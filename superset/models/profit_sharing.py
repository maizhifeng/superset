from __future__ import annotations

from flask_appbuilder import Model
from sqlalchemy import Column, Integer, String, UniqueConstraint


class ProfitSharing(Model):
    __tablename__ = "profit_sharing"
    __table_args__ = (
        UniqueConstraint(
            "papp_id", "channel_id", name="uq_profit_sharing_papp_channel"
        ),
        {"schema": "config"},
    )

    id = Column(Integer, primary_key=True, autoincrement=True)
    papp_id = Column(Integer, nullable=False)
    channel_id = Column(Integer, nullable=False)
    papp_name = Column(String(255), nullable=True)
    channel_name = Column(String(255), nullable=True)
    上线时间 = Column(String(255), nullable=True)
    渠道商分成 = Column(String(255), nullable=True)
    分成比例 = Column(String(255), nullable=True)
    研发分成 = Column(String(255), nullable=True)
    IP分成 = Column(String(255), nullable=True)
    分成方式 = Column(String(255), nullable=True)
    商户分成 = Column(String(255), nullable=True)
    ios虚拟支付分成 = Column(String(255), nullable=True)

    @classmethod
    def list_all(cls) -> list[ProfitSharing]:
        from superset import db

        return db.session.query(cls).order_by(cls.papp_id, cls.channel_id).all()

    @classmethod
    def sync(cls) -> int:
        from superset import db
        from superset.models.channel_metadata import ChannelMetadata
        from superset.models.papp_metadata import PappMetadata

        games = PappMetadata.list_all()
        channels = ChannelMetadata.list_all()

        whitelisted_games = [g for g in games if g.白名单控制参数 == "Y"]
        whitelisted_channels = [c for c in channels if c.白名单控制参数 == "Y"]

        channels_by_id = {c.channel_id: c for c in whitelisted_channels}

        count = 0
        for game in whitelisted_games:
            for channel in whitelisted_channels:
                channel_data = channels_by_id.get(channel.channel_id)
                existing = (
                    db.session.query(cls)
                    .filter(
                        cls.papp_id == game.papp_id,
                        cls.channel_id == channel.channel_id,
                    )
                    .one_or_none()
                )
                if existing:
                    existing.papp_name = game.papp_name
                    existing.channel_name = channel.channel_name
                    if not existing.渠道商分成:
                        existing.渠道商分成 = (
                            channel_data.默认分成 if channel_data else None
                        )
                    if not existing.商户分成:
                        existing.商户分成 = "1"
                    existing.ios虚拟支付分成 = (
                        channel_data.ios虚拟支付分成 if channel_data else None
                    ) or "0"
                else:
                    db.session.add(
                        cls(
                            papp_id=game.papp_id,
                            channel_id=channel.channel_id,
                            papp_name=game.papp_name,
                            channel_name=game.channel_name,
                            渠道商分成=channel_data.默认分成 if channel_data else None,
                            商户分成="1",
                            ios虚拟支付分成=channel_data.ios虚拟支付分成
                            if channel_data
                            else None,
                        )
                    )
                count += 1
        db.session.commit()
        cls._compute_net_ratio()
        return count

    @classmethod
    def _compute_net_ratio(cls) -> None:
        from superset import db

        records = db.session.query(cls).all()
        for r in records:
            try:
                qd = float(r.渠道商分成 or "0")
                yf = float(r.研发分成 or "0")
                ip = float(r.IP分成 or "0")
                if r.分成方式 == "利润后分成":
                    net = (100 - qd - ip) * (100 - yf) / 100
                else:
                    net = 100 - qd - yf - ip
                r.分成比例 = f"{net:.1f}"
            except (ValueError, TypeError):
                r.分成比例 = None
        db.session.commit()
