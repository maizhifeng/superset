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

from superset.project.briefing.html_export import build_briefing_html
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
    },
    "core_previous": {"spend": 400000.0, "new_users": 39000, "ROI1": 0.2},
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
        },
        {
            "date": "2026-09-27",
            "label": "2026-09-27",
            "spend": 59156.748,
            "new_users": 40518,
            "recharge": 1367042.7,
            "roi1": 0.152,
            "roi_cum": 0.18,
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
