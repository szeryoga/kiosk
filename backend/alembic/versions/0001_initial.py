"""initial schema"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "shop_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("store_name", sa.String(length=255), nullable=False),
        sa.Column("slogan", sa.String(length=255), nullable=False),
        sa.Column("about_text", sa.Text(), nullable=False),
        sa.Column("address", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=64), nullable=False),
        sa.Column("working_hours", sa.String(length=255), nullable=False),
        sa.Column("delivery_info", sa.Text(), nullable=False),
        sa.Column("pickup_info", sa.Text(), nullable=False),
        sa.Column("admin_login", sa.String(length=120), nullable=False),
        sa.Column("admin_password_hash", sa.String(length=255), nullable=False),
        sa.Column("sbp_provider_name", sa.String(length=120), nullable=True),
        sa.Column("sbp_public_label", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "social_links",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("platform", sa.String(length=64), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "subcategories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("category_id", sa.Integer(), sa.ForeignKey("categories.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "products",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("uuid", sa.String(length=36), nullable=False, unique=True),
        sa.Column("subcategory_id", sa.Integer(), sa.ForeignKey("subcategories.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("short_description", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("image_key", sa.String(length=255), nullable=True),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "events",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("uuid", sa.String(length=36), nullable=False, unique=True),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("image_key", sa.String(length=255), nullable=True),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_user_id", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("full_name", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=64), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("provider", "provider_user_id", name="uq_users_provider"),
    )
    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("customer_name", sa.String(length=255), nullable=False),
        sa.Column("customer_phone", sa.String(length=64), nullable=False),
        sa.Column("customer_email", sa.String(length=255), nullable=True),
        sa.Column("delivery_mode", sa.String(length=32), nullable=False),
        sa.Column("delivery_address", sa.String(length=500), nullable=True),
        sa.Column("customer_note", sa.Text(), nullable=True),
        sa.Column("subtotal", sa.Integer(), nullable=False),
        sa.Column("payment_status", sa.String(length=32), nullable=False),
        sa.Column("fulfillment_status", sa.String(length=32), nullable=False),
        sa.Column("sbp_payment_id", sa.String(length=255), nullable=True),
        sa.Column("payment_url", sa.String(length=500), nullable=True),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "order_items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("product_id", sa.Integer(), sa.ForeignKey("products.id", ondelete="SET NULL"), nullable=True),
        sa.Column("product_name", sa.String(length=255), nullable=False),
        sa.Column("unit_price", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("line_total", sa.Integer(), nullable=False),
    )
    op.create_table(
        "payment_webhook_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("provider", sa.String(length=120), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("signature", sa.String(length=255), nullable=True),
        sa.Column("is_valid", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("payment_webhook_logs")
    op.drop_table("order_items")
    op.drop_table("orders")
    op.drop_table("users")
    op.drop_table("events")
    op.drop_table("products")
    op.drop_table("subcategories")
    op.drop_table("categories")
    op.drop_table("social_links")
    op.drop_table("shop_settings")
