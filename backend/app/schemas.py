"""Pydantic schemas shared across routers."""

from typing import Any, Dict, List, Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
  username: str
  password: str


class LoginResponse(BaseModel):
  token: str
  token_type: str = "bearer"
  expires_in: int
  username: str


class ProfileUpdateRequest(BaseModel):
  currentPassword: str
  newUsername: Optional[str] = None
  newPassword: Optional[str] = None


class ProfileUpdateResponse(BaseModel):
  token: str
  username: str


class MotionEventsResponse(BaseModel):
  events: List[Dict[str, Any]]
