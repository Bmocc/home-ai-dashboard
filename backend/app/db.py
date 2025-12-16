"""SQLite helpers and thin repository utilities."""

import os
import sqlite3
import threading
from contextlib import contextmanager
from typing import Iterator, Optional

from .settings import Settings


def ensure_parent_dir(path: str) -> None:
  directory = os.path.dirname(path)
  if directory and not os.path.exists(directory):
    os.makedirs(directory, exist_ok=True)


class Database:
  """Simple SQLite helper that serializes writes with a lock."""

  def __init__(self, settings: Settings):
    self.settings = settings
    self._lock = threading.Lock()
    ensure_parent_dir(self.settings.app_db_path)
    ensure_parent_dir(self.settings.snapshot_dir + "/placeholder")

  @contextmanager
  def connect(self) -> Iterator[sqlite3.Connection]:
    conn = sqlite3.connect(self.settings.app_db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
      yield conn
    finally:
      conn.close()

  @contextmanager
  def write_lock(self) -> Iterator[None]:
    with self._lock:
      yield

  def init_db(self, *, default_username: str, default_password_hash: str) -> None:
    """Create tables and seed the default user."""
    with self.write_lock():
      with self.connect() as conn:
        conn.execute(
          """
          CREATE TABLE IF NOT EXISTS motion_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            source TEXT NOT NULL,
            message TEXT NOT NULL,
            severity TEXT,
            zone TEXT,
            thumbnail_url TEXT,
            frame_timestamp TEXT,
            detections TEXT,
            snapshot_path TEXT
          )
          """
        )
        conn.execute(
          """
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            last_token TEXT
          )
          """
        )
        conn.commit()

        cursor = conn.execute("PRAGMA table_info(motion_events)")
        columns = {row[1] for row in cursor.fetchall()}
        if "detections" not in columns:
          conn.execute("ALTER TABLE motion_events ADD COLUMN detections TEXT")
        if "snapshot_path" not in columns:
          conn.execute("ALTER TABLE motion_events ADD COLUMN snapshot_path TEXT")
        conn.commit()

        cursor = conn.execute("SELECT id FROM users WHERE username = ?", (default_username,))
        if cursor.fetchone() is None:
          conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)",
            (default_username, default_password_hash),
          )
          conn.commit()

  def get_user(self, username: str) -> Optional[sqlite3.Row]:
    with self.connect() as conn:
      cursor = conn.execute("SELECT * FROM users WHERE username = ?", (username,))
      return cursor.fetchone()

  def update_user(self, username: str, password_hash: str, user_id: int) -> None:
    with self.write_lock():
      with self.connect() as conn:
        conn.execute("UPDATE users SET username = ?, password_hash = ? WHERE id = ?", (username, password_hash, user_id))
        conn.commit()

  def store_token(self, user_id: int, token: str) -> None:
    with self.write_lock():
      with self.connect() as conn:
        conn.execute("UPDATE users SET last_token = ? WHERE id = ?", (token, user_id))
        conn.commit()
