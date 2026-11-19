# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
"""Project event calendar (launch / test dates) for fluctuation judgement.

The briefing already knows *when* a metric moved; this module answers *whether
the move was planned*.  ``config.profit_sharing`` carries each project's
上线时间 and 首测 / 二测 / 三测起始时间, so a launch or test week can suppress the
statistical verdict (「计划内」) and be kept out of the historical baseline
instead of inflating its volatility.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Iterable

import pandas as pd
from flask import current_app

logger = logging.getLogger(__name__)

# Source: the project profit-sharing table.  Database/schema are deployment
# settings so a rename does not require a code change.
DEFAULT_EVENT_DATABASE = "starfly_config"
DEFAULT_EVENT_TABLE = "config.profit_sharing"
# (column, label) pairs that describe a dated project event.
EVENT_COLUMNS: tuple[tuple[str, str], ...] = (
    ("上线时间", "上线"),
    ("首测起始时间", "首测"),
    ("二测起始时间", "二测"),
    ("三测起始时间", "三测"),
)
# The calendar changes rarely; a process-level cache keeps the per-report cost
# at one small query per TTL instead of one per run.
_CACHE_TTL_SECONDS = 600


@dataclass(frozen=True)
class ProjectEvent:
    """One dated project milestone (launch or a test start).

    ``channel`` is the calendar's ``channel_name`` (android / ios / 微信小游戏
    …).  A game can launch on different channels on different dates, so the
    channel travels with the event; the status rules themselves still judge the
    project and the aggregate metric, not a single channel row.
    """

    project: str
    date: date
    kind: str
    channel: str = ""


_cache: tuple[float, list[ProjectEvent]] | None = None


def _parse_event_date(value: Any) -> date | None:
    """Parse the calendar's date cells (``2026/11/11`` or ISO-ish)."""
    text = str(value or "").strip()
    if not text or text.lower() in {"nan", "nat", "none"}:
        return None
    parsed = pd.to_datetime(text, errors="coerce")
    if pd.isna(parsed):
        return None
    return parsed.date()


def _load_rows() -> pd.DataFrame:
    """Read the event calendar from the configured database."""
    from superset import db as superset_db
    from superset.models.core import Database

    database_name = str(
        current_app.config.get("BRIEFING_EVENT_DATABASE") or DEFAULT_EVENT_DATABASE
    )
    table = str(current_app.config.get("BRIEFING_EVENT_TABLE") or DEFAULT_EVENT_TABLE)
    columns = ", ".join(f'"{column}"' for column, _ in EVENT_COLUMNS)
    schema, _, table_name = table.partition(".")
    qualified = f"{schema}.{table_name}" if schema else table_name
    # Identifiers are deployment constants (columns/table above), never user
    # input; the values in the table are read as data, not interpolated.
    sql = f"SELECT papp_name, channel_name, {columns} FROM {qualified}"  # noqa: S608

    database = (
        superset_db.session.query(Database)
        .filter(Database.database_name == database_name)
        .one_or_none()
    )
    if database is None:
        logger.warning("Event calendar database %s not found", database_name)
        return pd.DataFrame()
    with database.get_sqla_engine(schema=schema or None) as engine:
        return pd.read_sql(sql, engine)


def load_events() -> list[ProjectEvent]:
    """All project events, cached for ``_CACHE_TTL_SECONDS``."""
    global _cache  # noqa: PLW0603 - process-level cache
    now = time.monotonic()
    if _cache is not None and now - _cache[0] < _CACHE_TTL_SECONDS:
        return _cache[1]
    try:
        frame = _load_rows()
    except Exception as ex:  # noqa: BLE001 - the calendar must not break a report
        logger.warning("Event calendar unavailable: %s", ex)
        return []
    events: list[ProjectEvent] = []
    if not frame.empty:
        for _, row in frame.iterrows():
            project = str(row.get("papp_name") or "").strip()
            if not project:
                continue
            channel = str(row.get("channel_name") or "").strip()
            for column, kind in EVENT_COLUMNS:
                day = _parse_event_date(row.get(column))
                if day is not None:
                    events.append(ProjectEvent(project, day, kind, channel))
    _cache = (now, events)
    return events


def events_for_projects(
    events: Iterable[ProjectEvent], projects: Iterable[str]
) -> list[ProjectEvent]:
    """Restrict the calendar to the projects a report actually contains."""
    wanted = {str(project) for project in projects}
    return [event for event in events if event.project in wanted]


def events_by_bucket(
    events: Iterable[ProjectEvent],
    buckets: Iterable[Any],
) -> dict[str, list[ProjectEvent]]:
    """Map bucket label -> the events whose date falls inside that bucket."""
    result: dict[str, list[ProjectEvent]] = {}
    event_list = list(events)
    for bucket in buckets:
        hits = [
            event for event in event_list if bucket.start <= event.date <= bucket.end
        ]
        if hits:
            result[bucket.label] = hits
    return result


def describe_events(events: Iterable[ProjectEvent]) -> str:
    """Human-readable event list for a fluctuation's reason line.

    Same project/date/kind from several channels collapses into one entry with
    the channels joined (「策定九州韩国（android/ios） 上线 2026-11-11」).
    """
    grouped: dict[tuple[str, date, str], list[str]] = {}
    for event in events:
        key = (event.project, event.date, event.kind)
        channels = grouped.setdefault(key, [])
        if event.channel and event.channel not in channels:
            channels.append(event.channel)
    parts: list[str] = []
    for (project, day, kind), channels in grouped.items():
        label = f"{project}（{'/'.join(channels)}）" if channels else project
        parts.append(f"{label} {kind} {day.isoformat()}")
    return "、".join(parts)
