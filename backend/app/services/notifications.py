"""Notification worker to send motion events to a webhook."""

import logging
import queue
import threading
from typing import Dict, Optional

import requests

logger = logging.getLogger("home_ai_motion.notifications")


class NotificationWorker:
  """Background thread that posts high-severity events to a webhook."""

  def __init__(self, webhook_url: str):
    self.webhook_url = webhook_url
    self._stop = threading.Event()
    self._queue: "queue.Queue[Dict]" = queue.Queue()
    self._thread: Optional[threading.Thread] = None

  def start(self) -> None:
    if not self.webhook_url or self._thread:
      return
    self._thread = threading.Thread(target=self._run, name="notify-worker", daemon=True)
    self._thread.start()

  def stop(self) -> None:
    self._stop.set()
    if self._thread:
      self._thread.join(timeout=5)

  def enqueue(self, event: Dict) -> None:
    if not self.webhook_url:
      return
    try:
      self._queue.put_nowait(event)
    except queue.Full:
      logger.debug("Notification queue is full; dropping event %s", event.get("id"))

  def _run(self) -> None:
    while not self._stop.is_set():
      try:
        event = self._queue.get(timeout=1)
      except queue.Empty:
        continue
      try:
        requests.post(
          self.webhook_url,
          json={"type": "motion_event", "payload": event},
          timeout=5,
        )
      except Exception as exc:
        logger.debug("Notification webhook failed: %s", exc)
