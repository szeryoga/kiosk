from datetime import datetime

from pydantic import BaseModel, EmailStr

from app.models.models import DeliveryMode, FulfillmentStatus, PaymentStatus, UserProvider
from app.schemas.common import ORMModel


class SocialLinkRead(ORMModel):
    id: int
    platform: str
    url: str
    sort_order: int


class SocialLinkUpdate(BaseModel):
    platform: str
    url: str
    sort_order: int = 0


class ShopSettingsPublicRead(ORMModel):
    store_name: str
    slogan: str
    about_text: str
    address: str
    phone: str
    working_hours: str
    delivery_info: str
    pickup_info: str
    social_links: list[SocialLinkRead]


class ShopSettingsAdminRead(ShopSettingsPublicRead):
    admin_login: str
    sbp_provider_name: str | None = None
    sbp_public_label: str | None = None


class ShopSettingsUpdate(BaseModel):
    store_name: str
    slogan: str
    about_text: str
    address: str
    phone: str
    working_hours: str
    delivery_info: str
    pickup_info: str
    admin_login: str
    admin_password: str | None = None
    sbp_provider_name: str | None = None
    sbp_public_label: str | None = None
    social_links: list[SocialLinkUpdate]


class CategoryRead(ORMModel):
    id: int
    name: str
    sort_order: int


class SubcategoryRead(ORMModel):
    id: int
    category_id: int
    name: str
    sort_order: int


class ProductRead(ORMModel):
    id: int
    uuid: str
    category_id: int | None
    subcategory_id: int | None
    name: str
    short_description: str
    description: str
    price: int
    image_key: str | None = None
    image_url: str | None = None
    is_active: bool
    orders_count: int = 0


class EventRead(ORMModel):
    id: int
    uuid: str
    title: str
    description: str
    starts_at: datetime
    image_key: str | None = None
    image_url: str | None = None


class ProductCreateUpdate(BaseModel):
    category_id: int | None = None
    subcategory_id: int | None = None
    name: str
    short_description: str
    description: str
    price: int
    image_url: str | None = None
    image_key: str | None = None
    is_active: bool = True


class CategoryCreateUpdate(BaseModel):
    name: str
    sort_order: int = 0


class SubcategoryCreateUpdate(BaseModel):
    category_id: int
    name: str
    sort_order: int = 0


class EventCreateUpdate(BaseModel):
    title: str
    description: str
    starts_at: datetime
    image_url: str | None = None
    image_key: str | None = None


class OrderItemInput(BaseModel):
    product_id: int
    quantity: int


class OrderCreateRequest(BaseModel):
    user_token: str | None = None
    full_name: str
    phone: str
    email: EmailStr | None = None
    delivery_mode: DeliveryMode
    delivery_address: str | None = None
    customer_note: str | None = None
    items: list[OrderItemInput]
    idempotency_key: str
    payment_device_type: str | None = None
    payment_device_os: str | None = None
    payment_device_webview: bool = False


class OrderItemRead(ORMModel):
    id: int
    product_id: int | None
    image_url: str | None = None
    product_name: str
    unit_price: int
    quantity: int
    line_total: int


class OrderRead(ORMModel):
    id: int
    user_id: int | None
    customer_name: str
    customer_phone: str
    customer_email: str | None
    delivery_mode: DeliveryMode
    delivery_address: str | None
    customer_note: str | None
    subtotal: int
    payment_status: PaymentStatus
    fulfillment_status: FulfillmentStatus
    payment_url: str | None
    created_at: datetime
    items: list[OrderItemRead]


class PaymentBankRead(BaseModel):
    id: str
    name: str
    logo_url: str | None = None


class PaymentSessionRead(BaseModel):
    provider: str
    payment_id: str
    payment_url: str | None = None
    qr_payload: str | None = None
    qr_image_svg: str | None = None
    banks: list[PaymentBankRead] = []


class OrderCreateResponse(OrderRead):
    payment_session: PaymentSessionRead | None = None


class PaymentLinkRequest(BaseModel):
    bank_id: str


class PaymentLinkResponse(BaseModel):
    url: str | None = None


class PaymentBanksRequest(BaseModel):
    payment_device_type: str | None = None
    payment_device_os: str | None = None
    payment_device_webview: bool = False


class PaymentBanksResponse(BaseModel):
    banks: list[PaymentBankRead] = []
    qr_payload: str | None = None
    qr_image_svg: str | None = None


class OrderStatusUpdate(BaseModel):
    fulfillment_status: FulfillmentStatus


class PaymentWebhookRequest(BaseModel):
    payment_id: str
    status: PaymentStatus
    signature: str | None = None
    payload: dict


class UploadResponse(BaseModel):
    key: str
    url: str


class ClientRead(ORMModel):
    id: int
    provider: UserProvider
    provider_user_id: str
    username: str | None = None
    full_name: str | None = None
    phone: str | None = None
    email: str | None = None
    last_login_at: datetime | None = None
    orders_count: int = 0


class ClientDetailRead(ClientRead):
    orders: list[OrderRead]


class PublicBootstrapRead(BaseModel):
    settings: ShopSettingsPublicRead
    categories: list[CategoryRead]
    subcategories: list[SubcategoryRead]
    products: list[ProductRead]
    events: list[EventRead]
    profile: "ProfileResponse | None" = None


class ProfileResponse(BaseModel):
    user: "UserRead"
    orders: list[OrderRead]


from app.schemas.auth import UserRead  # noqa: E402

PublicBootstrapRead.model_rebuild()
ProfileResponse.model_rebuild()
