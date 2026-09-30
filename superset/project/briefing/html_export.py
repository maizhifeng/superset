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
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { overflow-x: hidden; max-width: 100%; }
body {
  margin: 0; padding: 24px;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei",
    "Segoe UI", Roboto, sans-serif;
  color: #1f2329; background: #f5f6f7; line-height: 1.5;
}
.wrap { max-width: 1080px; margin: 0 auto; overflow-x: hidden; }
header.page {
  background: #fff; border-radius: 12px; padding: 20px 24px;
  border-left: 4px solid #3370ff; margin-bottom: 16px;
}
header.page.critical { border-left-color: #d83931; }
header.page.warning { border-left-color: #de7802; }
header.page h1 { margin: 0 0 4px; font-size: 22px; }
header.page .meta { color: #646a73; font-size: 13px; }
.badge {
  display: inline-block; margin-left: 8px; padding: 1px 8px; border-radius: 10px;
  font-size: 12px; color: #fff; background: #3370ff; vertical-align: middle;
}
.badge.critical { background: #d83931; }
.badge.warning { background: #de7802; }
section {
  background: #fff; border-radius: 12px; padding: 18px 24px; margin-bottom: 16px;
  max-width: 100%; overflow: hidden;
}
section > h2 { margin: 0 0 4px; font-size: 16px; }
section > .caption { color: #8f959e; font-size: 12px; margin-bottom: 12px; }
.metrics {
  display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 16px;
}
@media (max-width: 720px) {
  .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
.metric { min-width: 0; }
.metric .value {
  /* One size and weight for every metric, digits aligned across columns. */
  font-size: 20px; line-height: 1.3; font-weight: 600;
  font-variant-numeric: tabular-nums; white-space: nowrap;
  overflow: hidden; text-overflow: ellipsis;
}
.metric .label {
  color: #8f959e; font-size: 12px; line-height: 1.4;
  font-variant-numeric: tabular-nums; white-space: nowrap;
}
.metric .delta.up { color: #d83931; }
.metric .delta.down { color: #2ea121; }
.metric .delta.muted { color: #8f959e; }
.alerts { margin: 12px 0 0; padding: 0; list-style: none; font-size: 13px; }
.alerts li { margin: 4px 0; }
.chart { width: 100%; height: 320px; }
.table-wrap { max-width: 100%; overflow-x: auto; margin-top: 8px; }
table { border-collapse: separate; border-spacing: 0; width: 100%; font-size: 12px; }
th, td {
  border-bottom: 1px solid #eef0f3; padding: 6px 10px; text-align: center;
  white-space: nowrap;
}
th {
  background: #f7f8fa; color: #646a73; font-weight: 600;
  text-align: center; position: sticky; top: 0; z-index: 1;
}
td.dim, th.dim {
  text-align: left; position: sticky; left: 0; background: #fff; z-index: 2;
}
th.dim { background: #f7f8fa; z-index: 3; }
tr:hover td { background: #f7f8fa; }
tr:hover td.dim { background: #f7f8fa; }
.tier { display: inline-block; padding: 0 6px; border-radius: 4px; }
.tier-good { background: #e8f5ec; color: #2ea121; }
.tier-mid { background: #fdf3e0; color: #de7802; }
.tier-low { background: #fdeceb; color: #d83931; }
.tier-unknown { background: #f2f3f5; color: #8f959e; }
footer { color: #8f959e; font-size: 12px; text-align: center; padding: 8px 0 24px; }
nav.chapters {
  position: sticky; top: 0; z-index: 2; background: #fff; border-radius: 12px;
  padding: 10px 24px; margin-bottom: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.06);
  display: flex; gap: 16px; font-size: 13px;
}
nav.chapters a { color: #3370ff; text-decoration: none; }
nav.chapters a:hover { text-decoration: underline; }
details.breakdown { margin-top: 12px; border: 1px solid #eef0f3; border-radius: 8px; }
details.breakdown > summary {
  cursor: pointer; padding: 8px 12px; font-size: 13px; color: #1f2329;
  font-weight: 600; background: #f7f8fa; border-radius: 8px;
}
details.breakdown[open] > summary {
  border-bottom: 1px solid #eef0f3; border-radius: 8px 8px 0 0;
}
details.breakdown > .body { padding: 4px 12px 12px; }
.legend { font-size: 12px; color: #646a73; margin-top: 8px; }
.legend .tier { margin-right: 8px; }
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


def _table_html(table: dict[str, Any] | None) -> str:
    if not table:
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
        for row in table["rows"]
    )
    # The wrapper scrolls horizontally; the dimension column stays pinned, so a
    # wide (19-column) table never overflows the page.
    return (
        '<div class="table-wrap"><table><thead><tr>'
        f"{head}</tr></thead><tbody>{body}</tbody></table></div>"
    )


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


def build_briefing_html(
    result: dict[str, Any],
    *,
    name: str,
    report_type: str = "daily",
) -> str:
    """Render the whole briefing as one self-contained HTML page."""
    weekly = report_type == "weekly"
    labels = _chapter_labels(weekly)
    severity = _severity(result)
    title = f"{name}简报 · {_period(result, weekly)}"
    badge = {"critical": "严重", "warning": "预警", "ok": "正常"}[severity]

    charts: list[str] = []
    initialisers: list[str] = []
    for element_id, spec in _chart_specs(result, weekly=weekly):
        charts.append(_chart_html(element_id, spec))
        initialisers.append(element_id)

    tables = [
        build_platform_table,
        build_daily_table,
        build_project_table,
        build_media_table,
    ]
    # Every breakdown the payload carries, with all rows (the document is not
    # bound by the card's 30 KB / five-table limits).
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
    sections = []
    # ① core
    sections.append(
        '<section id="core">'
        f"<h2>1. {_escape(labels['core'])}</h2>"
        f"{_headline_html(result)}{_alerts_html(result)}"
        f"{_table_html(tables[0](result, limit=MAX_HTML_TABLE_ROWS))}"
        "</section>"
    )
    project_daily = _table_html(
        build_project_daily_table(result, limit=MAX_HTML_TABLE_ROWS)
    )
    # ② trend
    sections.append(
        '<section id="trend">'
        f"<h2>2. {_escape(labels['trend'])}</h2>"
        '<div class="caption">柱=消耗/流水（万元），折线=ROI1（%）</div>'
        f"{charts[0] if charts else ''}"
        f"{_table_html(tables[1](result, limit=MAX_HTML_TABLE_ROWS))}"
        "</section>"
    )
    # ③ projects
    sections.append(
        '<section id="projects">'
        f"<h2>3. {_escape(labels['projects'])}</h2>"
        '<div class="caption">柱=消耗（万元，颜色=ROI 质量），折线=ROI1（%）</div>'
        f"{charts[1] if len(charts) > 1 else ''}"
        f"{_table_html(tables[2](result, limit=MAX_HTML_TABLE_ROWS))}"
        f"{_legend_html()}"
        # 主游戏 × 渠道 × 日期 — the chapter's daily expansion, collapsed.
        f"{_breakdown_html('展开：主游戏 × 渠道 × 日期', project_daily)}"
        "</section>"
    )
    # ④ media
    sections.append(
        '<section id="media">'
        f"<h2>4. {_escape(labels['media'])}</h2>"
        '<div class="caption">柱=消耗（万元，颜色=ROI 质量），折线=ROI1（%）</div>'
        f"{charts[2] if len(charts) > 2 else ''}"
        f"{_table_html(tables[3](result, limit=MAX_HTML_TABLE_ROWS))}"
        # 媒体 × 主游戏 / 媒体 × 客户端, collapsed like the page's drill-downs.
        f"{breakdown_tables}"
        "</section>"
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
      new Cls(entry[1], {{ dom: entry[0], renderCanvas: false, animation: false }})
        .renderSync();
    }} catch (err) {{
      console.error('chart failed', entry[0], err);
    }}
  }});
}});
</script>
<script src="{VCHART_CDN}"></script>"""

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{_escape(title)}</title>
<style>{_STYLE}</style>
</head>
<body>
<div class="wrap">
<nav class="chapters">
<a href="#core">① 核心指标</a>
<a href="#trend">② 分天对比</a>
<a href="#projects">③ 主游戏</a>
<a href="#media">④ 媒体</a>
</nav>
<header class="page {severity}">
<h1>{_escape(title)}<span class="badge {severity}">{badge}</span></h1>
<div class="meta">生成时间：{_escape(_generated(result))} ·
数据周期：{_escape(_period(result, weekly))}</div>
</header>
{"".join(sections)}
<footer>由 Superset 简报推送生成 · 图表为交互式，可悬停查看数值</footer>
</div>
{render}
</body>
</html>
"""


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


__all__ = ["MAX_HTML_TABLE_ROWS", "build_briefing_html"]
