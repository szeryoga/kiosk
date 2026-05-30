import logging

import httpx
from fastapi import HTTPException

from app.core.config import get_settings

logger = logging.getLogger("uvicorn.error")


def normalize_telegram_target(value: str) -> str:
    target = value.strip()
    if not target:
        return ""
    if target.startswith("@") or target.startswith("-") or target.isdigit():
        return target
    return f"@{target}"


def send_telegram_message(target: str, text: str) -> None:
    settings = get_settings()
    if not settings.telegram_bot_token:
        raise HTTPException(status_code=503, detail="Telegram bot is not configured")

    normalized_target = normalize_telegram_target(target)
    if not normalized_target:
        raise HTTPException(status_code=400, detail="Telegram recipient is not configured")

    url = f"https://api.telegram.org/bot{settings.telegram_bot_token}/sendMessage"
    payload = {
        "chat_id": normalized_target,
        "text": text,
        "disable_web_page_preview": True,
    }
    try:
        response = httpx.post(url, json=payload, timeout=10)
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("Telegram sendMessage failed", exc_info=exc)
        raise HTTPException(status_code=502, detail="Telegram notification failed") from exc

    data = response.json()
    if not data.get("ok"):
        description = data.get("description") or "Telegram notification failed"
        raise HTTPException(status_code=502, detail=description)
