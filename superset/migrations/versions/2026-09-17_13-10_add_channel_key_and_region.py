"""add channel_key and region to channel_metadata and profit_sharing

Domestic channels are identified by the numeric ``cch_id`` from
``sj_platform.part_channel`` while oversea channels are the ``system`` values
(``ios``/``android``/...) of ``overseas_report_data.ad_operate_data_report``.
Both are stored in ``channel_key``, unique within a region, and profit sharing
only pairs games with channels of the same region.

Revision ID: add_channel_region_key
Revises: add_papp_region
Create Date: 2026-09-17 13:10:00.000000

"""

from alembic import op
from sqlalchemy import Column, inspect, Integer, String

from superset.migrations.shared.utils import get_table_column, table_has_column

revision = "add_channel_region_key"
down_revision = "add_papp_region"

DOMESTIC = "domestic"

CHANNEL_TABLE = "channel_metadata"
PROFIT_SHARING_TABLE = "profit_sharing"

# (table, old unique constraint, new unique constraint, constrained columns)
CHANNEL_UNIQUE = (
    CHANNEL_TABLE,
    "channel_metadata_channel_id_key",
    "uq_channel_metadata_region_key",
    ["region", "channel_key"],
)
PROFIT_SHARING_UNIQUE = (
    PROFIT_SHARING_TABLE,
    "uq_profit_sharing_papp_channel_region",
    "uq_profit_sharing_papp_key_region",
    ["papp_id", "channel_key", "region"],
)


def _unique_constraint_names(table_name: str) -> set[str]:
    inspector = inspect(op.get_context().bind)
    return {
        constraint["name"]
        for constraint in inspector.get_unique_constraints(table_name, schema="config")
    }


def _swap_unique_constraint(
    table_name: str,
    old_name: str,
    new_name: str,
    columns: list[str],
    *,
    restore: bool = False,
) -> None:
    names = _unique_constraint_names(table_name)
    drop_name, create_name = (new_name, old_name) if restore else (old_name, new_name)
    if drop_name not in names:
        return
    op.drop_constraint(drop_name, table_name, type_="unique", schema="config")
    if create_name not in names:
        op.create_unique_constraint(create_name, table_name, columns, schema="config")


def _column_is_nullable(table_name: str, column_name: str) -> bool:
    column = get_table_column(table_name, column_name, schema="config")
    return bool(column and column["nullable"])


def _set_nullable(
    table_name: str, column_name: str, existing_type: object, nullable: bool
) -> None:
    if nullable != _column_is_nullable(table_name, column_name):
        op.alter_column(
            table_name,
            column_name,
            existing_type=existing_type,
            nullable=nullable,
            schema="config",
        )


def _add_key_column(table_name: str) -> None:
    if not table_has_column(table_name, "channel_key", schema="config"):
        with op.batch_alter_table(table_name, schema="config") as batch_op:
            batch_op.add_column(Column("channel_key", String(64), nullable=True))

    # Rows written before this migration are domestic and were keyed by the
    # numeric channel id alone.
    op.execute(
        f"UPDATE config.{table_name} SET channel_key = CAST(channel_id AS VARCHAR) "  # noqa: S608
        "WHERE channel_key IS NULL"
    )

    # Oversea channels have no numeric id in their source table.
    _set_nullable(table_name, "channel_id", Integer(), nullable=True)
    _set_nullable(table_name, "channel_key", String(64), nullable=False)


def upgrade():
    if not table_has_column(CHANNEL_TABLE, "region", schema="config"):
        with op.batch_alter_table(CHANNEL_TABLE, schema="config") as batch_op:
            batch_op.add_column(
                Column(
                    "region",
                    String(32),
                    nullable=False,
                    server_default=DOMESTIC,
                )
            )
    op.execute(
        f"UPDATE config.{CHANNEL_TABLE} SET region = '{DOMESTIC}' "  # noqa: S608
        "WHERE region IS NULL"
    )

    _add_key_column(CHANNEL_TABLE)
    _add_key_column(PROFIT_SHARING_TABLE)

    _swap_unique_constraint(
        CHANNEL_UNIQUE[0], CHANNEL_UNIQUE[1], CHANNEL_UNIQUE[2], CHANNEL_UNIQUE[3]
    )
    _swap_unique_constraint(
        PROFIT_SHARING_UNIQUE[0],
        PROFIT_SHARING_UNIQUE[1],
        PROFIT_SHARING_UNIQUE[2],
        PROFIT_SHARING_UNIQUE[3],
    )


def downgrade():
    # Keys that only exist oversea cannot be represented by a numeric id;
    # dropping them keeps the restored unique constraints satisfiable.
    op.execute("DELETE FROM config.profit_sharing WHERE region <> 'domestic'")
    op.execute("DELETE FROM config.channel_metadata WHERE region <> 'domestic'")

    _swap_unique_constraint(
        CHANNEL_UNIQUE[0],
        CHANNEL_UNIQUE[1],
        CHANNEL_UNIQUE[2],
        ["channel_id"],
        restore=True,
    )
    _swap_unique_constraint(
        PROFIT_SHARING_UNIQUE[0],
        PROFIT_SHARING_UNIQUE[1],
        PROFIT_SHARING_UNIQUE[2],
        ["papp_id", "channel_id", "region"],
        restore=True,
    )

    for table_name in (CHANNEL_TABLE, PROFIT_SHARING_TABLE):
        _set_nullable(table_name, "channel_id", Integer(), nullable=False)
        if table_has_column(table_name, "channel_key", schema="config"):
            with op.batch_alter_table(table_name, schema="config") as batch_op:
                batch_op.drop_column("channel_key")

    if table_has_column(CHANNEL_TABLE, "region", schema="config"):
        with op.batch_alter_table(CHANNEL_TABLE, schema="config") as batch_op:
            batch_op.drop_column("region")
