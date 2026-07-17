from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify, request

channel_blueprint = Blueprint(
    "channel_metadata", __name__, url_prefix="/api/v1/project"
)


def _serialize(record: Any) -> dict:  # type: ignore[type-arg]
    return {
        "id": record.id,
        "channel_id": record.channel_id,
        "channel_name": record.channel_name,
        "updated_at": record.updated_at,
        "白名单控制参数": record.白名单控制参数,
        "默认分成": record.默认分成 or "",
        "ios虚拟支付分成": record.ios虚拟支付分成 or "",
    }


@channel_blueprint.route("/channel", methods=["GET"])
def list_channel():  # type: ignore[no-untyped-def]
    from superset.models.channel_metadata import ChannelMetadata

    records = ChannelMetadata.list_all()
    return jsonify({"result": [_serialize(r) for r in records]}), 200


@channel_blueprint.route("/channel/<int:channel_id>", methods=["GET"])
def get_channel(channel_id: int):  # type: ignore[no-untyped-def]
    from superset.models.channel_metadata import ChannelMetadata

    record = ChannelMetadata.get_by_channel_id(channel_id)
    if record is None:
        return jsonify({"result": None}), 200
    return jsonify({"result": _serialize(record)}), 200


@channel_blueprint.route("/channel/<int:channel_id>", methods=["PUT"])
def put_channel(channel_id: int):  # type: ignore[no-untyped-def]
    from superset.models.channel_metadata import ChannelMetadata

    data = request.get_json(force=True)
    if data is None:
        return jsonify({"error": "body is required"}), 400
    record = ChannelMetadata.upsert(
        channel_id,
        channel_name=data.get("channel_name"),
        updated_at=data.get("updated_at"),
        白名单控制参数=data.get("白名单控制参数"),
        默认分成=data.get("默认分成"),
        ios虚拟支付分成=data.get("ios虚拟支付分成"),
    )
    return jsonify({"result": _serialize(record)}), 200


@channel_blueprint.route("/channel/<int:channel_id>", methods=["DELETE"])
def delete_channel(channel_id: int):  # type: ignore[no-untyped-def]
    from superset import db
    from superset.models.channel_metadata import ChannelMetadata

    record = ChannelMetadata.get_by_channel_id(channel_id)
    if record is None:
        return jsonify({"error": "not found"}), 404
    db.session.delete(record)
    db.session.commit()
    return jsonify({"result": "ok"}), 200


@channel_blueprint.route("/profit-sharing", methods=["GET"])
def list_profit_sharing():  # type: ignore[no-untyped-def]
    from superset.models.profit_sharing import ProfitSharing

    records = ProfitSharing.list_all()
    return jsonify(
        {
            "result": [
                {
                    "id": r.id,
                    "papp_id": r.papp_id,
                    "papp_name": r.papp_name,
                    "channel_id": r.channel_id,
                    "channel_name": r.channel_name,
                    "上线时间": r.上线时间 or "",
                    "渠道商分成": r.渠道商分成 or "",
                    "分成比例": r.分成比例 or "",
                    "研发分成": r.研发分成 or "",
                    "IP分成": r.IP分成 or "",
                    "分成方式": r.分成方式 or "",
                    "商户分成": r.商户分成 or "",
                    "ios虚拟支付分成": r.ios虚拟支付分成 or "",
                }
                for r in records
            ],
        }
    ), 200


@channel_blueprint.route("/profit-sharing/sync", methods=["POST"])
def sync_profit_sharing():  # type: ignore[no-untyped-def]
    from superset.models.profit_sharing import ProfitSharing

    count = ProfitSharing.sync()
    return jsonify({"result": {"count": count}}), 200


@channel_blueprint.route("/profit-sharing/<int:combo_id>", methods=["PUT"])
def update_profit_sharing(combo_id: int):  # type: ignore[no-untyped-def] # noqa: C901
    from superset import db
    from superset.models.profit_sharing import ProfitSharing

    record = (
        db.session.query(ProfitSharing)
        .filter(ProfitSharing.id == combo_id)
        .one_or_none()
    )
    if record is None:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(force=True)
    if data is None:
        return jsonify({"error": "body is required"}), 400

    if (上线时间 := data.get("上线时间")) is not None:  # noqa: N806
        record.上线时间 = 上线时间
    if (渠道商分成 := data.get("渠道商分成")) is not None:  # noqa: N806
        record.渠道商分成 = 渠道商分成
    if (分成比例 := data.get("分成比例")) is not None:  # noqa: N806
        record.分成比例 = 分成比例
    if (研发分成 := data.get("研发分成")) is not None:  # noqa: N806
        record.研发分成 = 研发分成
    if (IP分成 := data.get("IP分成")) is not None:  # noqa: N806
        record.IP分成 = IP分成
    if (分成方式 := data.get("分成方式")) is not None:  # noqa: N806
        record.分成方式 = 分成方式
    if (商户分成 := data.get("商户分成")) is not None:  # noqa: N806
        record.商户分成 = 商户分成
    if (ios虚拟支付分成 := data.get("ios虚拟支付分成")) is not None:  # noqa: N806
        record.ios虚拟支付分成 = ios虚拟支付分成

    # Auto-compute net 分成比例
    try:
        qd = float(record.渠道商分成 or "0")
        yf = float(record.研发分成 or "0")
        ip = float(record.IP分成 or "0")
        if record.分成方式 == "利润后分成":
            net = (100 - qd - ip) * (100 - yf) / 100
        else:
            net = 100 - qd - yf - ip
        record.分成比例 = f"{net:.1f}"
    except (ValueError, TypeError):
        record.分成比例 = None

    db.session.commit()
    return jsonify(
        {
            "result": {
                "id": record.id,
                "papp_id": record.papp_id,
                "papp_name": record.papp_name,
                "channel_id": record.channel_id,
                "channel_name": record.channel_name,
                "上线时间": record.上线时间 or "",
                "渠道商分成": record.渠道商分成 or "",
                "分成比例": record.分成比例 or "",
                "研发分成": record.研发分成 or "",
                "IP分成": record.IP分成 or "",
                "分成方式": record.分成方式 or "",
                "商户分成": record.商户分成 or "",
                "ios虚拟支付分成": record.ios虚拟支付分成 or "",
            }
        }
    ), 200
