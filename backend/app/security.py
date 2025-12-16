"""Authentication and authorization helpers."""

import hashlib
from datetime import datetime, timedelta, timezone
from typing import Dict

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .db import Database
from .settings import Settings

bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str, settings: Settings) -> str:
  return hashlib.sha256(f"{password}{settings.app_password_salt}".encode()).hexdigest()


def verify_password(password: str, password_hash: str, settings: Settings) -> bool:
  return hash_password(password, settings) == password_hash


def create_token(username: str, settings: Settings) -> str:
  payload = {
    "sub": username,
    "exp": datetime.now(tz=timezone.utc) + timedelta(seconds=settings.app_token_expire_seconds),
  }
  return jwt.encode(payload, settings.app_jwt_secret, algorithm=settings.app_jwt_algorithm)


def decode_token(token: str, settings: Settings) -> Dict:
  try:
    return jwt.decode(token, settings.app_jwt_secret, algorithms=[settings.app_jwt_algorithm])
  except jwt.PyJWTError as exc:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token") from exc


async def require_token(
  request: Request,
  credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
) -> str:
  settings: Settings = request.app.state.settings
  db: Database = request.app.state.db

  if not credentials or credentials.scheme.lower() != "bearer":
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header missing")

  payload = decode_token(credentials.credentials, settings)
  username = payload.get("sub")
  if not username:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

  user = db.get_user(username)
  if not user:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
  return username
