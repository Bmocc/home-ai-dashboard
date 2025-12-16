"""API routers."""

from fastapi import APIRouter

from .routes import auth, health, motion, media, websocket

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/api", tags=["auth"])
api_router.include_router(health.router, prefix="/api", tags=["health"])
api_router.include_router(motion.router, prefix="/api", tags=["motion"])
api_router.include_router(media.router, prefix="/api", tags=["media"])
api_router.include_router(websocket.router, tags=["websocket"])
