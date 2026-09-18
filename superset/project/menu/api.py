"""
API for the global menu/route switch configuration.

``GET /api/v1/menu/settings`` is available to every authenticated user so the
SPA can decide which routes are reachable.  Only admins may update the
configuration, matching access to the ``/system/admin`` settings page.
"""

from __future__ import annotations

from typing import Any

from flask import Blueprint, jsonify, request

menu_blueprint = Blueprint("menu_settings", __name__, url_prefix="/api/v1/menu")


def _authenticated_user() -> Any | None:
    """Resolve the JWT bearer identity, mirroring the impersonate endpoint."""
    from flask_jwt_extended import get_jwt, verify_jwt_in_request

    from superset import security_manager

    try:
        verify_jwt_in_request()
    except Exception:  # pylint: disable=broad-except
        return None
    try:
        subject = get_jwt().get("sub")
    except Exception:  # pylint: disable=broad-except
        return None
    if not subject:
        return None
    try:
        return security_manager.get_user_by_id(int(subject))
    except (TypeError, ValueError):
        return None


def _is_admin(user: Any) -> bool:
    return "Admin" in [role.name for role in getattr(user, "roles", [])]


@menu_blueprint.route("/settings", methods=["GET"])
def get_menu_settings_route() -> Any:
    """Return the global configuration.

    A ``null`` result means nothing was saved yet; clients fall back to their
    built-in defaults so deployments keep working before the first save.
    """
    if _authenticated_user() is None:
        return jsonify({"error": "unauthorized"}), 401

    from superset.project.menu.store import get_menu_settings

    return jsonify({"result": get_menu_settings()}), 200


@menu_blueprint.route("/settings", methods=["PUT"])
def put_menu_settings() -> Any:
    """Persist the global configuration (admins only)."""
    from superset.project.menu.store import normalize_menu_settings, save_menu_settings

    user = _authenticated_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    if not _is_admin(user):
        return jsonify({"error": "forbidden"}), 403

    data = request.get_json(force=True, silent=True)
    try:
        payload = normalize_menu_settings(data)
    except ValueError as error:
        return jsonify({"error": str(error)}), 400

    saved = save_menu_settings(payload, getattr(user, "id", None))
    return jsonify({"result": saved}), 200
