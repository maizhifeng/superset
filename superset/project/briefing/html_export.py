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
    _as_float,
    _chapter_labels,
    _core_value,
    _roi_thresholds,
    build_daily_table,
    build_media_chart,
    build_media_platform_table,
    build_media_project_table,
    build_media_table,
    build_platform_table,
    build_project_chart,
    build_project_daily_table,
    build_project_region_table,
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

/* ---- page shell: the report always fills the viewport ---- */
.shell { width: 100%; margin: 0 auto; padding: 20px clamp(16px, 2.2vw, 36px) 48px; }

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
  display: grid; grid-template-columns: repeat(8, minmax(0, 1fr));
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

/* ---- fold card: a surface whose detail hangs from a bottom strip ---- */
.fold-card { overflow: hidden; background: #fff; border: 1px solid var(--line-soft); border-radius: 12px; }
.fold-card .metrics { border: 0; border-radius: 0; }
.fold-card .chart-body { padding: 14px 16px 0; }
details.fold-more { border-top: 1px solid var(--line-soft); }
details.fold-more > summary.fold-strip {
  display: flex; align-items: center; justify-content: center; gap: 7px;
  padding: 9px 16px; background: #f3f6fc; color: var(--ink-2);
  font-size: 13px; font-weight: 600; cursor: pointer; list-style: none;
  transition: background-color .15s, color .15s;
}
details.fold-more > summary.fold-strip::-webkit-details-marker { display: none; }
details.fold-more > summary.fold-strip::marker { content: ""; }
details.fold-more > summary.fold-strip:hover { background: var(--accent-soft); }
details.fold-more[open] > summary.fold-strip { background: var(--accent-soft); color: var(--accent); }
.fold-icon { font-size: 12px; }
details.fold-more > summary.fold-strip .chev::before { content: "▾"; }
details.fold-more[open] > summary.fold-strip .chev::before { content: "▴"; }
.fold-body { padding: 10px 16px 16px; }
.fold-body .table-block { margin-top: 0; }

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
tr.table-group-sep td {
  height: 8px; padding: 0; background: var(--line);
  border-top: 1px solid var(--line); border-bottom: 1px solid var(--line);
}
.tier { display: inline-block; padding: 1px 7px; border-radius: 999px; font-weight: 600; }
.tier-good { background: var(--good-soft); color: var(--good); }
.tier-mid { background: var(--warn-soft); color: var(--warn); }
.tier-low { background: var(--bad-soft); color: var(--bad); }
.tier-unknown { background: var(--line-soft); color: var(--ink-3); }

/* ---- fluctuation block (关键指标波动) ---- */
.delta-good { color: var(--good); font-weight: 600; }
.delta-bad { color: var(--bad); font-weight: 600; }
.delta-flat { color: var(--ink-3); }

/* Each metric is its own collapsible row, exactly like the report page. */
.fluct-panel {
  margin-top: 16px; overflow: hidden; background: #fff;
  border: 1px solid var(--line-soft); border-radius: 12px;
}
.fluct-head { padding: 12px 16px 10px; border-bottom: 1px solid var(--line-soft); }
.fluct-head h3 { margin: 0; font-size: 14px; font-weight: 700; letter-spacing: -.01em; }
.fluct-head .caption { margin: 4px 0 0; color: var(--ink-3); font-size: 12.5px; }
details.fluct-item { border-bottom: 1px solid var(--line-soft); }
details.fluct-item:last-child { border-bottom: 0; }
.fluct-row {
  display: grid;
  /* Fixed tracks keep 对比期 / 本期 / 环比 / 主因 aligned across rows; the
     pair is one nested grid so its arrow sits between the two numbers. */
  grid-template-columns:
    minmax(96px, 1.1fr) minmax(0, 2.2fr) minmax(0, .8fr)
    minmax(0, 1.8fr) 24px;
  align-items: center; gap: 10px;
  padding: 10px 16px; font-size: 12.5px;
}
details.fluct-item > summary.fluct-row {
  cursor: pointer; list-style: none; transition: background-color .15s;
}
details.fluct-item > summary.fluct-row::-webkit-details-marker { display: none; }
details.fluct-item > summary.fluct-row::marker { content: ""; }
details.fluct-item > summary.fluct-row:hover { background: #f8fafd; }
details.fluct-item[open] > summary.fluct-row { background: #f8fafd; }
.fluct-row .metric { font-weight: 600; }
.fluct-row .values {
  display: grid; grid-template-columns: minmax(0, 1fr) 16px minmax(0, 1fr);
  align-items: baseline; gap: 8px; font-variant-numeric: tabular-nums;
}
.fluct-row .prev {
  color: var(--ink-3); text-align: right; white-space: nowrap;
}
.fluct-row .arrow { color: var(--ink-3); text-align: center; }
.fluct-row .cur { font-weight: 600; white-space: nowrap; }

/* ---- fluctuation severity (异常 / 关注 / 正常 / 历史不足) ---- */
.fluct-sev {
  display: inline-block; margin-right: 6px; padding: 0 5px;
  border: 1px solid; border-radius: 4px;
  font-size: 11px; font-weight: 600; line-height: 1.5;
}
.fluct-sev.abnormal { color: var(--bad); border-color: var(--bad); background: var(--bad-soft); }
.fluct-sev.watch { color: var(--warn); border-color: var(--warn); background: var(--warn-soft); }
.fluct-sev.normal { color: var(--good); border-color: var(--good); background: var(--good-soft); }
.fluct-sev.insufficient, .fluct-sev.new { color: var(--ink-3); border-color: var(--line); background: var(--line-soft); }
.fluct-sev.event { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
.fluct-row .primary {
  color: var(--ink-3); overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap;
}
.fluct-row .chev { justify-self: end; color: var(--ink-3); transition: transform .15s; }
.fluct-row .chev::before { content: "▸"; }
details.fluct-item[open] > summary.fluct-row .chev { transform: rotate(90deg); }
.fluct-body { padding: 2px 16px 14px; }
.fluct-dims { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px 22px; }
.fluct-dim-label { margin-bottom: 4px; color: var(--ink-3); font-size: 12px; }
.fluct-factor {
  display: flex; align-items: baseline; gap: 8px;
  padding: 2px 0; font-size: 12.5px;
}
.fluct-dot {
  width: 6px; height: 6px; border-radius: 50%;
  display: inline-block; flex: none; align-self: center;
}
.fluct-dot.abnormal { background: var(--bad); }
.fluct-dot.watch { background: var(--warn); }
.fluct-dot.normal { background: var(--good); }
.fluct-dot.insufficient, .fluct-dot.new { background: var(--ink-3); }
.fluct-dot.event { background: var(--accent); }
.fluct-factor .rank {
  flex: none; padding: 0 6px; border-radius: 4px;
  background: var(--accent-soft); color: var(--accent);
  font-size: 11px; font-weight: 600;
}
.fluct-factor .name {
  flex: 1; min-width: 0; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.fluct-factor .contrib { flex: none; font-variant-numeric: tabular-nums; }

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
.table-note { margin: -2px 2px 8px; color: var(--ink-3); font-size: 12px; }

/* ---- media quality chips (最佳 / 需关注) ---- */
.quality-chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.quality-chip {
  padding: 4px 10px; border-radius: 999px; font-size: 12.5px;
  font-weight: 600; border: 1px solid transparent;
}
.quality-chip.good { color: var(--good); background: var(--good-soft); border-color: #cbe9da; }
.quality-chip.warn { color: var(--warn); background: var(--warn-soft); border-color: #f3ddbd; }
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

@media (max-width: 1199px) {
  .metrics { grid-template-columns: repeat(4, minmax(0, 1fr)); }
}
@media (max-width: 899px) {
  .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 1024px) {
  .brand { display: none; }
  .chart { height: 340px; }
}
@media (max-width: 900px) {
  .fluct-dims { grid-template-columns: 1fr; gap: 10px; }
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
    """The seven headline figures, in the report page's order and wording.

    ``None`` as the last tuple item means the delta is neutral (grey): 消耗 is
    neither good nor bad when it moves, exactly as the page renders it.
    """
    core = result.get("core") or {}
    previous = result.get("core_previous") or {}
    metrics: list[tuple[str, str, Callable[[Any], str], bool | None]] = [
        ("返点后消耗", "spend", format_amount, None),
        ("充值流水", "recharge", format_amount, True),
        ("新增进入", "new_users", format_count, True),
        ("自然新增%", "natural_rate", format_roi, True),
        ("CPA", "cpa", format_amount, False),
        ("广告ROI", "ad_roi", format_roi, True),
        ("ROI1", "roi1", format_roi, True),
        ("LTV1", "ltv1", format_amount, True),
    ]
    cells = []
    for label, key, formatter, higher_is_better in metrics:
        # The payload's ROI fields are capitalised (ROI1), hence the resolver.
        current, prev = _core_value(core, key), _core_value(previous, key)
        tone = (
            None
            if higher_is_better is None
            else delta_color(current, prev, higher_is_better=higher_is_better)
        )
        cells.append(
            _metric_html(
                label,
                formatter(current),
                format_delta(current, prev),
                tone,
            )
        )
    return f'<div class="metrics">{"".join(cells)}</div>'


def _core_card_html(result: dict[str, Any]) -> str:
    """核心指标速览 as one card, with 平台拆分 embedded under the band.

    Mirrors the report page: the platform split is a disclosure welded to the
    bottom edge of the KPI surface (a 分业务板块 strip), not a separate table
    block below the chapter.  Without platform rows the card is just the band.
    """
    metrics = _headline_html(result)
    table = _table_html(
        build_platform_table(result, limit=MAX_HTML_TABLE_ROWS, raw_money=True)
    )
    if not table:
        return f'<div class="fold-card">{metrics}</div>'
    return (
        '<div class="fold-card">'
        f"{metrics}"
        '<details class="fold-more">'
        '<summary class="fold-strip">'
        '<span class="fold-icon" aria-hidden="true">▦</span>分业务板块'
        '<span class="chev" aria-hidden="true"></span>'
        "</summary>"
        f'<div class="fold-body">{table}</div>'
        "</details></div>"
    )


def _chart_card_html(chart_html: str, table_html: str, *, strip_label: str) -> str:
    """A chart surface whose detail table hangs from a bottom strip.

    Mirrors §2 on the report page: the chart is the card, and the 分天/分周
    detail is a 分天明细/分周明细 disclosure welded to its bottom edge instead
    of a table always sitting open below it.
    """
    if not chart_html:
        return table_html
    if not table_html:
        return chart_html
    return (
        '<div class="fold-card">'
        f'<div class="chart-body">{chart_html}</div>'
        '<details class="fold-more">'
        '<summary class="fold-strip">'
        f'<span class="fold-icon" aria-hidden="true">▦</span>{_escape(strip_label)}'
        '<span class="chev" aria-hidden="true"></span>'
        "</summary>"
        f'<div class="fold-body">{table_html}</div>'
        "</details></div>"
    )


def _core_caption(result: dict[str, Any], weekly: bool) -> str:
    """§1's caption carries the reported/compared windows, as on the page."""
    start = result.get("period_start") or result.get("report_date") or ""
    end = result.get("period_end") or result.get("report_date") or ""
    previous_start = result.get("previous_period_start") or result.get("previous_date")
    previous_end = result.get("previous_period_end") or result.get("previous_date")
    period = (
        f"{start} ~ {end}"
        if start and end and start != end
        else str(result.get("report_date") or start)
    )
    previous = (
        f"{previous_start} ~ {previous_end}"
        if previous_start and previous_end and previous_start != previous_end
        else str(previous_start or "")
    )
    label = "报告周期" if weekly else "简报日期"
    parts = [f"{label}：{period}"]
    if previous:
        parts.append(f"对比周期：{previous}")
    return " ｜ ".join(parts)


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


# 波动指标 in the metric's own unit: ROI1 / 自然新增% are ratios, everything
# else is an amount or a count (the report page formats them the same way).
RATE_METRIC_KEYS = {"roi1", "natural_rate"}
# Metrics whose growth is not an improvement, so the delta is not coloured up.
FLUCTUATION_TONE = {"spend": "neutral", "cpa": "lower"}


def _fluctuation_value(metric_key: str, value: Any) -> str:
    """A 波动 metric value in its own unit (percent for ratios)."""
    number = _as_float(value)
    if number is None:
        return "—"
    if metric_key in RATE_METRIC_KEYS:
        return f"{number * 100:.1f}%"
    return format_amount(number)


def _fluctuation_contribution(metric_key: str, value: Any) -> str:
    """A factor's signed contribution in the metric's own unit."""
    number = _as_float(value)
    if number is None:
        return "—"
    sign = "+" if number > 0 else "−" if number < 0 else ""
    if metric_key in RATE_METRIC_KEYS:
        return f"{sign}{abs(number) * 100:.2f}%"
    # The report page's number formatter drops a trailing ``.0``; match it so a
    # whole-yuan contribution reads "3,863,322" rather than "3,863,322.0".
    text = format_amount(abs(number))
    if text.endswith(".0"):
        text = text[:-2]
    return f"{sign}{text}"


def _fluctuation_delta_html(metric: dict[str, Any]) -> str:
    """The 环比 cell: a toned arrow + percentage, or 新增 for a new metric.

    The change is read from the payload's ``delta_pct`` so the export and the
    report page quote the same figure (recomputing it from the rounded values
    would drift by a tenth of a percent).
    """
    if metric.get("new"):
        return '<span class="delta-flat">新增</span>'
    change = _as_float(metric.get("delta_pct"))
    if change is None:
        delta = format_delta(metric.get("current"), metric.get("previous"))
        if not delta:
            return "—"
        return f'<span class="delta-flat">{_escape(delta)}</span>'
    delta = f"{'▲' if change >= 0 else '▼'} {abs(change) * 100:.1f}%"
    tone = FLUCTUATION_TONE.get(str(metric.get("key") or ""), "higher")
    improved = change >= 0 if tone == "higher" else change <= 0
    if tone == "neutral":
        return f'<span class="delta-flat">{_escape(delta)}</span>'
    css = "delta-good" if improved else "delta-bad"
    return f'<span class="{css}">{_escape(delta)}</span>'


def _fluctuation_primary(metric: dict[str, Any]) -> str:
    """The headline factor: the strongest named change of the first dimension."""
    dimensions = [
        dimension
        for dimension in (metric.get("dimensions") or [])
        if isinstance(dimension, dict)
    ]
    items = [
        item
        for item in ((dimensions[0].get("items") if dimensions else None) or [])
        if isinstance(item, dict)
    ]
    primary = next(
        (
            item
            for item in items
            if (_as_float(item.get("contribution")) or 0.0) != 0
            and item.get("name") != "其他"
        ),
        items[0] if items else None,
    )
    if not primary:
        return ""
    return (
        f"主因：{primary.get('name')} "
        f"{_fluctuation_contribution(str(metric.get('key') or ''), primary.get('contribution'))}"
    )


def _fluctuation_factor_html(
    metric_key: str, item: dict[str, Any], rank_index: int
) -> str:
    """One 主因/次因 row: rank chip → factor name → signed contribution.

    The order is the report page's: the chip sits before the name and the
    contribution is right-aligned, so the export and the page read alike.
    """
    contribution = _as_float(item.get("contribution"))
    tone = FLUCTUATION_TONE.get(metric_key, "higher")
    if contribution is None or tone == "neutral":
        css = "delta-flat"
    else:
        improved = contribution >= 0 if tone == "higher" else contribution <= 0
        css = "delta-good" if improved else "delta-bad"
    severity = str(item.get("severity") or "")
    dot = (
        f'<span class="fluct-dot {severity}" '
        f'title="{_escape(_fluctuation_baseline_title(item))}"></span>'
        if severity in FLUCTUATION_SEVERITY_LABELS
        else ""
    )
    return (
        '<div class="fluct-factor">'
        f'<span class="rank">{"主因" if rank_index == 0 else "次因"}</span>'
        f"{dot}"
        f'<span class="name">{_escape(item.get("name"))}</span>'
        f'<span class="contrib {css}">'
        f"{_escape(_fluctuation_contribution(metric_key, contribution))}</span>"
        "</div>"
    )


def _fluctuation_detail_html(metric: dict[str, Any]) -> str:
    """One metric's factors, split into the 平台 / 媒体 / 主游戏 columns."""
    key = str(metric.get("key") or "")
    columns: list[str] = []
    for dimension in metric.get("dimensions") or []:
        if not isinstance(dimension, dict):
            continue
        ranked = [
            item
            for item in dimension.get("items") or []
            if isinstance(item, dict) and item.get("name") != "其他"
        ][:2]
        if not ranked:
            continue
        factors = "".join(
            _fluctuation_factor_html(key, item, index)
            for index, item in enumerate(ranked)
        )
        columns.append(
            '<div class="fluct-dim">'
            f'<div class="fluct-dim-label">'
            f"{_escape(dimension.get('label') or dimension.get('key'))}</div>"
            f"{factors}</div>"
        )
    if not columns:
        return ""
    return f'<div class="fluct-dims">{"".join(columns)}</div>'


FLUCTUATION_SEVERITY_LABELS = {
    "abnormal": "异常",
    "watch": "关注",
    "normal": "正常",
    "insufficient": "历史不足",
    "new": "新增",
    "event": "计划内",
}


def _fluctuation_baseline_title(metric: dict[str, Any]) -> str:
    """Tooltip copy: the verdict's reason plus the historical band behind it."""
    reason = str(metric.get("reason") or "")
    baseline = metric.get("baseline") or {}
    if not baseline or baseline.get("method") == "insufficient":
        return reason or "历史样本不足，暂按业务阈值判断"
    parts = [reason] if reason else []
    low, high = baseline.get("low"), baseline.get("high")
    if low is not None and high is not None:
        parts.append(
            f"近 {baseline.get('samples')} 期正常范围："
            f"{format_roi(low)} ~ {format_roi(high)}"
        )
    median = baseline.get("median")
    if median is not None:
        parts.append(f"中位环比：{format_roi(median)}")
    return "；".join(part for part in parts if part)


def _fluctuation_html(result: dict[str, Any]) -> str:
    """§1「关键指标波动」: the material moves and the factors behind them.

    Mirrors the report page's block: one summary row per metric and a
    collapsible breakdown that repeats the page's expanded row — per metric,
    the 平台 / 媒体 / 主游戏 columns with 主因/次因 chips placed before each
    factor's name and its contribution right-aligned.
    """
    metrics = [
        metric
        for metric in (result.get("fluctuations") or [])
        if isinstance(metric, dict)
    ]
    if not metrics:
        return ""
    min_pct = _as_float((result.get("thresholds") or {}).get("fluctuation_min_pct"))
    gate = 10 if min_pct is None else round(min_pct * 100)

    items: list[str] = []
    for metric in metrics:
        key = str(metric.get("key") or "")
        label = str(metric.get("label") or key)
        severity = str(metric.get("severity") or "")
        severity_label = FLUCTUATION_SEVERITY_LABELS.get(severity, "")
        severity_html = (
            f'<span class="fluct-sev {severity}" '
            f'title="{_escape(_fluctuation_baseline_title(metric))}">'
            f"{severity_label}</span>"
            if severity_label
            else ""
        )
        cells = (
            f'<span class="metric">{_escape(label)}</span>'
            '<span class="values">'
            f'<span class="prev">'
            f"{_escape(_fluctuation_value(key, metric.get('previous')))}</span>"
            '<span class="arrow" aria-hidden="true">→</span>'
            f'<span class="cur">'
            f"{_escape(_fluctuation_value(key, metric.get('current')))}</span>"
            "</span>"
            f'<span class="delta-cell">{_fluctuation_delta_html(metric)}</span>'
            f'<span class="primary">{severity_html}'
            f"{_escape(_fluctuation_primary(metric))}</span>"
        )
        detail = _fluctuation_detail_html(metric)
        # A metric without factors stays a plain row: no chevron, nothing to
        # expand, so the disclosure never promises content it cannot show.
        if detail:
            items.append(
                '<details class="fluct-item">'
                f'<summary class="fluct-row">{cells}'
                '<span class="chev" aria-hidden="true"></span></summary>'
                f'<div class="fluct-body">{detail}</div>'
                "</details>"
            )
        else:
            items.append(f'<div class="fluct-row">{cells}</div>')
    return (
        '<div class="fluct-panel">'
        '<div class="fluct-head">'
        "<h3>关键指标波动</h3>"
        '<p class="caption">'
        f"环比变化 ≥{gate}% 且基数达到阈值的关键指标，数值为对比期 → 本期；"
        "标签（异常 / 关注 / 正常 / 计划内 / 历史不足）按历史环比自动判定；"
        "展开可查看平台 / 媒体 / 主游戏的主次因素"
        "</p></div>"
        f"{''.join(items)}"
        "</div>"
    )


RATE_COLUMNS = {"pr", "rr", "nr"}

# Money columns hold raw 元 on the exported page, so they need thousands
# separators the 万元 card values never did.
MONEY_COLUMNS = {"spend", "recharge"}


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
    if column in MONEY_COLUMNS and isinstance(cell, (int, float)):
        number = float(cell)
        return f"{int(number):,}" if number.is_integer() else f"{number:,.1f}"
    if isinstance(cell, (int, float)) and not isinstance(cell, bool):
        number = float(cell)
        # Counts and per-user figures read with thousands separators, like the
        # report page's number formatter.
        return f"{int(number):,}" if number.is_integer() else f"{number:,}"
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


def _table_html(
    table: dict[str, Any] | None, *, title: str = "", note: str = ""
) -> str:
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
    rows_html: list[str] = []
    previous_project: object = None
    separates_groups = table["columns"][0].get("name") == "project"
    for row in rows:
        if separates_groups:
            project = row.get("project")
            if previous_project is not None and project != previous_project:
                rows_html.append(
                    '<tr class="table-group-sep">'
                    f'<td colspan="{len(table["columns"])}"></td></tr>'
                )
            previous_project = project
        rows_html.append(
            "<tr>"
            + "".join(
                f'<td class="{kind(column)}">'
                f"{_cell_html(row.get(column['name']), column['name'])}</td>"
                for column in table["columns"]
            )
            + "</tr>"
        )
    body = "".join(rows_html)
    caption = ""
    if title:
        count = f"{len(rows)} 行"
        caption = (
            '<div class="table-title">'
            f"<span>{_escape(title)}</span>"
            f'<span class="table-count">{count}</span>'
            "</div>"
        )
    if note:
        caption += f'<p class="table-note">{_escape(note)}</p>'
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


# Progressive enhancements of the exported page: expand-all for the detail
# tables, chapter scroll-spy and back-to-top.  The report is fully readable
# without it, so a failure here is cosmetic.
_PAGE_SCRIPT = """
<script>
(function () {
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

    The page is laid out for a desktop screen first: the report always fills
    the viewport, chapters are panels with a sticky chapter navigation, and the
    wide detail tables scroll in place with their header and dimension column
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
        if builder(result, raw_money=True)
    ]
    breakdown_tables = "".join(
        _breakdown_html(
            f"展开：{title}",
            _table_html(builder(result, limit=MAX_HTML_TABLE_ROWS, raw_money=True)),
        )
        for title, builder in zip(
            ("媒体 × 主游戏", "媒体 × 客户端"), extra, strict=False
        )
    )
    project_daily = _table_html(
        build_project_daily_table(result, limit=MAX_HTML_TABLE_ROWS, raw_money=True)
    )
    project_regions = _table_html(
        build_project_region_table(result, limit=MAX_HTML_TABLE_ROWS, raw_money=True)
    )
    # The cut applies to the channel rows: the listed games are the Top-N the
    # page's 「当周消耗 Top N」 tag counts (``project_summary`` also carries the
    # games the cut dropped).
    project_games = {
        str(row.get("project") or "")
        for row in (result.get("projects") or [])
        if isinstance(row, dict)
    } or {
        str(row.get("project") or "")
        for row in (result.get("project_summary") or [])
        if isinstance(row, dict)
    }
    trend_grain = "分周" if weekly else "分天"
    period_word = "当周" if weekly else "当日"

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
            _core_caption(result, weekly),
            f"{_alerts_html(result)}{_core_card_html(result)}"
            f"{_fluctuation_html(result)}",
        ),
        panel(
            2,
            "trend",
            "柱=消耗/流水（元），折线=ROI1 / 广告ROI（%）；悬停图表可查看具体数值",
            _chart_card_html(
                chart(0),
                _table_html(
                    tables[1](result, limit=MAX_HTML_TABLE_ROWS, raw_money=True)
                ),
                strip_label=f"{trend_grain}明细",
            ),
        ),
        panel(
            3,
            "projects",
            "柱=消耗（颜色=ROI 质量），折线=ROI1（%）；"
            f"展开可查看主游戏 × 渠道 × {trend_grain}与分地区",
            f"{chart(1)}"
            f"{_table_html(tables[2](result, limit=MAX_HTML_TABLE_ROWS, raw_money=True), title='主游戏 × 渠道商 明细（含环比）', note=f'{period_word}消耗 Top {len(project_games)} 主游戏；按主游戏汇总消耗排名，入选主游戏的渠道全部列出，不按渠道维度截断')}"
            f"{_legend_html()}"
            f"{_breakdown_html(f'展开：主游戏 × 渠道 × {trend_grain}', project_daily)}"
            f"{_breakdown_html('展开：主游戏 × 渠道 × 地区', project_regions)}",
        ),
        panel(
            4,
            "media",
            "柱=消耗（颜色=ROI 质量），折线=ROI1（%）；展开可查看媒体 × 主游戏与客户端",
            f"{_media_quality_html(result)}{chart(2)}"
            f"{_table_html(tables[3](result, limit=MAX_HTML_TABLE_ROWS, raw_money=True), title='媒体 明细（含环比）')}"
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
  // Raw 元 axis values run to seven digits; VChart has no JSON number format,
  // so the page installs the thousands-separator formatter the report page's
  // ECharts axis uses.
  function moneyTick(value) {{
    var number = Number(value);
    if (!isFinite(number)) {{ return String(value); }}
    return number.toLocaleString('zh-CN', {{ maximumFractionDigits: 1 }});
  }}
  function isMoneyAxis(axis) {{
    var text = axis && axis.title && axis.title.text;
    return text === '消耗' || (typeof text === 'string' && text.indexOf('金额') >= 0);
  }}
  (window.__SPECS || []).forEach(function (entry) {{
    var spec = entry[1];
    (spec.axes || []).forEach(function (axis) {{
      if (!isMoneyAxis(axis)) {{ return; }}
      axis.label = axis.label || {{}};
      axis.label.formatMethod = function (value) {{ return moneyTick(value); }};
    }});
    try {{
      new Cls(spec, {{ dom: entry[0], autoFit: true, animation: false }})
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
<footer class="page-foot">由 Superset 简报推送生成 · 图表为交互式，可悬停查看数值</footer>
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


def _quality_delta_html(row: dict[str, Any]) -> str:
    """The chip's 环比 phrase, or "" when the previous ROI1 is unknown."""
    previous = row.get("prev") if isinstance(row.get("prev"), dict) else {}
    current, base = _as_float(row.get("roi1")), _as_float(previous.get("roi1"))
    if current is None or not base:
        return ""
    change = (current - base) / abs(base)
    return f"环比 {'▲' if change >= 0 else '▼'} {abs(change) * 100:.1f}%"


def _media_quality_html(result: dict[str, Any]) -> str:
    """最佳媒体 / 需关注 chips above the media chart, as the page shows them."""
    media = [
        row
        for row in (result.get("media") or [])
        if isinstance(row, dict) and (_as_float(row.get("roi1")) or 0.0) > 0
    ]
    if not media:
        return ""
    best = max(media, key=lambda row: _as_float(row.get("roi1")) or 0.0)
    worst = min(media, key=lambda row: _as_float(row.get("roi1")) or 0.0)
    breakeven, _ = _roi_thresholds(result)

    def chip(tone: str, prefix: str, row: dict[str, Any]) -> str:
        parts = [
            f"{prefix}：{row.get('channel')}",
            f"ROI1 {format_roi(row.get('roi1'))}",
        ]
        if delta := _quality_delta_html(row):
            parts.append(delta)
        return f'<span class="quality-chip {tone}">{_escape(" · ".join(parts))}</span>'

    chips = [chip("good", "最佳媒体", best)]
    if (_as_float(worst.get("roi1")) or 0.0) < breakeven:
        chips.append(chip("warn", "需关注", worst))
    return f'<div class="quality-chips">{"".join(chips)}</div>'


def _chart_specs(
    result: dict[str, Any], *, weekly: bool
) -> list[tuple[str, dict[str, Any]]]:
    """The card's chart specs, in chapter order."""
    specs: list[tuple[str, dict[str, Any]]] = []
    for element_id, builder, kwargs in (
        (
            "chart-trend",
            build_trend_chart,
            # The page has room for the whole week range on the axis.
            {
                "weekly": weekly,
                "full_labels": True,
                "raw_money": True,
                # 广告ROI replaces LTV1 on this chart and shares ROI1's axis.
                "with_ad_roi": True,
            },
        ),
        ("chart-project", build_project_chart, {"raw_money": True}),
        ("chart-media", build_media_chart, {"raw_money": True}),
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
