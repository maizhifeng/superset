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
"""Feishu (Lark) notification channel.

Pushes messages through a Lark/Feishu **custom app**: the tenant access token
is fetched from ``FEISHU_APP_ID`` / ``FEISHU_APP_SECRET`` (deployment
configuration only — never persisted, never returned by an API) and messages
are sent with ``POST /open-apis/im/v1/messages``.  Two message types are
supported:

* ``interactive`` (default) — a **Card 2.0** card built from
  ``NotificationContent.briefing_result`` when the notification comes from a
  briefing (see ``superset/project/briefing``).  Cards follow the Card 2.0
  schema: ``"schema": "2.0"``, a header whose ``template`` encodes the alert
  severity, one focal metric, supporting metric blocks, an optional alert block
  and a single full-width "查看完整简报" button.
* ``text`` — the plain-text briefing summary, for clients/deployments where a
  card is not wanted.

Targets are stored per recipient as
``{"msg_type": ..., "targets": [{"receive_id_type": ..., "receive_id": ...}]}``
with a single ``{"target": "...", "target_type": "..."}`` accepted as well, so
a plain report schedule can configure Feishu through the standard recipient
shape.  ``FEISHU_API_BASE`` picks the deployment (``open.feishu.cn`` by default,
``open.larksuite.com`` for Lark).
"""

from __future__ import annotations

import hashlib
import html
import logging
import re
import threading
import time
import uuid
from typing import Any

import backoff
import requests
from flask import current_app

from superset.reports.models import ReportRecipientType
from superset.reports.notifications.base import BaseNotification, NotificationContent
from superset.reports.notifications.exceptions import (
    NotificationParamException,
    NotificationUnprocessableException,
)
from superset.utils import json
from superset.utils.decorators import statsd_gauge

logger = logging.getLogger(__name__)

# Send attempts for one recipient.  Scheduled pushes retry transient failures;
# interactive pushes (settings dialog's test / push-now buttons) use a single
# attempt so an HTTP request never waits on backoff.
DEFAULT_MAX_TRIES = 5
INTERACTIVE_MAX_TRIES = 1

# ``receive_id_type`` values accepted by the IM message API.
RECEIVE_ID_TYPES = ("chat_id", "open_id", "user_id", "union_id", "email")
# Target type used when a recipient only carries a bare ``target``.
DEFAULT_RECEIVE_ID_TYPE = "chat_id"

MESSAGE_TYPES = ("interactive", "text")
DEFAULT_MESSAGE_TYPE = "interactive"

# API paths (not credentials): the tenant-token URL trips the bandit-style
# hardcoded-password rule because of the constant's name.
TENANT_TOKEN_ENDPOINT = "/open-apis/auth/v3/tenant_access_token/internal"  # noqa: S105
MESSAGE_PATH = "/open-apis/im/v1/messages"

# Feishu answers with HTTP 200 + ``{"code": <int>, "msg": <str>}``; only code 0
# is a success.  Codes that mean "get a fresh token and try again".
_TOKEN_INVALID_CODES = frozenset({99991661, 99991663})
# Codes that mean "this app/target is not allowed to do that" (no retry).
_PERMISSION_CODES = frozenset({99991668, 99991672})

# tenant access token cache: "<api_base>|<app_id>" -> (token, expires_at)
_TOKEN_CACHE: dict[str, tuple[str, float]] = {}
_TOKEN_LOCK = threading.Lock()
# Refresh this many seconds before the token really expires.
_TOKEN_SKEW_SECONDS = 120

_HTML_BREAK_RE = re.compile(r"<br\s*/?>", re.IGNORECASE)


class _TokenExpiredError(Exception):  # noqa: N818
    """Internal: the Feishu token was rejected, refresh it and retry once."""


# --------------------------------------------------------------------------- #
# HTTP plumbing (shared with the briefing push orchestration)
# --------------------------------------------------------------------------- #


def feishu_request(
    method: str,
    url: str,
    *,
    timeout: int,
    json_body: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
    headers: dict[str, str] | None = None,
) -> dict[str, Any]:
    """Call the Feishu API and normalize its ``{code, msg}`` envelope.

    Business errors (HTTP 200 with a non-zero ``code``) are classified as
    parameter errors (no retry) unless the code says the token expired, in which
    case ``_TokenExpiredError`` asks the caller to refresh it.  Transport
    failures, 429 and 5xx are retryable.
    """
    try:
        response = requests.request(
            method,
            url,
            json=json_body,
            params=params,
            headers=headers,
            timeout=timeout,
        )
    except requests.exceptions.RequestException as ex:
        raise NotificationUnprocessableException(f"飞书接口请求失败：{ex}") from ex

    try:
        payload = response.json()
    except ValueError:
        payload = None

    if isinstance(payload, dict) and "code" in payload:
        code = payload.get("code")
        if code == 0:
            return payload
        message = payload.get("msg") or payload.get("message") or ""
        detail = f"飞书接口返回错误 code={code} msg={message}"
        if code in _TOKEN_INVALID_CODES:
            raise _TokenExpiredError(detail)
        if code in _PERMISSION_CODES:
            raise NotificationParamException(
                f"{detail}（请确认应用已开通 im:message 权限，且机器人已加入目标会话）"
            )
        if response.status_code >= 500 or response.status_code == 429:
            raise NotificationUnprocessableException(detail)
        raise NotificationParamException(detail)

    if response.status_code >= 500 or response.status_code == 429:
        raise NotificationUnprocessableException(
            f"飞书接口返回 HTTP {response.status_code}"
        )
    if response.status_code >= 400:
        raise NotificationParamException(
            f"飞书接口返回 HTTP {response.status_code}：{response.text[:200]}"
        )
    raise NotificationParamException("飞书接口返回无法解析的响应")


def tenant_access_token(
    app_id: str,
    app_secret: str,
    api_base: str,
    timeout: int,
    *,
    refresh: bool = False,
) -> str:
    """Return a (cached) tenant access token for the custom app."""
    cache_key = f"{api_base}|{app_id}"
    now = time.time()
    with _TOKEN_LOCK:
        cached = _TOKEN_CACHE.get(cache_key)
        if cached and cached[1] > now and not refresh:
            return cached[0]

    payload = feishu_request(
        "POST",
        f"{api_base}{TENANT_TOKEN_ENDPOINT}",
        json_body={"app_id": app_id, "app_secret": app_secret},
        timeout=timeout,
    )
    token = payload.get("tenant_access_token")
    if not token:
        raise NotificationParamException(
            "飞书未返回 tenant_access_token，请检查应用凭证"
        )
    expires_in = _as_float(payload.get("expire")) or 7200
    with _TOKEN_LOCK:
        _TOKEN_CACHE[cache_key] = (
            str(token),
            now + max(expires_in - _TOKEN_SKEW_SECONDS, 60),
        )
    return str(token)


def invalidate_tenant_token(api_base: str, app_id: str) -> None:
    """Drop the cached token so the next call fetches a fresh one."""
    with _TOKEN_LOCK:
        _TOKEN_CACHE.pop(f"{api_base}|{app_id}", None)


# --------------------------------------------------------------------------- #
# Value / text helpers shared with the card builder
# --------------------------------------------------------------------------- #


def _as_float(value: Any) -> float | None:
    """Return ``value`` as a float, or None when it is not numeric."""
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def format_amount(value: Any) -> str:
    """Money-style amount: thousands separators, two decimals."""
    number = _as_float(value)
    return "-" if number is None else f"{number:,.2f}"


def format_count(value: Any) -> str:
    """Whole-number count.  Counts are ints in the payload but tolerate floats."""
    number = _as_float(value)
    return "-" if number is None else f"{number:,.0f}"


def format_ratio(value: Any) -> str:
    """Ratio rendered as a percentage, mirroring the briefing UI (``x.y%``)."""
    number = _as_float(value)
    return "-" if number is None else f"{number * 100:.1f}%"


def format_delta(current: Any, previous: Any) -> str:
    """Relative change between two periods, as ``▲ 12.3%`` / ``▼ 4.5%``.

    Returns an empty string when either side is missing or the previous value
    is zero (no meaningful comparison).
    """
    cur, prev = _as_float(current), _as_float(previous)
    if cur is None or prev is None or prev == 0:
        return ""
    change = (cur - prev) / abs(prev)
    arrow = "▲" if change >= 0 else "▼"
    return f"{arrow} {abs(change) * 100:.1f}%"


def html_to_markdown(value: str | None) -> str:
    """Best-effort conversion of the HTML-ish notification description."""
    if not value:
        return ""
    text = _HTML_BREAK_RE.sub("\n", value)
    text = re.sub(r"<[^>]+>", "", text)
    return html.unescape(text).strip()


def escape_card_text(value: str | None) -> str:
    """Escape text for the card's markdown renderer.

    Feishu's card markdown parses HTML-ish markup, so literal characters such as
    ``<`` or ``*`` must be escaped.  The documented form is the numeric entity
    (``&#60;`` rather than ``&lt;``), hence the conversion of the named entities
    produced by :func:`html.escape`.
    """
    escaped = html.escape(str(value or ""))
    for named, numeric in (
        ("&lt;", "&#60;"),
        ("&gt;", "&#62;"),
        ("&amp;", "&#38;"),
        ("&quot;", "&#34;"),
        ("&#x27;", "&#39;"),
    ):
        escaped = escaped.replace(named, numeric)
    return escaped


def _severity(result: dict[str, Any]) -> str:
    """Strongest alert level in a briefing payload: critical | warning | ok."""
    levels = {
        str(alert.get("level") or "").lower()
        for alert in result.get("alerts") or []
        if isinstance(alert, dict)
    }
    if "critical" in levels:
        return "critical"
    if levels:
        return "warning"
    return "ok"


def _report_period(result: dict[str, Any]) -> str:
    """Human label of the reported period (a day, or a weekly range)."""
    start, end = result.get("period_start"), result.get("period_end")
    if start and end:
        # A single-day window reads as one date, not "X ~ X".
        return str(start) if start == end else f"{start} ~ {end}"
    return str(result.get("report_date") or "-")


# --------------------------------------------------------------------------- #
# Card 2.0 rendering
# --------------------------------------------------------------------------- #

# Feishu rejects a card whose JSON exceeds 30 KB, so the payload is measured and
# trimmed to this budget before sending.
MAX_CARD_BYTES = 30 * 1024
CARD_BYTE_BUDGET = MAX_CARD_BYTES - 1024

# Row caps per sub-table; the card is a summary surface, the detail lives in
# Superset.  Feishu renders at most 10 rows per page.
# Rows per detail table.  The card's five tables together have to stay inside
# the 30 KB budget together with the charts, so the caps are deliberately below
# the ten rows a Feishu table can show at once.
TABLE_ROW_CAPS = {
    "platform": 10,
    "daily": 10,
    "project": 10,
    "media": 10,
    # The narrower breakdown tables (主游戏 × 分天, 媒体 × 主游戏 / 客户端).
    "breakdown": 10,
}
# Rows a Feishu table renders before it adds a pager; the card avoids the pager.
TABLE_PAGE_MAX = 10
# Buckets kept in the trend series (most recent last) and in its chart.
MAX_TREND_POINTS = 14
# The chart shows fewer buckets than the table does, so the labels stay readable.
MAX_TREND_CHART_BUCKETS = 10
# Bars per chart.  VChart keeps at most ~6 category labels at card width (font
# size and name length make no difference — measured), so past that the axis
# shows every other name; the detail table below carries the full list.
MAX_BAR_CATEGORIES = 8
# Axis labels are small so a few more of them fit.
CATEGORY_LABEL = {"visible": True, "style": {"fontSize": 11}}
MAX_PROJECT_BARS = MAX_BAR_CATEGORIES
MAX_MEDIA_BARS = MAX_BAR_CATEGORIES
# Vertical chart heights on a card.
TREND_CHART_HEIGHT = "300px"
BAR_CHART_HEIGHT = "300px"
# Value labels on the bars, so the numbers are readable without hovering.  The
# values are already in 万元, which keeps the labels short.
VALUE_LABEL = {"visible": True, "position": "top", "style": {"fontSize": 11}}

# Money in charts and tables is rendered in 万元: the reported figures run into
# the hundreds of thousands, so raw yuan are unreadable on a card axis.
WAN = 10_000.0
CHART_WAN_DIGITS = 1
TABLE_WAN_DIGITS = 1

# Secondary text colour.  The card markdown component takes colours inline
# (``<font color='grey'>``) rather than through a ``font_color`` property: the
# latter is rejected by the API with card parse error 200621.
MUTED_COLOR = "grey"
# Period-over-period deltas use the usual business semantics: green for the good
# direction, red for the bad one (see ``DELTA_HIGHER_IS_BETTER``).
GOOD_DELTA_COLOR = "green"
BAD_DELTA_COLOR = "red"

# Separator between a metric label and its period-over-period delta.
IDEOGRAPHIC_SPACE = "\u3000"

# Which direction is good for each headline metric (mirrors the briefing page).
DELTA_HIGHER_IS_BETTER = {
    "spend": False,
    "new_users": True,
    "cpa": False,
    "recharge": True,
    "ROI1": True,
    "LTV1": True,
}

# ROI quality tiers, mirroring the briefing page's ``roiQuality`` helper: plain
# colours on the card, the exact palette of the web report in the chart spec.
ROI_TIER_GOOD = "达标"
ROI_TIER_MID = "中"
ROI_TIER_LOW = "低"
ROI_TIER_UNKNOWN = "无 ROI"
ROI_TIER_ORDER = (ROI_TIER_GOOD, ROI_TIER_MID, ROI_TIER_LOW, ROI_TIER_UNKNOWN)
ROI_TIER_TABLE_COLORS = {
    ROI_TIER_GOOD: "green",
    ROI_TIER_MID: "orange",
    ROI_TIER_LOW: "red",
    ROI_TIER_UNKNOWN: "neutral",
}

# The ROI line rides on a second value axis (bar + line combo), so a single
# hover lists both the spend bar and the ROI of that bucket / game / media.
# A series without a seriesField is labelled in the legend by its ``name``
# (falling back to the id), and an axis binds to it through the id.
ROI_MARKER_COLOR = "#1f2329"
ROI_SERIES_ID = "roi"
ROI_SERIES_NAME = "ROI1（%）"
# One constant field per money series, so the legend and the tooltip rows read
# ``消耗（万元）`` / ``流水（万元）`` / ``ROI1（%）`` instead of the raw field name
# (VChart labels a seriesField-less series with the dimension value).
ROI_METRIC_FIELD = "指标"
SPEND_LABEL = "消耗（万元）"
RECHARGE_LABEL = "流水（万元）"
# Single colour for the spend bars: without a tier split (which would rename the
# tooltip rows) VChart cannot colour bars per datum.
SPEND_BAR_COLOR = "#2b6cb0"

# Default thresholds, matching the briefing page's fallbacks.
DEFAULT_BREAKEVEN_LINE = 0.10
DEFAULT_CRITICAL_LINE = 0.05

# Header template per severity: the whole card stays in one colour family, and
# the header carries the "should I care" signal.
_SEVERITY_TEMPLATE = {"critical": "red", "warning": "orange", "ok": "blue"}
_SEVERITY_BACKGROUND = {"critical": "red-50", "warning": "orange-50", "ok": "blue-50"}
_SEVERITY_ALERT_COLOR = {"critical": "red", "warning": "orange", "ok": "grey"}

# At most this many alert lines are rendered; the rest is summarised.
MAX_ALERT_LINES = 5
# Alert level → the tag rendered in front of the message.
ALERT_TAGS = {"critical": "[严重告警]", "warning": "[预警]", "info": "[提示]"}

# Chapter titles, mirroring the briefing page's section headings.
CHAPTERS = {
    "core": "核心指标速览",
    "trend": "分天对比",
    "trend_weekly": "分周对比",
    "projects": "主游戏维度分析",
    "media": "媒体表现分析",
}


# ---- value formatting ------------------------------------------------------ #


def _wan(value: Any, digits: int = CHART_WAN_DIGITS) -> float | None:
    """Yuan to 万元, rounded for display."""
    number = _as_float(value)
    return None if number is None else round(number / WAN, digits)


def format_wan(value: Any, digits: int = CHART_WAN_DIGITS) -> str:
    """Money rendered in 万元 (charts and tables)."""
    number = _as_float(value)
    return "-" if number is None else f"{number / WAN:,.{digits}f}"


def format_roi(value: Any, digits: int = 1) -> str:
    """A ratio rendered as a percentage (ROI, LTV-based rates)."""
    number = _as_float(value)
    return "—" if number is None else f"{number * 100:.{digits}f}%"


def delta_color(
    current: Any, previous: Any, *, higher_is_better: bool = True
) -> str | None:
    """Colour for a period-over-period delta, or None when there is none."""
    cur, prev = _as_float(current), _as_float(previous)
    if cur is None or prev is None or prev == 0 or cur == prev:
        return None
    improved = (cur > prev) if higher_is_better else (cur < prev)
    return GOOD_DELTA_COLOR if improved else BAD_DELTA_COLOR


def roi_tier(
    roi1: Any,
    breakeven: float = DEFAULT_BREAKEVEN_LINE,
    critical: float = DEFAULT_CRITICAL_LINE,
) -> str:
    """ROI quality tier, mirroring the briefing page's ``roiQuality``."""
    value = _as_float(roi1)
    if value is None:
        return ROI_TIER_UNKNOWN
    if value >= breakeven:
        return ROI_TIER_GOOD
    if value >= critical:
        return ROI_TIER_MID
    return ROI_TIER_LOW


def _round(value: Any, digits: int) -> float | None:
    """A payload number rounded for display (cards have no client formatter)."""
    number = _as_float(value)
    return None if number is None else round(number, digits)


def _as_pct(value: Any, digits: int = 1) -> float | None:
    """A 0~1 ratio as a percentage number (the card's rate columns)."""
    number = _as_float(value)
    return None if number is None else round(number * 100, digits)


def _roi_thresholds(result: dict[str, Any]) -> tuple[float, float]:
    """``(breakeven, critical)`` ROI lines carried by the report payload."""
    thresholds = result.get("thresholds") or {}
    breakeven = _as_float(thresholds.get("default_breakeven_line"))
    critical = _as_float(thresholds.get("roi_critical_line"))
    return (
        breakeven if breakeven is not None else DEFAULT_BREAKEVEN_LINE,
        critical if critical is not None else DEFAULT_CRITICAL_LINE,
    )


def _metric_column(
    value: str,
    label: str,
    delta: str,
    *,
    delta_tone: str | None = None,
    focal: bool = False,
    text_size: str = "body",
) -> dict[str, Any]:
    """One metric cell: value on top, grey label (+ toned delta) underneath."""
    caption = f"<font color='{MUTED_COLOR}'>{escape_card_text(label)}</font>"
    if delta:
        tone = delta_tone or MUTED_COLOR
        caption += (
            f"{IDEOGRAPHIC_SPACE}<font color='{tone}'>{escape_card_text(delta)}</font>"
        )
    elements: list[dict[str, Any]] = [
        {
            "tag": "markdown",
            "content": f"**{value}**",
            "text_size": "title" if focal else text_size,
        },
        {"tag": "markdown", "content": caption, "text_size": "caption"},
    ]
    return {
        "tag": "column",
        "width": "weighted",
        "weight": 1,
        "vertical_spacing": "2px",
        "elements": elements,
    }


def _metric_row(cells: list[dict[str, Any]], background: str) -> dict[str, Any]:
    return {
        "tag": "column_set",
        "flex_mode": "none",
        "horizontal_spacing": "8px",
        "background_style": background,
        "columns": cells,
    }


def _chapter_labels(weekly: bool) -> dict[str, str]:
    """Chapter titles, with the weekly variant of the trend chapter."""
    labels = dict(CHAPTERS)
    if weekly:
        labels["trend"] = labels["trend_weekly"]
    return labels


def _chapter(index: int, key: str, caption: str = "") -> dict[str, Any]:
    """Chapter heading: a bold numbered title, plus an optional grey caption."""
    label = CHAPTERS.get(key, key)
    content = f"**{index}. {escape_card_text(label)}**"
    if caption:
        content += f"\n<font color='{MUTED_COLOR}'>{escape_card_text(caption)}</font>"
    return {"tag": "markdown", "content": content, "text_size": "body"}


# ---- tables ---------------------------------------------------------------- #


def _table(
    columns: list[dict[str, Any]],
    rows: list[dict[str, Any]],
    *,
    page_size: int = 5,
    freeze_first_column: bool = False,
) -> dict[str, Any]:
    """A Feishu table element (root-level only, at most 5 per card).

    ``freeze_first_column`` keeps the row's name in view while the reader
    scrolls the metric columns, which is what makes the wide (report-page
    equivalent) column set usable on a card.
    """
    table: dict[str, Any] = {
        "tag": "table",
        "columns": columns,
        "rows": rows,
        "page_size": max(1, min(10, page_size)),
        "row_height": "low",
        "header_style": {
            "background_style": "grey",
            "bold": True,
            "text_align": "center",
        },
        # The dimension column stays visible while the metric columns scroll.
        "freeze_first_column": True,
    }
    return table


def _num_column(
    name: str, display_name: str, precision: int, width: str = "auto"
) -> dict[str, Any]:
    return {
        "name": name,
        "display_name": display_name,
        "data_type": "number",
        "format": {"precision": precision, "separator": True},
        "width": width,
        "horizontal_align": "center",
    }


def _pct_column(name: str, display_name: str) -> dict[str, Any]:
    """A rate column whose cells already carry a percent sign."""
    return {
        "name": name,
        "display_name": display_name,
        "data_type": "text",
        "horizontal_align": "center",
    }


def _text_column(name: str, display_name: str) -> dict[str, Any]:
    return {
        "name": name,
        "display_name": display_name,
        "data_type": "text",
        "horizontal_align": "center",
    }


def _options_column(name: str, display_name: str) -> dict[str, Any]:
    """A column of coloured tags (used for the ROI quality read)."""
    return {
        "name": name,
        "display_name": display_name,
        "data_type": "options",
        "width": "auto",
        "horizontal_align": "right",
    }


def _roi_cell(value: Any, breakeven: float, critical: float) -> list[dict[str, str]]:
    """ROI rendered as a percentage tag coloured by its quality tier."""
    tier = roi_tier(value, breakeven, critical)
    return [{"text": format_roi(value), "color": ROI_TIER_TABLE_COLORS[tier]}]


def _rows_of(result: dict[str, Any], key: str) -> list[dict[str, Any]]:
    rows = result.get(key)
    return [row for row in rows or [] if isinstance(row, dict)]


def _axis_label(row: dict[str, Any]) -> str:
    """Compact bucket label for a chart axis (``2026-09-21`` → ``09-21``).

    A full date is too wide for a card axis, and VChart then drops every other
    label; weekly ranges keep their first day.
    """
    raw = str(row.get("label") or row.get("date") or "")
    if "~" in raw:
        raw = raw.split("~")[0].strip()
    match = re.search(r"(\d{4})-(\d{2})-(\d{2})$", raw)
    return f"{match.group(2)}-{match.group(3)}" if match else raw


def _trend_rows(result: dict[str, Any]) -> list[dict[str, Any]]:
    """Trend buckets, oldest first (the payload is newest-first)."""
    rows = _rows_of(result, "daily")
    return list(reversed(rows))[-MAX_TREND_POINTS:]


# ---- charts ---------------------------------------------------------------- #


def build_trend_chart(result: dict[str, Any], *, weekly: bool) -> dict[str, Any] | None:
    """Trend chapter: 消耗 / 流水 as paired bars plus the ROI1 line.

    The two money series share one 万元 axis and are drawn side by side: VChart
    only splits a dimension's bars when ``xField`` is an **array** whose extra
    entry names the grouping field — with a single ``xField`` the two series are
    painted into the same slot and the second one is hidden.
    """
    rows = _trend_rows(result)
    if not rows:
        return None
    chart_rows = list(reversed(rows))[:MAX_TREND_CHART_BUCKETS]
    amount_values: list[dict[str, Any]] = []
    roi_values: list[dict[str, Any]] = []
    for row in chart_rows:
        label = _axis_label(row)
        amount_values.append(
            {"周期": label, "指标": SPEND_LABEL, "金额": _wan(row.get("spend"))}
        )
        amount_values.append(
            {"周期": label, "指标": RECHARGE_LABEL, "金额": _wan(row.get("recharge"))}
        )
        roi = _as_float(row.get("roi1"))
        if roi is not None:
            # The constant field is what names this series in the legend and in
            # the tooltip: VChart falls back to the dimension value otherwise.
            roi_values.append(
                {
                    "周期": label,
                    ROI_METRIC_FIELD: ROI_SERIES_NAME,
                    "ROI1": round(roi * 100, 1),
                }
            )
    if not amount_values:
        return None
    grain = "分周" if weekly else "分天"
    return {
        "tag": "chart",
        "height": TREND_CHART_HEIGHT,
        "element_id": "chart-trend",
        "chart_spec": {
            "type": "common",
            "data": [
                {"id": "amount", "values": amount_values},
                {"id": ROI_SERIES_ID, "values": roi_values},
            ],
            "series": [
                {
                    "id": "amount",
                    "type": "bar",
                    # Array xField = the grouping field; see the docstring.
                    "xField": ["周期", "指标"],
                    "yField": "金额",
                    "dataId": "amount",
                    "seriesField": "指标",
                    "stack": False,
                    "label": VALUE_LABEL,
                },
                {
                    "id": ROI_SERIES_ID,
                    "type": "line",
                    "dataId": ROI_SERIES_ID,
                    "xField": "周期",
                    "yField": "ROI1",
                    # The constant metric field is what names this series in the
                    # legend and the tooltip rows.
                    "seriesField": ROI_METRIC_FIELD,
                    "line": {"style": {"stroke": ROI_MARKER_COLOR, "lineWidth": 2}},
                    "point": {"visible": True, "style": {"fill": ROI_MARKER_COLOR}},
                    # Percentage values; the unit rides in the series name.
                    "label": VALUE_LABEL,
                },
            ],
            "axes": [
                {"orient": "bottom", "type": "band", "label": CATEGORY_LABEL},
                {
                    "orient": "left",
                    "seriesId": ["amount"],
                    "title": {"visible": True, "text": f"{grain}金额（万元）"},
                },
                {
                    "orient": "right",
                    "seriesId": [ROI_SERIES_ID],
                    "grid": {"visible": False},
                    "title": {"visible": True, "text": "ROI1（%）"},
                },
            ],
            "legends": {"visible": True, "orient": "bottom"},
            # Hovering a bucket lists every series at that bucket (spend,
            # revenue and ROI in one tooltip) instead of only the hovered mark.
            "tooltip": {
                "visible": True,
                "activeType": "dimension",
                "dimension": {"visible": True},
            },
        },
    }


def _quality_bar_chart(
    *,
    element_id: str,
    title: str,
    category_field: str,
    values: list[dict[str, Any]],
    roi_values: list[dict[str, Any]],
    height: str,
) -> dict[str, Any]:
    """Spend bars (coloured by ROI tier) plus an ROI line, category axis below.

    The line makes the ROI a series of the chart, which is what puts it into the
    dimension tooltip: the card schema cannot carry the tooltip formatter
    function that would otherwise read it from the bar's datum.  Two details are
    load-bearing and were verified against a rendered chart:

    * the tier colours come from an ordinal scale keyed on the quality field; a
      plain colour array is applied in data order and mis-colours the tiers;
    * a band chart keeps one label per category only while the labels fit, which
      is why the bars are capped (``MAX_BAR_CATEGORIES``).
    """
    return {
        "tag": "chart",
        "height": height,
        "element_id": element_id,
        "chart_spec": {
            "type": "common",
            "data": [
                {
                    "id": "amount",
                    "values": [
                        {**value, ROI_METRIC_FIELD: SPEND_LABEL} for value in values
                    ],
                },
                {
                    "id": ROI_SERIES_ID,
                    "values": [
                        {**value, ROI_METRIC_FIELD: ROI_SERIES_NAME}
                        for value in roi_values
                    ],
                },
            ],
            "series": [
                {
                    "id": "amount",
                    "type": "bar",
                    "dataId": "amount",
                    "xField": category_field,
                    "yField": "消耗",
                    # One series per metric: the legend and the tooltip rows read
                    # "消耗（万元）" / "ROI1（%）".  Splitting by ROI tier instead
                    # would name the rows 达标/中/低 — VChart takes a series'
                    # label from its seriesField, and per-datum colours are only
                    # available through that same split.
                    "seriesField": ROI_METRIC_FIELD,
                    "stack": False,
                    "label": VALUE_LABEL,
                },
                {
                    "id": ROI_SERIES_ID,
                    "type": "line",
                    "dataId": ROI_SERIES_ID,
                    "xField": category_field,
                    "yField": "ROI1",
                    "seriesField": ROI_METRIC_FIELD,
                    "line": {"style": {"stroke": ROI_MARKER_COLOR, "lineWidth": 2}},
                    "point": {"visible": True, "style": {"fill": ROI_MARKER_COLOR}},
                    # The ROI value is already a percentage (the field is scaled
                    # by 100); the unit lives in the series name / axis title
                    # because a "%" suffix would need a JS formatter.
                    "label": VALUE_LABEL,
                },
            ],
            "axes": [
                {"orient": "bottom", "type": "band", "label": CATEGORY_LABEL},
                {
                    "orient": "left",
                    "seriesId": ["amount"],
                    "title": {"visible": True, "text": "消耗（万元）"},
                },
                {
                    "orient": "right",
                    "seriesId": [ROI_SERIES_ID],
                    "grid": {"visible": False},
                    "title": {"visible": True, "text": "ROI1（%）"},
                },
            ],
            "color": [SPEND_BAR_COLOR, ROI_MARKER_COLOR],
            "legends": {"visible": True, "orient": "bottom"},
            "tooltip": {
                "visible": True,
                "activeType": "dimension",
                "dimension": {"visible": True},
            },
        },
    }


def build_project_chart(result: dict[str, Any]) -> dict[str, Any] | None:
    """Top 主游戏 by spend, coloured by ROI quality."""
    rows = sorted(
        _rows_of(result, "project_summary") or _rows_of(result, "projects"),
        key=lambda row: _as_float(row.get("spend")) or 0.0,
        reverse=True,
    )[:MAX_PROJECT_BARS]
    values: list[dict[str, Any]] = []
    roi_values: list[dict[str, Any]] = []
    for row in rows:
        name = str(row.get("project") or "-")
        values.append(
            {
                "主游戏": name,
                "消耗": _wan(row.get("spend")),
            }
        )
        roi = _as_float(row.get("roi1"))
        if roi is not None:
            roi_values.append({"主游戏": name, "ROI1": round(roi * 100, 1)})
    if not values:
        return None
    return _quality_bar_chart(
        element_id="chart-project",
        title=f"主游戏消耗 Top {len(values)}（万元，颜色=ROI 质量）",
        category_field="主游戏",
        values=values,
        roi_values=roi_values,
        height=BAR_CHART_HEIGHT,
    )


def build_media_chart(result: dict[str, Any]) -> dict[str, Any] | None:
    """Top 媒体 by spend, coloured by ROI quality (same read as the report page)."""
    rows = _rows_of(result, "media")[:MAX_MEDIA_BARS]
    values: list[dict[str, Any]] = []
    roi_values: list[dict[str, Any]] = []
    for row in rows:
        name = str(row.get("channel") or "-")
        values.append(
            {
                "媒体": name,
                "消耗": _wan(row.get("spend")),
            }
        )
        roi = _as_float(row.get("roi1"))
        if roi is not None:
            roi_values.append({"媒体": name, "ROI1": round(roi * 100, 1)})
    if not values:
        return None
    return _quality_bar_chart(
        element_id="chart-media",
        title=f"媒体消耗 Top {len(values)}（万元，颜色=ROI 质量）",
        category_field="媒体",
        values=values,
        roi_values=roi_values,
        height=BAR_CHART_HEIGHT,
    )


# ---- sub-tables ------------------------------------------------------------ #


# The metric columns mirror the report page's table (``metricColumnDefs``):
# money in 万元, ratios as percentages, deltas and ROI as coloured tags.
# The report page lists a LTV column per elapsed day; the briefing payload
# carries ltv1…ltv30, so a table shows LTV1..LTV<elapsed> — a single-day window
# must not grow empty LTV2/LTV3/… columns.
LTV_DAYS: tuple[int, ...] = (1, 2, 3, 4, 5, 6, 7)
# A table that shows only the report's target date can trust LTV1 alone: the
# later horizons are still incomplete (yesterday's report has one elapsed day).
LTV_DAYS_SINGLE: tuple[int, ...] = (1,)

_METRIC_COLUMNS: list[dict[str, Any]] = [
    _num_column("spend", "消耗(万元)", TABLE_WAN_DIGITS),
    _text_column("sd", "消耗环比"),
    _num_column("recharge", "流水(万元)", TABLE_WAN_DIGITS),
    _num_column("new_users", "新增", 0),
    _pct_column("nr", "自然新增%"),
    _pct_column("pr", "1日付费率"),
    _pct_column("rr", "2日留存率"),
    _num_column("cpa", "CPA", 2),
]


def _metric_columns(ltv_days: tuple[int, ...]) -> list[dict[str, Any]]:
    """The metric columns, with one LTV column per elapsed day."""
    return [
        *_METRIC_COLUMNS,
        *[_num_column(f"l{day}", f"LTV{day}", 2) for day in ltv_days],
        *_ROI_COLUMNS,
    ]


_ROI_COLUMNS: list[dict[str, Any]] = [
    _options_column("roi1", "ROI1"),
    _text_column("rd", "ROI1环比"),
    _options_column("rcc", "累计ROI"),
]


def _columns(
    dimension: list[dict[str, Any]],
    ltv_days: tuple[int, ...] = LTV_DAYS_SINGLE,
) -> list[dict[str, Any]]:
    """Dimension columns + the report page's metric columns."""
    return [*dimension, *_metric_columns(ltv_days)]


def _delta_cell(
    current: Any,
    previous: Any,
    *,
    higher_is_better: bool = True,
) -> str:
    """A period-over-period delta as plain text (the card's byte budget bites)."""
    return format_delta(current, previous) or "—"


def _metric_cells(
    row: dict[str, Any],
    breakeven: float,
    critical: float,
    ltv_days: tuple[int, ...] = LTV_DAYS_SINGLE,
) -> dict[str, Any]:
    """Every metric cell of one row, keyed by column name."""
    raw_previous = row.get("prev")
    previous: dict[str, Any] = raw_previous if isinstance(raw_previous, dict) else {}

    def rate(key: str) -> str:
        value = _as_pct(row.get(key))
        return "—" if value is None else f"{value:.1f}%"

    return {
        "spend": _wan(row.get("spend"), TABLE_WAN_DIGITS),
        "sd": _delta_cell(
            row.get("spend"), previous.get("spend"), higher_is_better=False
        ),
        "recharge": _wan(row.get("recharge"), TABLE_WAN_DIGITS),
        "new_users": _round(row.get("new_users"), 0),
        "nr": rate("natural_rate"),
        "pr": rate("pay_rate"),
        "rr": rate("retention_rate"),
        "cpa": _round(row.get("cpa"), 2),
        **{f"l{day}": _round(row.get(f"ltv{day}"), 2) for day in ltv_days},
        "roi1": _roi_cell(row.get("roi1"), breakeven, critical),
        "rd": _delta_cell(row.get("roi1"), previous.get("roi1")),
        "rcc": _roi_cell(row.get("roi_cum"), breakeven, critical),
    }


def build_platform_table(
    result: dict[str, Any], *, limit: int | None = None
) -> dict[str, Any] | None:
    """分业务板块 split of the headline figures."""
    breakeven, critical = _roi_thresholds(result)
    cap = limit if limit is not None else TABLE_ROW_CAPS["platform"]
    rows = _rows_of(result, "platforms")[:cap]
    if not rows:
        return None
    ltv_days = LTV_DAYS_SINGLE
    return _table(
        _columns([_text_column("platform", "平台")], ltv_days),
        [
            {
                "platform": str(row.get("platform") or "-"),
                **_metric_cells(row, breakeven, critical, ltv_days),
            }
            for row in rows
        ],
        page_size=len(rows),
    )


def build_daily_table(
    result: dict[str, Any], *, limit: int | None = None
) -> dict[str, Any] | None:
    """分天/分周 detail behind the trend chart."""
    breakeven, critical = _roi_thresholds(result)
    cap = limit if limit is not None else TABLE_ROW_CAPS["daily"]
    rows = _trend_rows(result)[-cap:]
    if not rows:
        return None
    # The daily rows carry no ``prev`` block; the period-over-period columns come
    # from the neighbouring day instead, so 消耗环比 / ROI1环比 are not blank.
    enriched: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        previous = rows[index - 1] if index else {}
        enriched.append({**row, "prev": dict(previous)})
    # 分天表 is the only multi-day view, so it keeps the full LTV week.
    ltv_days = LTV_DAYS
    return _table(
        _columns([_text_column("label", "周期")], ltv_days),
        [
            {
                "label": str(row.get("label") or row.get("date") or "-"),
                **_metric_cells(row, breakeven, critical, ltv_days),
            }
            for row in enriched
        ],
        page_size=len(rows),
    )


def build_project_table(
    result: dict[str, Any], *, limit: int | None = None
) -> dict[str, Any] | None:
    """主游戏 × 渠道 detail behind the project chart."""
    breakeven, critical = _roi_thresholds(result)
    cap = limit if limit is not None else TABLE_ROW_CAPS["project"]
    # 一级维度按名称升序，组内按消耗降序。
    rows = sorted(
        _rows_of(result, "projects"),
        key=lambda row: (
            str(row.get("project") or ""),
            -(_as_float(row.get("spend")) or 0.0),
        ),
    )[:cap]
    if not rows:
        return None
    ltv_days = LTV_DAYS_SINGLE
    return _table(
        _columns(
            [
                _text_column("project", "主游戏"),
                _text_column("channel", "渠道"),
            ],
            ltv_days,
        ),
        [
            {
                "project": str(row.get("project") or "-"),
                "channel": str(row.get("channel") or "-"),
                **_metric_cells(row, breakeven, critical, ltv_days),
            }
            for row in rows
        ],
        page_size=len(rows),
    )


def build_project_daily_table(
    result: dict[str, Any], *, limit: int | None = None
) -> dict[str, Any] | None:
    """主游戏 × 分天 — the project chapter's daily expansion."""
    breakeven, critical = _roi_thresholds(result)
    cap = limit if limit is not None else TABLE_ROW_CAPS["breakdown"]
    rows: list[dict[str, Any]] = []
    for project in _rows_of(result, "projects"):
        daily = project.get("daily")
        if not isinstance(daily, list):
            continue
        for day in daily:
            if not isinstance(day, dict):
                continue
            rows.append(
                {
                    **day,
                    "project": project.get("project"),
                    "channel": project.get("channel"),
                }
            )
    rows = sorted(
        rows,
        key=lambda row: (
            str(row.get("project") or ""),
            str(row.get("channel") or ""),
            str(row.get("date") or ""),
        ),
    )[:cap]
    if not rows:
        return None
    # The day rows carry no ``prev`` block either: diff the previous day of the
    # same 主游戏 × 渠道 so 消耗环比 / ROI1环比 are filled in.
    previous_by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        key = (str(row.get("project") or ""), str(row.get("channel") or ""))
        row["prev"] = previous_by_key.get(key, {})
        previous_by_key[key] = row
    ltv_days = LTV_DAYS_SINGLE
    return _table(
        _columns(
            [
                _text_column("project", "主游戏"),
                _text_column("channel", "渠道"),
                _text_column("date", "日期"),
            ],
            ltv_days,
        ),
        [
            {
                "project": str(row.get("project") or "-"),
                "channel": str(row.get("channel") or "-"),
                "date": str(row.get("date") or row.get("label") or "-"),
                **_metric_cells(row, breakeven, critical, ltv_days),
            }
            for row in rows
        ],
        page_size=len(rows),
    )


def build_media_project_table(
    result: dict[str, Any], *, limit: int | None = None
) -> dict[str, Any] | None:
    """媒体 × 主游戏 — the media chapter's combination dimension."""
    breakeven, critical = _roi_thresholds(result)
    cap = limit if limit is not None else TABLE_ROW_CAPS["breakdown"]
    # Primary dimension by name, the media secondary, then spend descending.
    rows = sorted(
        _rows_of(result, "media_projects"),
        key=lambda row: (
            str(row.get("project") or ""),
            -(_as_float(row.get("spend")) or 0.0),
        ),
    )[:cap]
    if not rows:
        return None
    ltv_days = LTV_DAYS_SINGLE
    return _table(
        _columns(
            [
                _text_column("project", "主游戏"),
                _text_column("channel", "媒体"),
            ],
            ltv_days,
        ),
        [
            {
                "project": str(row.get("project") or "-"),
                "channel": str(row.get("channel") or "-"),
                **_metric_cells(row, breakeven, critical, ltv_days),
            }
            for row in rows
        ],
        page_size=len(rows),
        freeze_first_column=True,
    )


def build_media_platform_table(
    result: dict[str, Any], *, limit: int | None = None
) -> dict[str, Any] | None:
    """媒体 × 客户端 — the other media combination dimension."""
    breakeven, critical = _roi_thresholds(result)
    cap = limit if limit is not None else TABLE_ROW_CAPS["breakdown"]
    rows = sorted(
        _rows_of(result, "media_platforms"),
        key=lambda row: (
            str(row.get("platform") or ""),
            -(_as_float(row.get("spend")) or 0.0),
        ),
    )[:cap]
    if not rows:
        return None
    ltv_days = LTV_DAYS_SINGLE
    return _table(
        _columns(
            [
                _text_column("platform", "客户端"),
                _text_column("channel", "媒体"),
            ],
            ltv_days,
        ),
        [
            {
                "platform": str(row.get("platform") or "-"),
                "channel": str(row.get("channel") or "-"),
                **_metric_cells(row, breakeven, critical, ltv_days),
            }
            for row in rows
        ],
        page_size=len(rows),
        freeze_first_column=True,
    )


def build_media_table(
    result: dict[str, Any], *, limit: int | None = None
) -> dict[str, Any] | None:
    """媒体 detail behind the media chart."""
    breakeven, critical = _roi_thresholds(result)
    cap = limit if limit is not None else TABLE_ROW_CAPS["media"]
    rows = _rows_of(result, "media")[:cap]
    if not rows:
        return None
    ltv_days = LTV_DAYS_SINGLE
    return _table(
        _columns([_text_column("channel", "媒体")], ltv_days),
        [
            {
                "channel": str(row.get("channel") or "-"),
                **_metric_cells(row, breakeven, critical, ltv_days),
            }
            for row in rows
        ],
        page_size=len(rows),
    )


# ---- card assembly --------------------------------------------------------- #


def chapter_heading(chapter: str, weekly: bool) -> str:
    """The numbered chapter title, e.g. ``② 分天对比``."""
    labels = _chapter_labels(weekly)
    index = CHAPTER_KEYS.index(chapter) + 1
    circled = "①②③④⑤⑥⑦⑧⑨⑩"[index - 1]
    return f"{circled} {labels[chapter]}"


def _card_header(
    result: dict[str, Any],
    *,
    name: str,
    report_type: str,
    severity: str,
    chapter: str | None = None,
) -> dict[str, Any]:
    """Card header: the report's name + period, tagged with the worst alert."""
    weekly = report_type == "weekly"
    period = _report_period(result)
    tag_text = {"critical": "严重", "warning": "预警", "ok": "正常"}[severity]
    generated = _as_text(result.get("generated_at"))
    subtitle = " · ".join(
        part for part in (_period_phrase(result, weekly), generated) if part
    )
    # Report names often already read 日报简报 / 111简报; only add the suffix when
    # the name does not end with it.
    heading = name if name.endswith("简报") else f"{name}简报"
    title = f"{heading} · {period}"
    if chapter:
        # One message per chapter: say which chapter this message carries.
        title = f"{title} · {chapter_heading(chapter, weekly)}"
    return {
        "title": {
            "tag": "plain_text",
            "content": title,
        },
        "subtitle": {
            "tag": "plain_text",
            # The header renders one line; any newline in the data is dropped.
            "content": " ".join(subtitle.split()),
        },
        "template": _SEVERITY_TEMPLATE[severity],
        "text_tag_list": [
            {
                "tag": "text_tag",
                "text": {"tag": "plain_text", "content": tag_text},
                "color": _SEVERITY_TEMPLATE[severity],
            }
        ],
    }


def _as_text(value: Any) -> str:
    """A value rendered as stripped text ('' for None)."""
    return "" if value is None else str(value).strip()


def _period_phrase(result: dict[str, Any], weekly: bool) -> str:
    """Short description of the data window shown in the header subtitle."""
    if result.get("empty"):
        return "无数据"
    label = "本周" if weekly else "本期"
    rows = _trend_rows(result)
    if not rows:
        return f"{label}数据"
    latest = rows[-1]
    return f"{label} {_as_text(latest.get('label') or latest.get('date'))}"


def _alert_block(result: dict[str, Any], color: str) -> list[dict[str, Any]]:
    """The alert lines (capped) as one markdown block."""
    alerts = [
        alert
        for alert in (result.get("alerts") or [])
        if isinstance(alert, dict) and alert.get("message")
    ]
    if not alerts:
        return []
    lines = []
    for alert in alerts[:MAX_ALERT_LINES]:
        tag = ALERT_TAGS.get(str(alert.get("level")), ALERT_TAGS["warning"])
        message = escape_card_text(str(alert.get("message")))
        lines.append(f"<font color='{color}'>{tag}</font> {message}")
    if (remaining := len(alerts) - MAX_ALERT_LINES) > 0:
        lines.append(f"<font color='{MUTED_COLOR}'>还有 {remaining} 条告警</font>")
    return [{"tag": "markdown", "content": "\n".join(lines), "text_size": "caption"}]


def _headline_cells(result: dict[str, Any], background: str) -> list[dict[str, Any]]:
    """The headline metric row: 消耗 leads, the rest support it."""
    core = result.get("core") or {}
    previous = result.get("core_previous") or {}
    return [
        _metric_cell(core, previous, "spend", "消耗", format_amount),
        _metric_cell(core, previous, "new_users", "新增", format_count),
        _metric_cell(core, previous, "recharge", "流水", format_amount),
        _metric_cell(core, previous, "roi1", "ROI1", format_roi),
        _metric_cell(core, previous, "cpa", "CPA", format_amount),
    ]


def _funnel_caption(result: dict[str, Any]) -> dict[str, Any] | None:
    """One grey line with the funnel rates behind the headline numbers."""
    core = result.get("core") or {}
    parts = [
        f"{label} {value:.1f}%"
        for label, key in (
            ("付费率", "pay_rate"),
            ("留存率", "retention_rate"),
            ("自然%", "natural_rate"),
        )
        if (value := _as_pct(_core_value(core, key))) is not None
    ]
    if not parts:
        return None
    return {
        "tag": "markdown",
        "content": f"<font color='{MUTED_COLOR}'>{' · '.join(parts)}</font>",
        "text_size": "caption",
    }


def _core_section(
    result: dict[str, Any],
    *,
    background: str,
    alert_color: str,
    include_tables: bool,
) -> list[dict[str, Any]]:
    """Chapter ①: headline metrics, funnel rates, alerts and the platform split."""
    body: list[dict[str, Any]] = [
        _chapter(1, "core"),
        _metric_row(_headline_cells(result, background), background),
    ]
    if caption := _funnel_caption(result):
        body.append(caption)
    body.extend(_alert_block(result, alert_color))
    if result.get("empty"):
        body.append(
            {
                "tag": "markdown",
                "content": (
                    f"<font color='{MUTED_COLOR}'>"
                    "该周期没有数据，请检查数据源与日期范围</font>"
                ),
                "text_size": "caption",
            }
        )
    return body


def _trend_section(
    result: dict[str, Any], *, weekly: bool, include_tables: bool
) -> list[dict[str, Any]]:
    """Chapter ②: the trend chart plus its detail table."""
    body: list[dict[str, Any]] = [
        _chapter(
            2,
            "trend_weekly" if weekly else "trend",
            "柱=消耗/流水（万元），折线=ROI1（%）",
        )
    ]
    if chart := build_trend_chart(result, weekly=weekly):
        body.append(chart)
    return body


def _project_section(
    result: dict[str, Any], *, include_tables: bool
) -> list[dict[str, Any]]:
    """Chapter ③: the 主游戏 chart plus its detail table."""
    body: list[dict[str, Any]] = [
        _chapter(3, "projects", "柱=消耗（万元），折线=ROI1（%）")
    ]
    if chart := build_project_chart(result):
        body.append(chart)
    return body


def _media_section(
    result: dict[str, Any], *, include_tables: bool
) -> list[dict[str, Any]]:
    """Chapter ④: the media chart plus its detail table."""
    body: list[dict[str, Any]] = [
        _chapter(4, "media", "柱=消耗（万元），折线=ROI1（%）")
    ]
    if chart := build_media_chart(result):
        body.append(chart)
    return body


def _core_value(core: dict[str, Any], key: str) -> Any:
    """Read a core metric, tolerating the payload's capitalised ROI fields.

    The report stores ``spend``/``cpa``/``roi_cum`` in lower case but its ROI
    columns as ``ROI1``/``ROI2``/…, so a plain ``core.get("roi1")`` misses.
    """
    if key in core:
        value = core.get(key)
        if value is not None:
            return value
    return core.get(key.upper())


def _metric_cell(
    core: dict[str, Any],
    previous: dict[str, Any],
    key: str,
    label: str,
    formatter: Any,
    *,
    focal: bool = False,
) -> dict[str, Any]:
    """One headline metric with its semantic delta colour."""
    current, prev = _core_value(core, key), _core_value(previous, key)
    delta = format_delta(current, prev)
    tone = delta_color(
        current, prev, higher_is_better=DELTA_HIGHER_IS_BETTER.get(key, True)
    )
    return _metric_column(
        formatter(current),
        label,
        delta,
        delta_tone=tone,
        focal=focal,
    )


def _detail_button(url: str) -> dict[str, Any]:
    """The single full-width button that opens the interactive HTML report."""
    return {
        "tag": "button",
        "text": {"tag": "plain_text", "content": "查看明细"},
        "type": "primary_filled",
        "width": "fill",
        "behaviors": [
            {
                "type": "open_url",
                "default_url": url,
                "pc_url": url,
                "ios_url": url,
                "android_url": url,
            }
        ],
    }


# Detail tables in inclusion order; Feishu renders at most five per card, so the
# tail is dropped when a payload carries every breakdown.
_TABLE_BUILDERS: tuple[tuple[str, Any], ...] = (
    ("platform", build_platform_table),
    ("daily", build_daily_table),
    ("project", build_project_table),
    ("media", build_media_table),
    ("media_projects", build_media_project_table),
    ("media_platforms", build_media_platform_table),
)
MAX_CARD_TABLES = 5
_TABLE_LEVELS = {
    "platform": 1,
    "daily": 2,
    "project": 3,
    "media": 4,
    "media_projects": 4,
    "media_platforms": 4,
}


def _tables_by_level(result: dict[str, Any]) -> dict[int, list[dict[str, Any]]]:
    """The card's detail tables, grouped by chapter and capped at five."""
    grouped: dict[int, list[dict[str, Any]]] = {}
    total = 0
    for key, build in _TABLE_BUILDERS:
        if total >= MAX_CARD_TABLES:
            break
        if table := build(result):
            grouped.setdefault(_TABLE_LEVELS[key], []).append(table)
            total += 1
    return grouped


def build_briefing_card(
    result: dict[str, Any],
    *,
    name: str,
    include_tables: bool = False,
    report_type: str = "daily",
    detail_url: str | None = None,
    html_url: str | None = None,
    chapter: str | None = None,
) -> dict[str, Any]:
    """Build the Card 2.0 payload for a generated briefing.

    The card carries the report's chapters itself — headline metrics, one
    dual-axis trend chart, the 主游戏 chart and the media chart — so reading it
    does not require opening Superset.  ``include_tables`` adds each chapter's
    detail table; the caller trims the payload to Feishu's 30 KB card limit with
    :func:`shrink_card` before sending.
    """
    severity = _severity(result)
    weekly = report_type == "weekly"
    tables = _tables_by_level(result) if include_tables else {}
    if chapter is not None:
        # One chapter per card: each message gets its own 30 KB budget, so the
        # tables keep more rows and every chart keeps its labels.
        body = _chapter_body(result, chapter, tables=tables, weekly=weekly)
        # The button rides on the last chapter only: the earlier messages stay
        # clean and 查看明细 opens the complete HTML report straight away.
        if chapter == _last_chapter(result, include_tables=include_tables):
            if target := (html_url or detail_url):
                body.append(_detail_button(target))
        return _assemble_card(
            result,
            body=body,
            name=name,
            report_type=report_type,
            severity=severity,
            chapter=chapter,
        )
    body = [
        *_core_section(
            result,
            background=_SEVERITY_BACKGROUND[severity],
            alert_color=_SEVERITY_ALERT_COLOR[severity],
            include_tables=False,
        ),
        *tables.get(1, []),
        *_trend_section(result, weekly=weekly, include_tables=False),
        *tables.get(2, []),
        *_project_section(result, include_tables=False),
        *tables.get(3, []),
        *_media_section(result, include_tables=False),
        *tables.get(4, []),
    ]
    if target := (html_url or detail_url):
        body.append(_detail_button(target))
    return _assemble_card(
        result,
        body=body,
        name=name,
        report_type=report_type,
        severity=severity,
    )


CHAPTER_KEYS = ("core", "trend", "projects", "media")


def _last_chapter(result: dict[str, Any], *, include_tables: bool) -> str:
    """The chapter the 查看明细 button rides on: the last one in the card."""
    for chapter in reversed(CHAPTER_KEYS):
        if chapter == "core" or _chapter_body(result, chapter, tables={}, weekly=False):
            return chapter
    return "core"


def _chapter_body(
    result: dict[str, Any],
    chapter: str,
    *,
    tables: dict[int, list[dict[str, Any]]],
    weekly: bool,
) -> list[dict[str, Any]]:
    """The body elements of a single chapter (its heading, chart and tables)."""
    if chapter == "core":
        return [
            *_core_section(
                result,
                background=_SEVERITY_BACKGROUND[_severity(result)],
                alert_color=_SEVERITY_ALERT_COLOR[_severity(result)],
                include_tables=False,
            ),
            *tables.get(1, []),
        ]
    if chapter == "trend":
        return [
            *_trend_section(result, weekly=weekly, include_tables=False),
            *tables.get(2, []),
        ]
    if chapter == "projects":
        return [
            *_project_section(result, include_tables=False),
            *tables.get(3, []),
        ]
    if chapter == "media":
        return [
            *_media_section(result, include_tables=False),
            *tables.get(4, []),
        ]
    raise ValueError(f"unknown chapter: {chapter}")


def _assemble_card(
    result: dict[str, Any],
    *,
    body: list[dict[str, Any]],
    name: str,
    report_type: str,
    severity: str,
    chapter: str | None = None,
) -> dict[str, Any]:
    """Wrap a body in the card envelope (header, config, summary)."""
    core = result.get("core") or {}
    weekly = report_type == "weekly"
    type_label = "周报" if weekly else "日报"
    return {
        "schema": "2.0",
        "config": {
            "update_multi": True,
            "width_mode": "fill",
            "summary": {
                "content": " · ".join(
                    part
                    for part in (
                        f"{type_label}简报 {_report_period(result)}",
                        chapter_heading(chapter, weekly) if chapter else "",
                        f"消耗 {format_amount(core.get('spend'))}"
                        if not chapter or chapter == "core"
                        else "",
                    )
                    if part
                )
            },
            "style": {
                "text_size": {
                    "title": {
                        "default": "heading-2",
                        "pc": "heading-2",
                        "mobile": "heading-3",
                    },
                    "body": {"default": "normal", "pc": "normal", "mobile": "normal"},
                    "caption": {
                        "default": "notation",
                        "pc": "notation",
                        "mobile": "notation",
                    },
                }
            },
        },
        "header": _card_header(
            result,
            name=name,
            report_type=report_type,
            severity=severity,
            chapter=chapter,
        ),
        "body": {
            "direction": "vertical",
            "padding": "12px 12px 20px 12px",
            "vertical_spacing": "12px",
            "elements": body,
        },
    }


def card_bytes(card: dict[str, Any]) -> int:
    """Serialized size of a card, which Feishu caps at 30 KB.

    Measured with the same serializer the message body uses: non-ASCII text is
    escaped to ``\\uXXXX`` there, and that escaped form is what Feishu counts.
    """
    return len(json.dumps(card).encode("utf-8"))


def _trend_buckets(spec: dict[str, Any]) -> int:
    """Number of x buckets in the dual-axis trend chart."""
    datasets = spec.get("data")
    if not isinstance(datasets, list):
        return 0
    for dataset in datasets:
        if dataset.get("id") == ROI_SERIES_ID:
            return len(dataset.get("values") or [])
    amounts = next(
        (ds.get("values") or [] for ds in datasets if ds.get("id") == "amount"), []
    )
    return len(amounts) // 2


def _shrink_table_rows(
    card: dict[str, Any], tables: list[dict[str, Any]], budget: int
) -> list[str]:
    """Trim rows from the biggest table until the card fits or rows run out."""
    notes: list[str] = []
    for limit in (5, 3, 1):
        while card_bytes(card) > budget:
            target = max(
                (t for t in tables if len(t["rows"]) > limit),
                key=lambda t: len(t["rows"]),
                default=None,
            )
            if target is None:
                break
            target["rows"] = target["rows"][: max(limit, len(target["rows"]) - 1)]
            note = f"子表格行数已裁剪到每表 {limit} 行"
            if note not in notes:
                notes.append(note)
        if card_bytes(card) <= budget:
            break
    return notes


def _drop_tables(
    card: dict[str, Any],
    elements: list[dict[str, Any] | None],
    tables: list[dict[str, Any]],
    budget: int,
) -> list[str]:
    """Drop whole tables, least critical first, while the card is too big."""
    notes: list[str] = []
    for table in reversed(tables):
        if card_bytes(card) <= budget:
            break
        elements[elements.index(table)] = None
        _rebuild(card, elements)
        note = "已省略子表格（超出飞书 30KB 卡片限制）"
        if note not in notes:
            notes.append(note)
    return notes


def _shrink_trend_points(
    card: dict[str, Any], elements: list[dict[str, Any] | None], budget: int
) -> list[str]:
    """Thin the trend chart bucket by bucket, keeping both series aligned."""
    notes: list[str] = []
    while card_bytes(card) > budget:
        target = next(
            (
                el
                for el in elements
                if el is not None
                and el.get("tag") == "chart"
                and _trend_buckets(el["chart_spec"]) > 6
            ),
            None,
        )
        if target is None:
            break
        keep = max(6, _trend_buckets(target["chart_spec"]) - 4)
        for dataset in target["chart_spec"]["data"]:
            values = dataset.get("values") or []
            # The amount dataset carries one 消耗 + one 流水 value per bucket.
            per_bucket = 2 if dataset.get("id") == "amount" else 1
            dataset["values"] = values[-keep * per_bucket :]
        note = "趋势图数据点已裁剪（超出飞书 30KB 卡片限制）"
        if note not in notes:
            notes.append(note)
    return notes


def _drop_auxiliary_charts(
    card: dict[str, Any], elements: list[dict[str, Any] | None], budget: int
) -> list[str]:
    """Last resort: drop the auxiliary charts, keeping the headline ones."""
    notes: list[str] = []
    for element_id in ("chart-media", "chart-project"):
        if card_bytes(card) <= budget:
            break
        for index, element in enumerate(elements):
            if element is not None and element.get("element_id") == element_id:
                elements[index] = None
                _rebuild(card, elements)
                note = "已省略部分图表（超出飞书 30KB 卡片限制）"
                if note not in notes:
                    notes.append(note)
                break
    return notes


def _rebuild(card: dict[str, Any], elements: list[dict[str, Any] | None]) -> None:
    card["body"]["elements"] = [el for el in elements if el is not None]


def shrink_card(
    card: dict[str, Any], *, budget: int = CARD_BYTE_BUDGET
) -> tuple[dict[str, Any], list[str]]:
    """Trim a card down to ``budget`` bytes, reporting what was dropped.

    Sub-tables shrink first (they are the optional detail), then the auxiliary
    charts, then the trend chart's bucket count: the chapters' headline numbers
    and main charts survive as long as possible.
    """
    import copy

    if card_bytes(card) <= budget:
        return card, []

    card = copy.deepcopy(card)
    elements: list[dict[str, Any] | None] = card["body"]["elements"]
    tables = [el for el in elements if el is not None and el.get("tag") == "table"]

    notes = _shrink_table_rows(card, tables, budget)
    notes += _drop_tables(card, elements, tables, budget)
    notes += _shrink_trend_points(card, elements, budget)
    notes += _drop_auxiliary_charts(card, elements, budget)
    _rebuild(card, elements)
    return card, notes


def build_text_card(
    *,
    name: str,
    description: str | None,
) -> dict[str, Any]:
    """Fallback card for notifications that carry no briefing payload."""
    body = html_to_markdown(description) or "（无内容）"
    return {
        "schema": "2.0",
        "config": {"update_multi": True, "width_mode": "default"},
        "header": {
            "title": {"tag": "plain_text", "content": name or "通知"},
            "template": "blue",
        },
        "body": {
            "direction": "vertical",
            "padding": "12px 12px 20px 12px",
            "vertical_spacing": "12px",
            "elements": [{"tag": "markdown", "content": body, "text_size": "body"}],
        },
    }


def build_briefing_text(result: dict[str, Any], *, name: str, url: str = "") -> str:
    """Plain-text rendering of a briefing, used when ``msg_type`` is ``text``."""
    from superset.project.briefing.summary import build_briefing_summary

    lines = [name, *build_briefing_summary(result)]
    if url:
        lines.extend(["", url])
    return "\n".join(lines)


# --------------------------------------------------------------------------- #
# Notification channel
# --------------------------------------------------------------------------- #


class FeishuNotification(BaseNotification):
    """Sends a Feishu (Lark) message to every configured target."""

    type = ReportRecipientType.FEISHU

    def __init__(
        self,
        recipient: Any,
        content: NotificationContent,
        max_tries: int = DEFAULT_MAX_TRIES,
    ) -> None:
        super().__init__(recipient, content)
        self._max_tries = max(1, int(max_tries))
        # Idempotency scope of *this* send: shared by every retry of the same
        # call (a timed-out request that actually succeeded is not delivered
        # twice), but distinct between separate pushes of the same briefing.
        self._send_scope = uuid.uuid4().hex[:8]
        # What had to be trimmed to fit Feishu's 30 KB card limit (surfaced by
        # the briefing push outcome so the reader knows what is missing).
        self.trim_notes: list[str] = []

    # -- recipient configuration ------------------------------------------
    def _config(self) -> dict[str, Any]:
        raw = self._recipient.recipient_config_json or "{}"
        try:
            config = json.loads(raw)
        except (TypeError, ValueError) as ex:
            raise NotificationParamException("飞书推送配置不是合法的 JSON") from ex
        if not isinstance(config, dict):
            raise NotificationParamException("飞书推送配置必须是 JSON 对象")
        return config

    def _targets(self) -> list[tuple[str, str]]:
        """Return the configured ``(receive_id_type, receive_id)`` pairs."""
        config = self._config()
        raw_targets = config.get("targets")
        if raw_targets is None and config.get("target"):
            # Standard recipient shape (``{"target": "oc_xxx"}``).
            raw_targets = [
                {
                    "receive_id_type": config.get("target_type")
                    or DEFAULT_RECEIVE_ID_TYPE,
                    "receive_id": config.get("target"),
                }
            ]
        if not isinstance(raw_targets, list) or not raw_targets:
            raise NotificationParamException("飞书推送未配置接收目标")

        targets: list[tuple[str, str]] = []
        for item in raw_targets:
            if not isinstance(item, dict):
                raise NotificationParamException("飞书推送目标格式不正确")
            target_type = str(
                item.get("receive_id_type")
                or item.get("type")
                or DEFAULT_RECEIVE_ID_TYPE
            ).strip()
            receive_id = str(item.get("receive_id") or item.get("id") or "").strip()
            if target_type not in RECEIVE_ID_TYPES:
                raise NotificationParamException(
                    f"飞书推送目标类型不支持：{target_type}"
                    f"（可选 {'/'.join(RECEIVE_ID_TYPES)}）"
                )
            if not receive_id:
                raise NotificationParamException("飞书推送目标不能为空")
            targets.append((target_type, receive_id))
        return targets

    def _include_tables(self) -> bool:
        """Whether the card should carry each chapter's detail tables."""
        return bool(self._config().get("include_tables"))

    def _msg_type(self) -> str:
        msg_type = str(self._config().get("msg_type") or DEFAULT_MESSAGE_TYPE)
        if msg_type not in MESSAGE_TYPES:
            raise NotificationParamException(
                f"飞书消息类型不支持：{msg_type}（可选 {'/'.join(MESSAGE_TYPES)}）"
            )
        return msg_type

    def _credentials(self) -> tuple[str, str, str, int]:
        config = current_app.config
        app_id = str(config.get("FEISHU_APP_ID") or "").strip()
        app_secret = str(config.get("FEISHU_APP_SECRET") or "").strip()
        if not app_id or not app_secret:
            raise NotificationParamException(
                "未配置飞书应用凭证（FEISHU_APP_ID / FEISHU_APP_SECRET），"
                "请在部署配置中设置后重启服务"
            )
        api_base = str(
            config.get("FEISHU_API_BASE") or "https://open.feishu.cn"
        ).rstrip("/")
        timeout = int(config.get("FEISHU_REQUEST_TIMEOUT") or 30)
        return app_id, app_secret, api_base, timeout

    # -- tenant access token ----------------------------------------------
    def _token(self, app_id: str, app_secret: str, api_base: str, timeout: int) -> str:
        return tenant_access_token(app_id, app_secret, api_base, timeout)

    def _invalidate_token(self, api_base: str, app_id: str) -> None:
        invalidate_tenant_token(api_base, app_id)

    # -- message content ---------------------------------------------------
    def _cards(self) -> list[dict[str, Any]]:
        """The card(s) for this notification: one per chapter when requested."""
        if not self._split_chapters():
            return [self._card()]
        result = self._content.briefing_result or {}
        report_type = str(result.get("report_type") or "")
        if report_type not in ("daily", "weekly"):
            report_type = (
                "weekly"
                if result.get("period_start")
                and result.get("period_start") != result.get("report_date")
                else "daily"
            )
        cards = []
        for chapter in CHAPTER_KEYS:
            built, notes = shrink_card(
                build_briefing_card(
                    result,
                    name=self._content.name,
                    include_tables=self._include_tables(),
                    report_type=report_type,
                    # The links ride on every chapter card's tail.
                    detail_url=self._content.briefing_detail_url,
                    html_url=self._content.briefing_html_url,
                    chapter=chapter,
                )
            )
            for note in notes:
                if note not in self.trim_notes:
                    self.trim_notes.append(note)
            cards.append(built)
        return cards

    def _split_chapters(self) -> bool:
        return bool(self._content.briefing_split_chapters) and bool(
            self._content.briefing_result
        )

    def _card(self) -> dict[str, Any]:
        result = self._content.briefing_result
        if isinstance(result, dict) and result:
            report_type = str(result.get("report_type") or "")
            if report_type not in ("daily", "weekly"):
                report_type = (
                    "weekly"
                    if result.get("period_start")
                    and result.get("period_start") != result.get("report_date")
                    else "daily"
                )
            card, notes = shrink_card(
                build_briefing_card(
                    result,
                    name=self._content.name,
                    include_tables=self._include_tables(),
                    report_type=report_type,
                    detail_url=self._content.briefing_detail_url,
                    html_url=self._content.briefing_html_url,
                )
            )
            self.trim_notes = notes
            for note in notes:
                logger.warning("Feishu briefing card trimmed: %s", note)
            return card
        return build_text_card(
            name=self._content.name,
            description=self._content.description or self._content.text,
        )

    def _content_json(self, msg_type: str) -> str | list[str]:
        if msg_type == "text":
            result = self._content.briefing_result
            if isinstance(result, dict) and result:
                text = build_briefing_text(
                    result, name=self._content.name, url=self._content.url or ""
                )
            else:
                text = "\n".join(
                    part
                    for part in (
                        self._content.name,
                        html_to_markdown(
                            self._content.description or self._content.text
                        ),
                        self._content.url or "",
                    )
                    if part
                )
            return json.dumps({"text": text})
        return [json.dumps(card) for card in self._cards()]

    def _content_items(self, msg_type: str) -> list[str]:
        """The message payloads to send: one per chapter when splitting."""
        content = self._content_json(msg_type)
        return content if isinstance(content, list) else [content]

    def _idempotency_key(
        self, target_type: str, receive_id: str, card_index: int = 0
    ) -> str:
        """Stable per-message key so a retry is not delivered twice.

        The key must differ per message: with one key for the whole send Feishu
        treats every chapter card as a duplicate of the first one and delivers
        only that one (max 50 chars).
        """
        raw = (
            f"{self._send_scope}|{self._content.name}|{target_type}:{receive_id}"
            f"|{card_index}"
        )
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:40]

    # -- sending -----------------------------------------------------------
    def _post_message(
        self,
        *,
        api_base: str,
        token: str,
        timeout: int,
        target_type: str,
        receive_id: str,
        msg_type: str,
        content: str,
        card_index: int = 0,
    ) -> dict[str, Any]:
        return feishu_request(
            "POST",
            f"{api_base}{MESSAGE_PATH}",
            params={"receive_id_type": target_type},
            json_body={
                "receive_id": receive_id,
                "msg_type": msg_type,
                "content": content,
                # Per-message key: sharing one across chapters makes Feishu drop
                # all but the first message as duplicates.
                "uuid": self._idempotency_key(target_type, receive_id, card_index),
            },
            headers={"Authorization": f"Bearer {token}"},
            timeout=timeout,
        )

    def _send_once(self) -> None:
        app_id, app_secret, api_base, timeout = self._credentials()
        targets = self._targets()
        msg_type = self._msg_type()
        contents = self._content_items(msg_type)
        token = self._token(app_id, app_secret, api_base, timeout)

        # Parameter/configuration problems are not worth retrying, transient
        # ones (429/5xx/network) are — keep them apart so ``send`` can decide.
        param_failures: list[str] = []
        transient_failures: list[str] = []
        for target_type, receive_id in targets:
            try:
                # Each chapter travels as its own message, so every card gets the
                # full 30 KB budget and the tables keep their rows.
                for index, content in enumerate(contents):
                    try:
                        payload = self._post_message(
                            api_base=api_base,
                            token=token,
                            timeout=timeout,
                            target_type=target_type,
                            receive_id=receive_id,
                            msg_type=msg_type,
                            content=content,
                            card_index=index,
                        )
                    except _TokenExpiredError:
                        # Token revoked/expired out of band: refresh once, retry.
                        self._invalidate_token(api_base, app_id)
                        token = self._token(app_id, app_secret, api_base, timeout)
                        payload = self._post_message(
                            api_base=api_base,
                            token=token,
                            timeout=timeout,
                            target_type=target_type,
                            receive_id=receive_id,
                            msg_type=msg_type,
                            content=content,
                            card_index=index,
                        )
                    message_id = (payload.get("data") or {}).get("message_id")
                    self._last_message_id = message_id
                    logger.info(
                        "Feishu message %s/%s sent (message_id=%s)",
                        index + 1,
                        len(contents),
                        message_id,
                    )
            except NotificationParamException as ex:
                param_failures.append(f"{target_type}:{receive_id} → {ex.message}")
            except NotificationUnprocessableException as ex:
                transient_failures.append(f"{target_type}:{receive_id} → {ex.message}")
            else:
                logger.info(
                    "Feishu notification sent to %s:%s (last message_id=%s)",
                    target_type,
                    receive_id,
                    getattr(self, "_last_message_id", None),
                )

        if param_failures:
            raise NotificationParamException(
                "飞书推送失败：" + "；".join(param_failures + transient_failures)
            )
        if transient_failures:
            raise NotificationUnprocessableException(
                "飞书推送失败：" + "；".join(transient_failures)
            )

    @backoff.on_exception(
        backoff.expo,
        NotificationUnprocessableException,
        factor=2,
        base=2,
        max_tries=DEFAULT_MAX_TRIES,
    )
    def _send_with_retries(self) -> None:
        self._send_once()

    @statsd_gauge("reports.feishu.send")
    def send(self) -> None:
        """Send the notification, retrying only for scheduled pushes."""
        if self._max_tries <= 1:
            self._send_once()
        else:
            self._send_with_retries()
