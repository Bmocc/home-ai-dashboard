# Home AI Motion Dashboard

A minimal FastAPI + React/Vite playground that shows simulated motion events. Run it on your laptop and open the dashboard from any phone on the same Wi-Fi network.

## Backend
1. `cd backend`
2. Copy the sample environment file and adjust values as needed (keep `APP_HOST=0.0.0.0` if you want phone access on the LAN):  
   - macOS/Linux: `cp .env.example .env`  
   - Windows: `copy .env.example .env`
3. Create a virtual environment (one time setup):
   - macOS/Linux: `python -m venv .venv && source .venv/bin/activate`
   - Windows (PowerShell/CMD): `python -m venv .venv && .venv\\Scripts\\activate`
4. Install dependencies: `pip install -r requirements.txt`
5. Start the API (reads host/port + future secrets from `.env`):
   ```bash
   python main.py  # runs uvicorn main:app with reload, honoring APP_HOST / APP_PORT
   ```
   or run `uvicorn main:app --host $APP_HOST --port $APP_PORT --reload` after exporting the variables.

> Tip: `run_backend.sh` (macOS/Linux) and `run_backend.bat` (Windows) now auto-load `.env`, create the virtualenv, install requirements, and launch Uvicorn.

Endpoints:
- `GET /api/health` → health check response includes the configured host/port
- `GET /api/motion-events` → list of simulated events (`severity`, `zone`, `thumbnailUrl` fields included)
- `POST /api/motion-events/simulate` → add a new dummy event with severity/zone metadata
- `WS /ws` → pushes every newly created motion event to connected dashboards in real time
- `GET /api/latest-frame` → JPEG snapshot of the most recent laptop camera frame

### Laptop camera motion detector
- Set `CAM_MONITOR_ENABLED=true` in `backend/.env` (default in the example) to stream from your laptop webcam using OpenCV.
- The background watcher continually grabs `cv2.VideoCapture(0)` frames, blurs/grayscales them, and diff-compares with a baseline.
- When enough change is detected, it emits a motion event with `source: "laptop_cam"` and `frameTimestamp` so both the REST response and WebSocket clients stay in sync.
- If you do not want webcam access (or your device has no camera), set `CAM_MONITOR_ENABLED=false`.
- Tweaks available: `CAM_FRAME_INTERVAL`, `CAM_MOTION_THRESHOLD`, `CAM_MIN_AREA`, and `CAM_BASELINE_REFRESH_FRAMES` in `.env`.
- Windows/macOS may prompt for camera permission the first time Python/OpenCV tries to read from the webcam—allow access so events can be generated.

## Frontend
1. `cd frontend`
2. Copy the env example and update `VITE_API_BASE_URL` if your phone should hit a LAN IP (e.g., `http://192.168.1.50:8000`):  
   - macOS/Linux: `cp .env.example .env`  
   - Windows: `copy .env.example .env`
3. Install packages (creates `node_modules` and `package-lock.json`): `npm install`
4. Start the dev server: `npm run dev`
   - Runs at `http://localhost:5173`
   - Because Vite is configured with `host: '0.0.0.0'`, you can also reach it from phones on the LAN via `http://<laptop_LAN_IP>:5173`

Configuration:
- API base URL is driven by `VITE_API_BASE_URL` (see `frontend/.env.example` and `src/config.js`). Update it to your laptop's LAN IP when testing from a phone.
- UI is broken into reusable components (`Header`, `ServerInfo`, `StatsRow`, `StatusCard`, `LiveSnapshot`, `EventsList`) so it is easier to replace the simulated data with real detections.
- A WebSocket connection to `ws://<backend-host>/ws` keeps the motion list live; the initial fetch seeds state, and every new event streams in instantly.
- The dashboard also polls `/api/latest-frame` and displays a “live-ish” snapshot image beside the event feed so phones & laptops can see the latest frame even without a full stream.

## Testing on Phone
1. **Find laptop LAN IP**
   - Windows: run `ipconfig` and note the IPv4 address (e.g., `192.168.x.x`).
   - macOS/Linux: run `ifconfig` or `ip addr` for the same info.
2. **Start backend**
   - `cd backend`
   - Activate the virtualenv
   - `uvicorn main:app --host 0.0.0.0 --port 8000 --reload` (or `python main.py`)
   - Make sure `.env` still says `APP_HOST=0.0.0.0` so phones can connect.
3. **Start frontend**
   - `cd frontend`
   - Confirm `.env` points `VITE_API_BASE_URL` to `http://<laptop_LAN_IP>:8000`
   - `npm run dev`
4. **Verify on the laptop**
   - Visit `http://localhost:5173`
   - Confirm the health indicator shows “Connected”, motion events render, and the “Simulate Motion Event” button adds rows.
5. **Open on the phone**
   - Connect the phone to the same Wi-Fi network.
   - Open `http://<laptop_LAN_IP>:5173` (example: `http://192.168.1.50:5173`).
   - If it does not load, ensure firewall prompts for Node (Vite) and Python are allowed on private networks.
   - Once the page loads, repeat the same checks (health status, motion list, simulate button).
6. Optional: Add the page to the phone’s home screen for a lightweight app feel.

## Summary
- Backend: FastAPI served via `uvicorn` on `0.0.0.0:8000`, with host/port + future secrets loaded from `.env`.
- Frontend: React + Vite served on `0.0.0.0:5173`, configured via `VITE_API_BASE_URL` for LAN-friendly API calls and `ws://` streaming.
- Access from laptop using `localhost`; access from phones using `http://<laptop_LAN_IP>`. Keep both devices on the same Wi-Fi.
- This is a stub meant to host future AI-powered motion detection logic while keeping today’s wiring simple, configurable, and testable—even your built-in laptop camera can trigger events today.
