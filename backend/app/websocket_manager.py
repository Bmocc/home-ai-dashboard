"""WebSocket connection tracking and broadcasting."""

from typing import Any, Dict, List

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder


class ConnectionManager:
  """Track active WebSocket connections and broadcast events."""

  def __init__(self) -> None:
    self.active_connections: List[WebSocket] = []

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
    disconnected: List[WebSocket] = []

    for connection in list(self.active_connections):
      try:
        await connection.send_json(payload)
      except Exception:
        disconnected.append(connection)

    for connection in disconnected:
      self.disconnect(connection)
