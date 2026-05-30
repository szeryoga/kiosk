from datetime import datetime

from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.config import get_settings
from app.db.session import SessionLocal
from app.models.models import (
    Category,
    DeliveryMode,
    Event,
    FulfillmentStatus,
    Order,
    OrderItem,
    PaymentStatus,
    Product,
    ShopSettings,
    SocialLink,
    Subcategory,
    User,
    UserProvider,
)
from app.services.auth import hash_password


def seed_initial_data() -> None:
    db = SessionLocal()
    try:
      db.execute(text("ALTER TABLE social_links DROP COLUMN IF EXISTS image_key"))
      db.execute(text("ALTER TABLE social_links DROP COLUMN IF EXISTS image_url"))
      db.execute(text("ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL"))
      db.execute(text("ALTER TABLE shop_settings ADD COLUMN IF NOT EXISTS admin_telegram_login VARCHAR(255)"))
      db.execute(text("""
          UPDATE products
          SET category_id = subcategories.category_id
          FROM subcategories
          WHERE products.subcategory_id = subcategories.id
            AND (products.category_id IS NULL OR products.category_id <> subcategories.category_id)
      """))
      db.execute(text("UPDATE orders SET fulfillment_status = 'shipped' WHERE fulfillment_status = 'received'"))
      settings = get_settings()
      shop = db.scalar(select(ShopSettings).where(ShopSettings.id == 1))
      if not shop:
          db.add(
              ShopSettings(
                  id=1,
                  store_name="Киоск",
                  slogan="Чай, какао, специи и события в спокойной домашней атмосфере",
                  about_text=(
                      "Небольшой магазин в Санкт-Петербурге с авторским чаем, какао, травами, грибами, "
                      "пряностями, благовониями и камерными событиями для друзей магазина."
                  ),
                  address="Санкт-Петербург, Литейный проспект, 21",
                  phone="+7 (921) 000-00-00",
                  working_hours="Ежедневно 11:00-21:00",
                  delivery_info="Оплата доставки производится при получении товара в ПВЗ.",
                  pickup_info="Самовывоз доступен в часы работы магазина. Заказ хранится 3 дня.",
                  admin_login=settings.admin_login,
                  admin_telegram_login=None,
                  admin_password_hash=hash_password(settings.admin_password),
                  sbp_provider_name="СБП",
                  sbp_public_label="Оплата через СБП",
              )
          )
      if not db.scalar(select(SocialLink.id).limit(1)):
          db.add_all(
              [
                  SocialLink(platform="telegram", url="https://t.me/kiosk_spb", sort_order=1),
                  SocialLink(platform="instagram", url="https://instagram.com/kiosk_spb", sort_order=2),
                  SocialLink(platform="vk", url="https://vk.com/kiosk_spb", sort_order=3),
              ]
          )
      if not db.scalar(select(Category.id).limit(1)):
          tea = Category(name="Чай", sort_order=1)
          cacao = Category(name="Какао", sort_order=2)
          spices = Category(name="Пряности и травы", sort_order=3)
          db.add_all([tea, cacao, spices])
          db.flush()
          tea_black = Subcategory(category_id=tea.id, name="Авторские смеси", sort_order=1)
          tea_herbal = Subcategory(category_id=tea.id, name="Травяные сборы", sort_order=2)
          cacao_sub = Subcategory(category_id=cacao.id, name="Какао и напитки", sort_order=1)
          spices_sub = Subcategory(category_id=spices.id, name="Восточные пряности", sort_order=1)
          db.add_all([tea_black, tea_herbal, cacao_sub, spices_sub])
          db.flush()
          db.add_all(
              [
                  Product(
                      category_id=tea.id,
                      subcategory_id=tea_black.id,
                      name="Чай “Дорога на север”",
                      short_description="Уютная смесь с черным чаем, какао шелухой и апельсином.",
                      description="Плотный чай для прохладных вечеров с мягкой цитрусовой сладостью и домашним теплом.",
                      price=890,
                      image_url="https://images.unsplash.com/photo-1544787219-7f47ccb76574?auto=format&fit=crop&w=900&q=80",
                  ),
                  Product(
                      category_id=tea.id,
                      subcategory_id=tea_herbal.id,
                      name="Сбор “Тихий вечер”",
                      short_description="Мята, ромашка, чабрец и лист смородины.",
                      description="Травяной сбор для спокойного вечера и медленного разговора.",
                      price=740,
                      image_url="https://images.unsplash.com/photo-1515823064-d6e0c04616a7?auto=format&fit=crop&w=900&q=80",
                  ),
                  Product(
                      category_id=cacao.id,
                      subcategory_id=cacao_sub.id,
                      name="Какао с кардамоном",
                      short_description="Густой напиток с мягкими восточными нотами.",
                      description="Авторская какао-смесь для приготовления дома или в дороге.",
                      price=950,
                      image_url="https://images.unsplash.com/photo-1517578239113-b03992dcdd25?auto=format&fit=crop&w=900&q=80",
                  ),
                  Product(
                      category_id=spices.id,
                      subcategory_id=spices_sub.id,
                      name="Набор восточных пряностей",
                      short_description="Корица, кардамон, бадьян, перец кубеба.",
                      description="Сет для напитков, десертов и медленных домашних экспериментов.",
                      price=1190,
                      image_url="https://images.unsplash.com/photo-1532336414038-cf19250c5757?auto=format&fit=crop&w=900&q=80",
                  ),
              ]
          )
      if not db.scalar(select(Event.id).limit(1)):
          db.add_all(
              [
                  Event(
                      title="Чайная встреча: весенние смеси",
                      description="Камерная дегустация и разговор о сезонных ароматах.",
                      starts_at=datetime.fromisoformat("2026-05-12T19:00:00+03:00"),
                      image_url="https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
                  ),
                  Event(
                      title="Вечер какао и музыки",
                      description="Собираемся после работы, слушаем винил и пробуем авторские напитки.",
                      starts_at=datetime.fromisoformat("2026-05-20T20:00:00+03:00"),
                      image_url="https://images.unsplash.com/photo-1509042239860-f550ce710b93?auto=format&fit=crop&w=1200&q=80",
                  ),
              ]
          )
      if not db.scalar(select(User.id).limit(1)):
          sample_users = [
              User(
                  provider=UserProvider.guest,
                  provider_user_id="guest-anna-1",
                  username="annam",
                  full_name="Анна Миронова",
                  phone="+7 921 101-10-10",
                  email="anna.kiosk@example.com",
                  last_login_at=datetime.fromisoformat("2026-05-04T18:40:00+03:00"),
              ),
              User(
                  provider=UserProvider.telegram,
                  provider_user_id="tg-100200300",
                  username="denis_tea",
                  full_name="Денис Крылов",
                  phone="+7 921 202-20-20",
                  email="denis.kiosk@example.com",
                  last_login_at=datetime.fromisoformat("2026-05-05T09:15:00+03:00"),
              ),
              User(
                  provider=UserProvider.guest,
                  provider_user_id="guest-elena-1",
                  full_name="Елена Васильева",
                  phone="+7 921 303-30-30",
                  email="elena.kiosk@example.com",
                  last_login_at=datetime.fromisoformat("2026-05-03T14:05:00+03:00"),
              ),
          ]
          db.add_all(sample_users)
          db.flush()

          products = list(db.scalars(select(Product).order_by(Product.id)).all())
          if len(products) >= 4:
              orders = [
                  Order(
                      user_id=sample_users[0].id,
                      customer_name="Анна Миронова",
                      customer_phone="+7 921 101-10-10",
                      customer_email="anna.kiosk@example.com",
                      delivery_mode=DeliveryMode.pickup,
                      delivery_address=None,
                      customer_note="Заберу после 18:00",
                      subtotal=products[0].price + products[2].price,
                      payment_status=PaymentStatus.paid,
                      fulfillment_status=FulfillmentStatus.shipped,
                      payment_url="https://bank.example/pay/order-anna",
                      idempotency_key="seed-order-anna-1",
                  ),
                  Order(
                      user_id=sample_users[1].id,
                      customer_name="Денис Крылов",
                      customer_phone="+7 921 202-20-20",
                      customer_email="denis.kiosk@example.com",
                      delivery_mode=DeliveryMode.delivery,
                      delivery_address="Санкт-Петербург, ул. Чайковского, 18",
                      customer_note="Позвонить за час до доставки",
                      subtotal=products[1].price * 2 + products[3].price,
                      payment_status=PaymentStatus.pending,
                      fulfillment_status=FulfillmentStatus.new,
                      payment_url="https://bank.example/pay/order-denis",
                      idempotency_key="seed-order-denis-1",
                  ),
                  Order(
                      user_id=sample_users[2].id,
                      customer_name="Елена Васильева",
                      customer_phone="+7 921 303-30-30",
                      customer_email="elena.kiosk@example.com",
                      delivery_mode=DeliveryMode.pickup,
                      delivery_address=None,
                      customer_note=None,
                      subtotal=products[2].price + products[3].price,
                      payment_status=PaymentStatus.paid,
                      fulfillment_status=FulfillmentStatus.shipped,
                      payment_url="https://bank.example/pay/order-elena",
                      idempotency_key="seed-order-elena-1",
                  ),
              ]
              db.add_all(orders)
              db.flush()
              db.add_all(
                  [
                      OrderItem(
                          order_id=orders[0].id,
                          product_id=products[0].id,
                          product_name=products[0].name,
                          unit_price=products[0].price,
                          quantity=1,
                          line_total=products[0].price,
                      ),
                      OrderItem(
                          order_id=orders[0].id,
                          product_id=products[2].id,
                          product_name=products[2].name,
                          unit_price=products[2].price,
                          quantity=1,
                          line_total=products[2].price,
                      ),
                      OrderItem(
                          order_id=orders[1].id,
                          product_id=products[1].id,
                          product_name=products[1].name,
                          unit_price=products[1].price,
                          quantity=2,
                          line_total=products[1].price * 2,
                      ),
                      OrderItem(
                          order_id=orders[1].id,
                          product_id=products[3].id,
                          product_name=products[3].name,
                          unit_price=products[3].price,
                          quantity=1,
                          line_total=products[3].price,
                      ),
                      OrderItem(
                          order_id=orders[2].id,
                          product_id=products[2].id,
                          product_name=products[2].name,
                          unit_price=products[2].price,
                          quantity=1,
                          line_total=products[2].price,
                      ),
                      OrderItem(
                          order_id=orders[2].id,
                          product_id=products[3].id,
                          product_name=products[3].name,
                          unit_price=products[3].price,
                          quantity=1,
                          line_total=products[3].price,
                      ),
                  ]
              )
      try:
          db.commit()
      except IntegrityError:
          db.rollback()
    finally:
      db.close()
