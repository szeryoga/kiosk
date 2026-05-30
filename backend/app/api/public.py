import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, File, Header, HTTPException, Request, UploadFile, status
from fastapi.responses import PlainTextResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_current_user, get_db
from app.models.models import (
    Category,
    Event,
    FulfillmentStatus,
    Order,
    OrderItem,
    PaymentStatus,
    PaymentWebhookLog,
    Product,
    ShopSettings,
    SocialLink,
    Subcategory,
    User,
    UserProvider,
)
from app.schemas.auth import ProfileUpdateRequest, PublicTelegramAuthRequest, TokenResponse, UserRead
from app.schemas.shop import (
    OrderCreateRequest,
    OrderCreateResponse,
    ProductQuickOrderRequest,
    ProductQuickOrderResponse,
    OrderRead,
    PaymentBanksRequest,
    PaymentBanksResponse,
    PaymentLinkRequest,
    PaymentLinkResponse,
    PaymentWebhookRequest,
    ProfileResponse,
    PublicBootstrapRead,
)
from app.services.auth import create_token
from app.services.notifications import send_telegram_message
from app.services.payment import (
    cancel_tbank_payment,
    TBankDeviceInfo,
    create_sbp_payment,
    get_tbank_bank_payment_link,
    get_tbank_payment_session,
    map_provider_status,
    payment_session_to_dict,
    verify_webhook_signature,
)

router = APIRouter(prefix="/public", tags=["public"])
logger = logging.getLogger("uvicorn.error")


def _profile_from_user(user: User | None) -> ProfileResponse | None:
    if not user:
        return None
    return ProfileResponse(user=UserRead.model_validate(user), orders=[OrderRead.model_validate(item) for item in user.orders])


def _product_read_from_row(product: Product, orders_count: int | None) -> dict:
    return {
        "id": product.id,
        "uuid": product.uuid,
        "category_id": product.category_id,
        "subcategory_id": product.subcategory_id,
        "name": product.name,
        "short_description": product.short_description,
        "description": product.description,
        "price": product.price,
        "image_key": product.image_key,
        "image_url": product.image_url,
        "is_active": product.is_active,
        "orders_count": orders_count or 0,
    }


def _format_quick_order_message(
    product: Product,
    payload: ProductQuickOrderRequest,
    settings: ShopSettings,
    current_user: User | None,
) -> str:
    customer_name = payload.customer_name or (current_user.full_name if current_user else None)
    customer_phone = payload.customer_phone or (current_user.phone if current_user else None)
    customer_email = payload.customer_email or (current_user.email if current_user else None)

    lines = [
        f"Новый быстрый заказ: {settings.store_name}",
        "",
        f"Товар: {product.name}",
        f"Цена: {product.price} ₽",
        f"UUID: {product.uuid}",
    ]
    if payload.order_details:
        lines.extend(["", "Детали заказа:", payload.order_details.strip()])

    contacts: list[str] = []
    if customer_name:
        contacts.append(f"Имя: {customer_name}")
    if payload.customer_username:
        contacts.append(f"Telegram: @{payload.customer_username.lstrip('@')}")
    if payload.customer_telegram_id:
        contacts.append(f"Telegram ID: {payload.customer_telegram_id}")
    if customer_phone:
        contacts.append(f"Телефон: {customer_phone}")
    if customer_email:
        contacts.append(f"Email: {customer_email}")
    if contacts:
        lines.extend(["", "Контакты:"])
        lines.extend(contacts)

    return "\n".join(lines)

@router.get("/bootstrap", response_model=PublicBootstrapRead)
def bootstrap(user: User | None = Depends(get_current_user), db: Session = Depends(get_db)) -> PublicBootstrapRead:
    settings = db.get(ShopSettings, 1)
    if not settings:
        raise HTTPException(status_code=500, detail="Settings missing")
    categories = list(db.scalars(select(Category).order_by(Category.sort_order, Category.id)).all())
    subcategories = list(db.scalars(select(Subcategory).order_by(Subcategory.sort_order, Subcategory.id)).all())
    product_rows = db.execute(
        select(Product, func.count(OrderItem.id).label("orders_count"))
        .outerjoin(OrderItem, OrderItem.product_id == Product.id)
        .where(Product.is_active.is_(True))
        .group_by(Product.id)
        .order_by(Product.id.desc())
    ).all()
    products = [_product_read_from_row(product, orders_count) for product, orders_count in product_rows]
    events = list(db.scalars(select(Event).order_by(Event.starts_at.desc())).all())
    social_links = list(db.scalars(select(SocialLink).order_by(SocialLink.sort_order, SocialLink.id)).all())
    public_settings = {
        "store_name": settings.store_name,
        "slogan": settings.slogan,
        "about_text": settings.about_text,
        "address": settings.address,
        "phone": settings.phone,
        "working_hours": settings.working_hours,
        "delivery_info": settings.delivery_info,
        "pickup_info": settings.pickup_info,
        "social_links": social_links,
    }
    if user:
        user.orders
    return PublicBootstrapRead(
        settings=public_settings,
        categories=categories,
        subcategories=subcategories,
        products=products,
        events=events,
        profile=_profile_from_user(user),
    )


@router.post("/auth/telegram", response_model=TokenResponse)
def auth_telegram(payload: PublicTelegramAuthRequest, db: Session = Depends(get_db)) -> TokenResponse:
    user = db.scalar(
        select(User).where(User.provider == UserProvider.telegram, User.provider_user_id == payload.telegram_id)
    )
    if not user:
        user = User(provider=UserProvider.telegram, provider_user_id=payload.telegram_id)
        db.add(user)
    user.username = payload.username
    user.avatar_url = payload.avatar_url
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    return TokenResponse(access_token=create_token(str(user.id), "user"), user_id=user.id)


@router.post("/product-quick-order", response_model=ProductQuickOrderResponse)
def create_product_quick_order(
    payload: ProductQuickOrderRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_current_user),
) -> ProductQuickOrderResponse:
    product = db.scalar(select(Product).where(Product.uuid == payload.product_uuid, Product.is_active.is_(True)))
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    settings = db.get(ShopSettings, 1)
    if not settings:
        raise HTTPException(status_code=500, detail="Settings missing")
    if not settings.admin_telegram_login:
        raise HTTPException(status_code=400, detail="Telegram recipient is not configured")

    message = _format_quick_order_message(product, payload, settings, current_user)
    send_telegram_message(settings.admin_telegram_login, message)
    return ProductQuickOrderResponse(ok=True)


@router.get("/profile", response_model=ProfileResponse)
def get_profile(user: User | None = Depends(get_current_user)) -> ProfileResponse:
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user.orders
    return _profile_from_user(user)  # type: ignore[return-value]


@router.put("/profile", response_model=ProfileResponse)
def update_profile(
    payload: ProfileUpdateRequest,
    user: User | None = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProfileResponse:
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user.full_name = payload.full_name
    user.phone = payload.phone
    user.email = payload.email
    user.delivery_address = payload.delivery_address
    user.last_login_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(user)
    user.orders
    return _profile_from_user(user)  # type: ignore[return-value]


@router.post("/orders", response_model=OrderCreateResponse)
def create_order(payload: OrderCreateRequest, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)) -> OrderCreateResponse:
    product_ids = [item.product_id for item in payload.items]
    products = list(db.scalars(select(Product).where(Product.id.in_(product_ids))).all())
    product_map = {item.id: item for item in products}
    if len(products) != len(product_ids):
        raise HTTPException(status_code=400, detail="Some products were not found")
    existing = db.scalar(select(Order).where(Order.idempotency_key == payload.idempotency_key))
    if existing:
        existing.items
        return OrderRead.model_validate(existing)

    subtotal = 0
    order = Order(
        user_id=current_user.id if current_user else None,
        customer_name=payload.full_name,
        customer_phone=payload.phone,
        customer_email=payload.email,
        delivery_mode=payload.delivery_mode,
        delivery_address=payload.delivery_address,
        customer_note=payload.customer_note,
        subtotal=0,
        payment_status=PaymentStatus.pending,
        fulfillment_status=FulfillmentStatus.new,
        idempotency_key=payload.idempotency_key,
    )
    db.add(order)
    db.flush()
    for item in payload.items:
        product = product_map[item.product_id]
        line_total = product.price * item.quantity
        subtotal += line_total
        db.add(
            OrderItem(
                order_id=order.id,
                product_id=product.id,
                product_name=product.name,
                unit_price=product.price,
                quantity=item.quantity,
                line_total=line_total,
            )
        )
    order.subtotal = subtotal
    payment_id, payment_url = create_sbp_payment(order)
    order.sbp_payment_id = payment_id
    order.payment_url = payment_url
    db.commit()
    db.refresh(order)
    order.items
    device = TBankDeviceInfo(
        type=payload.payment_device_type or "mobile",
        os=payload.payment_device_os or "unknown",
        is_webview=payload.payment_device_webview,
    )
    try:
        payment_session = payment_session_to_dict(get_tbank_payment_session(order, device))
    except HTTPException:
        payment_session = {
            "provider": "tbank_sbp",
            "payment_id": order.sbp_payment_id or "",
            "payment_url": order.payment_url,
            "qr_payload": None,
            "qr_image_svg": None,
            "banks": [],
        }
    return OrderCreateResponse(**OrderRead.model_validate(order).model_dump(), payment_session=payment_session)


@router.get("/orders/{order_id}", response_model=OrderRead)
def get_order(order_id: int, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)) -> OrderRead:
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product))
        .where(Order.id == order_id, Order.user_id == current_user.id)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderRead.model_validate(order)


@router.post("/orders/{order_id}/cancel", response_model=OrderRead)
def cancel_order(order_id: int, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)) -> OrderRead:
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product))
        .where(Order.id == order_id, Order.user_id == current_user.id)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    order.fulfillment_status = FulfillmentStatus.canceled
    db.commit()
    db.refresh(order)
    order.items
    return OrderRead.model_validate(order)


@router.post("/orders/{order_id}/cancel-payment", response_model=OrderRead)
def cancel_order_payment(order_id: int, db: Session = Depends(get_db), current_user: User | None = Depends(get_current_user)) -> OrderRead:
    if not current_user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    order = db.scalar(
        select(Order)
        .options(selectinload(Order.items).selectinload(OrderItem.product))
        .where(Order.id == order_id, Order.user_id == current_user.id)
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    if order.sbp_payment_id and order.payment_status == PaymentStatus.pending:
        cancel_tbank_payment(order.sbp_payment_id)

    order.payment_status = PaymentStatus.failed
    order.fulfillment_status = FulfillmentStatus.canceled
    db.commit()
    db.refresh(order)
    order.items
    return OrderRead.model_validate(order)


@router.post("/orders/{order_id}/payment-link", response_model=PaymentLinkResponse)
def get_order_payment_link(order_id: int, payload: PaymentLinkRequest, db: Session = Depends(get_db)) -> PaymentLinkResponse:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    return PaymentLinkResponse(url=get_tbank_bank_payment_link(order, payload.bank_id))


@router.post("/orders/{order_id}/payment-banks", response_model=PaymentBanksResponse)
def get_order_payment_banks(order_id: int, payload: PaymentBanksRequest, db: Session = Depends(get_db)) -> PaymentBanksResponse:
    order = db.scalar(select(Order).where(Order.id == order_id))
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    logger.info(
        "TBANK payment-banks endpoint | order_id=%s device_type=%s webview=%s",
        order_id,
        payload.payment_device_type or "mobile",
        payload.payment_device_webview,
    )
    device = TBankDeviceInfo(
        type=payload.payment_device_type or "mobile",
        os=payload.payment_device_os or "unknown",
        is_webview=payload.payment_device_webview,
    )
    session = get_tbank_payment_session(order, device)
    return PaymentBanksResponse(
        banks=[
            {"id": item.id, "name": item.name, "logo_url": item.logo_url}
            for item in session.banks
        ],
        qr_payload=session.qr_payload,
        qr_image_svg=session.qr_image_svg,
    )


@router.post("/payments/webhook")
async def payment_webhook(
    request: Request,
    db: Session = Depends(get_db),
) -> PlainTextResponse:
    raw = await request.body()
    payload = json.loads(raw.decode() or "{}")
    is_valid = verify_webhook_signature(payload)
    db.add(PaymentWebhookLog(provider="tbank_sbp", payload=payload, signature=str(payload.get("Token") or ""), is_valid=is_valid))
    if not is_valid:
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid signature")

    payment_id = payload.get("PaymentId") or payload.get("payment_id")
    if payment_id:
        order = db.scalar(select(Order).where(Order.sbp_payment_id == str(payment_id)))
        if order:
            order.payment_status = map_provider_status(str(payload.get("Status") or payload.get("status") or "pending"))
    db.commit()
    return PlainTextResponse("OK")
