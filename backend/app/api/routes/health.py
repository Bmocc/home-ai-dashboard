"""Health endpoint."""

from fastapi import APIRouter, Request

router = APIRouter()


@router.get("/health")
def health_check(request: Request) -> dict:
  settings = request.app.state.settings
  return {"status": "ok", "host": settings.app_host, "port": str(settings.app_port)}
