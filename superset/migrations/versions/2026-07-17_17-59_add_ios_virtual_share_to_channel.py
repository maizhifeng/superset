"""add ios虚拟支付分成 to channel_metadata

Revision ID: add_channel_ios_share
Revises: add_merchant_ios_share
Create Date: 2026-07-17 17:59:00.000000

"""

from alembic import op
from sqlalchemy import Column, String

from superset.migrations.shared.utils import table_has_column

revision = "add_channel_ios_share"
down_revision = "add_merchant_ios_share"


def upgrade():
    if not table_has_column("channel_metadata", "ios虚拟支付分成"):
        with op.batch_alter_table("channel_metadata", schema="config") as batch_op:
            batch_op.add_column(Column("ios虚拟支付分成", String(255), nullable=True))


def downgrade():
    if table_has_column("channel_metadata", "ios虚拟支付分成"):
        with op.batch_alter_table("channel_metadata", schema="config") as batch_op:
            batch_op.drop_column("ios虚拟支付分成")
