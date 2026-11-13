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
"""Standalone HTML export of a generated briefing.

The Feishu card is deliberately trimmed (five tables, capped rows, no page
chrome) and a card cannot carry a full report.  This module renders the same
report as one self-contained HTML page — every chapter, every table row, the
interactive charts — which the Feishu push uploads to the tenant's Drive and
imports as a Feishu document, so a card can offer a 「查看明细」 button that
opens the complete version.

The charts reuse the card's VChart specs and the tables reuse the card's column
definitions, so the document and the card can never disagree about the numbers
or the wording.
"""

from __future__ import annotations

import html
from datetime import datetime
from typing import Any, Callable

from superset.reports.notifications.feishu import (
    _chapter_labels,
    _core_value,
    build_daily_table,
    build_media_chart,
    build_media_platform_table,
    build_media_project_table,
    build_media_table,
    build_platform_table,
    build_project_chart,
    build_project_daily_table,
    build_project_table,
    build_trend_chart,
    delta_color,
    format_amount,
    format_count,
    format_delta,
    format_roi,
)
from superset.utils import json

# VChart renders the specs in a browser; the card's own build is used so the
# page and the card show the same picture.
VCHART_CDN = "https://cdn.jsdelivr.net/npm/@visactor/vchart@2.0.17/build/index.min.js"
MAX_HTML_TABLE_ROWS = 300

# The report page's palette, so the document reads like the briefing page.
TIER_CLASS = {
    "green": "tier-good",
    "orange": "tier-mid",
    "red": "tier-low",
    "neutral": "tier-unknown",
}

_STYLE = """
:root {
  color-scheme: light;
  --bg: #f2f4f8;
  --panel: #ffffff;
  --line: #e5e9f0;
  --line-soft: #eef1f6;
  --ink: #1b1f24;
  --ink-2: #4b5563;
  --ink-3: #8b95a5;
  --accent: #2e5bff;
  --accent-soft: #e9efff;
  --good: #178a5c;
  --good-soft: #e6f5ee;
  --warn: #c4700a;
  --warn-soft: #fdf3e5;
  --bad: #c93b31;
  --bad-soft: #fdecea;
  --radius: 16px;
  --shadow: 0 1px 2px rgba(17, 24, 39, .04), 0 10px 28px rgba(17, 24, 39, .05);
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 74px; }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 14px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC",
    "Microsoft YaHei", "Segoe UI", Roboto, sans-serif;
  -webkit-font-smoothing: antialiased;
}
a { color: var(--accent); }

/* ---- top bar (sticky chapter navigation + view controls) ---- */
.topbar {
  position: sticky; top: 0; z-index: 60;
  display: flex; align-items: center; gap: 18px;
  padding: 10px clamp(16px, 2.2vw, 36px);
  background: rgba(255, 255, 255, .88);
  -webkit-backdrop-filter: blur(10px); backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--line);
}
.brand {
  display: flex; align-items: center; gap: 9px; white-space: nowrap;
  font-size: 13.5px; font-weight: 700; letter-spacing: .2px;
}
.brand::before {
  content: ""; width: 18px; height: 18px; border-radius: 6px;
  background: linear-gradient(135deg, #2e5bff, #7aa2ff);
}
nav.chapters { display: flex; gap: 4px; overflow-x: auto; scrollbar-width: none; }
nav.chapters::-webkit-scrollbar { display: none; }
nav.chapters a {
  flex: 0 0 auto; padding: 6px 12px; border-radius: 999px;
  color: var(--ink-2); font-size: 13px; text-decoration: none;
  transition: background .15s, color .15s;
}
nav.chapters a:hover { background: var(--line-soft); color: var(--ink); }
nav.chapters a.active { background: var(--accent-soft); color: var(--accent); font-weight: 600; }
.topbar-actions { margin-left: auto; display: flex; gap: 8px; }
.ghost-btn {
  font: inherit; font-size: 12.5px; color: var(--ink-2); white-space: nowrap;
  background: transparent; border: 1px solid var(--line); border-radius: 999px;
  padding: 6px 13px; cursor: pointer; transition: background .15s, border-color .15s;
}
.ghost-btn:hover { background: #fff; border-color: #ccd5e3; color: var(--ink); }

/* ---- page shell: full width by default, optional centred view ---- */
.shell { width: 100%; margin: 0 auto; padding: 20px clamp(16px, 2.2vw, 36px) 48px; }
body.centred .shell { max-width: 1480px; }

/* ---- hero header ---- */
.hero {
  display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between;
  gap: 18px 28px; margin-bottom: 18px;
  padding: 22px clamp(18px, 1.8vw, 32px) 20px;
  background: var(--panel); border: 1px solid var(--line);
  border-left: 5px solid var(--accent); border-radius: var(--radius);
  box-shadow: var(--shadow);
}
.hero.critical { border-left-color: var(--bad); }
.hero.warning { border-left-color: var(--warn); }
.hero h1 {
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin: 0 0 8px;
  font-size: clamp(22px, 1.9vw, 28px); font-weight: 700; letter-spacing: -.015em;
}
.hero .meta {
  display: flex; flex-wrap: wrap; gap: 6px 18px; margin: 0;
  color: var(--ink-3); font-size: 12.5px;
}
.hero-facts { display: flex; flex-wrap: wrap; gap: 8px; }
.fact { padding: 5px 12px; border-radius: 999px; background: var(--line-soft); color: var(--ink-2); font-size: 12px; }
.badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; color: #fff; background: var(--accent); }
.badge.critical { background: var(--bad); }
.badge.warning { background: var(--warn); }
.badge.ok { background: var(--good); }

/* ---- chapter panels ---- */
.panel {
  margin-bottom: 18px; padding: 18px clamp(16px, 1.6vw, 28px) 22px;
  background: var(--panel); border: 1px solid var(--line);
  border-radius: var(--radius); box-shadow: var(--shadow); scroll-margin-top: 72px;
}
.panel-head {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 16px; margin-bottom: 16px; padding-bottom: 14px;
  border-bottom: 1px solid var(--line-soft);
}
.panel-head h2 {
  display: flex; align-items: center; gap: 10px; margin: 0;
  font-size: 17.5px; font-weight: 700; letter-spacing: -.01em;
}
.panel-head h2::before { content: ""; width: 4px; height: 18px; border-radius: 2px; background: var(--accent); }
.panel-head .caption { margin: 5px 0 0 14px; color: var(--ink-3); font-size: 12.5px; }

/* ---- headline metrics ---- */
.metrics {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 14px 18px; padding: 16px 18px;
  background: #f8fafd; border: 1px solid var(--line-soft); border-radius: 12px;
}
.metric { min-width: 0; padding-left: 14px; border-left: 1px solid var(--line-soft); }
.metric:first-child { padding-left: 0; border-left: 0; }
.metric .value {
  font-size: clamp(22px, 1.7vw, 27px); line-height: 1.2; font-weight: 700;
  font-variant-numeric: tabular-nums; letter-spacing: -.01em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.metric .label {
  display: flex; align-items: center; gap: 8px; margin-top: 6px;
  color: var(--ink-3); font-size: 12px; white-space: nowrap;
}
.metric .delta { padding: 1px 7px; border-radius: 999px; background: var(--line-soft); font-weight: 600; font-variant-numeric: tabular-nums; }
.metric .delta.up { color: var(--bad); background: var(--bad-soft); }
.metric .delta.down { color: var(--good); background: var(--good-soft); }
.metric .delta.muted { color: var(--ink-3); }

/* ---- alerts ---- */
.alerts {
  margin: 14px 0 0; padding: 11px 16px 11px 34px;
  background: var(--warn-soft); border-radius: 10px;
  color: #7a4b00; font-size: 13px; list-style: disc;
}
.alerts li { margin: 4px 0; }

/* ---- charts ---- */
.chart { width: 100%; height: clamp(340px, 42vh, 520px); min-height: 320px; }

/* ---- tables ---- */
.table-block { margin-top: 16px; }
.table-title {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 12px; margin: 0 2px 8px; color: var(--ink-2); font-size: 13px; font-weight: 600;
}
.table-count { color: var(--ink-3); font-size: 12px; font-weight: 400; }
.table-wrap {
  overflow: auto; max-height: 72vh;
  background: #fff; border: 1px solid var(--line-soft); border-radius: 12px;
}
table { border-collapse: separate; border-spacing: 0; width: 100%; min-width: max-content; font-size: 12.5px; }
th, td {
  padding: 7px 12px; border-bottom: 1px solid var(--line-soft);
  text-align: center; white-space: nowrap; font-variant-numeric: tabular-nums;
}
thead th { position: sticky; top: 0; z-index: 3; background: #f7f9fd; color: var(--ink-2); font-weight: 600; border-bottom: 1px solid var(--line); }
td.dim, th.dim { position: sticky; left: 0; z-index: 2; text-align: left; background: #fff; }
th.dim { z-index: 4; background: #f7f9fd; }
tbody tr:nth-child(even) td { background: #fbfcfe; }
tbody tr:nth-child(even) td.dim { background: #fbfcfe; }
tbody tr:hover td { background: #f1f5ff; }
tbody tr:hover td.dim { background: #f1f5ff; }
tbody tr:last-child td { border-bottom: 0; }
.tier { display: inline-block; padding: 1px 7px; border-radius: 999px; font-weight: 600; }
.tier-good { background: var(--good-soft); color: var(--good); }
.tier-mid { background: var(--warn-soft); color: var(--warn); }
.tier-low { background: var(--bad-soft); color: var(--bad); }
.tier-unknown { background: var(--line-soft); color: var(--ink-3); }

/* ---- collapsible detail tables ---- */
details.breakdown { margin-top: 16px; overflow: hidden; background: #fbfcfe; border: 1px solid var(--line-soft); border-radius: 12px; }
details.breakdown > summary {
  display: flex; align-items: center; gap: 8px; padding: 11px 16px;
  color: var(--ink-2); font-size: 13px; font-weight: 600;
  cursor: pointer; list-style: none;
}
details.breakdown > summary::-webkit-details-marker { display: none; }
details.breakdown > summary::before { content: "▸"; color: var(--ink-3); transition: transform .15s; }
details.breakdown[open] > summary::before { transform: rotate(90deg); }
details.breakdown[open] > summary { border-bottom: 1px solid var(--line-soft); }
details.breakdown > .body { padding: 0 16px 16px; }

.legend { margin-top: 12px; color: var(--ink-3); font-size: 12px; }
.legend .tier { margin-right: 8px; }
footer.page-foot { padding: 10px 0 24px; color: var(--ink-3); font-size: 12px; text-align: center; }

.to-top {
  position: fixed; right: clamp(16px, 2vw, 32px); bottom: 28px; z-index: 50;
  display: grid; place-items: center; width: 40px; height: 40px;
  background: #fff; border: 1px solid var(--line); border-radius: 50%;
  box-shadow: var(--shadow); color: var(--ink-2); font-size: 16px; text-decoration: none;
  opacity: 0; pointer-events: none; transition: opacity .2s, color .15s, border-color .15s;
}
.to-top.show { opacity: 1; pointer-events: auto; }
.to-top:hover { color: var(--accent); border-color: #ccd5e3; }

@media (max-width: 1180px) {
  .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1024px) {
  .brand { display: none; }
  .chart { height: 340px; }
}
@media (max-width: 720px) {
  .shell { padding: 14px 12px 40px; }
  .topbar { padding: 8px 12px; gap: 10px; }
  .topbar-actions .ghost-btn:first-child { display: none; }
  .hero { padding: 16px; }
  .hero h1 { font-size: 20px; }
  .panel { padding: 14px 12px 18px; border-radius: 12px; }
  .panel-head h2 { font-size: 16px; }
  .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .metric { padding-left: 0; border-left: 0; }
  .chart { height: 300px; }
  .table-wrap { max-height: none; }
}
@media print {
  body { background: #fff; }
  .topbar, .to-top { display: none; }
  .shell { padding: 0; }
  .hero, .panel { box-shadow: none; border: 1px solid #dcdfe5; break-inside: avoid; }
  .table-wrap { max-height: none; overflow: visible; }
  .chart { height: 360px; }
}
"""


def _escape(value: Any) -> str:
    return html.escape("" if value is None else str(value))


def _metric_html(label: str, value: str, delta: str, tone: str | None) -> str:
    classes = {"green": "down", "red": "up"}.get(tone or "", "muted")
    delta_html = (
        f'<span class="delta {classes}">{_escape(delta)}</span>' if delta else ""
    )
    return (
        '<div class="metric">'
        f'<div class="value">{_escape(value)}</div>'
        f'<div class="label">{_escape(label)} {delta_html}</div>'
        "</div>"
    )


def _headline_html(result: dict[str, Any]) -> str:
    core = result.get("core") or {}
    previous = result.get("core_previous") or {}
    metrics: list[tuple[str, str, Callable[[Any], str], bool]] = [
        ("消耗", "spend", format_amount, False),
        ("新增", "new_users", format_count, True),
        ("流水", "recharge", format_amount, True),
        ("ROI1", "roi1", format_roi, True),
        ("CPA", "cpa", format_amount, False),
    ]
    cells = []
    for label, key, formatter, higher_is_better in metrics:
        # The payload's ROI fields are capitalised (ROI1), hence the resolver.
        current, prev = _core_value(core, key), _core_value(previous, key)
        cells.append(
            _metric_html(
                label,
                formatter(current),
                format_delta(current, prev),
                delta_color(current, prev, higher_is_better=higher_is_better),
            )
        )
    return f'<div class="metrics">{"".join(cells)}</div>'


def _alerts_html(result: dict[str, Any]) -> str:
    alerts = [
        alert
        for alert in (result.get("alerts") or [])
        if isinstance(alert, dict) and alert.get("message")
    ]
    if not alerts:
        return ""
    items = "".join(f"<li>{_escape(alert.get('message'))}</li>" for alert in alerts)
    return f'<ul class="alerts">{items}</ul>'


RATE_COLUMNS = {"pr", "rr", "nr"}


DIMENSION_COLUMNS = {"project", "channel", "platform", "date", "label", "region"}


def _cell_html(cell: Any, column: str = "") -> str:
    """Render one table cell: ``options`` cells carry text + colour."""
    if isinstance(cell, list):
        parts = []
        for option in cell:
            if not isinstance(option, dict):
                parts.append(_escape(option))
                continue
            color = TIER_CLASS.get(str(option.get("color")), "tier-unknown")
            parts.append(
                f'<span class="tier {color}">{_escape(option.get("text"))}</span>'
            )
        return "".join(parts)
    if cell is None:
        return "—"
    if column in RATE_COLUMNS and isinstance(cell, (int, float)):
        # The table rows already carry these as percentages.
        return f"{cell:.1f}%"
    if isinstance(cell, float) and cell.is_integer():
        return str(int(cell))
    return _escape(cell)


def _breakdown_html(title: str, table: str) -> str:
    """A collapsible detail table, mirroring the report page's expansions."""
    if not table:
        return ""
    return (
        f'<details class="breakdown"><summary>{_escape(title)}</summary>'
        f'<div class="body">{table}</div></details>'
    )


def _legend_html() -> str:
    tiers = "".join(
        f'<span class="tier {TIER_CLASS[color]}">{_escape(tier)}</span>'
        for tier, color in (
            ("达标 ROI≥10%", "green"),
            ("中 5%~10%", "orange"),
            ("低 <5%", "red"),
        )
    )
    return f'<div class="legend">ROI1 / 累计ROI 颜色：{tiers}</div>'


def _table_html(table: dict[str, Any] | None, *, title: str = "") -> str:
    """Render one table as a scrollable block, optionally under a caption."""
    if not table:
        return ""
    rows = table.get("rows") or []
    if not rows:
        return ""

    def kind(column: dict[str, Any]) -> str:
        return "dim" if column["name"] in DIMENSION_COLUMNS else "num"

    head = "".join(
        f'<th class="{kind(column)}">{_escape(column.get("display_name"))}</th>'
        for column in table["columns"]
    )
    body = "".join(
        "<tr>"
        + "".join(
            f'<td class="{kind(column)}">'
            f"{_cell_html(row.get(column['name']), column['name'])}</td>"
            for column in table["columns"]
        )
        + "</tr>"
        for row in rows
    )
    caption = ""
    if title:
        count = f"{len(rows)} 行"
        caption = (
            '<div class="table-title">'
            f"<span>{_escape(title)}</span>"
            f'<span class="table-count">{count}</span>'
            "</div>"
        )
    # The wrapper scrolls both ways; the header and the dimension column stay
    # pinned, so even a 19-column table stays readable at full width.
    return (
        f'<div class="table-block">{caption}'
        '<div class="table-wrap"><table><thead><tr>'
        f"{head}</tr></thead><tbody>{body}</tbody></table></div></div>"
    )


def _previous_period(result: dict[str, Any]) -> str:
    """The report's comparison window (one day, or a weekly range)."""
    start, end = result.get("previous_period_start"), result.get("previous_period_end")
    if start and end:
        return str(start) if start == end else f"{start} ~ {end}"
    return str(result.get("previous_date") or "")


# Progressive enhancements of the exported page: full-width/centred view
# toggle, expand-all for the detail tables, chapter scroll-spy and back-to-top.
# The report is fully readable without it, so a failure here is cosmetic.
_PAGE_SCRIPT = """
<script>
(function () {
  var body = document.body;
  var widthBtn = document.getElementById("btn-width");
  function setWidth(mode) {
    var centred = mode === "centred";
    body.classList.toggle("centred", centred);
    if (widthBtn) { widthBtn.textContent = centred ? "全宽视图" : "居中视图"; }
    try { localStorage.setItem("briefing-width", centred ? "centred" : "full"); } catch (e) {}
  }
  var savedWidth = "full";
  try { savedWidth = localStorage.getItem("briefing-width") || "full"; } catch (e) {}
  setWidth(savedWidth);
  if (widthBtn) { widthBtn.addEventListener("click", function () { setWidth(body.classList.contains("centred") ? "full" : "centred"); }); }

  var detailBtn = document.getElementById("btn-details");
  var details = Array.prototype.slice.call(document.querySelectorAll("details.breakdown"));
  function allOpen() {
    return details.length > 0 && details.every(function (d) { return d.open; });
  }
  function refreshDetails() {
    if (!detailBtn) { return; }
    detailBtn.textContent = allOpen() ? "收起明细" : "展开明细";
  }
  if (detailBtn) {
    detailBtn.addEventListener("click", function () {
      var open = !allOpen();
      details.forEach(function (d) { d.open = open; });
      refreshDetails();
    });
  }
  details.forEach(function (d) { d.addEventListener("toggle", refreshDetails); });
  refreshDetails();

  var links = Array.prototype.slice.call(document.querySelectorAll("nav.chapters a"));
  var byId = {};
  links.forEach(function (a) { byId[(a.getAttribute("href") || "").slice(1)] = a; });
  function activate(id) {
    links.forEach(function (a) { a.classList.remove("active"); });
    if (byId[id]) { byId[id].classList.add("active"); }
  }
  var sections = Array.prototype.slice.call(document.querySelectorAll("section[id]"));
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { activate(entry.target.id); }
      });
    }, { rootMargin: "-38% 0px -55% 0px", threshold: 0 });
    sections.forEach(function (section) { io.observe(section); });
  }

  var toTop = document.querySelector(".to-top");
  function refreshToTop() {
    if (toTop) { toTop.classList.toggle("show", window.scrollY > 480); }
  }
  window.addEventListener("scroll", refreshToTop, { passive: true });
  refreshToTop();
})();
</script>
"""


def _chart_html(element_id: str, spec: dict[str, Any]) -> str:
    """A chart div plus the spec handed to VChart on load."""
    # Superset's json wrapper escapes non-ASCII, which stays valid for the
    # inline JSON.parse the page performs.
    blob = json.dumps(spec, separators=(",", ":"))
    # </script> cannot appear inside an inline script block.
    blob = blob.replace("</", "<\\/")
    return (
        f'<div class="chart" id="{element_id}"></div>'
        f"<script>window.__SPECS=window.__SPECS||[];"
        f'window.__SPECS.push(["{element_id}",{blob}]);</script>'
    )


def _page_generated(result: dict[str, Any]) -> str:
    """The push time in the reader's timezone, for the page header."""
    value = _generated(result)
    if not value:
        return ""
    try:
        stamp = datetime.fromisoformat(value)
    except ValueError:
        return value
    if stamp.tzinfo is None:
        return stamp.strftime("%Y-%m-%d %H:%M")
    import pytz  # noqa: PLC0415 - only the exported page needs a timezone

    local = stamp.astimezone(pytz.timezone("Asia/Shanghai"))
    return f"{local.strftime('%Y-%m-%d %H:%M')}（北京时间）"


def build_briefing_html(
    result: dict[str, Any],
    *,
    name: str,
    report_type: str = "daily",
) -> str:
    """Render the whole briefing as one self-contained, full-width HTML page.

    The page is laid out for a desktop screen first: the report fills the
    viewport (a top-bar button switches to a centred column and remembers the
    choice), chapters are panels with a sticky chapter navigation, and the wide
    detail tables scroll in place with their header and dimension column
    pinned.  Charts keep their VChart runtime, so they stay interactive.
    """
    weekly = report_type == "weekly"
    labels = _chapter_labels(weekly)
    severity = _severity(result)
    type_label = "周报" if weekly else "日报"
    title = f"{name}{type_label} · {_period(result, weekly)}"
    badge = {"critical": "严重", "warning": "预警", "ok": "正常"}[severity]

    charts: list[str] = []
    initialisers: list[str] = []
    for element_id, spec in _chart_specs(result, weekly=weekly):
        # The card's pixel height is tuned for the chat card; on the page the
        # CSS owns the container size and VChart fills it (``autoFit``).
        page_spec = dict(spec)
        page_spec.pop("height", None)
        charts.append(_chart_html(element_id, page_spec))
        initialisers.append(element_id)

    def chart(index: int) -> str:
        return charts[index] if len(charts) > index else ""

    tables = [
        build_platform_table,
        build_daily_table,
        build_project_table,
        build_media_table,
    ]
    # Every breakdown the payload carries, with all rows (the page is not bound
    # by the card's 30 KB / five-table limits).
    extra = [
        builder
        for builder in (build_media_project_table, build_media_platform_table)
        if builder(result)
    ]
    breakdown_tables = "".join(
        _breakdown_html(
            f"展开：{title}",
            _table_html(builder(result, limit=MAX_HTML_TABLE_ROWS)),
        )
        for title, builder in zip(
            ("媒体 × 主游戏", "媒体 × 客户端"), extra, strict=False
        )
    )
    project_daily = _table_html(
        build_project_daily_table(result, limit=MAX_HTML_TABLE_ROWS)
    )
    trend_grain = "分周" if weekly else "分天"

    def panel(index: int, key: str, caption: str, body: str) -> str:
        return (
            f'<section id="{key}" class="panel">'
            '<div class="panel-head"><div>'
            f"<h2>{index}. {_escape(labels[key])}</h2>"
            f'<p class="caption">{_escape(caption)}</p>'
            "</div></div>"
            f"{body}"
            "</section>"
        )

    sections = [
        panel(
            1,
            "core",
            "核心经营指标、预警提示与平台拆分",
            f"{_headline_html(result)}{_alerts_html(result)}"
            f"{_table_html(tables[0](result, limit=MAX_HTML_TABLE_ROWS), title='平台拆分')}",
        ),
        panel(
            2,
            "trend",
            "柱=消耗/流水（万元），折线=ROI1（%）；悬停图表可查看具体数值",
            f"{chart(0)}"
            f"{_table_html(tables[1](result, limit=MAX_HTML_TABLE_ROWS), title=f'{trend_grain}明细')}",
        ),
        panel(
            3,
            "projects",
            "柱=消耗（万元，颜色=ROI 质量），折线=ROI1（%）；展开可查看主游戏 × 渠道 × 日期",
            f"{chart(1)}"
            f"{_table_html(tables[2](result, limit=MAX_HTML_TABLE_ROWS), title='主游戏 × 渠道')}"
            f"{_legend_html()}"
            f"{_breakdown_html('展开：主游戏 × 渠道 × 日期', project_daily)}",
        ),
        panel(
            4,
            "media",
            "柱=消耗（万元，颜色=ROI 质量），折线=ROI1（%）；展开可查看媒体 × 主游戏与客户端",
            f"{chart(2)}"
            f"{_table_html(tables[3](result, limit=MAX_HTML_TABLE_ROWS), title='媒体明细')}"
            f"{breakdown_tables}",
        ),
    ]

    table_count = sum(section.count("<table>") for section in sections)
    facts = [
        f"{len(sections)} 个章节",
        f"{table_count} 张明细表",
        f"{len(charts)} 张交互图",
    ]
    meta = " · ".join(
        part
        for part in (
            f"生成时间：{_page_generated(result)}" if _page_generated(result) else "",
            f"数据周期：{_period(result, weekly)}",
            (
                f"对比周期：{_previous_period(result)}"
                if _previous_period(result)
                else ""
            ),
        )
        if part
    )

    render = ""
    if initialisers:
        render = f"""
<script>
window.addEventListener('load', function () {{
  var Cls = window.VChart && (window.VChart.VChart || window.VChart);
  if (!Cls) {{ return; }}
  (window.__SPECS || []).forEach(function (entry) {{
    try {{
      new Cls(entry[1], {{ dom: entry[0], autoFit: true, animation: false }})
        .renderSync();
    }} catch (err) {{
      console.error('chart failed', entry[0], err);
    }}
  }});
}});
</script>
<script src="{VCHART_CDN}"></script>"""

    nav_links = "".join(
        '<a href="#{key}"{cls}>{label}</a>'.format(
            key=key,
            cls=' class="active"' if index == 0 else "",
            label=_escape(labels[key]),
        )
        for index, key in enumerate(("core", "trend", "projects", "media"))
    )
    facts_html = "".join(
        '<span class="fact">{fact}</span>'.format(fact=_escape(fact)) for fact in facts
    )
    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_escape(title)}</title>
<style>{_STYLE}</style>
</head>
<body id="top">
<header class="topbar">
<span class="brand">Superset 简报</span>
<nav class="chapters" aria-label="章节导航">{nav_links}</nav>
<div class="topbar-actions">
<button class="ghost-btn" id="btn-width" type="button">居中视图</button>
<button class="ghost-btn" id="btn-details" type="button">展开明细</button>
</div>
</header>
<main class="shell">
<header class="hero {severity}">
<div class="hero-main">
<h1>{_escape(title)}<span class="badge {severity}">{badge}</span></h1>
<p class="meta">{_escape(meta)}</p>
</div>
<div class="hero-facts">{facts_html}</div>
</header>
{"".join(sections)}
<footer class="page-foot">由 Superset 简报推送生成 · 图表为交互式，可悬停查看数值 · 右上角可切换全宽/居中视图</footer>
</main>
<a class="to-top" href="#top" aria-label="返回顶部">↑</a>
{render}
{_PAGE_SCRIPT}
</body>
</html>
"""


def build_briefing_doc_title(
    result: dict[str, Any],
    *,
    name: str,
    report_type: str = "weekly",
) -> str:
    """Title of the exported interactive HTML report (also its Drive name).

    The weekly push uploads :func:`build_briefing_html` unchanged, so the file
    name is the only report heading the export controls: ``{name}周报 · {period}``,
    truncated by the uploader.  Daily exports reuse it too.
    """
    weekly = report_type == "weekly"
    suffix = "周报" if weekly else "日报"
    return f"{name}{suffix} · {_period(result, weekly)}"


def _severity(result: dict[str, Any]) -> str:
    from superset.reports.notifications.feishu import _severity as severity

    return severity(result)


def _period(result: dict[str, Any], weekly: bool) -> str:
    from superset.reports.notifications.feishu import _report_period

    return _report_period(result)


def _generated(result: dict[str, Any]) -> str:
    value = result.get("generated_at") or result.get("finished_at")
    return "" if value is None else str(value)


def _chart_specs(
    result: dict[str, Any], *, weekly: bool
) -> list[tuple[str, dict[str, Any]]]:
    """The card's chart specs, in chapter order."""
    specs: list[tuple[str, dict[str, Any]]] = []
    for element_id, builder, kwargs in (
        ("chart-trend", build_trend_chart, {"weekly": weekly}),
        ("chart-project", build_project_chart, {}),
        ("chart-media", build_media_chart, {}),
    ):
        chart = builder(result, **kwargs)
        if chart:
            specs.append((element_id, chart["chart_spec"]))
    return specs


__all__ = [
    "MAX_HTML_TABLE_ROWS",
    "build_briefing_doc_title",
    "build_briefing_html",
]
