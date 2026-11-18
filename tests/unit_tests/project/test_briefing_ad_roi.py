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

"""广告ROI: the ad-only 1日充值 over rebate-adjusted spend.

Mirrors the dataset's saved metric,
``SUM(CASE WHEN 媒体 = '自然量' THEN 0 ELSE 1日充值 END) / SUM(返点后消耗)``,
so the organic recharge never counts as an ad return.
"""

from __future__ import annotations

from typing import Any

import pandas as pd

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _ad_roi,
    _build_core_metrics,
    _ratio_fields,
)


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "report_date": ["2026-09-19"] * 3,
            "主游戏": ["A", "A", "A"],
            "渠道商": ["c1", "c1", "c1"],
            "媒体": ["自然量", "今日头条", "广点通"],
            "返点后消耗": [0.0, 300.0, 100.0],
            "新增进入": [60, 30, 10],
            "1日充值": [120.0, 90.0, 20.0],
            "充值流水": [200.0, 150.0, 30.0],
        }
    )


def _config(**overrides: Any) -> DailyReportConfig:
    base: dict[str, Any] = {
        "date_column": "report_date",
        "project_column": "主游戏",
        "channel_column": "渠道商",
        "ad_channel_column": "媒体",
        "spend_column": "返点后消耗",
        "new_users_column": "新增进入",
        "cpa_column": "返点后消耗",
        "recharge_column": "充值流水",
        "ltv_columns": ("1日充值",),
        "roi_columns": ("1日充值",),
        "ltv_weighted_average": False,
        "roi_weighted_average": False,
    }
    base.update(overrides)
    return DailyReportConfig(**base)


def test_ad_roi_drops_the_organic_recharge_from_the_numerator() -> None:
    # (90 + 20) / (300 + 100): the 120 organic recharge is excluded.
    assert _ad_roi(_frame(), _config()) == 110.0 / 400.0


def test_ad_roi_keeps_the_same_denominator_as_roi1() -> None:
    fields = _ratio_fields(_frame(), _config())
    assert fields["roi1"] == 230.0 / 400.0
    assert fields["ad_roi"] == 110.0 / 400.0


def test_ad_roi_is_undefined_without_spend() -> None:
    frame = _frame()
    frame["返点后消耗"] = 0.0
    assert _ad_roi(frame, _config()) is None


def test_core_metrics_carry_ad_roi() -> None:
    core = _build_core_metrics(_frame(), _config(), DailyReportContext())
    assert core["ad_roi"] == 110.0 / 400.0


def test_ad_roi_handles_a_frame_without_the_media_column() -> None:
    frame = _frame().drop(columns=["媒体"])
    assert _ad_roi(frame, _config()) is None
