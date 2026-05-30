from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Kiosk API"
    debug: bool = False
    database_url: str = Field(default="postgresql+psycopg://kiosk:kiosk@postgres:5432/kiosk")
    cors_origins: str = Field(default="http://127.0.0.1:3015,http://127.0.0.1:8015")
    admin_login: str = "admin"
    admin_password: str = "admin"
    jwt_secret: str = "change_me"
    jwt_expire_hours: int = 168
    admin_jwt_expire_hours: int = 12
    s3_endpoint_url: str = ""
    s3_region: str = "ru-1"
    s3_bucket: str = ""
    s3_access_key_id: str = ""
    s3_secret_access_key: str = ""
    s3_public_base_url: str = ""
    tbank_terminal_key: str = ""
    tbank_terminal_password: str = ""
    tbank_debug: bool = False
    tbank_notification_url: str = ""
    tbank_success_url: str = ""
    tbank_fail_url: str = ""
    tbank_merchant_name: str = ""
    tbank_merchant_id: str = ""
    tbank_terminal_id: str = ""
    tbank_sbp_merchant_id: str = ""
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore")

    @property
    def cors_origin_list(self) -> list[str]:
        return [item.strip() for item in self.cors_origins.split(",") if item.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
