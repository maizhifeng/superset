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
"""Tests for the standalone HTML export of a briefing."""

from __future__ import annotations

import re
from typing import Any

from superset.project.briefing.html_export import (
    _chart_specs,
    build_briefing_doc_title,
    build_briefing_html,
)
from superset.utils import json

RESULT: dict[str, Any] = {
    "report_type": "daily",
    "report_date": "2026-09-27",
    "generated_at": "2026-09-28 01:00:50",
    "core": {
        "spend": 591567.48,
        "new_users": 40518,
        "recharge": 1367042.7,
        "ROI1": 0.152,
        "cpa": 14.6,
        "natural_rate": 0.637,
        "ad_roi": 0.11,
        "ltv1": 3.1,
    },
    "core_previous": {
        "spend": 400000.0,
        "new_users": 39000,
        "ROI1": 0.2,
        "natural_rate": 0.68,
        "ad_roi": 0.09,
        "ltv1": 3.9,
    },
    "thresholds": {"default_breakeven_line": 0.1, "roi_critical_line": 0.05},
    "daily": [
        {
            "date": "2026-09-26",
            "label": "2026-09-26",
            "spend": 42400,
            "new_users": 39125,
            "recharge": 1627000,
            "roi1": 0.355,
            "roi_cum": 0.61,
            "ad_roi": 0.31,
        },
        {
            "date": "2026-09-27",
            "label": "2026-09-27",
            "spend": 59156.748,
            "new_users": 40518,
            "recharge": 1367042.7,
            "roi1": 0.152,
            "roi_cum": 0.18,
            "ad_roi": 0.11,
        },
    ],
    "platforms": [
        {"platform": "mobile", "spend": 101600, "new_users": 48950, "roi1": 0.158}
    ],
    "projects": [
        {
            "project": "游戏A",
            "channel": "android",
            "spend": 106100,
            "new_users": 26660,
            "roi1": 0.062,
        },
        {
            "project": "游戏B",
            "channel": "ios",
            "spend": 75800,
            "new_users": 1540,
            "roi1": 0.234,
        },
    ],
    "media": [
        {
            "channel": "今日头条",
            "spend": 170200,
            "new_users": 45710,
            "recharge": 149200,
            "roi1": 0.127,
            "pay_rate": 0.0683809,
            "retention_rate": 0.1012,
        }
    ],
    "alerts": [{"level": "warning", "message": "ROI1 偏低 < 0.05"}],
}


def test_export_is_self_contained_html() -> None:
    page = build_briefing_html(RESULT, name="111")
    assert page.startswith("<!doctype html>")
    assert page.rstrip().endswith("</html>")
    # Styles are inline and the only remote asset is the chart runtime.
    assert "<style>" in page
    assert page.count("<script src=") == 1
    assert "cdn.jsdelivr.net" in page


def test_export_carries_every_chapter_and_chart() -> None:
    page = build_briefing_html(RESULT, name="111")
    for heading in (
        "1. 核心指标速览",
        "2. 分天对比",
        "3. 主游戏维度分析",
        "4. 媒体表现分析",
    ):
        assert heading in page
    assert page.count("__SPECS.push") == 3
    # 平台 / 分天 / 主游戏×渠道 / 媒体 (+任何可用组合维度).
    assert page.count("<table>") >= 4


def test_export_shows_roi_as_a_percentage() -> None:
    """The payload's ROI lives under ``ROI1``; the export must still find it."""
    page = build_briefing_html(RESULT, name="111")
    assert "15.2%" in page
    assert "—" not in page.split('<div class="metrics">')[1].split("</div></div>")[0]


def test_export_renders_full_tables_and_rates() -> None:
    page = build_briefing_html(RESULT, name="111")
    # Every 主游戏 × 渠道 row travels, not just the chart's top N.
    assert "游戏A" in page
    assert "游戏B" in page
    # Ratios render as percentages rather than raw 0~1 numbers.
    assert "6.8%" in page
    assert "10.1%" in page
    assert "0.068" not in page


def test_export_uses_raw_yuan_without_the_wan_suffix() -> None:
    """Money columns carry the payload's 元 values, not 万元."""
    page = build_briefing_html(RESULT, name="111")
    assert "万元" not in page
    assert "消耗(万元)" not in page
    assert "流水(万元)" not in page
    # 游戏A's 106,100 元 stays 106,100 rather than becoming 10.6 万元.
    assert "106,100" in page
    assert ">10.6<" not in page


def test_export_trend_chart_plots_ad_roi_on_the_roi_axis() -> None:
    """广告ROI replaces LTV1 and rides ROI1's right-hand axis."""
    specs = dict(_chart_specs(RESULT, weekly=False))
    spec = specs["chart-trend"]
    series = {item["id"]: item for item in spec["series"]}
    assert series["adroi"]["yField"] == "广告ROI"
    assert series["adroi"]["type"] == "line"
    axis = next(a for a in spec["axes"] if a.get("orient") == "right")
    assert axis["seriesId"] == ["roi", "adroi"]
    assert axis["title"]["text"] == "ROI（%）"
    # The chart no longer carries an LTV series.
    assert not any("LTV" in str(item.get("yField")) for item in spec["series"])


def test_export_charts_plot_raw_yuan() -> None:
    specs = dict(_chart_specs(RESULT, weekly=False))
    trend = specs["chart-trend"]
    amount_values = trend["data"][0]["values"]
    assert {row["指标"] for row in amount_values} == {"消耗", "流水"}
    assert 42400.0 in {row["金额"] for row in amount_values}


def test_export_separates_project_groups() -> None:
    """Each 主游戏 group is fenced off from the next by a separator row."""
    page = build_briefing_html(RESULT, name="111")
    assert page.count('<tr class="table-group-sep">') >= 1


def test_export_carries_the_project_channel_daily_expansion() -> None:
    """主游戏 × 渠道 × 日期 is the project chapter's daily expansion."""
    expanded = json.loads(json.dumps(RESULT))
    expanded["projects"][0]["daily"] = [
        {
            "date": "2026-09-27",
            "label": "2026-09-27",
            "spend": 106121.61,
            "new_users": 2667,
            "cpa": 39.7963,
            "roi1": 0.0623,
            "roi_cum": 0.0689,
        }
    ]
    expanded["media_projects"] = [
        {
            "channel": "今日头条",
            "project": "游戏A",
            "spend": 50000,
            "new_users": 400,
            "cpa": 125.0,
            "roi1": 0.2,
            "roi_cum": 0.18,
        }
    ]
    page = build_briefing_html(expanded, name="111")
    headers = [
        # ``<th class="dim">名称</th>`` — keep the text after the closing ``>``.
        re.findall(r"<th[^>]*>([^<]*)</th>", row)
        for row in page.split("<thead><tr>")[1:]
    ]
    flat = [" ".join(header) for header in headers]
    assert any("主游戏 渠道 日期" in h for h in flat), flat
    assert any("主游戏 媒体" in h for h in flat), flat


def test_export_escapes_alert_markup() -> None:
    page = build_briefing_html(RESULT, name="111")
    assert "&lt; 0.05" in page or "&#60; 0.05" in page
    assert "< 0.05" not in page


def test_export_is_valid_json_inline() -> None:
    page = build_briefing_html(RESULT, name="111")
    blob = page.split("__SPECS.push([", 1)[1].split("]);", 1)[0]
    _, spec_json = blob.split(",", 1)
    spec = json.loads(spec_json.rstrip("]"))
    assert spec["type"] == "common"


# --------------------------------------------------------------------------- #
# §1 关键指标波动 and the 分地区 expansion (the page's remaining features)
# --------------------------------------------------------------------------- #


def _with_fluctuations() -> dict[str, Any]:
    result = json.loads(json.dumps(RESULT))
    result["thresholds"]["fluctuation_min_pct"] = 0.1
    result["fluctuations"] = [
        {
            "key": "roi1",
            "label": "ROI1",
            "kind": "ratio",
            "new": False,
            "previous": 0.098,
            "current": 0.155,
            "delta": 0.057,
            "delta_pct": 0.574,
            "severity": "abnormal",
            "zscore": 3.2,
            "reason": "明显高于过去 8 期的正常波动",
            "baseline": {
                "samples": 8,
                "method": "robust",
                "median": 0.10,
                "mad": 0.02,
                "p10": 0.02,
                "p90": 0.17,
                "low": 0.011,
                "high": 0.189,
            },
            "dimensions": [
                {
                    "key": "platform",
                    "label": "平台",
                    "items": [
                        {
                            "name": "oversea",
                            "previous": 0.05,
                            "current": 0.11,
                            "contribution": 0.06,
                            "share": 0.7,
                            "rank": "primary",
                            "severity": "abnormal",
                            "zscore": 2.4,
                            "reason": "明显高于同类项目的历史波动",
                            "baseline": {
                                "samples": 7,
                                "pooled_samples": 8,
                                "method": "pooled",
                                "median": 0.04,
                                "mad": 0.02,
                                "p10": -0.01,
                                "p90": 0.09,
                                "low": -0.049,
                                "high": 0.129,
                            },
                        },
                        {
                            "name": "mobile",
                            "previous": 0.06,
                            "current": 0.08,
                            "contribution": 0.02,
                            "share": 0.3,
                            "rank": "secondary",
                        },
                        {
                            "name": "其他",
                            "previous": 0.01,
                            "current": 0.01,
                            "contribution": 0.001,
                            "share": 0.01,
                            "rank": "secondary",
                        },
                    ],
                },
                {
                    "key": "project",
                    "label": "主游戏",
                    "items": [
                        {
                            "name": "游戏A",
                            "previous": 0.08,
                            "current": 0.12,
                            "contribution": 0.02,
                            "share": 0.4,
                            "rank": "primary",
                        }
                    ],
                },
            ],
        },
        {
            "key": "cpa",
            "label": "CPA",
            "kind": "ratio",
            "new": False,
            "previous": 32.3,
            "current": 39.0,
            "delta": 6.7,
            "delta_pct": 0.208,
            "severity": "insufficient",
            "reason": "历史数据不足，暂按 10% 业务阈值判断",
            "baseline": {
                "samples": 3,
                "method": "insufficient",
                "median": None,
                "mad": None,
                "p10": None,
                "p90": None,
                "low": None,
                "high": None,
            },
            "dimensions": [],
        },
        {
            "key": "spend",
            "label": "返点后消耗",
            "kind": "sum",
            "new": False,
            "previous": 400000.0,
            "current": 591567.48,
            "delta": 191567.48,
            "delta_pct": 0.479,
            "severity": "normal",
            "zscore": 0.4,
            "reason": "处于过去 8 期的正常波动范围",
            "baseline": {
                "samples": 8,
                "method": "robust",
                "median": 0.20,
                "mad": 0.15,
                "p10": -0.05,
                "p90": 0.45,
                "low": -0.47,
                "high": 0.87,
            },
            "dimensions": [],
        },
        {
            "key": "new_users",
            "label": "新增进入",
            "kind": "additive",
            "new": False,
            "previous": 232756,
            "current": 349759,
            "delta": 117003,
            "delta_pct": 0.5027,
            "severity": "event",
            "reason": "事件：策定九州韩国 上线 2026-11-11",
            "events": [
                {"project": "策定九州韩国", "date": "2026-11-11", "kind": "上线"}
            ],
            "baseline": {
                "samples": 6,
                "method": "robust",
                "median": 0.05,
                "mad": 0.08,
                "p10": -0.1,
                "p90": 0.2,
                "low": -0.3,
                "high": 0.4,
                "includes_events": True,
                "event_samples": 2,
            },
            "dimensions": [],
        },
    ]
    return result


def test_export_carries_the_fluctuation_block() -> None:
    """§1 shows the material moves and the factors behind them."""
    page = build_briefing_html(_with_fluctuations(), name="111")
    assert "<h3>关键指标波动</h3>" in page
    # The gate comes from the payload so the wording matches the page.
    assert "环比变化 ≥10%" in page
    # Ratio metrics keep the metric's own unit, the amount keeps 元 formatting.
    assert "9.8%" in page
    assert "15.5%" in page
    assert "400,000" in page
    assert "591,567.5" in page
    # The headline factor is the first dimension's strongest named change, and
    # 「其他」 never becomes the cited factor.
    assert "主因：oversea +6.00%" in page
    assert "主因：其他" not in page
    # Each metric row is its own inline disclosure, like the page — not one
    # table at the bottom listing every metric's factors.
    assert '<details class="fluct-item">' in page
    assert '<summary class="fluct-row">' in page
    assert '<span class="metric">ROI1</span>' in page
    # 对比期 / 本期 / 环比 / 主因 sit in their own fixed columns so the rows
    # line up under each other.
    assert '<span class="prev">9.8%</span>' in page
    assert '<span class="arrow" aria-hidden="true">→</span>' in page
    assert '<span class="cur">15.5%</span>' in page
    # The factors sit in the row's body, in the page's order: rank chip →
    # factor name → signed contribution, grouped by dimension.
    assert '<div class="fluct-dim-label">平台</div>' in page
    assert '<div class="fluct-dim-label">主游戏</div>' in page
    assert '<span class="rank">主因</span>' in page
    assert '<span class="name">oversea</span>' in page
    assert '<span class="rank">次因</span>' in page
    assert '<span class="name">mobile</span>' in page
    assert 'class="contrib delta-good">+6.00%' in page
    # The old "排名" column is gone; the chip carries the rank instead.
    assert "<th>排名</th>" not in page
    # A metric without factors is a plain row: no chevron, nothing to open.
    assert '<div class="fluct-row"><span class="metric">返点后消耗</span>' in page
    assert page.count('<details class="fluct-item">') == 1
    # The historical-band verdict rides on the row as a chip.
    assert '<span class="fluct-sev abnormal"' in page
    assert ">异常</span>" in page
    assert ">历史不足</span>" in page
    assert ">正常</span>" in page
    assert "明显高于过去 8 期的正常波动" in page
    assert "中位环比" not in page
    assert "z=" not in page
    # Launch/test weeks are marked as planned instead of abnormal.
    assert '<span class="fluct-sev event"' in page
    assert ">上线</span>" in page
    assert "策定九州韩国 上线 2026-11-11" in page
    # Factor rows carry their own pooled verdict as a coloured dot.
    assert '<span class="fluct-dot abnormal"' in page
    assert "明显高于同类项目的历史波动" in page
    # Colour follows the metric's own semantics: a ROI1 rise is good, a CPA
    # rise is bad, and 消耗 is neutral (grey) either way.
    assert 'class="delta-good">▲ 57.4%' in page
    assert 'class="delta-bad">▲ 20.8%' in page
    assert 'class="delta-flat">▲ 47.9%' in page


def test_export_omits_the_fluctuation_block_without_rows() -> None:
    page = build_briefing_html(RESULT, name="111")
    assert "<h3>关键指标波动</h3>" not in page
    assert "展开：关键指标波动的主次因素" not in page


def test_export_embeds_the_platform_split_in_the_core_card() -> None:
    """平台拆分 is the KPI card's bottom disclosure, as on the report page."""
    page = build_briefing_html(_with_fluctuations(), name="111")
    assert '<div class="fold-card">' in page
    assert '<details class="fold-more">' in page
    assert "▦</span>分业务板块" in page
    # The platform table lives inside that disclosure, before 关键指标波动.
    core_at = page.index('<details class="fold-more">')
    fluct_at = page.index("<h3>关键指标波动</h3>")
    platform_at = page.index("mobile", core_at)
    assert core_at < fluct_at
    assert core_at < platform_at < fluct_at
    # No standalone 平台拆分 table block is left in the chapter.
    assert 'title="平台拆分"' not in page


def test_export_headline_matches_the_page_tiles() -> None:
    """§1 opens with the page's seven tiles, in the page's order and wording."""
    page = build_briefing_html(RESULT, name="111")
    metrics = page.split('<div class="metrics">', 1)[1]
    labels = re.findall(r'<div class="label">([^<]+)', metrics.split("<h3>", 1)[0])
    assert [label.split()[0] for label in labels] == [
        "返点后消耗",
        "充值流水",
        "新增进入",
        "自然新增%",
        "CPA",
        "广告ROI",
        "ROI1",
        "LTV1",
    ]
    assert metrics.count('<div class="metric">') == 8
    # Share and per-user figures keep their units.
    assert "63.7%" in metrics
    assert "11.0%" in metrics
    assert "15.2%" in metrics
    # 消耗 moves are neutral: the delta is muted rather than green/red.
    assert '<span class="delta muted">' in metrics


def test_export_trend_table_hangs_from_a_strip() -> None:
    """§2's detail table is the chart card's bottom disclosure, as on the page."""
    daily = build_briefing_html(RESULT, name="111")
    weekly = build_briefing_html(WEEKLY_RESULT, name="111", report_type="weekly")
    # Two disclosures in §1/§2: 分业务板块 under the KPI band, 分天/分周明细
    # under the trend chart.
    assert daily.count('<details class="fold-more">') == 2
    assert "▦</span>分天明细" in daily
    assert "▦</span>分周明细" in weekly
    # The table no longer sits open with its own title block.
    assert 'title="分天明细"' not in daily
    assert 'title="分周明细"' not in weekly


def test_export_tables_carry_the_page_metric_columns() -> None:
    """The detail tables end with the page's 流水ROI column."""
    page = build_briefing_html(RESULT, name="111")
    headers = re.findall(r"<th[^>]*>(流水ROI)</th>", page)
    assert headers


def test_export_weekly_project_expansion_uses_week_ranges() -> None:
    """A weekly bucket reads as its range, never as the week's Monday."""
    weekly = json.loads(json.dumps(WEEKLY_RESULT))
    weekly["projects"][0]["daily"] = [
        {
            "date": "2026-08-23",
            "label": "2026-08-23 ~ 2026-08-29",
            "spend": 100000.0,
            "new_users": 100,
            "roi1": 0.1,
        }
    ]
    page = build_briefing_html(weekly, name="111", report_type="weekly")
    assert "展开：主游戏 × 渠道 × 分周" in page
    # The expansion's leading column is 周期 in a weekly report, and the cell
    # carries the whole range rather than the bucket's ISO start date.
    assert '<th class="dim">周期</th>' in page
    assert ">2026-08-23 ~ 2026-08-29<" in page


def test_export_media_quality_chips_match_the_page() -> None:
    """§4 opens with the page's 最佳媒体 / 需关注 chips."""
    result = json.loads(json.dumps(RESULT))
    result["media"][0]["prev"] = {"roi1": 0.1}
    result["media"].append(
        {
            "channel": "低效媒体",
            "spend": 1000.0,
            "new_users": 10,
            "recharge": 10.0,
            "roi1": 0.03,
            "prev": {"roi1": 0.05},
        }
    )
    page = build_briefing_html(result, name="111")
    assert '<div class="quality-chips">' in page
    assert "最佳媒体：今日头条 · ROI1 12.7% · 环比 ▲ 27.0%" in page
    # The worst media is only flagged when it sits below the breakeven line.
    assert "需关注：低效媒体 · ROI1 3.0% · 环比 ▼ 40.0%" in page


def test_export_omits_the_worst_chip_when_every_media_clears_the_line() -> None:
    result = json.loads(json.dumps(RESULT))
    page = build_briefing_html(result, name="111")
    assert "最佳媒体：今日头条" in page
    assert "需关注：" not in page


def test_export_project_table_carries_the_top_n_note() -> None:
    """§3 states the same Top-N rule the page puts beside the table title."""
    daily = build_briefing_html(RESULT, name="111")
    weekly = build_briefing_html(WEEKLY_RESULT, name="111", report_type="weekly")
    assert "当日消耗 Top 2 主游戏" in daily
    assert "当周消耗 Top 2 主游戏" in weekly
    assert "入选主游戏的渠道全部列出" in daily


def test_export_carries_the_region_expansion() -> None:
    """主游戏 × 渠道 × 地区 is the project chapter's 分地区 expansion."""
    expanded = json.loads(json.dumps(RESULT))
    expanded["project_regions"] = [
        {
            "project": "游戏A",
            "channel": "android",
            "region": "KR",
            "spend": 50000.0,
            "recharge": 12000.0,
            "new_users": 900,
            "roi1": 0.2,
            "roi_cum": 0.35,
        }
    ]
    page = build_briefing_html(expanded, name="111")
    assert "展开：主游戏 × 渠道 × 地区" in page
    headers = [
        " ".join(re.findall(r"<th[^>]*>([^<]*)</th>", row))
        for row in page.split("<thead><tr>")[1:]
    ]
    assert any(h.startswith("主游戏 渠道 地区") for h in headers), headers
    assert "KR" in page


def test_weekly_and_daily_exports_share_every_chapter_and_feature() -> None:
    """The two report types differ in the period wording only, never the结构."""
    result = _with_fluctuations()
    result["project_regions"] = [
        {
            "project": "游戏A",
            "channel": "android",
            "region": "KR",
            "spend": 50000.0,
            "recharge": 12000.0,
            "new_users": 900,
            "roi1": 0.2,
        }
    ]
    daily = build_briefing_html({**result, "report_type": "daily"}, name="111")
    weekly = build_briefing_html(
        {**result, "report_type": "weekly"}, name="111", report_type="weekly"
    )

    def chapters(page: str) -> list[str]:
        return [
            text.replace("分天对比", "分X对比").replace("分周对比", "分X对比")
            for text in re.findall(r"<h2>(.*?)</h2>", page)
        ]

    assert chapters(daily) == chapters(weekly)
    assert daily.count("<table>") == weekly.count("<table>")
    # The 波动 rows are per-metric disclosures in both types.
    assert daily.count('<details class="fluct-item">') == weekly.count(
        '<details class="fluct-item">'
    )
    assert re.findall(r"<summary>(.*?)</summary>", daily) == re.findall(
        r"<summary>(.*?)</summary>", weekly
    )
    # The weekly export names its trend chapter after the week grain.
    assert "分周对比" in weekly
    assert "分天对比" in daily


# --------------------------------------------------------------------------- #
# Exported file title (used as the uploaded HTML's Drive name)
# --------------------------------------------------------------------------- #

WEEKLY_RESULT: dict[str, Any] = {
    **json.loads(json.dumps(RESULT)),
    "report_type": "weekly",
    "report_date": "2026-08-29",
    "period_start": "2026-08-23",
    "period_end": "2026-08-29",
    "previous_period_start": "2026-08-16",
    "previous_period_end": "2026-08-22",
    "daily": [
        {
            "date": "2026-08-23",
            "label": "2026-08-23 ~ 2026-08-29",
            "spend": 42400,
            "new_users": 39125,
            "recharge": 1627000,
            "roi1": 0.355,
            "roi_cum": 0.61,
            "ad_roi": 0.31,
        },
    ],
}


def test_export_title_names_the_weekly_file() -> None:
    assert (
        build_briefing_doc_title(WEEKLY_RESULT, name="111")
        == "111周报 · 2026-08-23 ~ 2026-08-29"
    )
    assert build_briefing_doc_title(RESULT, name="111", report_type="daily") == (
        "111日报 · 2026-09-27"
    )


def test_export_is_always_full_width() -> None:
    """The exported page fills the viewport; there is no centred mode at all."""
    page = build_briefing_html(WEEKLY_RESULT, name="111", report_type="weekly")
    # The old fixed 1080px column is gone and the shell stays fluid.
    assert "max-width: 1080px" not in page
    assert ".shell { width: 100%" in page
    # The centred view was removed: no toggle, no body class, no persisted mode.
    assert "centred" not in page
    assert "居中视图" not in page
    assert 'id="btn-width"' not in page
    assert "briefing-width" not in page
    # Charts follow the container instead of a fixed pixel height.
    assert ".chart { width: 100%; height: clamp(" in page
    assert "autoFit: true" in page


def test_export_weekly_trend_axis_keeps_the_whole_range() -> None:
    """The page has room for the week range, so the export axis keeps it too."""
    specs = dict(_chart_specs(WEEKLY_RESULT, weekly=True))
    labels = {row["周期"] for row in specs["chart-trend"]["data"][0]["values"]}
    assert "2026-08-23 ~ 2026-08-29" in labels


def test_export_chapters_are_panels_with_tables_and_nav() -> None:
    page = build_briefing_html(WEEKLY_RESULT, name="111", report_type="weekly")
    assert page.count('class="panel"') == 4
    # The sticky nav uses the weekly trend wording for a weekly report.
    assert '<a href="#trend">分周对比</a>' in page
    assert "分天对比" not in page
    # Every chapter's detail table is captioned and counted.
    for caption in ("分周明细", "主游戏 × 渠道商", "媒体 明细"):
        assert caption in page
    assert 'class="table-count"' in page
    # Expand-all + back-to-top round out the page structure.
    assert 'id="btn-details"' in page
    assert 'class="to-top"' in page


def test_weekly_export_is_interactive_html() -> None:
    """The weekly push uploads this page as-is; charts stay interactive."""
    from superset.project.briefing.html_export import VCHART_CDN

    page = build_briefing_html(WEEKLY_RESULT, name="111", report_type="weekly")
    # Script, VChart runtime and inline chart specs make the charts interactive.
    assert "<script" in page
    assert VCHART_CDN in page
    assert page.count("__SPECS.push") == 3
    # Every chapter and its detail table travel with the file.
    for heading in (
        "1. 核心指标速览",
        "2. 分周对比",
        "3. 主游戏维度分析",
        "4. 媒体表现分析",
    ):
        assert heading in page
    assert page.count("<table>") >= 4
    assert "游戏A" in page
