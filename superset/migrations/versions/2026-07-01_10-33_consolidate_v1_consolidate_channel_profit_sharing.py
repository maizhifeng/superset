"""consolidate channel & profit sharing migrations

Revision ID: consolidate_v1
Revises: s0q1u2a3s4h5
Create Date: 2026-07-01 10:33:00.000000

"""

from alembic import op
from sqlalchemy import Column, Integer, String, UniqueConstraint

from superset.migrations.shared.utils import (
    create_table,
    drop_table,
    table_has_column,
)

revision = "consolidate_v1"
down_revision = "s0q1u2a3s4h5"


def upgrade():
    # 1. create channel_metadata table
    create_table(
        "channel_metadata",
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("channel_id", Integer, nullable=False, unique=True),
        Column("channel_name", String(255), nullable=True),
        Column("updated_at", String(255), nullable=True),
        Column("白名单控制参数", String(255), nullable=True),
        schema="config",
    )

    # 2. add 白名单控制参数 to papp_metadata
    if not table_has_column("papp_metadata", "白名单控制参数"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.add_column(Column("白名单控制参数", String(255), nullable=True))

    # 3. drop 上线时间 from papp_metadata
    if table_has_column("papp_metadata", "上线时间"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.drop_column("上线时间")

    # 4. create profit_sharing table
    create_table(
        "profit_sharing",
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("papp_id", Integer, nullable=False),
        Column("channel_id", Integer, nullable=False),
        Column("papp_name", String(255), nullable=True),
        Column("channel_name", String(255), nullable=True),
        Column("上线时间", String(255), nullable=True),
        Column("分成比例", String(255), nullable=True),
        Column("分成方式", String(255), nullable=True),
        Column("研发分成", String(255), nullable=True),
        Column("IP分成", String(255), nullable=True),
        UniqueConstraint(
            "papp_id", "channel_id", name="uq_profit_sharing_papp_channel"
        ),
        schema="config",
    )

    # 5. add 默认分成 to channel_metadata
    if not table_has_column("channel_metadata", "默认分成"):
        with op.batch_alter_table("channel_metadata", schema="config") as batch_op:
            batch_op.add_column(Column("默认分成", String(255), nullable=True))


def downgrade():
    # remove column in reverse order
    if table_has_column("channel_metadata", "默认分成"):
        with op.batch_alter_table("channel_metadata", schema="config") as batch_op:
            batch_op.drop_column("默认分成")

    drop_table("profit_sharing")

    if table_has_column("papp_metadata", "上线时间"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.add_column(Column("上线时间", String(255), nullable=True))

    if table_has_column("papp_metadata", "白名单控制参数"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.drop_column("白名单控制参数")

    drop_table("channel_metadata")
