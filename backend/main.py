"""Simple FastAPI backend for the Home AI Motion Dashboard demo."""
import asyncio
import io
import logging
import os
import random
import threading
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import cv2
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

load_dotenv()

APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "8000"))
CAM_MONITOR_ENABLED = os.getenv("CAM_MONITOR_ENABLED", "false").lower() == "true"
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
CAM_FRAME_INTERVAL = float(os.getenv("CAM_FRAME_INTERVAL", "1.0"))
CAM_MOTION_THRESHOLD = float(os.getenv("CAM_MOTION_THRESHOLD", "25.0"))
CAM_MIN_AREA = int(os.getenv("CAM_MIN_AREA", "5000"))
CAM_BASELINE_REFRESH_FRAMES = int(os.getenv("CAM_BASELINE_REFRESH_FRAMES", "150"))


def _csv_to_list(raw: str | None, fallback: List[str]) -> List[str]:
    if not raw:
        return fallback
    return [chunk.strip() for chunk in raw.split(",") if chunk.strip()]


allowed_origins = _csv_to_list(
    os.getenv("APP_ALLOWED_ORIGINS"),
    ["http://localhost:5173", "http://127.0.0.1:5173", "*"],
)
zones = _csv_to_list(
    os.getenv("APP_ZONES"),
    ["Front Door", "Backyard", "Driveway", "Garage", "Living Room"],
)
severity_levels = _csv_to_list(
    os.getenv("APP_SEVERITY_LEVELS"),
    ["low", "medium", "high"],
)
thumbnail_placeholder = os.getenv(
    "APP_THUMBNAIL_URL",
    "https://placehold.co/120x68?text=Motion",
)
sources = _csv_to_list(
    os.getenv("APP_SOURCES"),
    ["test-cam-1", "test-cam-2", "simulated-ai"],
)

app = FastAPI(title="Home AI Motion Dashboard")
logger = logging.getLogger("home_ai_motion")
logging.basicConfig(level=logging.INFO)

# Allow the Vite dev server (and phones hitting via LAN IP) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for fake motion events; replace with a real database later.
_next_event_id = 1
motion_events: List[Dict[str, Any]] = []


class ConnectionManager:
    """Track active WebSocket connections and broadcast events."""

    def __init__(self) -> None:
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]) -> None:
        """Send a JSON message to every connected client."""
        if not self.active_connections:
            return

        payload = jsonable_encoder(message)
        disconnected: list[WebSocket] = []

        for connection in self.active_connections:
            try:
                await connection.send_json(payload)
            except Exception:
                disconnected.append(connection)

        for connection in disconnected:
            self.disconnect(connection)


manager = ConnectionManager()
camera_thread_stop = threading.Event()
camera_thread: Optional[threading.Thread] = None
event_loop: Optional[asyncio.AbstractEventLoop] = None
latest_frame_lock = threading.Lock()
latest_frame_bytes: Optional[bytes] = None


def _create_motion_event(
    *,
    source: str | None = None,
    message: str = "Simulated motion detected",
) -> Dict[str, Any]:
    """Create a new simulated motion event payload."""
    global _next_event_id
    event = {
        "id": _next_event_id,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "source": source or random.choice(sources),
        "message": message,
        "severity": random.choice(severity_levels),
        "zone": random.choice(zones),
        "thumbnailUrl": thumbnail_placeholder,
    }
    _next_event_id += 1
    return event


async def _record_motion_event(event: Dict[str, Any]) -> None:
    """Persist the event and notify any connected dashboards."""
    motion_events.append(event)
    await manager.broadcast({"type": "motion_event", "payload": event})


def _preprocess_frame(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (21, 21), 0)
    return gray


def _frame_has_motion(baseline, current) -> bool:
    frame_delta = cv2.absdiff(baseline, current)
    thresh = cv2.threshold(frame_delta, CAM_MOTION_THRESHOLD, 255, cv2.THRESH_BINARY)[1]
    thresh = cv2.dilate(thresh, None, iterations=2)
    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    return any(cv2.contourArea(contour) > CAM_MIN_AREA for contour in contours)


def _camera_monitor_loop(stop_event: threading.Event) -> None:
    """Watch the laptop webcam for motion and emit events."""
    logger.info("Starting laptop camera monitor (enabled=%s)", CAM_MONITOR_ENABLED)
    cap = cv2.VideoCapture(CAMERA_INDEX)
    if not cap.isOpened():
        logger.warning("Could not open webcam index %s; disable CAM_MONITOR_ENABLED to skip.", CAMERA_INDEX)
        return

    baseline = None
    frames_without_motion = 0

    while not stop_event.is_set():
        ret, frame = cap.read()
        if not ret:
            logger.debug("Failed to read frame; retrying soon.")
            time.sleep(1.0)
            continue

        frame_timestamp = datetime.now(tz=timezone.utc).isoformat()
        processed = _preprocess_frame(frame)

        # Persist the most recent raw frame as JPEG for the snapshot endpoint.
        try:
            success, buffer = cv2.imencode(".jpg", frame)
            if success:
                with latest_frame_lock:
                    global latest_frame_bytes
                    latest_frame_bytes = buffer.tobytes()
        except Exception as exc:
            logger.debug("Failed to encode frame for snapshot: %s", exc)

        if baseline is None:
            baseline = processed
            time.sleep(CAM_FRAME_INTERVAL)
            continue

        if _frame_has_motion(baseline, processed):
            baseline = processed
            frames_without_motion = 0
            event = _create_motion_event(source="laptop_cam", message="Laptop camera detected motion")
            event["frameTimestamp"] = frame_timestamp

            if event_loop is not None:
                try:
                    future = asyncio.run_coroutine_threadsafe(_record_motion_event(event), event_loop)
                    future.result()
                except Exception as exc:
                    logger.exception("Failed to record webcam motion event: %s", exc)
        else:
            frames_without_motion += 1
            if frames_without_motion >= CAM_BASELINE_REFRESH_FRAMES:
                baseline = processed
                frames_without_motion = 0

        time.sleep(CAM_FRAME_INTERVAL)

    cap.release()
    logger.info("Laptop camera monitor stopped.")


@app.get("/api/health")
def health_check() -> Dict[str, str]:
    """Health check endpoint so the frontend knows the backend is reachable."""
    return {"status": "ok", "host": APP_HOST, "port": str(APP_PORT)}


@app.get("/api/motion-events")
def get_motion_events() -> Dict[str, List[Dict[str, Any]]]:
    """Return the list of in-memory motion events."""
    return {"events": motion_events}


@app.get("/api/latest-frame")
def get_latest_frame() -> StreamingResponse:
    """Return the most recent webcam frame as a JPEG stream."""
    with latest_frame_lock:
        frame = latest_frame_bytes
    if not frame:
        raise HTTPException(status_code=404, detail="No frame captured yet.")
    return StreamingResponse(io.BytesIO(frame), media_type="image/jpeg")


@app.post("/api/motion-events/simulate")
async def simulate_motion_event() -> Dict[str, Any]:
    """Simulate an incoming motion event; later, plug real detectors here."""
    event = _create_motion_event()
    await _record_motion_event(event)
    return event


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    """Push real-time motion updates to connected clients."""
    await manager.connect(websocket)
    try:
        await websocket.send_json({"type": "info", "message": "Connected to motion event stream"})
        while True:
            # We do not expect any inbound data, but this keeps the connection open.
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except asyncio.CancelledError:
        manager.disconnect(websocket)
        raise
    except Exception:
        manager.disconnect(websocket)


@app.on_event("startup")
async def startup_event() -> None:
    """Kick off background services like the webcam motion watcher."""
    global camera_thread, event_loop
    event_loop = asyncio.get_running_loop()
    if CAM_MONITOR_ENABLED and camera_thread is None:
        camera_thread_stop.clear()
        camera_thread = threading.Thread(
            target=_camera_monitor_loop, args=(camera_thread_stop,), name="laptop-camera-monitor", daemon=True
        )
        camera_thread.start()
        logger.info("Laptop camera monitor thread launched.")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    """Signal camera monitoring to stop when the app shuts down."""
    if camera_thread:
        camera_thread_stop.set()
        await asyncio.to_thread(camera_thread.join, timeout=5)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=APP_HOST, port=APP_PORT, reload=True)
