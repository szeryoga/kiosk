from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import delete, or_, select
from sqlalchemy.orm import Session, selectinload

from app.api.deps import get_admin, get_db
from app.models.models import Category, Event, Order, OrderItem, Product, ShopSettings, SocialLink, Subcategory, User
from app.schemas.auth import AdminLoginRequest, TokenResponse
from app.schemas.shop import (
    CategoryCreateUpdate,
    CategoryRead,
    ClientDetailRead,
    ClientRead,
    EventCreateUpdate,
    EventRead,
    OrderRead,
    OrderStatusUpdate,
    ProductCreateUpdate,
    ProductRead,
    ShopSettingsAdminRead,
    ShopSettingsUpdate,
    SubcategoryCreateUpdate,
    SubcategoryRead,
    UploadResponse,
)
from app.services.auth import create_token, verify_password
from app.services.storage import upload_image_to_s3

router = APIRouter(prefix="/admin", tags=["admin"])


def _normalize_product_payload(payload: ProductCreateUpdate, db: Session) -> dict:
    data = payload.model_dump()
    subcategory_id = data.get("subcategory_id")
    if subcategory_id:
      subcategory = db.get(Subcategory, subcategory_id)
      if not subcategory:
          raise HTTPException(400, "Подкатегория не найдена")
      data["category_id"] = subcategory.category_id
      return data

    category_id = data.get("category_id")
    if category_id and not db.get(Category, category_id):
      raise HTTPException(400, "Категория не найдена")
    return data


def _client_read_from_user(user: User) -> ClientRead:
    return ClientRead(
        id=user.id,
        provider=user.provider,
        provider_user_id=user.provider_user_id,
        username=user.username,
        full_name=user.full_name,
        phone=user.phone,
        email=user.email,
        last_login_at=user.last_login_at,
        orders_count=len(user.orders),
    )


def _client_detail_read_from_user(user: User) -> ClientDetailRead:
    return ClientDetailRead(
        **_client_read_from_user(user).model_dump(),
        orders=[OrderRead.model_validate(item) for item in user.orders],
    )


@router.post("/login", response_model=TokenResponse)
def login(payload: AdminLoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    settings = db.get(ShopSettings, 1)
    if not settings or payload.login != "admin" or not verify_password(payload.password, settings.admin_password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неверный логин или пароль")
    return TokenResponse(access_token=create_token("admin", "admin"), user_id=1)


@router.get("/settings", response_model=ShopSettingsAdminRead, dependencies=[Depends(get_admin)])
def get_settings(db: Session = Depends(get_db)) -> ShopSettingsAdminRead:
    settings = db.get(ShopSettings, 1)
    social_links = list(db.scalars(select(SocialLink).order_by(SocialLink.sort_order, SocialLink.id)).all())
    return ShopSettingsAdminRead(
        store_name=settings.store_name,
        slogan=settings.slogan,
        about_text=settings.about_text,
        address=settings.address,
        phone=settings.phone,
        working_hours=settings.working_hours,
        delivery_info=settings.delivery_info,
        pickup_info=settings.pickup_info,
        admin_login="admin",
        sbp_provider_name=settings.sbp_provider_name,
        sbp_public_label=settings.sbp_public_label,
        social_links=social_links,
    )


@router.put("/settings", response_model=ShopSettingsAdminRead, dependencies=[Depends(get_admin)])
def update_settings(payload: ShopSettingsUpdate, db: Session = Depends(get_db)) -> ShopSettingsAdminRead:
    from app.services.auth import hash_password

    settings = db.get(ShopSettings, 1)
    settings.store_name = payload.store_name
    settings.slogan = payload.slogan
    settings.about_text = payload.about_text
    settings.address = payload.address
    settings.phone = payload.phone
    settings.working_hours = payload.working_hours
    settings.delivery_info = payload.delivery_info
    settings.pickup_info = payload.pickup_info
    settings.admin_login = "admin"
    settings.sbp_provider_name = payload.sbp_provider_name
    settings.sbp_public_label = payload.sbp_public_label
    if payload.admin_password:
        settings.admin_password_hash = hash_password(payload.admin_password)
    db.execute(delete(SocialLink))
    for item in payload.social_links:
        db.add(
            SocialLink(
                platform=item.platform,
                url=item.url,
                sort_order=item.sort_order,
            )
        )
    db.commit()
    return get_settings(db)


@router.get("/categories", response_model=list[CategoryRead], dependencies=[Depends(get_admin)])
def list_categories(db: Session = Depends(get_db)) -> list[Category]:
    return list(db.scalars(select(Category).order_by(Category.sort_order, Category.id)).all())


@router.post("/categories", response_model=CategoryRead, dependencies=[Depends(get_admin)])
def create_category(payload: CategoryCreateUpdate, db: Session = Depends(get_db)) -> Category:
    item = Category(name=payload.name, sort_order=payload.sort_order)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/categories/{category_id}", response_model=CategoryRead, dependencies=[Depends(get_admin)])
def update_category(category_id: int, payload: CategoryCreateUpdate, db: Session = Depends(get_db)) -> Category:
    item = db.get(Category, category_id)
    if not item:
        raise HTTPException(404, "Категория не найдена")
    item.name = payload.name
    item.sort_order = payload.sort_order
    db.commit()
    db.refresh(item)
    return item


@router.delete("/categories/{category_id}", dependencies=[Depends(get_admin)])
def delete_category(category_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.get(Category, category_id)
    if not item:
        raise HTTPException(404, "Категория не найдена")
    db.delete(item)
    db.commit()
    return {"success": True}


@router.get("/subcategories", response_model=list[SubcategoryRead], dependencies=[Depends(get_admin)])
def list_subcategories(db: Session = Depends(get_db)) -> list[Subcategory]:
    return list(db.scalars(select(Subcategory).order_by(Subcategory.sort_order, Subcategory.id)).all())


@router.post("/subcategories", response_model=SubcategoryRead, dependencies=[Depends(get_admin)])
def create_subcategory(payload: SubcategoryCreateUpdate, db: Session = Depends(get_db)) -> Subcategory:
    item = Subcategory(category_id=payload.category_id, name=payload.name, sort_order=payload.sort_order)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/subcategories/{subcategory_id}", response_model=SubcategoryRead, dependencies=[Depends(get_admin)])
def update_subcategory(subcategory_id: int, payload: SubcategoryCreateUpdate, db: Session = Depends(get_db)) -> Subcategory:
    item = db.get(Subcategory, subcategory_id)
    if not item:
        raise HTTPException(404, "Подкатегория не найдена")
    item.category_id = payload.category_id
    item.name = payload.name
    item.sort_order = payload.sort_order
    db.commit()
    db.refresh(item)
    return item


@router.delete("/subcategories/{subcategory_id}", dependencies=[Depends(get_admin)])
def delete_subcategory(subcategory_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.get(Subcategory, subcategory_id)
    if not item:
        raise HTTPException(404, "Подкатегория не найдена")
    db.delete(item)
    db.commit()
    return {"success": True}


@router.get("/products", response_model=list[ProductRead], dependencies=[Depends(get_admin)])
def list_products(subcategory_id: int | None = None, db: Session = Depends(get_db)) -> list[Product]:
    query = select(Product).order_by(Product.created_at.desc())
    if subcategory_id:
        query = query.where(Product.subcategory_id == subcategory_id)
    return list(db.scalars(query).all())


@router.post("/products", response_model=ProductRead, dependencies=[Depends(get_admin)])
def create_product(payload: ProductCreateUpdate, db: Session = Depends(get_db)) -> Product:
    item = Product(**_normalize_product_payload(payload, db))
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/products/{product_id}", response_model=ProductRead, dependencies=[Depends(get_admin)])
def update_product(product_id: int, payload: ProductCreateUpdate, db: Session = Depends(get_db)) -> Product:
    item = db.get(Product, product_id)
    if not item:
        raise HTTPException(404, "Товар не найден")
    for field, value in _normalize_product_payload(payload, db).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/products/{product_id}", dependencies=[Depends(get_admin)])
def delete_product(product_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.get(Product, product_id)
    if not item:
        raise HTTPException(404, "Товар не найден")
    db.delete(item)
    db.commit()
    return {"success": True}


@router.get("/events", response_model=list[EventRead], dependencies=[Depends(get_admin)])
def list_events(db: Session = Depends(get_db)) -> list[Event]:
    return list(db.scalars(select(Event).order_by(Event.starts_at.desc())).all())


@router.post("/events", response_model=EventRead, dependencies=[Depends(get_admin)])
def create_event(payload: EventCreateUpdate, db: Session = Depends(get_db)) -> Event:
    item = Event(**payload.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/events/{event_id}", response_model=EventRead, dependencies=[Depends(get_admin)])
def update_event(event_id: int, payload: EventCreateUpdate, db: Session = Depends(get_db)) -> Event:
    item = db.get(Event, event_id)
    if not item:
        raise HTTPException(404, "Событие не найдено")
    for field, value in payload.model_dump().items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/events/{event_id}", dependencies=[Depends(get_admin)])
def delete_event(event_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.get(Event, event_id)
    if not item:
        raise HTTPException(404, "Событие не найдено")
    db.delete(item)
    db.commit()
    return {"success": True}


@router.get("/orders", response_model=list[OrderRead], dependencies=[Depends(get_admin)])
def list_orders(db: Session = Depends(get_db)) -> list[Order]:
    return list(
        db.scalars(select(Order).options(selectinload(Order.items).selectinload(OrderItem.product)).order_by(Order.created_at.desc())).all()
    )


@router.get("/orders/{order_id}", response_model=OrderRead, dependencies=[Depends(get_admin)])
def get_order(order_id: int, db: Session = Depends(get_db)) -> Order:
    item = db.scalar(select(Order).options(selectinload(Order.items).selectinload(OrderItem.product)).where(Order.id == order_id))
    if not item:
        raise HTTPException(404, "Заказ не найден")
    return item


@router.put("/orders/{order_id}/status", response_model=OrderRead, dependencies=[Depends(get_admin)])
def update_order_status(order_id: int, payload: OrderStatusUpdate, db: Session = Depends(get_db)) -> Order:
    item = db.scalar(select(Order).options(selectinload(Order.items).selectinload(OrderItem.product)).where(Order.id == order_id))
    if not item:
        raise HTTPException(404, "Заказ не найден")
    item.fulfillment_status = payload.fulfillment_status
    db.commit()
    db.refresh(item)
    item.items
    return item


@router.delete("/orders/{order_id}", dependencies=[Depends(get_admin)])
def delete_order(order_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.get(Order, order_id)
    if not item:
        raise HTTPException(404, "Заказ не найден")
    db.delete(item)
    db.commit()
    return {"success": True}


@router.get("/clients", response_model=list[ClientRead], dependencies=[Depends(get_admin)])
def list_clients(q: str | None = None, db: Session = Depends(get_db)) -> list[ClientRead]:
    query = select(User).options(selectinload(User.orders)).order_by(User.last_login_at.desc().nullslast(), User.created_at.desc())
    if q:
        like = f"%{q}%"
        query = query.where(or_(User.full_name.ilike(like), User.username.ilike(like), User.email.ilike(like)))
    items = list(db.scalars(query).all())
    return [_client_read_from_user(item) for item in items]


@router.get("/clients/{client_id}", response_model=ClientDetailRead, dependencies=[Depends(get_admin)])
def get_client(client_id: int, db: Session = Depends(get_db)) -> ClientDetailRead:
    item = db.scalar(
        select(User).options(selectinload(User.orders).selectinload(Order.items).selectinload(OrderItem.product)).where(User.id == client_id)
    )
    if not item:
        raise HTTPException(404, "Клиент не найден")
    return _client_detail_read_from_user(item)


@router.delete("/clients/{client_id}", dependencies=[Depends(get_admin)])
def delete_client(client_id: int, db: Session = Depends(get_db)) -> dict[str, bool]:
    item = db.get(User, client_id)
    if not item:
        raise HTTPException(404, "Клиент не найден")
    db.delete(item)
    db.commit()
    return {"success": True}


@router.post("/uploads/{kind}", response_model=UploadResponse, dependencies=[Depends(get_admin)])
def upload_asset(kind: str, file: UploadFile = File(...), object_name: str | None = Form(default=None)) -> UploadResponse:
    if kind not in {"product", "event"}:
        raise HTTPException(400, "Unsupported upload kind")
    key, url = upload_image_to_s3(file, kind, object_name=object_name)
    return UploadResponse(key=key, url=url)
