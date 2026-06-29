from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from wakeonlan import wake
from fastapi.staticfiles import StaticFiles
import os

import models
from database import engine, get_db, Base
from models import DeviceCreate, Device

# Initialize database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Lantern - Wake-on-LAN API")

# Enable CORS for all origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="dist", html=True), name="static")
# ------------------- API Endpoints -------------------

@app.get("/api/devices", response_model=list[Device])
def get_all_devices(db: Session = Depends(get_db)):
    devices = db.query(models.DeviceDB).all()
    return devices

@app.post("/api/devices", response_model=Device, status_code=201)
def add_device(device: DeviceCreate, db: Session = Depends(get_db)):
    # Check for duplicate MAC address
    existing = db.query(models.DeviceDB).filter(
        models.DeviceDB.mac_address == device.mac_address
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Device with this MAC address already exists")

    db_device = models.DeviceDB(**device.model_dump())
    db.add(db_device)
    db.commit()
    db.refresh(db_device)
    return db_device

@app.delete("/api/devices/{device_id}")
def delete_device(device_id: int, db: Session = Depends(get_db)):
    db_device = db.query(models.DeviceDB).filter(models.DeviceDB.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")
    db.delete(db_device)
    db.commit()
    return {"detail": f"Device '{db_device.name}' deleted successfully"}

@app.post("/api/wake/{device_id}")
def wake_device(device_id: int, db: Session = Depends(get_db)):
    db_device = db.query(models.DeviceDB).filter(models.DeviceDB.id == device_id).first()
    if not db_device:
        raise HTTPException(status_code=404, detail="Device not found")

    try:
        wake(str(db_device.mac_address))
        return {"detail": f"Magic packet sent to {db_device.name} ({db_device.mac_address})"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send WoL packet: {str(e)}")


if os.path.exists("dist"):
    app.mount("/", StaticFiles(directory="dist", html=True), name="frontend")