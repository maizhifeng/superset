"""add 首测起始时间, 二测起始时间 and 三测起始时间 to profit_sharing

Revision ID: add_test_round_start_times
Revises: add_channel_ios_share
Create Date: 2026-09-14 11:16:00.000000

"""

from alembic import op
from sqlalchemy import Column, String

from superset.migrations.shared.utils import table_has_column

revision = "add_test_round_start_times"
down_revision = "add_channel_ios_share"

ROUND_COLUMNS = ("首测起始时间", "二测起始时间", "三测起始时间")


def upgrade():
    for column_name in ROUND_COLUMNS:
        if not table_has_column("profit_sharing", column_name, schema="config"):
            with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
                batch_op.add_column(Column(column_name, String(255), nullable=True))


def downgrade():
    for column_name in reversed(ROUND_COLUMNS):
        if table_has_column("profit_sharing", column_name, schema="config"):
            with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
                batch_op.drop_column(column_name)
