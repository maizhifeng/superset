from __future__ import annotations

from flask_appbuilder import Model
from sqlalchemy import Column, Integer, String


class ChannelMetadata(Model):
    __tablename__ = "channel_metadata"
    __table_args__ = {"schema": "config"}

    id = Column(Integer, primary_key=True, autoincrement=True)
    channel_id = Column(Integer, nullable=False, unique=True)
    channel_name = Column(String(255), nullable=True)
    updated_at = Column(String(255), nullable=True)
    白名单控制参数 = Column(String(255), nullable=True)
    默认分成 = Column(String(255), nullable=True)

    @classmethod
    def get_by_channel_id(cls, channel_id: int) -> ChannelMetadata | None:
        from superset import db

        return db.session.query(cls).filter(cls.channel_id == channel_id).one_or_none()

    @classmethod
    def upsert(
        cls,
        channel_id: int,
        channel_name: str | None,
        updated_at: str | None,
        白名单控制参数: str | None,  # noqa: N803
        默认分成: str | None = None,  # noqa: N803
    ) -> ChannelMetadata:
        from superset import db

        if existing := cls.get_by_channel_id(channel_id):
            existing.channel_name = channel_name
            existing.updated_at = updated_at
            existing.白名单控制参数 = 白名单控制参数
            if 默认分成 is not None:
                existing.默认分成 = 默认分成
            db.session.commit()
            return existing
        record = cls(
            channel_id=channel_id,
            channel_name=channel_name,
            updated_at=updated_at,
            白名单控制参数=白名单控制参数,
            默认分成=默认分成,
        )
        db.session.add(record)
        db.session.commit()
        return record

    @classmethod
    def list_all(cls) -> list[ChannelMetadata]:
        from superset import db

        return db.session.query(cls).order_by(cls.channel_id).all()
