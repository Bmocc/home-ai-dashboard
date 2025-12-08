# Home AI Motion Dashboard

A minimal FastAPI + React/Vite playground that shows simulated motion events. Run it on your laptop and open the dashboard from any phone on the same Wi-Fi network.

## Backend
1. `cd backend`
2. Create a virtual environment (one time setup):
   - macOS/Linux: `python -m venv .venv && source .venv/bin/activate`
   - Windows (PowerShell/CMD): `python -m venv .venv && .venv\\Scripts\\activate`
3. Install dependencies: `pip install -r requirements.txt`
4. Start the API (exposes 0.0.0.0 so your phone can reach it over LAN):
   ```bash
   uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

> Tip: use `run_backend.sh` (macOS/Linux) or `run_backend.bat` (Windows) to automate steps 2-4.

Endpoints:
- `GET /api/health` → health check
- `GET /api/motion-events` → list of simulated events
- `POST /api/motion-events/simulate` → add a new dummy event

## Frontend
1. `cd frontend`
2. Install packages (creates `node_modules` and `package-lock.json`): `npm install`
3. Start the dev server: `npm run dev`
   - Runs at `http://localhost:5173`
   - Because Vite is configured with `host: '0.0.0.0'`, you can also reach it from phones on the LAN via `http://<laptop_LAN_IP>:5173`

Configuration:
- API base URL defaults to `http://localhost:8000` in `src/config.js`. Replace `localhost` with your laptop's LAN IP when testing from a phone, e.g. `http://192.168.1.50:8000`.

## Testing on Phone
1. **Find laptop LAN IP**
   - Windows: run `ipconfig` and note the IPv4 address (e.g., `192.168.x.x`).
   - macOS/Linux: run `ifconfig` or `ip addr` for the same info.
2. **Start backend**
   - `cd backend`
   - Activate the virtualenv
   - `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
3. **Start frontend**
   - `cd frontend`
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
- Backend: FastAPI served via `uvicorn` on `0.0.0.0:8000`.
- Frontend: React + Vite served on `0.0.0.0:5173`.
- Access from laptop using `localhost`; access from phones using `http://<laptop_LAN_IP>`. Keep both devices on the same Wi-Fi.
- This is a stub meant to host future AI-powered motion detection logic while keeping today’s wiring simple and testable.
