from __future__ import annotations

from typing import Any

from flask_appbuilder import Model
from sqlalchemy import Column, Integer, String, UniqueConstraint

# Game regions. Domestic and oversea games are sourced from different tables
# and may reuse the same papp_id with different names, so every game row is
# scoped by its region.
REGION_DOMESTIC = "domestic"
REGION_OVERSEA = "oversea"
REGIONS = (REGION_DOMESTIC, REGION_OVERSEA)


class PappMetadata(Model):
    __tablename__ = "papp_metadata"
    __table_args__ = (
        UniqueConstraint("papp_id", "region", name="uq_papp_metadata_papp_region"),
        {"schema": "config"},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    papp_id = Column(Integer, nullable=False)
    region = Column(String(32), nullable=False, default=REGION_DOMESTIC)
    papp_name = Column(String(255), nullable=True)
    updated_at = Column(String(255), nullable=True)
    白名单控制参数 = Column(String(255), nullable=True)

    @classmethod
    def get_by_papp_id(
        cls,
        papp_id: int,
        region: str = REGION_DOMESTIC,
    ) -> PappMetadata | None:
        from superset import db

        return (
            db.session.query(cls)
            .filter(cls.papp_id == papp_id, cls.region == region)
            .one_or_none()
        )

    @classmethod
    def upsert(
        cls,
        papp_id: int,
        papp_name: str | None,
        updated_at: str | None,
        白名单控制参数: str | None,  # noqa: N803
        region: str = REGION_DOMESTIC,
    ) -> PappMetadata:
        from superset import db

        if existing := cls.get_by_papp_id(papp_id, region):
            existing.papp_name = papp_name
            existing.updated_at = updated_at
            existing.白名单控制参数 = 白名单控制参数
            db.session.commit()
            return existing
        record = cls(
            papp_id=papp_id,
            region=region,
            papp_name=papp_name,
            updated_at=updated_at,
            白名单控制参数=白名单控制参数,
        )
        db.session.add(record)
        db.session.commit()
        return record

    @classmethod
    def list_all(cls, region: str | None = None) -> list[PappMetadata]:
        from superset import db

        query = db.session.query(cls)
        if region is not None:
            query = query.filter(cls.region == region)
        return query.order_by(cls.region, cls.papp_id).all()

    @classmethod
    def bulk_upsert(cls, region: str, games: list[dict[str, Any]]) -> int:
        """Insert or refresh games from a source table in a single commit.

        Only ``papp_name``/``updated_at`` come from the source; the locally
        maintained whitelist flag is preserved for games already configured.
        Games missing from ``games`` are left untouched.

        :param region: Region the games belong to
        :param games: Source rows with ``papp_id``, ``papp_name`` and
            ``updated_at`` keys
        :returns: Number of games written
        """
        from superset import db

        existing = {record.papp_id: record for record in cls.list_all(region)}
        count = 0
        for game in games:
            try:
                papp_id = int(game["papp_id"])
            except (KeyError, TypeError, ValueError):
                continue
            papp_name = game.get("papp_name")
            updated_at = game.get("updated_at")
            if record := existing.get(papp_id):
                record.papp_name = papp_name
                record.updated_at = updated_at
            else:
                record = cls(
                    papp_id=papp_id,
                    region=region,
                    papp_name=papp_name,
                    updated_at=updated_at,
                )
                db.session.add(record)
                existing[papp_id] = record
            count += 1
        db.session.commit()
        return count
