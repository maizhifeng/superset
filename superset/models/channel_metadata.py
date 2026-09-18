from __future__ import annotations

from typing import Any

from flask_appbuilder import Model
from sqlalchemy import Column, Integer, String, UniqueConstraint

from superset.models.papp_metadata import REGION_DOMESTIC


class ChannelMetadata(Model):
    __tablename__ = "channel_metadata"
    __table_args__ = (
        UniqueConstraint(
            "region", "channel_key", name="uq_channel_metadata_region_key"
        ),
        {"schema": "config"},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    # Numeric source id; NULL for oversea channels, which are keyed by name.
    channel_id = Column(Integer, nullable=True)
    # Identifier within the region: the numeric id as text for domestic
    # channels, the source ``system`` for oversea ones.
    channel_key = Column(String(64), nullable=False)
    region = Column(String(32), nullable=False, default=REGION_DOMESTIC)
    channel_name = Column(String(255), nullable=True)
    updated_at = Column(String(255), nullable=True)
    白名单控制参数 = Column(String(255), nullable=True)
    默认分成 = Column(String(255), nullable=True)
    ios虚拟支付分成 = Column(String(255), nullable=True)

    @classmethod
    def get_by_channel_key(
        cls,
        channel_key: str,
        region: str = REGION_DOMESTIC,
    ) -> ChannelMetadata | None:
        from superset import db

        return (
            db.session.query(cls)
            .filter(cls.channel_key == channel_key, cls.region == region)
            .one_or_none()
        )

    @classmethod
    def get_by_channel_id(
        cls,
        channel_id: int,
        region: str = REGION_DOMESTIC,
    ) -> ChannelMetadata | None:
        from superset import db

        return (
            db.session.query(cls)
            .filter(cls.channel_id == channel_id, cls.region == region)
            .one_or_none()
        )

    @classmethod
    def upsert(
        cls,
        channel_key: str,
        channel_name: str | None,
        updated_at: str | None,
        白名单控制参数: str | None,  # noqa: N803
        默认分成: str | None = None,  # noqa: N803
        ios虚拟支付分成: str | None = None,  # noqa: N803
        region: str = REGION_DOMESTIC,
        channel_id: int | None = None,
    ) -> ChannelMetadata:
        from superset import db

        if existing := cls.get_by_channel_key(channel_key, region):
            existing.channel_id = channel_id
            existing.channel_name = channel_name
            existing.updated_at = updated_at
            existing.白名单控制参数 = 白名单控制参数
            if 默认分成 is not None:
                existing.默认分成 = 默认分成
            if ios虚拟支付分成 is not None:
                existing.ios虚拟支付分成 = ios虚拟支付分成
            db.session.commit()
            return existing
        record = cls(
            channel_id=channel_id,
            channel_key=channel_key,
            region=region,
            channel_name=channel_name,
            updated_at=updated_at,
            白名单控制参数=白名单控制参数,
            默认分成=默认分成,
            ios虚拟支付分成=ios虚拟支付分成,
        )
        db.session.add(record)
        db.session.commit()
        return record

    @classmethod
    def list_all(cls, region: str | None = None) -> list[ChannelMetadata]:
        from superset import db

        query = db.session.query(cls)
        if region is not None:
            query = query.filter(cls.region == region)
        return query.order_by(cls.region, cls.channel_key).all()

    @classmethod
    def bulk_upsert(cls, region: str, channels: list[dict[str, Any]]) -> int:
        """Insert or refresh channels from a source table in a single commit.

        Only ``channel_key``/``channel_name``/``updated_at`` come from the
        source; the locally maintained whitelist flag and default split are
        preserved for channels already configured.

        :param region: Region the channels belong to
        :param channels: Source rows with ``channel_key``, ``channel_name``,
            ``updated_at`` and optional ``channel_id`` keys
        :returns: Number of channels written
        """
        from superset import db

        existing = {record.channel_key: record for record in cls.list_all(region)}
        count = 0
        for channel in channels:
            channel_key = channel.get("channel_key")
            if channel_key is None or str(channel_key).strip() == "":
                continue
            channel_key = str(channel_key)
            channel_name = channel.get("channel_name")
            updated_at = channel.get("updated_at")
            channel_id = channel.get("channel_id")
            if record := existing.get(channel_key):
                record.channel_id = channel_id
                record.channel_name = channel_name
                record.updated_at = updated_at
            else:
                record = cls(
                    channel_id=channel_id,
                    channel_key=channel_key,
                    region=region,
                    channel_name=channel_name,
                    updated_at=updated_at,
                )
                db.session.add(record)
                existing[channel_key] = record
            count += 1
        db.session.commit()
        return count
