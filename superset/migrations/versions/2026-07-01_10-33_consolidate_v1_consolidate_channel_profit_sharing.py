"""consolidate papp_metadata, channel_metadata & profit_sharing migrations

Revision ID: consolidate_v1
Revises: 33d7e0e21daa
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
down_revision = "33d7e0e21daa"


def upgrade():
    # 1. create papp_metadata table
    create_table(
        "papp_metadata",
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("papp_id", Integer, nullable=False, unique=True),
        Column("papp_name", String(255), nullable=True),
        Column("updated_at", String(255), nullable=True),
        Column("上线时间", String(255), nullable=True),
        schema="config",
    )

    # 2. create channel_metadata table
    create_table(
        "channel_metadata",
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("channel_id", Integer, nullable=False, unique=True),
        Column("channel_name", String(255), nullable=True),
        Column("updated_at", String(255), nullable=True),
        Column("白名单控制参数", String(255), nullable=True),
        schema="config",
    )

    # 3. add 白名单控制参数 to papp_metadata
    if not table_has_column("papp_metadata", "白名单控制参数", schema="config"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.add_column(Column("白名单控制参数", String(255), nullable=True))

    # 4. drop 上线时间 from papp_metadata
    if table_has_column("papp_metadata", "上线时间", schema="config"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.drop_column("上线时间")

    # 5. create profit_sharing table
    create_table(
        "profit_sharing",
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("papp_id", Integer, nullable=False),
        Column("channel_id", Integer, nullable=False),
        Column("papp_name", String(255), nullable=True),
        Column("channel_name", String(255), nullable=True),
        Column("上线时间", String(255), nullable=True),
        Column("渠道商分成", String(255), nullable=True),
        Column("分成比例", String(255), nullable=True),
        Column("分成方式", String(255), nullable=True),
        Column("研发分成", String(255), nullable=True),
        Column("IP分成", String(255), nullable=True),
        UniqueConstraint(
            "papp_id", "channel_id", name="uq_profit_sharing_papp_channel"
        ),
        schema="config",
    )

    # 6. add 默认分成 to channel_metadata
    if not table_has_column("channel_metadata", "默认分成", schema="config"):
        with op.batch_alter_table("channel_metadata", schema="config") as batch_op:
            batch_op.add_column(Column("默认分成", String(255), nullable=True))

    # 7. rename 分成比例 -> 渠道商分成 for existing installations
    if table_has_column(
        "profit_sharing", "分成比例", schema="config"
    ) and not table_has_column("profit_sharing", "渠道商分成", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.alter_column("分成比例", new_column_name="渠道商分成")

    # 8. add 分成比例 (net) for existing installations
    if not table_has_column("profit_sharing", "分成比例", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.add_column(Column("分成比例", String(255), nullable=True))


def downgrade():
    # remove net 分成比例 column
    if table_has_column("profit_sharing", "分成比例", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.drop_column("分成比例")

    # rename 渠道商分成 back to 分成比例
    if table_has_column("profit_sharing", "渠道商分成", schema="config"):
        with op.batch_alter_table("profit_sharing", schema="config") as batch_op:
            batch_op.alter_column("渠道商分成", new_column_name="分成比例")

    # remove columns in reverse order
    if table_has_column("channel_metadata", "默认分成", schema="config"):
        with op.batch_alter_table("channel_metadata", schema="config") as batch_op:
            batch_op.drop_column("默认分成")

    drop_table("profit_sharing")

    if table_has_column("papp_metadata", "上线时间", schema="config"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.add_column(Column("上线时间", String(255), nullable=True))

    if table_has_column("papp_metadata", "白名单控制参数", schema="config"):
        with op.batch_alter_table("papp_metadata", schema="config") as batch_op:
            batch_op.drop_column("白名单控制参数")

    drop_table("channel_metadata")
    drop_table("papp_metadata")
