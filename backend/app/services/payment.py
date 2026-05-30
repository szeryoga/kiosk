import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

import httpx
from fastapi import HTTPException

from app.core.config import get_settings
from app.models.models import Order, PaymentStatus

TBANK_API_BASE = "https://securepay.tinkoff.ru/v2"
logger = logging.getLogger("uvicorn.error")


@dataclass
class TBankDeviceInfo:
    type: str
    os: str
    is_webview: bool = False


@dataclass
class TBankBank:
    id: str
    name: str
    logo_url: str | None = None


@dataclass
class TBankPaymentInit:
    payment_id: str
    payment_url: str | None
    status: str


@dataclass
class TBankPaymentSession:
    payment_id: str
    payment_url: str | None
    qr_payload: str | None
    qr_image_svg: str | None
    banks: list[TBankBank]


def _is_tbank_enabled() -> bool:
    settings = get_settings()
    return bool(settings.tbank_terminal_key and settings.tbank_terminal_password)


def _tbank_token(payload: dict) -> str:
    settings = get_settings()
    values: dict[str, str] = {}
    for key, value in payload.items():
        if key == "Token" or isinstance(value, (dict, list)) or value is None:
            continue
        if isinstance(value, bool):
            values[key] = "true" if value else "false"
        else:
            values[key] = str(value)
    values["Password"] = settings.tbank_terminal_password
    source = "".join(values[key] for key in sorted(values))
    return hashlib.sha256(source.encode("utf-8")).hexdigest()


def _sanitize_tbank_payload(payload: dict) -> dict:
    sanitized: dict[str, Any] = {}
    for key, value in payload.items():
        if key in {"Password", "Token"}:
            sanitized[key] = "***"
            continue
        if isinstance(value, dict):
            sanitized[key] = _sanitize_tbank_payload(value)
            continue
        if isinstance(value, list):
            sanitized[key] = [_sanitize_tbank_payload(item) if isinstance(item, dict) else item for item in value]
            continue
        sanitized[key] = value
    return sanitized


def _shorten_text(value: str, limit: int = 700) -> str:
    collapsed = " ".join(value.split())
    if len(collapsed) <= limit:
        return collapsed
    return f"{collapsed[:limit]}..."


def _with_query_params(url: str, **params: str) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    query.update(params)
    return urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _tbank_debug(message: str, **extra: Any) -> None:
    settings = get_settings()
    if not settings.tbank_debug:
        return
    if extra:
        logger.info("TBANK %s | %s", message, extra)
        return
    logger.info("TBANK %s", message)


def _tbank_request(path: str, payload: dict) -> dict:
    body = {**payload, "Token": _tbank_token(payload)}
    _tbank_debug("request", path=path, payload=_sanitize_tbank_payload(body))
    try:
        response = httpx.post(
            f"{TBANK_API_BASE}{path}",
            json=body,
            headers={"Content-Type": "application/json"},
            timeout=20,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        _tbank_debug("http_error", path=path, error=str(exc))
        raise HTTPException(status_code=502, detail="T-Bank API is unavailable") from exc

    data = response.json()
    _tbank_debug(
        "response",
        path=path,
        status_code=response.status_code,
        body=_sanitize_tbank_payload(data) if isinstance(data, dict) else _shorten_text(str(data)),
    )
    if not data.get("Success", False):
        message = data.get("Message") or data.get("Details") or data.get("ErrorCode") or "T-Bank request failed"
        raise HTTPException(status_code=502, detail=f"T-Bank: {message}")
    return data


def _tbank_raw_request(path: str, payload: dict) -> tuple[dict | None, str]:
    body = {**payload, "Token": _tbank_token(payload)}
    _tbank_debug("request_raw", path=path, payload=_sanitize_tbank_payload(body))
    try:
        response = httpx.post(
            f"{TBANK_API_BASE}{path}",
            json=body,
            headers={"Content-Type": "application/json"},
            timeout=20,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        _tbank_debug("http_error_raw", path=path, error=str(exc))
        raise HTTPException(status_code=502, detail="T-Bank API is unavailable") from exc

    text = response.text
    try:
        data = response.json()
    except ValueError:
        data = None
    _tbank_debug(
        "response_raw",
        path=path,
        status_code=response.status_code,
        json_body=_sanitize_tbank_payload(data) if isinstance(data, dict) else None,
        text_preview=_shorten_text(text),
    )
    return data, text


def _extract_nested_strings(value: Any) -> list[str]:
    values: list[str] = []
    if isinstance(value, str):
        stripped = value.strip()
        if stripped:
            values.append(stripped)
        return values
    if isinstance(value, dict):
        for nested in value.values():
            values.extend(_extract_nested_strings(nested))
        return values
    if isinstance(value, list):
        for nested in value:
            values.extend(_extract_nested_strings(nested))
    return values


def _pick_qr_payload(data: dict | None, text: str) -> str | None:
    candidates: list[str] = []
    if data is not None:
        for key in ("Data", "data", "Payload", "payload", "DeepLink", "deepLink", "Url", "url"):
            if key in data:
                candidates.extend(_extract_nested_strings(data[key]))
        candidates.extend(_extract_nested_strings(data))
    raw_text = text.strip()
    if raw_text:
        candidates.append(raw_text)

    for candidate in candidates:
        lowered = candidate.lower()
        if lowered.startswith(("https://", "http://", "sbp://", "intent://")):
            return candidate
    return None


def _pick_qr_image(data: dict | None, text: str) -> str | None:
    candidates: list[str] = []
    if data is not None:
        for key in ("Data", "data", "Image", "image", "Svg", "svg", "QrImage", "qrImage"):
            if key in data:
                candidates.extend(_extract_nested_strings(data[key]))
        candidates.extend(_extract_nested_strings(data))
    raw_text = text.strip()
    if raw_text:
        candidates.append(raw_text)

    for candidate in candidates:
        lowered = candidate.lower()
        if "<svg" in lowered or lowered.startswith("data:image/"):
            return candidate
    return None


def is_tbank_sbp_enabled() -> bool:
    return _is_tbank_enabled()


def create_sbp_payment(order: Order) -> tuple[str, str]:
    settings = get_settings()
    payment = init_tbank_sbp_payment(order)
    if payment.payment_url:
        return payment.payment_id, payment.payment_url
    if settings.tbank_success_url:
        return payment.payment_id, settings.tbank_success_url
    return payment.payment_id, "https://example.com/payment-success"


def init_tbank_sbp_payment(order: Order) -> TBankPaymentInit:
    settings = get_settings()
    if not _is_tbank_enabled():
        raise HTTPException(status_code=500, detail="T-Bank payment is not configured")

    due_at = datetime.now(timezone.utc) + timedelta(minutes=30)
    success_url = _with_query_params(settings.tbank_success_url, payment_order=str(order.id), payment_return="success") if settings.tbank_success_url else ""
    fail_url = _with_query_params(settings.tbank_fail_url, payment_order=str(order.id), payment_return="fail") if settings.tbank_fail_url else ""
    payload = {
        "TerminalKey": settings.tbank_terminal_key,
        "Amount": order.subtotal * 100,
        "OrderId": str(order.id),
        "Description": f"Заказ №{order.id} в {settings.tbank_merchant_name or 'Po Putea'}",
        "PayType": "O",
        "NotificationURL": settings.tbank_notification_url,
        "SuccessURL": success_url,
        "FailURL": fail_url,
        "RedirectDueDate": due_at.strftime("%Y-%m-%dT%H:%M:%S+00:00"),
        "DATA": {
            "QR": "true",
        },
    }
    data = _tbank_request("/Init", payload)
    return TBankPaymentInit(
        payment_id=str(data.get("PaymentId")),
        payment_url=data.get("PaymentURL"),
        status=str(data.get("Status") or "NEW"),
    )


def get_tbank_sbp_banks(device: TBankDeviceInfo) -> list[TBankBank]:
    settings = get_settings()
    if not _is_tbank_enabled():
        return []

    data = _tbank_request(
        "/GetQrBankList",
        {
            "TerminalKey": settings.tbank_terminal_key,
            "ScenarioType": "qr",
            "Device": {
                "Type": "mobile" if device.type.lower() == "mobile" else "desktop",
                "Os": device.os or "unknown",
            },
        },
    )
    raw_banks = data.get("Banks") or data.get("banks") or data.get("Data") or data.get("data") or []
    if isinstance(raw_banks, dict):
        raw_banks = (
            raw_banks.get("Banks")
            or raw_banks.get("banks")
            or raw_banks.get("Items")
            or raw_banks.get("items")
            or []
        )
    banks: list[TBankBank] = []
    for item in raw_banks:
        if not isinstance(item, dict):
            continue
        bank_id = str(item.get("BankId") or item.get("bankId") or item.get("Id") or item.get("id") or "")
        name = str(item.get("Name") or item.get("BankName") or item.get("bankName") or item.get("name") or "").strip()
        logo_url = item.get("Logo") or item.get("LogoUrl") or item.get("logoUrl")
        if bank_id and name:
            banks.append(TBankBank(id=bank_id, name=name, logo_url=str(logo_url) if logo_url else None))
    _tbank_debug("banks_parsed", count=len(banks), bank_ids=[bank.id for bank in banks])
    return banks


def get_tbank_qr(payment_id: str, bank_id: str | None = None, image: bool = False) -> str | None:
    settings = get_settings()
    if not _is_tbank_enabled():
        return None

    payload: dict[str, object] = {
        "TerminalKey": settings.tbank_terminal_key,
        "PaymentId": payment_id,
        "DataType": "IMAGE" if image else "PAYLOAD",
    }
    if bank_id and not image:
        payload["BankId"] = bank_id
    data, text = _tbank_raw_request("/GetQr", payload)
    if data is not None:
        if not data.get("Success", False):
            _tbank_debug("qr_failed", payment_id=payment_id, bank_id=bank_id, image=image)
            return None
    result = _pick_qr_image(data, text) if image else _pick_qr_payload(data, text)
    _tbank_debug(
        "qr_parsed",
        payment_id=payment_id,
        bank_id=bank_id,
        image=image,
        has_result=bool(result),
        preview=_shorten_text(result or "", 180) if result else None,
    )
    return result


def get_tbank_payment_session(order: Order, device: TBankDeviceInfo) -> TBankPaymentSession:
    try:
        banks = get_tbank_sbp_banks(device) if device.type.lower() == "mobile" else []
    except HTTPException:
        banks = []
    try:
        qr_payload = get_tbank_qr(order.sbp_payment_id, image=False) if order.sbp_payment_id else None
    except HTTPException:
        qr_payload = None
    try:
        qr_image_svg = get_tbank_qr(order.sbp_payment_id, image=True) if order.sbp_payment_id else None
    except HTTPException:
        qr_image_svg = None
    _tbank_debug(
        "payment_session",
        order_id=order.id,
        payment_id=order.sbp_payment_id,
        bank_count=len(banks),
        has_qr_payload=bool(qr_payload),
        has_qr_image=bool(qr_image_svg),
        has_payment_url=bool(order.payment_url),
    )
    return TBankPaymentSession(
        payment_id=order.sbp_payment_id or "",
        payment_url=order.payment_url,
        qr_payload=qr_payload,
        qr_image_svg=qr_image_svg,
        banks=banks,
    )


def get_tbank_bank_payment_link(order: Order, bank_id: str) -> str | None:
    if not order.sbp_payment_id:
        return None
    return get_tbank_qr(order.sbp_payment_id, bank_id=bank_id, image=False)


def verify_webhook_signature(payload: dict) -> bool:
    token = str(payload.get("Token") or "")
    if not token:
        return False
    return token == _tbank_token(payload)


def get_tbank_payment_state(payment_id: str) -> dict:
    settings = get_settings()
    return _tbank_request(
        "/GetState",
        {
            "TerminalKey": settings.tbank_terminal_key,
            "PaymentId": payment_id,
        },
    )


def cancel_tbank_payment(payment_id: str) -> dict:
    settings = get_settings()
    return _tbank_request(
        "/Cancel",
        {
            "TerminalKey": settings.tbank_terminal_key,
            "PaymentId": payment_id,
        },
    )


def map_provider_status(status: str) -> PaymentStatus:
    normalized = status.lower()
    mapping = {
        "paid": PaymentStatus.paid,
        "success": PaymentStatus.paid,
        "confirmed": PaymentStatus.paid,
        "authorized": PaymentStatus.paid,
        "completed": PaymentStatus.paid,
        "failed": PaymentStatus.failed,
        "error": PaymentStatus.failed,
        "rejected": PaymentStatus.failed,
        "deadline_expired": PaymentStatus.failed,
        "canceled": PaymentStatus.failed,
        "cancelled": PaymentStatus.failed,
    }
    return mapping.get(normalized, PaymentStatus.pending)


def payment_session_to_dict(session: TBankPaymentSession) -> dict:
    return {
        "provider": "tbank_sbp",
        "payment_id": session.payment_id,
        "payment_url": session.payment_url,
        "qr_payload": session.qr_payload,
        "qr_image_svg": session.qr_image_svg,
        "banks": [
            {"id": item.id, "name": item.name, "logo_url": item.logo_url}
            for item in session.banks
        ],
    }
