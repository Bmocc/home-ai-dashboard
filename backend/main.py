"""FastAPI entrypoint for the Home AI Motion Dashboard backend."""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import api_router
from app.db import Database
from app.security import hash_password
from app.services.camera import CameraMonitor
from app.services.detection import ObjectDetector
from app.services.events import EventService
from app.services.notifications import NotificationWorker
from app.services.retention import RetentionPruner
from app.settings import get_settings
from app.websocket_manager import ConnectionManager

logger = logging.getLogger("home_ai_motion")
logging.basicConfig(level=logging.INFO)

settings = get_settings()
db = Database(settings)
ws_manager = ConnectionManager()
notifier = NotificationWorker(settings.notify_webhook_url) if settings.notify_webhook_url else None
detector = ObjectDetector(settings) if settings.ai_detection_enabled else None
event_service = EventService(settings, db, ws_manager, notifier)
camera_monitor = CameraMonitor(settings, event_service, detector) if settings.cam_monitor_enabled else None
retention_pruner = (
  RetentionPruner(event_service, settings.retention_prune_interval_seconds) if settings.retention_days > 0 else None
)


@asynccontextmanager
async def lifespan(app: FastAPI):
  """Initialize resources on startup and clean them up on shutdown."""
  default_hash = hash_password(settings.app_auth_password, settings)
  db.init_db(default_username=settings.app_auth_username, default_password_hash=default_hash)

  if notifier:
    notifier.start()
  if retention_pruner:
    retention_pruner.start()
  if camera_monitor and settings.cam_monitor_enabled:
    loop = asyncio.get_running_loop()
    camera_monitor.start(loop)

  yield

  if camera_monitor:
    camera_monitor.stop()
  if retention_pruner:
    retention_pruner.stop()
  if notifier:
    notifier.stop()


app = FastAPI(title="Home AI Motion Dashboard", lifespan=lifespan)
app.add_middleware(
  CORSMiddleware,
  allow_origins=settings.allowed_origins,
  allow_credentials=False,
  allow_methods=["*"],
  allow_headers=["*"],
)

# Store shared services on app.state so dependencies can access them.
app.state.settings = settings
app.state.db = db
app.state.ws_manager = ws_manager
app.state.event_service = event_service
app.state.camera_monitor = camera_monitor
app.state.detector = detector
app.state.notifier = notifier
app.state.retention_pruner = retention_pruner

app.include_router(api_router)


if __name__ == "__main__":
  import uvicorn

  uvicorn.run("main:app", host=settings.app_host, port=settings.app_port, reload=True)
