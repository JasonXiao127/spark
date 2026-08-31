# Lantern

An ultra-lightweight, single-container Wake-on-LAN control panel to remotely boot devices on your local network. Save your devices once by MAC address, then wake them up with a single tap.

---

## Why?

Back in my first year, I used Moonlight to remote into my desktop from campus. To boot it up, I had to SSH into my home server and manually run a CLI tool to send a Wake-on-LAN magic packet. It worked, but it was tedious.

Lantern solves that mess. It runs as a lightweight Docker container on your home network so you can wake any machine with a single click from a quick web dashboard - no SSH required.

---

## Features

* **One-click boot:** Trigger Wake-on-LAN magic packets instantly over broadcast UDP port 9.
* **Simple device management:** Add, normalize, and save target devices by MAC address (multicast and broadcast MACs are rejected).
* **Secured by default:** Every API call requires a 32+ character API key, compared in constant time; mutating endpoints are rate-limited.
* **Single-container deployment:** Built frontend and backend packaged into one minimal Docker image.
* **Dark theme UI:** Quick, responsive interface built for desktop and mobile browsers.

---

## Tech Stack

* **Frontend:** React 18, TypeScript, Vite, Axios
* **Backend:** Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2
* **Database:** SQLite
* **Networking:** `wakeonlan` Python library
* **Tests / CI:** pytest, GitHub Actions

---

## Quick start (no clone needed)

1. Generate an API key and keep it private:

   ```
   python -c "import secrets; print(secrets.token_urlsafe(32))"
   ```

2. In an empty folder, create a `docker-compose.yml` containing exactly this:

   ```yaml
   services:
     lantern:
       image: maraudermarauder/lantern:latest # pulled from Docker Hub
       container_name: lantern
       ports:
         - "127.0.0.1:8282:8282" # change the left port if 8282 is taken on your machine
       environment:
         LANTERN_API_KEY: ${LANTERN_API_KEY:?Create a .env file next to this one containing LANTERN_API_KEY with 32 or more random characters}
       volumes:
         - ./data:/app/data # persists your devices across restarts
       restart: unless-stopped
   ```

   and a `.env` file next to it containing:

   ```
   LANTERN_API_KEY=paste-the-key-from-step-1-here
   ```

3. Start it:

   ```
   docker compose up -d
   ```

4. Open http://127.0.0.1:8282 and paste the API key into the UI.

That is the whole setup - the image is pulled from Docker Hub, so nothing
needs to be built. (If you cloned this repository instead, the same
`docker-compose.yml` is already in the repo root, so step 2 is done for you.)

### Important: Wake-on-LAN and Docker networking

A UDP broadcast sent from a container on Docker''s default bridge network
never reaches your LAN - magic packets die at the container boundary. What
works, depending on where Lantern runs:

| Deployment | Does WoL work? |
| --- | --- |
| Backend run directly on the host (`uvicorn main:app`) | Yes - works everywhere |
| Docker on a **Linux** host with `network_mode: host` | Yes (add it to the compose file; see the comment in the repo''s `docker-compose.yml`) |
| Docker bridge network (the compose default) | No - management only (add/delete devices) |
| macvlan network (container gets its own LAN IP) | Yes - advanced option |

On **Docker Desktop (Windows/macOS)**, `network_mode: host` does not reach the
physical LAN either ("host" means the WSL2/VM network stack), so on those
platforms run `uvicorn` directly on the host when you actually want to wake
machines.

---

## API Reference

All endpoints except the liveness probe require the `X-API-Key` header.

| Endpoint | Method | Auth | Description |
| --- | --- | --- | --- |
| `/api/health` | `GET` | No | Liveness probe |
| `/api/devices` | `GET` | Yes | List all saved devices |
| `/api/devices` | `POST` | Yes | Add a new device (`{ "name": "...", "mac_address": "..." }`); duplicates return `409` |
| `/api/devices/{id}` | `DELETE` | Yes | Remove a device |
| `/api/wake/{id}` | `POST` | Yes | Send a Wake-on-LAN magic packet to the device |

---

## Development

Ports differ between dev and Docker: the dev backend runs on **8000** (the
Vite dev server proxies `/api` to it), Docker runs on **8282**.

Backend:

```
cd backend
python -m venv venv                     # once
venv\Scripts\activate                  # Windows (source venv/bin/activate on Linux/macOS)
python -m pip install -r requirements.txt -r requirements-dev.txt
set LANTERN_API_KEY=your-32-plus-character-key   # export on Linux/macOS
uvicorn main:app --port 8000 --reload
```

Frontend:

```
cd frontend
npm ci
npm run dev     # http://localhost:5173, proxies /api to port 8000
```

Run backend tests:

```
cd backend
pytest -q
```

CI (GitHub Actions, `.github/workflows/ci.yml`) runs the backend tests, the
frontend build (`tsc && vite build`), and a `docker build` on every push and
pull request.

---

## Configuration (environment variables)

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `LANTERN_API_KEY` | Yes | - | API key; must be at least 32 characters; required on every API call |
| `LANTERN_CORS_ORIGINS` | No | `http://localhost:5173,http://127.0.0.1:5173` | Extra browser origins allowed during development |
| `LANTERN_DB_PATH` | No | `./data/lantern.db` | SQLite database location |

---

## Data persistence and permissions

The compose file mounts `./data` into the container, which runs as a non-root
user. On Linux hosts, if Docker creates `./data` as root, SQLite cannot create
the database and the container will crash-loop on startup. Fix it before the
first start:

```
mkdir -p data
sudo chown 1000:1000 data    # or use a named volume instead of the bind mount
```

---

## Security notes

- Every API endpoint except `/api/health` requires the `X-API-Key` header.
  The app refuses to start without a 32+ character key, and the key is
  compared in constant time.
- Mutating endpoints are rate-limited to 30 requests per minute per source IP
  (in-memory, per process; resets on restart).
- Swagger / ReDoc / OpenAPI are disabled unconditionally - there is no
  environment flag that re-enables them.
- Security headers and a strict CSP (`style-src 'self'`, no inline styles)
  are applied to all responses.
- MAC addresses are validated and normalized; multicast and broadcast MACs
  are rejected.

---

## Known limitations

- "Magic packet sent" means the UDP packet was written to the socket, not
  that the target machine actually powered on.
- The published image is built for `linux/amd64`; on ARM, clone the repo and
  run `docker compose up -d --build` (add `build: .` to the compose file).
- The rate limiter is in-memory: it resets on restart and is per-process.