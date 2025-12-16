"""Motion event helpers and persistence."""

import json
import logging
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from ..db import Database, ensure_parent_dir
from ..settings import Settings
from ..websocket_manager import ConnectionManager
from .notifications import NotificationWorker

logger = logging.getLogger("home_ai_motion.events")


class EventService:
  """Create, persist, and broadcast motion events."""

  def __init__(
    self,
    settings: Settings,
    db: Database,
    ws_manager: ConnectionManager,
    notifier: Optional[NotificationWorker] = None,
  ):
    self.settings = settings
    self.db = db
    self.ws_manager = ws_manager
    self.notifier = notifier

  def create_motion_event(self, *, source: str | None = None, message: str = "Simulated motion detected") -> Dict[str, Any]:
    return {
      "timestamp": datetime.now(tz=timezone.utc).isoformat(),
      "source": source or random.choice(self.settings.sources),
      "message": message,
      "severity": random.choice(self.settings.severity_levels),
      "zone": random.choice(self.settings.zones),
      "thumbnailUrl": self.settings.thumbnail_placeholder,
    }

  def fetch_motion_events(self, limit: int | None = None) -> List[Dict[str, Any]]:
    limit = limit or self.settings.app_events_limit
    with self.db.connect() as conn:
      cursor = conn.execute(
        "SELECT id, timestamp, source, message, severity, zone, thumbnail_url, frame_timestamp, detections, snapshot_path FROM motion_events ORDER BY id DESC LIMIT ?",
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
        "thumbnailUrl": row["thumbnail_url"] or (f"/api/event-snapshot/{row['id']}" if row["snapshot_path"] else None),
        "frameTimestamp": row["frame_timestamp"],
        "detections": json.loads(row["detections"]) if row["detections"] else [],
      }
      for row in rows
    ]
    events.reverse()
    return events

  async def persist_event(self, event: Dict[str, Any], snapshot_bytes: bytes | None = None) -> Dict[str, Any]:
    if "detections" not in event:
      event["detections"] = []
    snapshot_path: Optional[str] = None

    with self.db.write_lock():
      with self.db.connect() as conn:
        cursor = conn.execute(
          """
          INSERT INTO motion_events (timestamp, source, message, severity, zone, thumbnail_url, frame_timestamp, detections, snapshot_path)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          """,
          (
            event["timestamp"],
            event["source"],
            event["message"],
            event.get("severity"),
            event.get("zone"),
            event.get("thumbnailUrl"),
            event.get("frameTimestamp"),
            json.dumps(event.get("detections") or []),
            snapshot_path,
          ),
        )
        conn.commit()
        event["id"] = cursor.lastrowid

        if snapshot_bytes:
          ensure_parent_dir(self.settings.snapshot_dir)
          snapshot_path = os.path.join(self.settings.snapshot_dir, f"event-{event['id']}.jpg")
          try:
            with open(snapshot_path, "wb") as f:
              f.write(snapshot_bytes)
            conn.execute("UPDATE motion_events SET snapshot_path = ?, thumbnail_url = ? WHERE id = ?", (snapshot_path, f"/api/event-snapshot/{event['id']}", event["id"]))
            conn.commit()
            event["thumbnailUrl"] = f"/api/event-snapshot/{event['id']}"
          except Exception as exc:
            logger.exception("Failed to save snapshot for event %s: %s", event["id"], exc)

    await self.ws_manager.broadcast({"type": "motion_event", "payload": event})

    if self.notifier and str(event.get("severity", "")).lower() == "high":
      self.notifier.enqueue(event)
    return event

  def get_snapshot_path(self, event_id: int) -> Optional[str]:
    with self.db.connect() as conn:
      cursor = conn.execute("SELECT snapshot_path FROM motion_events WHERE id = ?", (event_id,))
      row = cursor.fetchone()
      if row and row["snapshot_path"] and os.path.exists(row["snapshot_path"]):
        return row["snapshot_path"]
    return None

  def prune_old_events(self) -> int:
    """Delete events older than retention_days. Returns number pruned."""
    if self.settings.retention_days <= 0:
      return 0
    cutoff = datetime.now(tz=timezone.utc) - timedelta(days=self.settings.retention_days)
    cutoff_iso = cutoff.isoformat()
    with self.db.write_lock():
      with self.db.connect() as conn:
        cursor = conn.execute("SELECT id, snapshot_path FROM motion_events WHERE timestamp < ?", (cutoff_iso,))
        rows = cursor.fetchall()
        ids = [row["id"] for row in rows]
        snapshots = [row["snapshot_path"] for row in rows if row["snapshot_path"]]
        for path in snapshots:
          try:
            if os.path.exists(path):
              os.remove(path)
          except Exception:
            logger.debug("Failed to remove snapshot %s", path)
        if ids:
          conn.executemany("DELETE FROM motion_events WHERE id = ?", [(id_,) for id_ in ids])
          conn.commit()
    return len(ids)
