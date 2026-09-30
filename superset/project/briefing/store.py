"""
Persistence for briefing configurations.

Report configurations (each a set of report parameters) are stored as JSON
blobs in Superset's existing ``key_value`` table under the custom resource
``daily_report_cfg``.  Reusing this table avoids new DB migrations.

The resource identifiers intentionally keep their historical ``daily_report``
values: they are an internal storage namespace only, and changing them would
orphan every configuration/result persisted before the briefing consolidation.

Each stored configuration is a dict of ``DailyReportConfig`` parameters plus a
``name``, optional ``description``, and the ``report_type`` ("daily" or
"weekly"; legacy rows without one are treated as daily).
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

# Feishu push settings per briefing configuration (targets, message type,
# enable switch) plus the outcome of the last push.  Stored outside the report
# configuration payload on purpose: saving the parameter editor replaces that
# payload wholesale, which would drop a nested push section.
RESOURCE_FEISHU = "daily_report_feishu"


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

    Surfaces the task (job) id, report type/date and finish time so list views
    can reference a generated briefing without pulling the full result.
    """
    data = get_latest_result(config_id)
    if data is None:
        return None
    return {
        "job_id": data.get("job_id"),
        "report_type": data.get("report_type", "daily"),
        "report_date": data.get("report_date"),
        "finished_at": data.get("finished_at"),
    }


# --------------------------------------------------------------------------- #
# Feishu push settings
# --------------------------------------------------------------------------- #


def _feishu_entry(config_id: int) -> KeyValueEntry | None:
    """Return the stored Feishu settings row for a configuration, if any."""
    entries = (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE_FEISHU)
        .order_by(KeyValueEntry.created_on.desc())
        .all()
    )
    for entry in entries:
        if _decode(entry.value).get("config_id") == config_id:
            return entry
    return None


def get_feishu_settings(config_id: int) -> dict[str, Any] | None:
    """Return the stored Feishu push settings for a briefing configuration."""
    entry = _feishu_entry(config_id)
    if entry is None:
        return None
    return _decode(entry.value)


def list_feishu_states() -> dict[int, dict[str, Any]]:
    """Return every stored Feishu state keyed by briefing configuration id.

    One query for the whole list view, mirroring how the list annotates each
    configuration with its latest result.
    """
    entries = (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE_FEISHU)
        .order_by(KeyValueEntry.created_on.desc())
        .all()
    )
    states: dict[int, dict[str, Any]] = {}
    for entry in entries:
        data = _decode(entry.value)
        config_id = data.get("config_id")
        if isinstance(config_id, int) and not isinstance(config_id, bool):
            states.setdefault(config_id, data)
    return states


def save_feishu_settings(config_id: int, payload: dict[str, Any]) -> dict[str, Any]:
    """Create or replace the Feishu push settings of a briefing configuration.

    ``last_push`` is preserved across saves unless the payload carries one, so
    editing the targets does not erase the delivery history.
    """
    value = {"config_id": config_id, **payload}
    entry = _feishu_entry(config_id)
    if entry is None:
        entry = KeyValueEntry(
            resource=RESOURCE_FEISHU,
            value=_encode(value),
            created_on=datetime.now(),
            created_by_fk=get_user_id(),
        )
        db.session.add(entry)
    else:
        previous = _decode(entry.value)
        if "last_push" not in value and previous.get("last_push"):
            value["last_push"] = previous["last_push"]
        entry.value = _encode(value)
        entry.changed_on = datetime.now()
        entry.changed_by_fk = get_user_id()
    db.session.commit()
    return _decode(entry.value)


def delete_feishu_settings(config_id: int) -> bool:
    """Drop the Feishu push settings of a deleted briefing configuration."""
    entry = _feishu_entry(config_id)
    if entry is None:
        return False
    db.session.delete(entry)
    db.session.commit()
    return True


def record_last_push(config_id: int, info: dict[str, Any]) -> None:
    """Persist the outcome of the most recent Feishu push for a configuration."""
    entry = _feishu_entry(config_id)
    if entry is None:
        # A push can happen before any settings were saved (e.g. an ad-hoc test
        # with explicit targets); keep the record anyway so the UI can show it.
        save_feishu_settings(config_id, {"last_push": info})
        return
    value = _decode(entry.value)
    value["last_push"] = info
    entry.value = _encode(value)
    entry.changed_on = datetime.now()
    db.session.commit()
