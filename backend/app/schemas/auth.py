from pydantic import BaseModel, EmailStr

from app.models.models import UserProvider
from app.schemas.common import ORMModel


class TokenResponse(BaseModel):
    access_token: str
    user_id: int


class AdminLoginRequest(BaseModel):
    login: str
    password: str


class PublicTelegramAuthRequest(BaseModel):
    telegram_id: str
    username: str | None = None
    full_name: str | None = None
    avatar_url: str | None = None


class ProfileUpdateRequest(BaseModel):
    full_name: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    delivery_address: str | None = None


class UserRead(ORMModel):
    id: int
    provider: UserProvider
    username: str | None = None
    avatar_url: str | None = None
    full_name: str | None = None
    phone: str | None = None
    email: EmailStr | None = None
    delivery_address: str | None = None
