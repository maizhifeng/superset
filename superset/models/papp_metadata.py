from __future__ import annotations

from flask_appbuilder import Model
from sqlalchemy import Column, Integer, String


class PappMetadata(Model):
    __tablename__ = "papp_metadata"

    id = Column(Integer, primary_key=True, autoincrement=True)
    papp_id = Column(Integer, nullable=False, unique=True)
    papp_name = Column(String(255), nullable=True)
    updated_at = Column(String(255), nullable=True)
    上线时间 = Column(String(255), nullable=True)

    @classmethod
    def get_by_papp_id(cls, papp_id: int) -> PappMetadata | None:
        from superset import db

        return db.session.query(cls).filter(cls.papp_id == papp_id).one_or_none()

    @classmethod
    def upsert(
        cls,
        papp_id: int,
        papp_name: str | None,
        updated_at: str | None,
        上线时间: str | None,
    ) -> PappMetadata:
        from superset import db

        if existing := cls.get_by_papp_id(papp_id):
            existing.papp_name = papp_name
            existing.updated_at = updated_at
            existing.上线时间 = 上线时间
            db.session.commit()
            return existing
        record = cls(
            papp_id=papp_id,
            papp_name=papp_name,
            updated_at=updated_at,
            上线时间=上线时间,
        )
        db.session.add(record)
        db.session.commit()
        return record

    @classmethod
    def list_all(cls) -> list[PappMetadata]:
        from superset import db

        return db.session.query(cls).order_by(cls.papp_id).all()
