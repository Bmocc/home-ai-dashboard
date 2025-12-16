"""Media endpoints for snapshots and latest frame."""

import io

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse, StreamingResponse

router = APIRouter()


@router.get("/latest-frame")
def get_latest_frame(request: Request) -> StreamingResponse:
  camera_monitor = request.app.state.camera_monitor
  frame = camera_monitor.latest_frame_bytes() if camera_monitor else None
  if not frame:
    raise HTTPException(status_code=404, detail="No frame captured yet.")
  return StreamingResponse(io.BytesIO(frame), media_type="image/jpeg")


@router.get("/event-snapshot/{event_id}")
def get_event_snapshot(event_id: int, request: Request) -> FileResponse:
  event_service = request.app.state.event_service
  path = event_service.get_snapshot_path(event_id)
  if not path:
    raise HTTPException(status_code=404, detail="Snapshot not found.")
  return FileResponse(path, media_type="image/jpeg")
