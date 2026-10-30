"""Persisted snapshots for the analysis topic pages.

The analysis pages can render a default view from a previously generated
snapshot instead of issuing federated queries on every visit.  Snapshots are
stored as JSON blobs in Superset's existing ``key_value`` table (the same
mechanism the briefing feature uses), keyed by topic id through the payload.

Only the *default* filter scope is snapshotted; any interactive filter or
drill still goes through the live federated query path.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from typing import Any

from superset import db
from superset.key_value.models import KeyValueEntry
from superset.utils import json as _json
from superset.utils.core import get_user_id

logger = logging.getLogger(__name__)

RESOURCE = "analysis_snapshot"
TOPIC_PATTERN = re.compile(r"^[a-z0-9](?:[a-z0-9_-]{0,62}[a-z0-9])?$")
# A default-view payload is small (tens to a few hundred KB); cap it so a
# malformed client request cannot fill the metadata database.
MAX_SNAPSHOT_BYTES = 8 * 1024 * 1024


def _encode(value: dict[str, Any]) -> bytes:
    return _json.dumps(value).encode("utf-8")


def _decode(raw: bytes) -> dict[str, Any]:
    try:
        value = _json.loads(raw.decode("utf-8"))
        return value if isinstance(value, dict) else {}
    except (ValueError, UnicodeDecodeError):
        return {}


def _entries() -> list[KeyValueEntry]:
    return (
        db.session.query(KeyValueEntry)
        .filter(KeyValueEntry.resource == RESOURCE)
        .order_by(KeyValueEntry.created_on.desc())
        .all()
    )


def get_snapshot(topic: str) -> dict[str, Any] | None:
    """Return the latest persisted snapshot for one topic, or ``None``."""
    if not TOPIC_PATTERN.match(topic):
        return None
    for entry in _entries():
        payload = _decode(entry.value)
        if payload.get("topic") == topic:
            return payload
    return None


def save_snapshot(
    topic: str,
    scope: dict[str, Any],
    data: dict[str, Any],
    generated_at: str | None = None,
    version: int | None = None,
    query_signature: str | None = None,
) -> dict[str, Any]:
    """Upsert the snapshot for one topic.

    The response is lightweight metadata; the full payload stays in the row so
    a later ``GET`` can return it.
    """
    if not TOPIC_PATTERN.match(topic):
        raise ValueError("invalid topic id")
    if not isinstance(scope, dict) or not isinstance(data, dict):
        raise ValueError("scope and data must be objects")

    payload: dict[str, Any] = {
        "topic": topic,
        "scope": scope,
        "generated_at": generated_at or datetime.now().isoformat(),
        "data": data,
    }
    if version is not None:
        payload["version"] = version
    if query_signature:
        payload["query_signature"] = query_signature
    encoded = _encode(payload)
    if len(encoded) > MAX_SNAPSHOT_BYTES:
        raise ValueError("snapshot payload is too large")

    existing: KeyValueEntry | None = None
    for entry in _entries():
        if _decode(entry.value).get("topic") == topic:
            existing = entry
            break

    now = datetime.now()
    if existing is None:
        entry = KeyValueEntry(
            resource=RESOURCE,
            value=encoded,
            created_on=now,
            created_by_fk=get_user_id(),
        )
        db.session.add(entry)
    else:
        existing.value = encoded
        existing.changed_on = now
        existing.changed_by_fk = get_user_id()

    db.session.commit()
    return {
        "topic": topic,
        "generated_at": payload["generated_at"],
        "saved_at": now.isoformat(),
        "bytes": len(encoded),
    }
