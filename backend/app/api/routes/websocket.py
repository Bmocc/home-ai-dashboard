"""WebSocket endpoint for live motion events."""

import asyncio

from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect, status

from ...security import decode_token

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, request: Request) -> None:
  settings = request.app.state.settings
  db = request.app.state.db
  manager = request.app.state.ws_manager

  token = websocket.query_params.get("token")
  if not token:
    await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    return
  try:
    payload = decode_token(token, settings)
    username = payload.get("sub")
    if not username or not db.get_user(username):
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
