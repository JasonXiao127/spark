from __future__ import annotations

from collections import defaultdict, deque
import logging
import os
import secrets
import threading
import time

from fastapi import Depends, FastAPI, HTTPException, Request, Security
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import APIKeyHeader
from fastapi.staticfiles import StaticFiles
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from wakeonlan import send_magic_packet

import models
from database import engine, get_db, Base
from models import DeviceCreate, Device

logger = logging.getLogger(__name__)

LANTERN_API_KEY = os.environ.get("LANTERN_API_KEY", "").strip()
if len(LANTERN_API_KEY) < 32:
    raise RuntimeError("LANTERN_API_KEY must be set to at least 32 characters")


def _csv_env(name: str, default: str) -> list[str]:
    value = os.environ.get(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="Lantern - Wake-on-LAN API",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

# The production frontend is same-origin. These localhost origins are only
# needed while running the Vite development server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=_csv_env(
        "LANTERN_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173"
    ),
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-API-Key"],
)


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'"
    )
    return response


api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def require_api_key(api_key: str | None = Security(api_key_header)) -> None:
    if not api_key or not secrets.compare_digest(api_key, LANTERN_API_KEY):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "ApiKey"},
        )


_rate_limit_lock = threading.Lock()
_mutation_requests: defaultdict[str, deque[float]] = defaultdict(deque)
_RATE_LIMIT_WINDOW_SECONDS = 60.0
_RATE_LIMIT_MAX_REQUESTS = 30


def enforce_mutation_rate_limit(request: Request) -> None:
    client_host = request.client.host if request.client else "unknown"
    now = time.monotonic()
    with _rate_limit_lock:
        timestamps = _mutation_requests[client_host]
        while timestamps and now - timestamps[0] >= _RATE_LIMIT_WINDOW_SECONDS:
            timestamps.popleft()
        if len(timestamps) >= _RATE_LIMIT_MAX_REQUESTS:
            raise HTTPException(
                status_code=429,
                detail="Too many requests; try again later",
                headers={"Retry-After": "60"},
            )
        timestamps.append(now)


# ------------------- API Endpoints -------------------


@app.get("/api/devices", response_model=list[Device])
def get_all_devices(
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
):
    devices = db.query(models.DeviceDB).order_by(models.DeviceDB.id).all()
    return devices


@app.post("/api/devices", response_model=Device, status_code=201)
def add_device(
    device: DeviceCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
    __: None = Depends(enforce_mutation_rate_limit),
):
    # Check for duplicate MAC address
    existing = db.query(models.DeviceDB).filter(
        models.DeviceDB.mac_address == device.mac_address
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Device with this MAC address already exists")

    db_device = models.DeviceDB(**device.model_dump())
    db.add(db_device)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Device with this MAC address already exists"
        )
    db.refresh(db_device)
    return db_device


@app.delete("/api/devices/{device_id}")
def delete_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
    __: None = Depends(enforce_mutation_rate_limit),
):
    db_device = db.query(models.DeviceDB).filter(models.DeviceDB.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    device_name = db_device.name
    db.delete(db_device)
    db.commit()
    return {"detail": f"Device '{device_name}' deleted successfully"}


@app.post("/api/wake/{device_id}")
def wake_device(
    device_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_api_key),
    __: None = Depends(enforce_mutation_rate_limit),
):
    db_device = db.query(models.DeviceDB).filter(models.DeviceDB.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    try:
        send_magic_packet(str(db_device.mac_address))
        return {"detail": f"Magic packet sent to {db_device.name} ({db_device.mac_address})"}
    except Exception as e:
        logger.exception("Failed to send WoL packet for device %s", device_id)
        raise HTTPException(status_code=500, detail="Failed to send WoL packet") from e


# Mount frontend static files AFTER all API routes to avoid squashing 404s
if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="frontend")
