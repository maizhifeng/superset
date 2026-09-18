from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify, request

papp_blueprint = Blueprint("papp_metadata", __name__, url_prefix="/api/v1/project")


def _serialize(record: Any) -> dict:  # type: ignore[type-arg]
    return {
        "id": record.id,
        "papp_id": record.papp_id,
        "region": record.region,
        "papp_name": record.papp_name,
        "updated_at": record.updated_at,
        "白名单控制参数": record.白名单控制参数,
    }


def _region_from_request() -> str | None:
    """Region sent by the caller, taken from the query string.

    PUT bodies may also carry it so the game being written is unambiguous even
    though ``papp_id`` alone is no longer unique across regions.
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


@papp_blueprint.route("/papp", methods=["GET"])
def list_papp():  # type: ignore[no-untyped-def]
    from superset.models.papp_metadata import PappMetadata

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400
    records = PappMetadata.list_all(region)
    return jsonify({"result": [_serialize(r) for r in records]}), 200


@papp_blueprint.route("/papp/bulk", methods=["POST"])
def bulk_upsert_papp():  # type: ignore[no-untyped-def]
    """Refresh many games from their source table in one request.

    A per-row sync needs one request per game, which trips the application
    rate limit for source tables with hundreds of rows.
    """
    from superset.models.papp_metadata import (
        PappMetadata,
        REGION_DOMESTIC,
        REGIONS,
    )

    data = request.get_json(force=True)
    if not isinstance(data, dict):
        return jsonify({"error": "body is required"}), 400

    region = data.get("region") or REGION_DOMESTIC
    if region not in REGIONS:
        return jsonify({"error": f"unknown region: {region}"}), 400

    games = data.get("games")
    if not isinstance(games, list):
        return jsonify({"error": "games must be a list"}), 400

    count = PappMetadata.bulk_upsert(region, games)
    return jsonify({"result": {"count": count, "region": region}}), 200


@papp_blueprint.route("/papp/<int:papp_id>", methods=["GET"])
def get_papp(papp_id: int):  # type: ignore[no-untyped-def]
    from superset.models.papp_metadata import PappMetadata, REGION_DOMESTIC

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400
    record = PappMetadata.get_by_papp_id(papp_id, region or REGION_DOMESTIC)
    if record is None:
        return jsonify({"result": None}), 200
    return jsonify({"result": _serialize(record)}), 200


@papp_blueprint.route("/papp/<int:papp_id>", methods=["PUT"])
def put_papp(papp_id: int):  # type: ignore[no-untyped-def]
    from superset.models.papp_metadata import PappMetadata, REGION_DOMESTIC

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400

    data = request.get_json(force=True)
    if data is None:
        return jsonify({"error": "body is required"}), 400
    record = PappMetadata.upsert(
        papp_id,
        papp_name=data.get("papp_name"),
        updated_at=data.get("updated_at"),
        白名单控制参数=data.get("白名单控制参数"),
        region=region or REGION_DOMESTIC,
    )
    return jsonify({"result": _serialize(record)}), 200


@papp_blueprint.route("/papp/<int:papp_id>", methods=["DELETE"])
def delete_papp(papp_id: int):  # type: ignore[no-untyped-def]
    from superset import db
    from superset.models.papp_metadata import PappMetadata, REGION_DOMESTIC

    region = _region_from_request()
    if _bad_region(region):
        return jsonify({"error": f"unknown region: {region}"}), 400

    record = PappMetadata.get_by_papp_id(papp_id, region or REGION_DOMESTIC)
    if record is None:
        return jsonify({"error": "not found"}), 404
    db.session.delete(record)
    db.session.commit()
    return jsonify({"result": "ok"}), 200
