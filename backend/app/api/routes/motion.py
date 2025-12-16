"""Motion event routes."""

from fastapi import APIRouter, Depends, Request

from ... import schemas
from ...security import require_token

router = APIRouter()


@router.get("/motion-events", response_model=schemas.MotionEventsResponse)
async def get_motion_events(request: Request, _: str = Depends(require_token)) -> schemas.MotionEventsResponse:
  events = request.app.state.event_service.fetch_motion_events()
  return schemas.MotionEventsResponse(events=events)


@router.post("/motion-events/simulate")
async def simulate_motion_event(request: Request, _: str = Depends(require_token)) -> dict:
  event_service = request.app.state.event_service
  event = event_service.create_motion_event()
  await event_service.persist_event(event)
  return event
