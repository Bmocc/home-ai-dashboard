"""Thin wrapper around optional YOLO object detection."""

import logging
from typing import Any, Dict, List, Optional

from ..settings import Settings

try:
  from ultralytics import YOLO
except ImportError:
  YOLO = None  # type: ignore

try:
  import torch
except ImportError:
  torch = None  # type: ignore

logger = logging.getLogger("home_ai_motion.detection")


class ObjectDetector:
  """Wrap a YOLO model so we can flip between CPU/GPU via env."""

  def __init__(self, settings: Settings):
    self.settings = settings
    self.device = self._resolve_device()
    self.model = self._load_model()

  def _resolve_device(self) -> str:
    if self.settings.ai_device_mode in ("gpu", "cuda"):
      if torch and torch.cuda.is_available():
        return "cuda"
      logger.warning("AI_DEVICE_MODE=gpu requested but CUDA is not available; falling back to CPU.")
    return "cpu"

  def _load_model(self):
    if YOLO is None:
      logger.warning("ultralytics is not installed; object detection is disabled.")
      return None
    try:
      model = YOLO(self.settings.ai_model_path)
      logger.info("Loaded object detector %s on %s", self.settings.ai_model_path, self.device)
      return model
    except Exception as exc:
      logger.exception("Failed to load object detector: %s", exc)
      return None

  def detect(self, frame) -> List[Dict[str, Any]]:
    """Run detection on a BGR frame and return top predictions."""
    if not self.model:
      return []

    height, width = frame.shape[:2]
    results = self.model(
      frame,
      device=self.device,
      conf=self.settings.ai_confidence_threshold,
      verbose=False,
    )
    detections: List[Dict[str, Any]] = []
    for result in results:
      names = result.names or {}
      boxes = getattr(result, "boxes", None)
      if boxes is None:
        continue

      for box in boxes:
        cls_id = int(box.cls[0]) if getattr(box, "cls", None) is not None else -1
        label = names.get(cls_id, f"class_{cls_id}")
        conf_score = float(box.conf[0]) if getattr(box, "conf", None) is not None else 0.0
        xyxy = box.xyxy[0].tolist() if getattr(box, "xyxy", None) is not None else None
        bbox = None
        if xyxy and len(xyxy) == 4 and width and height:
          x1, y1, x2, y2 = xyxy
          bbox = {
            "x1": max(0.0, min(1.0, x1 / width)),
            "y1": max(0.0, min(1.0, y1 / height)),
            "x2": max(0.0, min(1.0, x2 / width)),
            "y2": max(0.0, min(1.0, y2 / height)),
          }
        detections.append({"label": label, "confidence": conf_score, "bbox": bbox})

    detections.sort(key=lambda det: det["confidence"], reverse=True)
    return detections[: self.settings.ai_max_detections]
