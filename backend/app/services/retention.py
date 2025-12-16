"""Retention pruning background worker."""

import logging
import threading
from typing import Optional

from .events import EventService

logger = logging.getLogger("home_ai_motion.retention")


class RetentionPruner:
  def __init__(self, event_service: EventService, interval_seconds: int):
    self.event_service = event_service
    self.interval_seconds = interval_seconds
    self._stop = threading.Event()
    self._thread: Optional[threading.Thread] = None

  def start(self) -> None:
    if self._thread:
      return
    self._thread = threading.Thread(target=self._run, daemon=True, name="retention-pruner")
    self._thread.start()

  def stop(self) -> None:
    self._stop.set()
    if self._thread:
      self._thread.join(timeout=5)

  def _run(self) -> None:
    while not self._stop.is_set():
      pruned = self.event_service.prune_old_events()
      if pruned:
        logger.info("Pruned %s old events", pruned)
      self._stop.wait(self.interval_seconds)
