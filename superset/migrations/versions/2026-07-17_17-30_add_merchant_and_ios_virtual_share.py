"""add 商户分成 and ios虚拟支付分成 to profit_sharing

Revision ID: add_merchant_ios_share
Revises: consolidate_v1
Create Date: 2026-07-17 17:30:00.000000

"""

from alembic import op
from sqlalchemy import Column, String

from superset.migrations.shared.utils import table_has_column

revision = "add_merchant_ios_share"
down_revision = "consolidate_v1"


def upgrade():
    if not table_has_column("profit_sharing", "商户分成", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.add_column(Column("商户分成", String(255), nullable=True))

    if not table_has_column("profit_sharing", "ios虚拟支付分成", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.add_column(Column("ios虚拟支付分成", String(255), nullable=True))


def downgrade():
    if table_has_column("profit_sharing", "ios虚拟支付分成", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.drop_column("ios虚拟支付分成")

    if table_has_column("profit_sharing", "商户分成", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.drop_column("商户分成")
