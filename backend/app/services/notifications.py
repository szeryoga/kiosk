import html

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.models.models import DeliveryMode, Order, ShopSettings, User, UserProvider


def _escape(value: str | None) -> str:
    return html.escape((value or "").strip())


def _delivery_mode_label(mode: DeliveryMode) -> str:
    return "Доставка" if mode == DeliveryMode.delivery else "Самовывоз"


def _telegram_user_link(user: User | None) -> str | None:
    if not user or user.provider != UserProvider.telegram or not user.username:
        return None
    username = user.username.strip().lstrip("@")
    if not username:
        return None
    escaped_username = html.escape(username)
    return f'<a href="https://t.me/{escaped_username}">@{escaped_username}</a>'


def ensure_telegram_notifications_configured(settings: ShopSettings) -> None:
    app_settings = get_settings()
    if not app_settings.telegram_bot_token:
        raise HTTPException(status_code=500, detail="Telegram bot not configured")
    if not settings.admin_telegram_id:
        raise HTTPException(status_code=400, detail="Admin Telegram ID is not configured")


def build_order_notification_text(order: Order, user: User | None = None) -> str:
    lines = [
        "<b>Новый заказ</b>",
        f"Заказ: #{order.id}",
        f"Имя: {_escape(order.customer_name)}",
        f"Телефон: {_escape(order.customer_phone)}",
        f"Email: {_escape(order.customer_email) or 'не указан'}",
        f"Способ получения: {_escape(_delivery_mode_label(order.delivery_mode))}",
    ]
    telegram_link = _telegram_user_link(user)
    if telegram_link:
        lines.append(f"Telegram: {telegram_link}")
    if order.delivery_address:
        lines.append(f"Адрес: {_escape(order.delivery_address)}")
    if order.customer_note:
        lines.append(f"Комментарий: {_escape(order.customer_note)}")
    lines.append("")
    lines.append("<b>Состав заказа</b>")
    for item in order.items:
        lines.append(f"- {_escape(item.product_name)} x{item.quantity} = {item.line_total} ₽")
    lines.append("")
    lines.append(f"<b>Итого: {order.subtotal} ₽</b>")
    return "\n".join(lines)


def send_order_notification(order: Order, settings: ShopSettings, user: User | None = None) -> None:
    ensure_telegram_notifications_configured(settings)
    app_settings = get_settings()
    url = f"https://api.telegram.org/bot{app_settings.telegram_bot_token}/sendMessage"
    payload = {
        "chat_id": settings.admin_telegram_id,
        "text": build_order_notification_text(order, user),
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }
    try:
        response = httpx.post(url, json=payload, timeout=15.0)
        response.raise_for_status()
        data = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Failed to send Telegram notification") from exc

    if not data.get("ok"):
        description = data.get("description") or "Failed to send Telegram notification"
        raise HTTPException(status_code=502, detail=description)
