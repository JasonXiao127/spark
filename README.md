# Lantern

An ultra-lightweight, single-container Wake-on-LAN control panel to remotely boot devices on your local network. Save your devices once by MAC address, then wake them up with a single tap.

---

## Why?

I made this in anticipation for my next college year, though that never ended up materializing.

Back in my first year, I used Moonlight to remote into my desktop from campus. To boot it up, I had to SSH into my home server and manually run a CLI tool to send a Wake-on-LAN magic packet. It worked, but it was tedious.

Lantern solves that mess. It runs as a lightweight Docker container on your home network so you can wake any machine with a single click from a quick web dashboard—no SSH required.

---

## Features

* **One-click boot:** Trigger Wake-on-LAN magic packets instantly over broadcast UDP port 9.
* **Simple device management:** Add, normalize, and save target devices by MAC address.
* **Single-container deployment:** Built frontend and backend packaged into one minimal Docker image.
* **Dark theme UI:** Quick, responsive interface built for desktop and mobile browsers.

---

## Tech Stack

* **Frontend:** React 18, TypeScript, Vite, Axios
* **Backend:** Python 3.9+, FastAPI, SQLAlchemy 2.0, Pydantic v2
* **Database:** SQLite
* **Networking:** `wakeonlan` Python library

---

## Quickstart

Run Lantern using Docker Compose:

```bash
docker compose up -d --build

```

Access the dashboard at **`http://localhost:8000`**.

---

## API Reference

| Endpoint | Method | Description |
| --- | --- | --- |
| `/api/devices` | `GET` | List all saved devices |
| `/api/devices` | `POST` | Add a new device (`{ "name": "...", "mac_address": "..." }`) |
| `/api/devices/{id}` | `DELETE` | Remove a device |
| `/api/wake/{id}` | `POST` | Send Wake-on-LAN magic packet to device |

---
