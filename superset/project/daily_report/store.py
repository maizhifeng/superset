"""
Persistence for daily report configurations.

Report configurations (each a set of report parameters) are stored as JSON
blobs in Superset's existing ``key_value`` table under the custom resource
``daily_report_cfg``.  Reusing this table avoids new DB migrations.

Each stored configuration is a dict of ``DailyReportConfig`` parameters plus a
``name`` and optional ``description``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from superset import db
from superset.key_value.models import KeyValueEntry
from superset.utils import json as _json
from superset.utils.core import get_user_id

RESOURCE = "daily_report_cfg"

# Persisted generated results, keyed by (config_id, report_date) via the
# payload's ``config_id`` field.  Kept in the same key_value table so no new
# DB migration is required.
RESOURCE_RESULT = "daily_report_result"


def _encode(value: dict[str, Any]) -> bytes:
    return _json.dumps(value).encode("utf-8")


def _decode(raw: bytes) -> dict[str, Any]:
    try:
        value = _json.loads(raw.decode("utf-8"))
        return value if isinstance(value, dict) else {}
    except (ValueError, UnicodeDecodeError):
        return {}


def _serialize(entry: KeyValueEntry) -> dict[str, Any]:
    data = _decode(entry.value)
    return {
        "id": entry.id,
        **data,
    }


def list_configs() -> list[dict[str, Any]]:
    """Return all stored report configurations, newest first."""
    entries = (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE)
        .order_by(KeyValueEntry.created_on.desc())
        .all()
    )
    return [_serialize(e) for e in entries]


def get_config(config_id: int) -> dict[str, Any] | None:
    """Return a single stored report configuration by id."""
    entry = (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE, KeyValueEntry.id == config_id)
        .one_or_none()
    )
    return _serialize(entry) if entry else None


def create_config(payload: dict[str, Any]) -> dict[str, Any]:
    """Persist a new report configuration."""
    entry = KeyValueEntry(
        resource=RESOURCE,
        value=_encode(payload),
        created_on=datetime.now(),
        created_by_fk=get_user_id(),
    )
    db.session.add(entry)
    db.session.commit()
    return _serialize(entry)


def update_config(config_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    """Update an existing report configuration, preserving its id."""
    entry = (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE, KeyValueEntry.id == config_id)
        .one_or_none()
    )
    if entry is None:
        return None
    entry.value = _encode(payload)
    entry.changed_on = datetime.now()
    entry.changed_by_fk = get_user_id()
    db.session.commit()
    return _serialize(entry)


def delete_config(config_id: int) -> bool:
    """Delete a stored report configuration."""
    entry = (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE, KeyValueEntry.id == config_id)
        .one_or_none()
    )
    if entry is None:
        return False
    db.session.delete(entry)
    db.session.commit()
    return True


# --------------------------------------------------------------------------- #
# Generated results
# --------------------------------------------------------------------------- #


def save_result(config_id: int, result: dict[str, Any]) -> None:
    """Persist a generated report result so it survives navigation/restarts.

    The payload embeds ``config_id`` (and ``report_date``) so it can later be
    looked up per configuration.
    """
    payload = {"config_id": config_id, **result}
    entry = KeyValueEntry(
        resource=RESOURCE_RESULT,
        value=_encode(payload),
        created_on=datetime.now(),
        created_by_fk=get_user_id(),
    )
    db.session.add(entry)
    db.session.commit()


def get_latest_result(config_id: int) -> dict[str, Any] | None:
    """Return the most recently persisted result for a configuration, or None."""
    entries = (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE_RESULT)
        .order_by(KeyValueEntry.created_on.desc())
        .all()
    )
    for entry in entries:
        data = _decode(entry.value)
        if data.get("config_id") == config_id:
            return data
    return None


def get_latest_result_meta(config_id: int) -> dict[str, Any] | None:
    """Return lightweight metadata about the latest result (no heavy payload).

    Surfaces the task (job) id, report date and finish time so list views can
    reference a generated briefing without pulling the full result.
    """
    data = get_latest_result(config_id)
    if data is None:
        return None
    return {
        "job_id": data.get("job_id"),
        "report_date": data.get("report_date"),
        "finished_at": data.get("finished_at"),
    }
