"""add user delivery address

Revision ID: 0002_user_delivery_address
Revises: 0001_initial
Create Date: 2026-05-27
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_user_delivery_address"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("delivery_address", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "delivery_address")
