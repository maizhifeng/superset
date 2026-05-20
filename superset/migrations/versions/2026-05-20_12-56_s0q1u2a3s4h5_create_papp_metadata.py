"""create papp_metadata table (squash)

Revision ID: s0q1u2a3s4h5
Revises: 33d7e0e21daa
Create Date: 2026-05-20 12:56:00.000000

"""

from sqlalchemy import Column, Integer, String

from superset.migrations.shared.utils import create_table, drop_table

revision = "s0q1u2a3s4h5"
down_revision = "33d7e0e21daa"

TABLE = "papp_metadata"


def upgrade():
    create_table(
        TABLE,
        Column("id", Integer, primary_key=True, autoincrement=True),
        Column("papp_id", Integer, nullable=False, unique=True),
        Column("papp_name", String(255), nullable=True),
        Column("updated_at", String(255), nullable=True),
        Column("上线时间", String(255), nullable=True),
    )


def downgrade():
    drop_table(TABLE)
