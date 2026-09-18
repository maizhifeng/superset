"""add region to papp_metadata and profit_sharing

Domestic and oversea games come from separate source tables and can share the
same ``papp_id`` with different names, so game and profit-sharing records are
keyed by ``(id, region)`` instead of ``id`` alone.

Revision ID: add_papp_region
Revises: add_test_round_start_times
Create Date: 2026-09-17 12:30:00.000000

"""

from alembic import op
from sqlalchemy import Column, inspect, String

from superset.migrations.shared.utils import table_has_column

revision = "add_papp_region"
down_revision = "add_test_round_start_times"

REGION_COLUMN = "region"
DOMESTIC = "domestic"

# (table, old unique constraint, new unique constraint, constrained columns)
PAPP_UNIQUE = (
    "papp_metadata",
    "papp_metadata_papp_id_key",
    "uq_papp_metadata_papp_region",
    ["papp_id", "region"],
)
PROFIT_SHARING_UNIQUE = (
    "profit_sharing",
    "uq_profit_sharing_papp_channel",
    "uq_profit_sharing_papp_channel_region",
    ["papp_id", "channel_id", "region"],
)


def _unique_constraint_names(table_name: str) -> set[str]:
    """Names of the unique constraints currently defined on a config table."""
    inspector = inspect(op.get_context().bind)
    return {
        constraint["name"]
        for constraint in inspector.get_unique_constraints(table_name, schema="config")
    }


def _add_region_column(table_name: str) -> None:
    if not table_has_column(table_name, REGION_COLUMN, schema="config"):
        with op.batch_alter_table(table_name, schema="config") as batch_op:
            batch_op.add_column(
                Column(
                    REGION_COLUMN,
                    String(32),
                    nullable=False,
                    server_default=DOMESTIC,
                )
            )


def _drop_region_column(table_name: str) -> None:
    if table_has_column(table_name, REGION_COLUMN, schema="config"):
        with op.batch_alter_table(table_name, schema="config") as batch_op:
            batch_op.drop_column(REGION_COLUMN)


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


def upgrade():
    for table_name in ("papp_metadata", "profit_sharing"):
        _add_region_column(table_name)
        # Rows created before this migration belong to the domestic source.
        op.execute(
            f"UPDATE config.{table_name} SET {REGION_COLUMN} = '{DOMESTIC}' "  # noqa: S608
            f"WHERE {REGION_COLUMN} IS NULL"
        )

    _swap_unique_constraint(
        PAPP_UNIQUE[0], PAPP_UNIQUE[1], PAPP_UNIQUE[2], PAPP_UNIQUE[3]
    )
    _swap_unique_constraint(
        PROFIT_SHARING_UNIQUE[0],
        PROFIT_SHARING_UNIQUE[1],
        PROFIT_SHARING_UNIQUE[2],
        PROFIT_SHARING_UNIQUE[3],
    )


def downgrade():
    # Collapsing both regions into one key can violate the restored unique
    # constraints; oversea rows are dropped so domestic data survives intact.
    op.execute("DELETE FROM config.papp_metadata WHERE region <> 'domestic'")
    op.execute("DELETE FROM config.profit_sharing WHERE region <> 'domestic'")

    _swap_unique_constraint(
        PAPP_UNIQUE[0],
        PAPP_UNIQUE[1],
        PAPP_UNIQUE[2],
        ["papp_id"],
        restore=True,
    )
    _swap_unique_constraint(
        PROFIT_SHARING_UNIQUE[0],
        PROFIT_SHARING_UNIQUE[1],
        PROFIT_SHARING_UNIQUE[2],
        ["papp_id", "channel_id"],
        restore=True,
    )

    for table_name in ("papp_metadata", "profit_sharing"):
        _drop_region_column(table_name)
