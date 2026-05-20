from __future__ import annotations

from flask import Blueprint, jsonify, request

papp_blueprint = Blueprint("papp_metadata", __name__, url_prefix="/api/v1/project")


def _serialize(record: "PappMetadata") -> dict:  # noqa: F821
    return {
        "id": record.id,
        "papp_id": record.papp_id,
        "papp_name": record.papp_name,
        "updated_at": record.updated_at,
        "上线时间": record.上线时间,
    }


@papp_blueprint.route("/papp", methods=["GET"])
def list_papp():
    from superset.models.papp_metadata import PappMetadata

    records = PappMetadata.list_all()
    return jsonify({"result": [_serialize(r) for r in records]}), 200


@papp_blueprint.route("/papp/<int:papp_id>", methods=["GET"])
def get_papp(papp_id: int):
    from superset.models.papp_metadata import PappMetadata

    record = PappMetadata.get_by_papp_id(papp_id)
    if record is None:
        return jsonify({"result": None}), 200
    return jsonify({"result": _serialize(record)}), 200


@papp_blueprint.route("/papp/<int:papp_id>", methods=["PUT"])
def put_papp(papp_id: int):
    from superset.models.papp_metadata import PappMetadata

    data = request.get_json(force=True)
    if data is None:
        return jsonify({"error": "body is required"}), 400
    record = PappMetadata.upsert(
        papp_id,
        papp_name=data.get("papp_name"),
        updated_at=data.get("updated_at"),
        上线时间=data.get("上线时间"),
    )
    return jsonify({"result": _serialize(record)}), 200


@papp_blueprint.route("/papp/<int:papp_id>", methods=["DELETE"])
def delete_papp(papp_id: int):
    from superset import db
    from superset.models.papp_metadata import PappMetadata

    record = PappMetadata.get_by_papp_id(papp_id)
    if record is None:
        return jsonify({"error": "not found"}), 404
    db.session.delete(record)
    db.session.commit()
    return jsonify({"result": "ok"}), 200
