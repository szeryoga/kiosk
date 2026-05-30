from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.models import ShopSettings, User
from app.services.auth import decode_token


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_admin(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> ShopSettings:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized") from exc
    if payload.get("type") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    settings = db.get(ShopSettings, 1)
    if not settings:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Settings missing")
    return settings


def get_current_user(db: Session = Depends(get_db), authorization: str | None = Header(default=None)) -> User | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        payload = decode_token(token)
    except ValueError:
        return None
    if payload.get("type") != "user":
        return None
    user_id = int(payload["sub"])
    return db.get(User, user_id)
