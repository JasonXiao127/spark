"""Tests for the Lantern API: validators, auth, rate limiting, CRUD, wake."""

import os

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

import main
from models import DeviceCreate

API_KEY = os.environ["LANTERN_API_KEY"]
HEADERS = {"X-API-Key": API_KEY}


@pytest.fixture()
def client() -> TestClient:
    return TestClient(main.app)


# ------------------- Pydantic validators (pure) -------------------


def test_device_input_is_normalized():
    device = DeviceCreate(name="  Living Room PC  ", mac_address="aa-bb-cc-dd-ee-ff")
    assert device.name == "Living Room PC"
    assert device.mac_address == "AA:BB:CC:DD:EE:FF"


@pytest.mark.parametrize(
    "mac",
    [
        "00:00:00:00:00:00",  # all-zero broadcast MAC
        "01:11:22:33:44:55",  # multicast (first octet odd)
        "00:11:22:33:44:5",  # too short
        "00:11:22:33:44:55:66",  # too long
        "00:11:22:33:44:GG",  # invalid hex
        "",
    ],
)
def test_invalid_mac_addresses_are_rejected(mac):
    with pytest.raises(ValidationError):
        DeviceCreate(name="PC", mac_address=mac)


def test_blank_name_is_rejected():
    with pytest.raises(ValidationError):
        DeviceCreate(name="   ", mac_address="00:11:22:33:44:55")


# ------------------- Health -------------------


def test_health_is_unauthenticated(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


# ------------------- Auth -------------------


def test_missing_api_key_returns_401(client):
    assert client.get("/api/devices").status_code == 401


def test_wrong_api_key_returns_401(client):
    response = client.get("/api/devices", headers={"X-API-Key": "x" * 40})
    assert response.status_code == 401


def test_non_ascii_api_key_returns_401_not_500(client):
    # Raw byte 0xE9 in the header arrives latin-1 decoded as a non-ASCII str;
    # the byte-encoded compare_digest must 401 it, not raise a 500.
    response = client.get("/api/devices", headers={"X-API-Key": b"\xe9" * 40})
    assert response.status_code == 401


# ------------------- Duplicate handling -------------------


def test_duplicate_mac_returns_409(client):
    # The pre-check and the IntegrityError race fallback must agree on 409.
    # (The IntegrityError path itself only triggers under concurrent inserts,
    # which is why the deterministic pre-check path is asserted here.)
    body = {"name": "PC", "mac_address": "02:00:00:00:00:09"}
    assert client.post("/api/devices", json=body, headers=HEADERS).status_code == 201
    response = client.post("/api/devices", json=body, headers=HEADERS)
    assert response.status_code == 409


# ------------------- Rate limiting -------------------


def test_mutation_rate_limit(client, monkeypatch):
    clock = {"now": 1000.0}
    monkeypatch.setattr(main.time, "monotonic", lambda: clock["now"])
    main._mutation_requests.clear()
    try:
        for i in range(30):
            clock["now"] += 0.1
            response = client.post(
                "/api/devices",
                json={
                    "name": "PC",
                    "mac_address": f"02:00:00:00:{i // 256:02X}:{i % 256:02X}",
                },
                headers=HEADERS,
            )
            assert response.status_code == 201, response.text

        # 31st mutation inside the window is rejected.
        clock["now"] += 0.1
        response = client.post(
            "/api/devices",
            json={"name": "PC", "mac_address": "02:00:00:FF:FF:FF"},
            headers=HEADERS,
        )
        assert response.status_code == 429

        # Once the window has passed, requests are allowed again.
        clock["now"] += 61
        response = client.post(
            "/api/devices",
            json={"name": "PC", "mac_address": "02:00:00:FF:FF:FE"},
            headers=HEADERS,
        )
        assert response.status_code == 201
    finally:
        main._mutation_requests.clear()


# ------------------- CRUD + wake -------------------


def test_device_crud_and_wake(client, monkeypatch):
    sent = []
    monkeypatch.setattr(main, "send_magic_packet", lambda mac: sent.append(mac))

    created = client.post(
        "/api/devices",
        json={"name": "NAS", "mac_address": "02:11:22:33:44:55"},
        headers=HEADERS,
    )
    assert created.status_code == 201
    device_id = created.json()["id"]

    listing = client.get("/api/devices", headers=HEADERS)
    assert [d["mac_address"] for d in listing.json()] == ["02:11:22:33:44:55"]

    woken = client.post(f"/api/wake/{device_id}", headers=HEADERS)
    assert woken.status_code == 200
    assert sent == ["02:11:22:33:44:55"]

    assert client.post("/api/wake/9999", headers=HEADERS).status_code == 404

    deleted = client.delete(f"/api/devices/{device_id}", headers=HEADERS)
    assert deleted.status_code == 200
    assert client.get("/api/devices", headers=HEADERS).json() == []
    assert client.delete(f"/api/devices/{device_id}", headers=HEADERS).status_code == 404