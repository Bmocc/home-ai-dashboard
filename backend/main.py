"""Simple FastAPI backend for the Home AI Motion Dashboard demo."""
from datetime import datetime, timezone
from typing import List, Dict, Any

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Home AI Motion Dashboard")

# Allow the Vite dev server (and phones hitting via LAN IP) to call the API.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory store for fake motion events; replace with a real database later.
motion_events: List[Dict[str, Any]] = []
_next_event_id = 1


def _create_motion_event() -> Dict[str, Any]:
    """Create a new simulated motion event payload."""
    global _next_event_id
    event = {
        "id": _next_event_id,
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "source": "test",
        "message": "Simulated motion detected",
    }
    _next_event_id += 1
    return event


@app.get("/api/health")
def health_check() -> Dict[str, str]:
    """Health check endpoint so the frontend knows the backend is reachable."""
    return {"status": "ok"}


@app.get("/api/motion-events")
def get_motion_events() -> Dict[str, List[Dict[str, Any]]]:
    """Return the list of in-memory motion events."""
    return {"events": motion_events}


@app.post("/api/motion-events/simulate")
def simulate_motion_event() -> Dict[str, Any]:
    """Simulate an incoming motion event; later, plug real detectors here."""
    event = _create_motion_event()
    motion_events.append(event)
    return event


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
