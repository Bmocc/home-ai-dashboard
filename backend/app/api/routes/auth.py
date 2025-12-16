"""Authentication and profile endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, status

from ... import schemas
from ...security import create_token, hash_password, require_token, verify_password

router = APIRouter()


@router.post("/login", response_model=schemas.LoginResponse)
def login(payload: schemas.LoginRequest, request: Request) -> schemas.LoginResponse:
  settings = request.app.state.settings
  db = request.app.state.db
  user = db.get_user(payload.username)
  if not user or not verify_password(payload.password, user["password_hash"], settings):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
  token = create_token(payload.username, settings)
  db.store_token(user["id"], token)
  return schemas.LoginResponse(token=token, expires_in=settings.app_token_expire_seconds, username=payload.username)


@router.get("/me")
def get_profile(current_user: str = Depends(require_token)) -> dict:
  return {"username": current_user}


@router.post("/profile", response_model=schemas.ProfileUpdateResponse)
def update_profile(payload: schemas.ProfileUpdateRequest, request: Request, current_user: str = Depends(require_token)) -> schemas.ProfileUpdateResponse:
  settings = request.app.state.settings
  db = request.app.state.db
  if not payload.newUsername and not payload.newPassword:
    raise HTTPException(status_code=400, detail="Provide a new username or password.")
  user = db.get_user(current_user)
  if not user or not verify_password(payload.currentPassword, user["password_hash"], settings):
    raise HTTPException(status_code=401, detail="Current password is incorrect.")

  target_username = payload.newUsername.strip() if payload.newUsername else current_user
  if payload.newUsername and payload.newUsername != current_user:
    if db.get_user(target_username):
      raise HTTPException(status_code=400, detail="Username already in use.")
  new_hash = hash_password(payload.newPassword, settings) if payload.newPassword else user["password_hash"]
  db.update_user(target_username, new_hash, user["id"])

  new_token = create_token(target_username, settings)
  db.store_token(user["id"], new_token)
  return schemas.ProfileUpdateResponse(token=new_token, username=target_username)
