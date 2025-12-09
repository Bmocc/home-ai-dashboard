"""Secure FastAPI backend for the Home AI Motion Dashboard demo."""
import asyncio
import hashlib
import io
import logging
import os
import random
import sqlite3
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import cv2
import jwt
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, WebSocket, WebSocketDisconnect, status
from fastapi.encoders import jsonable_encoder
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

load_dotenv()

APP_HOST = os.getenv("APP_HOST", "0.0.0.0")
APP_PORT = int(os.getenv("APP_PORT", "8000"))
APP_DB_PATH = os.getenv("APP_DB_PATH", "data/motion.db")
APP_PASSWORD_SALT = os.getenv("APP_PASSWORD_SALT", "home-ai-dashboard")
CAM_MONITOR_ENABLED = os.getenv("CAM_MONITOR_ENABLED", "false").lower() == "true"
CAMERA_INDEX = int(os.getenv("CAMERA_INDEX", "0"))
CAM_FRAME_INTERVAL = float(os.getenv("CAM_FRAME_INTERVAL", "1.0"))
CAM_MOTION_THRESHOLD = float(os.getenv("CAM_MOTION_THRESHOLD", "25.0"))
CAM_MIN_AREA = int(os.getenv("CAM_MIN_AREA", "5000"))
CAM_BASELINE_REFRESH_FRAMES = int(os.getenv("CAM_BASELINE_REFRESH_FRAMES", "150"))
APP_AUTH_USERNAME = os.getenv("APP_AUTH_USERNAME", "admin")
APP_AUTH_PASSWORD = os.getenv("APP_AUTH_PASSWORD", "changeme")
APP_JWT_SECRET = os.getenv("APP_JWT_SECRET", "super-secret-key")
APP_JWT_ALGORITHM = os.getenv("APP_JWT_ALGORITHM", "HS256")
APP_TOKEN_EXPIRE_SECONDS = int(os.getenv("APP_TOKEN_EXPIRE_SECONDS", "3600"))
MAX_EVENTS_RETURNED = int(os.getenv("APP_EVENTS_LIMIT", "200"))


class LoginRequest(BaseModel):
  username: str
  password: str


class LoginResponse(BaseModel):
  token: str
  token_type: str = "bearer"
  expires_in: int
  username: str


class ProfileUpdateRequest(BaseModel):
  currentPassword: str
  newUsername: Optional[str] = None
  newPassword: Optional[str] = None


class ProfileUpdateResponse(BaseModel):
  token: str
  username: str


def _csv_to_list(raw: str | None, fallback: List[str]) -> List[str]:
  if not raw:
    return fallback
  return [chunk.strip() for chunk in raw.split(",") if chunk.strip()]


def _ensure_parent_dir(path: str) -> None:
  directory = os.path.dirname(path)
  if directory and not os.path.exists(directory):
    os.makedirs(directory, exist_ok=True)


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

app.add_middleware(
  CORSMiddleware,
  allow_origins=allowed_origins,
  allow_credentials=False,
  allow_methods=["*"],
  allow_headers=["*"],
)

# --- Database helpers -----------------------------------------------------
_ensure_parent_dir(APP_DB_PATH)
db_conn = sqlite3.connect(APP_DB_PATH, check_same_thread=False)
db_conn.row_factory = sqlite3.Row
db_lock = threading.Lock()


def hash_password(password: str) -> str:
  return hashlib.sha256(f"{password}{APP_PASSWORD_SALT}".encode()).hexdigest()


def verify_password(password: str, password_hash: str) -> bool:
  return hash_password(password) == password_hash


def init_db() -> None:
  with db_lock:
    db_conn.execute(
      """
      CREATE TABLE IF NOT EXISTS motion_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        source TEXT NOT NULL,
        message TEXT NOT NULL,
        severity TEXT,
        zone TEXT,
        thumbnail_url TEXT,
        frame_timestamp TEXT
      )
      """
    )
    db_conn.execute(
      """
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        last_token TEXT
      )
      """
    )
    db_conn.commit()

    cursor = db_conn.execute("SELECT id FROM users WHERE username = ?", (APP_AUTH_USERNAME,))
    if cursor.fetchone() is None:
      db_conn.execute(
        "INSERT INTO users (username, password_hash) VALUES (?, ?)",
        (APP_AUTH_USERNAME, hash_password(APP_AUTH_PASSWORD)),
      )
      db_conn.commit()


def get_user(username: str) -> Optional[sqlite3.Row]:
  with db_lock:
    cursor = db_conn.execute("SELECT * FROM users WHERE username = ?", (username,))
    return cursor.fetchone()


def update_user(username: str, password_hash: str, user_id: int) -> None:
  with db_lock:
    db_conn.execute("UPDATE users SET username = ?, password_hash = ? WHERE id = ?", (username, password_hash, user_id))
    db_conn.commit()


def store_token(user_id: int, token: str) -> None:
  with db_lock:
    db_conn.execute("UPDATE users SET last_token = ? WHERE id = ?", (token, user_id))
    db_conn.commit()


def fetch_motion_events(limit: int = MAX_EVENTS_RETURNED) -> List[Dict[str, Any]]:
  with db_lock:
    cursor = db_conn.execute(
      "SELECT id, timestamp, source, message, severity, zone, thumbnail_url, frame_timestamp FROM motion_events ORDER BY id DESC LIMIT ?",
      (limit,),
    )
    rows = cursor.fetchall()
  events = [
    {
      "id": row["id"],
      "timestamp": row["timestamp"],
      "source": row["source"],
      "message": row["message"],
      "severity": row["severity"],
      "zone": row["zone"],
      "thumbnailUrl": row["thumbnail_url"],
      "frameTimestamp": row["frame_timestamp"],
    }
    for row in rows
  ]
  events.reverse()
  return events


async def _persist_event(event: Dict[str, Any]) -> Dict[str, Any]:
  with db_lock:
    cursor = db_conn.execute(
      """
      INSERT INTO motion_events (timestamp, source, message, severity, zone, thumbnail_url, frame_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      """,
      (
        event["timestamp"],
        event["source"],
        event["message"],
        event.get("severity"),
        event.get("zone"),
        event.get("thumbnailUrl"),
        event.get("frameTimestamp"),
      ),
    )
    db_conn.commit()
    event["id"] = cursor.lastrowid
  await manager.broadcast({"type": "motion_event", "payload": event})
  return event


# --- Auth helpers ---------------------------------------------------------
bearer_scheme = HTTPBearer(auto_error=False)


def create_token(username: str) -> str:
  payload = {
    "sub": username,
    "exp": datetime.now(tz=timezone.utc) + timedelta(seconds=APP_TOKEN_EXPIRE_SECONDS),
  }
  return jwt.encode(payload, APP_JWT_SECRET, algorithm=APP_JWT_ALGORITHM)


def decode_token(token: str) -> Dict[str, Any]:
  try:
    return jwt.decode(token, APP_JWT_SECRET, algorithms=[APP_JWT_ALGORITHM])
  except jwt.PyJWTError as exc:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


async def require_token(credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme)) -> str:
  if not credentials or credentials.scheme.lower() != "bearer":
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing")
  payload = decode_token(credentials.credentials)
  username = payload.get("sub")
  if not username or not get_user(username):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
  return username


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


# --- Event helpers --------------------------------------------------------

def _create_motion_event(*, source: str | None = None, message: str = "Simulated motion detected") -> Dict[str, Any]:
  return {
    "timestamp": datetime.now(tz=timezone.utc).isoformat(),
    "source": source or random.choice(sources),
    "message": message,
    "severity": random.choice(severity_levels),
    "zone": random.choice(zones),
    "thumbnailUrl": thumbnail_placeholder,
  }


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
          future = asyncio.run_coroutine_threadsafe(_persist_event(event), event_loop)
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


# --- Routes ---------------------------------------------------------------

@app.post("/api/login", response_model=LoginResponse)
def login(payload: LoginRequest) -> LoginResponse:
  user = get_user(payload.username)
  if not user or not verify_password(payload.password, user["password_hash"]):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
  token = create_token(payload.username)
  store_token(user["id"], token)
  return LoginResponse(token=token, expires_in=APP_TOKEN_EXPIRE_SECONDS, username=payload.username)


@app.get("/api/me")
def get_profile(current_user: str = Depends(require_token)) -> Dict[str, str]:
  return {"username": current_user}


@app.post("/api/profile", response_model=ProfileUpdateResponse)
def update_profile(payload: ProfileUpdateRequest, current_user: str = Depends(require_token)) -> ProfileUpdateResponse:
  if not payload.newUsername and not payload.newPassword:
    raise HTTPException(status_code=400, detail="Provide a new username or password.")
  user = get_user(current_user)
  if not user or not verify_password(payload.currentPassword, user["password_hash"]):
    raise HTTPException(status_code=401, detail="Current password is incorrect.")

  target_username = payload.newUsername.strip() if payload.newUsername else current_user
  if payload.newUsername and payload.newUsername != current_user:
    if get_user(target_username):
      raise HTTPException(status_code=400, detail="Username already in use.")
  new_hash = hash_password(payload.newPassword) if payload.newPassword else user["password_hash"]
  update_user(target_username, new_hash, user["id"])

  new_token = create_token(target_username)
  store_token(user["id"], new_token)
  return ProfileUpdateResponse(token=new_token, username=target_username)


@app.get("/api/health")
def health_check() -> Dict[str, str]:
  return {"status": "ok", "host": APP_HOST, "port": str(APP_PORT)}


@app.get("/api/motion-events")
async def get_motion_events(_: str = Depends(require_token)) -> Dict[str, List[Dict[str, Any]]]:
  return {"events": fetch_motion_events()}


@app.get("/api/latest-frame")
def get_latest_frame() -> StreamingResponse:
  with latest_frame_lock:
    frame = latest_frame_bytes
  if not frame:
    raise HTTPException(status_code=404, detail="No frame captured yet.")
  return StreamingResponse(io.BytesIO(frame), media_type="image/jpeg")


@app.post("/api/motion-events/simulate")
async def simulate_motion_event(_: str = Depends(require_token)) -> Dict[str, Any]:
  event = _create_motion_event()
  await _persist_event(event)
  return event


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
  token = websocket.query_params.get("token")
  if not token:
    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    return
  try:
    payload = decode_token(token)
    username = payload.get("sub")
    if not username or not get_user(username):
      raise HTTPException(status_code=401, detail="Invalid token")
  except HTTPException:
    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    return

  await manager.connect(websocket)
  try:
    await websocket.send_json({"type": "info", "message": "Connected to motion event stream"})
    while True:
      await websocket.receive_text()
  except WebSocketDisconnect:
    manager.disconnect(websocket)
  except asyncio.CancelledError:
    manager.disconnect(websocket)
    raise
  except Exception:
    manager.disconnect(websocket)


# --- Lifecycle ------------------------------------------------------------

@app.on_event("startup")
async def startup_event() -> None:
  global camera_thread, event_loop
  init_db()
  event_loop = asyncio.get_running_loop()
  if CAM_MONITOR_ENABLED and camera_thread is None:
    camera_thread_stop.clear()
    camera_thread = threading.Thread(
      target=_camera_monitor_loop,
      args=(camera_thread_stop,),
      name="laptop-camera-monitor",
      daemon=True,
    )
    camera_thread.start()
    logger.info("Laptop camera monitor thread launched.")


@app.on_event("shutdown")
async def shutdown_event() -> None:
  if camera_thread:
    camera_thread_stop.set()
    await asyncio.to_thread(camera_thread.join, timeout=5)
  with db_lock:
    db_conn.close()


if __name__ == "__main__":
  import uvicorn

  uvicorn.run("main:app", host=APP_HOST, port=APP_PORT, reload=True)
