"""Application configuration loaded from environment variables."""

from functools import lru_cache
from typing import List

from dotenv import load_dotenv
from pydantic import Field, validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Load .env early so all settings below can read values.
load_dotenv()


def _split_csv(value) -> List[str]:
  if value is None:
    return []
  if isinstance(value, list):
    return value
  if isinstance(value, str):
    return [chunk.strip() for chunk in value.split(",") if chunk.strip()]
  return []


class Settings(BaseSettings):
  """Centralized settings with sensible defaults for local development."""

  app_host: str = Field("0.0.0.0", env="APP_HOST")
  app_port: int = Field(8000, env="APP_PORT")
  app_db_path: str = Field("data/motion.db", env="APP_DB_PATH")
  app_password_salt: str = Field("home-ai-dashboard", env="APP_PASSWORD_SALT")
  app_auth_username: str = Field("admin", env="APP_AUTH_USERNAME")
  app_auth_password: str = Field("changeme", env="APP_AUTH_PASSWORD")
  app_jwt_secret: str = Field("super-secret-key", env="APP_JWT_SECRET")
  app_jwt_algorithm: str = Field("HS256", env="APP_JWT_ALGORITHM")
  app_token_expire_seconds: int = Field(3600, env="APP_TOKEN_EXPIRE_SECONDS")
  app_events_limit: int = Field(200, env="APP_EVENTS_LIMIT")

  allowed_origins: List[str] = Field(default_factory=lambda: ["http://localhost:5173", "http://127.0.0.1:5173", "*"], env="APP_ALLOWED_ORIGINS")
  zones: List[str] = Field(default_factory=lambda: ["Front Door", "Backyard", "Driveway", "Garage", "Living Room"], env="APP_ZONES")
  severity_levels: List[str] = Field(default_factory=lambda: ["low", "medium", "high"], env="APP_SEVERITY_LEVELS")
  sources: List[str] = Field(default_factory=lambda: ["test-cam-1", "test-cam-2", "simulated-ai"], env="APP_SOURCES")
  thumbnail_placeholder: str = Field("https://placehold.co/120x68?text=Motion", env="APP_THUMBNAIL_URL")

  snapshot_dir: str = Field("data/snaps", env="APP_SNAPSHOT_DIR")
  retention_days: int = Field(7, env="APP_RETENTION_DAYS")
  retention_prune_interval_seconds: int = Field(60 * 60, env="APP_RETENTION_PRUNE_INTERVAL_SECONDS")

  cam_monitor_enabled: bool = Field(False, env="CAM_MONITOR_ENABLED")
  camera_index: int = Field(0, env="CAMERA_INDEX")
  cam_frame_interval: float = Field(1.0, env="CAM_FRAME_INTERVAL")
  cam_motion_threshold: float = Field(25.0, env="CAM_MOTION_THRESHOLD")
  cam_min_area: int = Field(5000, env="CAM_MIN_AREA")
  cam_baseline_refresh_frames: int = Field(150, env="CAM_BASELINE_REFRESH_FRAMES")

  notify_webhook_url: str = Field("", env="APP_NOTIFY_WEBHOOK_URL")

  ai_model_path: str = Field("yolov8n.pt", env="AI_MODEL_PATH")
  ai_detection_enabled: bool = Field(True, env="AI_DETECTION_ENABLED")
  ai_device_mode: str = Field("cpu", env="AI_DEVICE_MODE")
  ai_confidence_threshold: float = Field(0.25, env="AI_CONFIDENCE_THRESHOLD")
  ai_max_detections: int = Field(3, env="AI_MAX_DETECTIONS")

  model_config = SettingsConfigDict(env_file=".env", case_sensitive=False, extra="ignore")

  @validator("allowed_origins", "zones", "severity_levels", "sources", pre=True)
  def _coerce_csv(cls, value):
    parsed = _split_csv(value)
    return parsed if parsed else (value or [])


@lru_cache
def get_settings() -> Settings:
  """Return a cached settings instance for reuse across the app."""
  return Settings()
