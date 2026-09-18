"""
Persistence for the global menu/route switch configuration.

The configuration is a single JSON blob shared by all users: the switches on
``/system/admin?tab=menu`` decide which menu entries are visible and whether
the matching routes are reachable at all.  It is stored in Superset's existing
``key_value`` table under the custom resource ``menu_settings`` so no new DB
migration is required.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from superset import db
from superset.key_value.models import KeyValueEntry
from superset.utils import json as _json

RESOURCE = "menu_settings"

# Defensive cap: the only writer is the admin settings page with a fixed set
# of menu entries.
_MAX_ITEMS = 200


def _encode(value: dict[str, Any]) -> bytes:
    return _json.dumps(value).encode("utf-8")


def _decode(raw: bytes) -> dict[str, Any]:
    try:
        value = _json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return {}
    return value if isinstance(value, dict) else {}


def _latest_entry() -> KeyValueEntry | None:
    return (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE)
        .order_by(KeyValueEntry.created_on.desc(), KeyValueEntry.id.desc())
        .first()
    )


def get_menu_settings() -> dict[str, Any] | None:
    """Return the stored configuration, or ``None`` when none was saved yet."""
    entry = _latest_entry()
    if entry is None:
        return None
    data = _decode(entry.value)
    return data or None


def _normalize_item(raw: Any) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("each item must be an object")
    item_id = raw.get("id")
    path = raw.get("path")
    label = raw.get("label")
    if not isinstance(item_id, str) or not item_id:
        raise ValueError("item.id must be a non-empty string")
    if not isinstance(path, str) or not path.startswith("/"):
        raise ValueError("item.path must be a string starting with '/'")
    if not isinstance(label, str) or not label:
        raise ValueError("item.label must be a non-empty string")
    item: dict[str, Any] = {"id": item_id, "path": path, "label": label}
    if isinstance(raw.get("builtIn"), bool):
        item["builtIn"] = raw["builtIn"]
    roles = raw.get("roles")
    if isinstance(roles, list) and all(isinstance(role, str) for role in roles):
        item["roles"] = roles
    return item


def normalize_menu_settings(raw: Any) -> dict[str, Any]:
    """Validate an incoming payload and keep only the known fields."""
    if not isinstance(raw, dict):
        raise ValueError("payload must be an object")
    items_raw = raw.get("items")
    enabled_raw = raw.get("enabled")
    if not isinstance(items_raw, list):
        raise ValueError("items must be a list")
    if len(items_raw) > _MAX_ITEMS:
        raise ValueError(f"too many items (max {_MAX_ITEMS})")
    if not isinstance(enabled_raw, dict):
        raise ValueError("enabled must be an object")
    enabled: dict[str, bool] = {}
    for key, value in enabled_raw.items():
        if not isinstance(key, str):
            raise ValueError("enabled keys must be strings")
        if not isinstance(value, bool):
            raise ValueError("enabled values must be booleans")
        enabled[key] = value
    return {
        "items": [_normalize_item(item) for item in items_raw],
        "enabled": enabled,
    }


def save_menu_settings(payload: dict[str, Any], user_id: int | None) -> dict[str, Any]:
    """Persist the configuration, updating the existing row when present."""
    normalized = normalize_menu_settings(payload)
    now = datetime.now()
    entry = _latest_entry()
    if entry is None:
        entry = KeyValueEntry(
            resource=RESOURCE,
            value=_encode(normalized),
            created_on=now,
            created_by_fk=user_id,
        )
        db.session.add(entry)
    else:
        entry.value = _encode(normalized)
        entry.changed_on = now
        entry.changed_by_fk = user_id
    db.session.commit()
    return normalized
