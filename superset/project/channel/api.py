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
        "channel_key": record.channel_key,
        "region": record.region,
        "channel_name": record.channel_name,
        "updated_at": record.updated_at,
        "白名单控制参数": record.白名单控制参数,
        "默认分成": record.默认分成 or "",
        "ios虚拟支付分成": record.ios虚拟支付分成 or "",
    }


def _region_from_request() -> str | None:
    """Region sent by the caller, taken from the query string.

    PUT bodies may also carry it so the channel being written is unambiguous
    even though ``channel_key`` is only unique within a region.
    """
    region = request.args.get("region")
    if region is None and request.method in {"PUT", "POST"}:
        body = request.get_json(silent=True)
        if isinstance(body, dict) and body.get("region") is not None:
            region = str(body["region"])
    return region


def _bad_region(region: str | None) -> bool:
    from superset.models.papp_metadata import REGIONS

    return region is not None and region not in REGIONS


@channel_blueprint.route("/channel", methods=["GET"])
def list_channel():  # type: ignore[no-untyped-def]
    from superset.models.channel_metadata import ChannelMetadata

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400
    records = ChannelMetadata.list_all(region)
    return jsonify({"result": [_serialize(r) for r in records]}), 200


@channel_blueprint.route("/channel/bulk", methods=["POST"])
def bulk_upsert_channel():  # type: ignore[no-untyped-def]
    """Refresh many channels from their source table in one request.

    A per-row sync needs one request per channel, which trips the application
    rate limit for source tables with hundreds of rows.
    """
    from superset.models.channel_metadata import ChannelMetadata
    from superset.models.papp_metadata import REGION_DOMESTIC, REGIONS

    data = request.get_json(force=True)
    if not isinstance(data, dict):
        return jsonify({"error": "body is required"}), 400

    region = data.get("region") or REGION_DOMESTIC
    if region not in REGIONS:
        return jsonify({"error": f"unknown region: {region}"}), 400

    channels = data.get("channels")
    if not isinstance(channels, list):
        return jsonify({"error": "channels must be a list"}), 400

    count = ChannelMetadata.bulk_upsert(region, channels)
    return jsonify({"result": {"count": count, "region": region}}), 200


@channel_blueprint.route("/channel/<channel_key>", methods=["GET"])
def get_channel(channel_key: str):  # type: ignore[no-untyped-def]
    from superset.models.channel_metadata import ChannelMetadata
    from superset.models.papp_metadata import REGION_DOMESTIC

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400
    record = ChannelMetadata.get_by_channel_key(channel_key, region or REGION_DOMESTIC)
    if record is None:
        return jsonify({"result": None}), 200
    return jsonify({"result": _serialize(record)}), 200


@channel_blueprint.route("/channel/<channel_key>", methods=["PUT"])
def put_channel(channel_key: str):  # type: ignore[no-untyped-def]
    from superset.models.channel_metadata import ChannelMetadata
    from superset.models.papp_metadata import REGION_DOMESTIC

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400

    data = request.get_json(force=True)
    if data is None:
        return jsonify({"error": "body is required"}), 400
    record = ChannelMetadata.upsert(
        channel_key,
        channel_name=data.get("channel_name"),
        updated_at=data.get("updated_at"),
        白名单控制参数=data.get("白名单控制参数"),
        默认分成=data.get("默认分成"),
        ios虚拟支付分成=data.get("ios虚拟支付分成"),
        region=region or REGION_DOMESTIC,
        channel_id=data.get("channel_id"),
    )
    return jsonify({"result": _serialize(record)}), 200


@channel_blueprint.route("/channel/<channel_key>", methods=["DELETE"])
def delete_channel(channel_key: str):  # type: ignore[no-untyped-def]
    from superset import db
    from superset.models.channel_metadata import ChannelMetadata
    from superset.models.papp_metadata import REGION_DOMESTIC

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400

    record = ChannelMetadata.get_by_channel_key(channel_key, region or REGION_DOMESTIC)
    if record is None:
        return jsonify({"error": "not found"}), 404
    db.session.delete(record)
    db.session.commit()
    return jsonify({"result": "ok"}), 200


@channel_blueprint.route("/profit-sharing", methods=["GET"])
def list_profit_sharing():  # type: ignore[no-untyped-def]
    from superset.models.papp_metadata import REGIONS
    from superset.models.profit_sharing import ProfitSharing

    region = request.args.get("region")
    if region is not None and region not in REGIONS:
        return jsonify({"error": f"unknown region: {region}"}), 400
    records = ProfitSharing.list_all(region)
    return jsonify(
        {
            "result": [
                {
                    "id": r.id,
                    "papp_id": r.papp_id,
                    "region": r.region,
                    "channel_id": r.channel_id,
                    "channel_key": r.channel_key,
                    "papp_name": r.papp_name,
                    "channel_name": r.channel_name,
                    "上线时间": r.上线时间 or "",
                    "首测起始时间": r.首测起始时间 or "",
                    "二测起始时间": r.二测起始时间 or "",
                    "三测起始时间": r.三测起始时间 or "",
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
    from superset.models.papp_metadata import REGIONS
    from superset.models.profit_sharing import ProfitSharing

    region = request.args.get("region")
    if region is None:
        body = request.get_json(silent=True)
        if isinstance(body, dict) and body.get("region") is not None:
            region = str(body["region"])
    if region is not None and region not in REGIONS:
        return jsonify({"error": f"unknown region: {region}"}), 400

    count = ProfitSharing.sync(region)
    return jsonify({"result": {"count": count, "region": region}}), 200


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
    if (首测起始时间 := data.get("首测起始时间")) is not None:  # noqa: N806
        record.首测起始时间 = 首测起始时间
    if (二测起始时间 := data.get("二测起始时间")) is not None:  # noqa: N806
        record.二测起始时间 = 二测起始时间
    if (三测起始时间 := data.get("三测起始时间")) is not None:  # noqa: N806
        record.三测起始时间 = 三测起始时间
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
                "region": record.region,
                "channel_id": record.channel_id,
                "channel_key": record.channel_key,
                "papp_name": record.papp_name,
                "channel_name": record.channel_name,
                "上线时间": record.上线时间 or "",
                "首测起始时间": record.首测起始时间 or "",
                "二测起始时间": record.二测起始时间 or "",
                "三测起始时间": record.三测起始时间 or "",
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
