"""Laptop camera monitoring loop with optional object detection."""

import asyncio
import logging
import threading
import time
from datetime import datetime, timezone
from typing import Optional

import cv2

from ..settings import Settings
from .detection import ObjectDetector
from .events import EventService

logger = logging.getLogger("home_ai_motion.camera")


def _preprocess_frame(frame):
  gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
  gray = cv2.GaussianBlur(gray, (21, 21), 0)
  return gray


def _frame_has_motion(baseline, current, threshold: float, min_area: int) -> bool:
  frame_delta = cv2.absdiff(baseline, current)
  thresh = cv2.threshold(frame_delta, threshold, 255, cv2.THRESH_BINARY)[1]
  thresh = cv2.dilate(thresh, None, iterations=2)
  contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
  return any(cv2.contourArea(contour) > min_area for contour in contours)


class CameraMonitor:
  """Captures frames and creates events when motion is detected."""

  def __init__(self, settings: Settings, event_service: EventService, detector: Optional[ObjectDetector]):
    self.settings = settings
    self.event_service = event_service
    self.detector = detector if settings.ai_detection_enabled else None
    self._stop = threading.Event()
    self._thread: Optional[threading.Thread] = None
    self._event_loop: Optional[asyncio.AbstractEventLoop] = None
    self._latest_frame_lock = threading.Lock()
    self._latest_frame_bytes: Optional[bytes] = None

  def start(self, loop: asyncio.AbstractEventLoop) -> None:
    if self._thread:
      return
    self._event_loop = loop
    self._stop.clear()
    self._thread = threading.Thread(target=self._run, name="laptop-camera-monitor", daemon=True)
    self._thread.start()
    logger.info("Laptop camera monitor thread launched.")

  def stop(self) -> None:
    self._stop.set()
    if self._thread:
      self._thread.join(timeout=5)

  def latest_frame_bytes(self) -> Optional[bytes]:
    with self._latest_frame_lock:
      return self._latest_frame_bytes

  def _run(self) -> None:
    logger.info("Starting laptop camera monitor (enabled=%s)", self.settings.cam_monitor_enabled)
    cap = cv2.VideoCapture(self.settings.camera_index)
    if not cap.isOpened():
      logger.warning("Could not open webcam index %s; disable CAM_MONITOR_ENABLED to skip.", self.settings.camera_index)
      return

    baseline = None
    frames_without_motion = 0

    while not self._stop.is_set():
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
          with self._latest_frame_lock:
            self._latest_frame_bytes = buffer.tobytes()
      except Exception as exc:
        logger.debug("Failed to encode frame for snapshot: %s", exc)

      if baseline is None:
        baseline = processed
        time.sleep(self.settings.cam_frame_interval)
        continue

      if _frame_has_motion(baseline, processed, self.settings.cam_motion_threshold, self.settings.cam_min_area):
        baseline = processed
        frames_without_motion = 0
        base_message = "Laptop camera detected motion"
        event = self.event_service.create_motion_event(source="laptop_cam", message=base_message)
        event["frameTimestamp"] = frame_timestamp

        snapshot_bytes = None
        detections = []
        if self.detector:
          try:
            detections = self.detector.detect(frame)
          except Exception as exc:
            logger.exception("Object detection failed; continuing without detections: %s", exc)
          event["detections"] = detections
          if detections:
            labels = ", ".join(f"{det['label']} ({det['confidence'] * 100:.0f}%)" for det in detections)
            event["message"] = f"{base_message}: {labels}"

        try:
          success, buffer = cv2.imencode(".jpg", frame)
          if success:
            snapshot_bytes = buffer.tobytes()
        except Exception as exc:
          logger.debug("Failed to encode snapshot for event: %s", exc)

        if self._event_loop is not None:
          try:
            future = asyncio.run_coroutine_threadsafe(self.event_service.persist_event(event, snapshot_bytes), self._event_loop)
            future.result()
          except Exception as exc:
            logger.exception("Failed to record webcam motion event: %s", exc)
      else:
        frames_without_motion += 1
        if frames_without_motion >= self.settings.cam_baseline_refresh_frames:
          baseline = processed
          frames_without_motion = 0

      time.sleep(self.settings.cam_frame_interval)

    cap.release()
    logger.info("Laptop camera monitor stopped.")
