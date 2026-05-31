"""add admin telegram id

Revision ID: 0003_admin_telegram_id
Revises: 0002_user_delivery_address
Create Date: 2026-05-31
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_admin_telegram_id"
down_revision = "0002_user_delivery_address"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("shop_settings", sa.Column("admin_telegram_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("shop_settings", "admin_telegram_id")
