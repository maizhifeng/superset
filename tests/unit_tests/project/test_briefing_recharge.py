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

"""充值流水 (period recharge flow) carried through every briefing view.

The metric is a plain additive sum, deliberately independent of the backdated
``N日充值`` columns that feed LTV/ROI, so these tests also pin that adding it did
not change the existing ratio numerators.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _bucket_group_metrics,
    _build_core_metrics,
    _build_daily_series,
    _build_project_combo_rows,
    _build_project_summary_rows,
    PeriodBucket,
)


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "report_date": ["2026-08-26", "2026-08-26", "2026-08-25"],
            "主游戏": ["A", "B", "A"],
            "渠道商": ["c1", "c1", "c1"],
            "返点后消耗": [100.0, 60.0, 50.0],
            "新增进入": [10, 6, 5],
            "1日充值": [30.0, 12.0, 10.0],
            "充值流水": [120.0, 40.0, 60.0],
        }
    )


def _config(**overrides) -> DailyReportConfig:
    base: dict = {
        "date_column": "report_date",
        "project_column": "主游戏",
        "channel_column": "渠道商",
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


def _current() -> pd.DataFrame:
    frame = _frame()
    return frame[frame["report_date"] == "2026-08-26"]


def _previous() -> pd.DataFrame:
    frame = _frame()
    return frame[frame["report_date"] == "2026-08-25"]


def test_core_metrics_sum_recharge_without_touching_roi() -> None:
    core = _build_core_metrics(_current(), _config(), DailyReportContext())

    assert core["recharge"] == 160.0  # 120 + 40
    # ROI1/LTV1 keep using the backdated numerator, not the recharge flow.
    assert core["LTV1"] == 42.0 / 16
    assert core["ROI1"] == 42.0 / 160


def test_undefined_ratios_are_null_not_zero() -> None:
    """Zero denominators must not read as "zero return"."""
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-26"],
            "主游戏": ["自然量游戏"],
            "渠道商": ["third"],
            # Revenue with no ad spend: ROI is undefined, not 0%.
            "返点后消耗": [0.0],
            "新增进入": [7],
            "1日充值": [21.0],
            "充值流水": [30.0],
        }
    )
    core = _build_core_metrics(frame, _config(), DailyReportContext())

    assert core["spend"] == 0.0
    assert core["recharge"] == 30.0
    assert core["cpa"] == 0.0  # a real 0: no spend over 7 users
    assert core["LTV1"] == 3.0  # 21 recharge / 7 users
    assert core["ROI1"] is None  # 21 recharge / 0 spend

    empty = _build_core_metrics(pd.DataFrame(), _config(), DailyReportContext())
    assert empty["ROI1"] is None
    assert empty["LTV1"] is None
    assert empty["cpa"] is None


def test_per_game_ratios_are_null_when_their_denominator_is_zero() -> None:
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-26", "2026-09-26"],
            "主游戏": ["无投放游戏", "投放无新增游戏"],
            "渠道商": ["third", "ios"],
            "返点后消耗": [0.0, 80.0],
            "新增进入": [12, 0],
            "1日充值": [36.0, 0.0],
            "充值流水": [40.0, 0.0],
        }
    )
    bucket = PeriodBucket("2026-09-26", date(2026, 9, 26), date(2026, 9, 26))
    rows = {
        row["project"]: row
        for row in _build_project_combo_rows(
            frame,
            "report_date",
            frame,
            frame.iloc[0:0],
            [bucket],
            _config(),
            DailyReportContext(),
        )
    }

    # Selection is spend-only, so a zero-spend game has no row of its own.
    assert "无投放游戏" not in rows
    assert rows["投放无新增游戏"]["cpa"] is None  # 80 / 0 users
    assert rows["投放无新增游戏"]["ltv1"] is None  # 0 / 0 users
    assert rows["投放无新增游戏"]["roi1"] == 0.0  # 0 recharge / 80 spend

    # Group roll-ups (media rows, previous-period maps) still meet zero
    # denominators and must report them as undefined.
    grouped = _bucket_group_metrics(frame, ["主游戏"], _config())
    assert grouped[("无投放游戏",)]["cpa"] == 0.0  # 0 spend / 12 users
    assert grouped[("无投放游戏",)]["roi1"] is None  # 36 recharge / 0 spend


def test_core_metrics_zero_recharge_when_column_is_unmapped() -> None:
    config = _config(recharge_column="并不存在的列")

    assert (
        _build_core_metrics(_current(), config, DailyReportContext())["recharge"] == 0.0
    )
    assert (
        _build_core_metrics(pd.DataFrame(), config, DailyReportContext())["recharge"]
        == 0.0
    )


def test_daily_series_carries_recharge_per_bucket() -> None:
    bucket = PeriodBucket("2026-08-26", date(2026, 8, 26), date(2026, 8, 26))

    series = _build_daily_series(
        _frame(), _config(), DailyReportContext(), "report_date", [bucket]
    )

    assert series[0]["recharge"] == 160.0


def test_group_metrics_expose_recharge_for_current_and_previous() -> None:
    config = _config()

    current = _bucket_group_metrics(_current(), ["主游戏"], config)
    previous = _bucket_group_metrics(_previous(), ["主游戏"], config)

    assert current[("A",)]["recharge"] == 120.0
    assert current[("B",)]["recharge"] == 40.0
    assert previous[("A",)]["recharge"] == 60.0


def test_project_summary_rows_carry_recharge_and_previous_recharge() -> None:
    rows = _build_project_summary_rows(_current(), _previous(), _config())

    by_project = {row["project"]: row for row in rows}
    assert by_project["A"]["recharge"] == 120.0
    assert by_project["A"]["prev"]["recharge"] == 60.0
    assert by_project["B"]["recharge"] == 40.0


def test_pay_rate_and_retention_flow_through_every_view() -> None:
    """1日付费率 / 2日留存率 share the new-users denominator and travel with
    the same rows as LTV/ROI."""
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-19", "2026-09-19"],
            "主游戏": ["A", "B"],
            "渠道商": ["ios", "ios"],
            "返点后消耗": [100.0, 20.0],
            "新增进入": [10, 0],
            "1日充值": [30.0, 0.0],
            "充值流水": [50.0, 0.0],
            "1日付费数": [2, 0],
            "2日留存数": [4, 0],
        }
    )
    config = _config(
        pay_rate_column="1日付费数",
        retention_column="2日留存数",
    )

    core = _build_core_metrics(frame, config, DailyReportContext())
    assert core["pay_rate"] == 0.2  # 2 / 10 users
    assert core["retention_rate"] == 0.4  # 4 / 10 users

    bucket = PeriodBucket("2026-09-19", date(2026, 9, 19), date(2026, 9, 19))
    rows = {
        row["project"]: row
        for row in _build_project_combo_rows(
            frame,
            "report_date",
            frame,
            frame.iloc[0:0],
            [bucket],
            config,
            DailyReportContext(),
        )
    }

    assert rows["A"]["pay_rate"] == 0.2
    assert rows["A"]["retention_rate"] == 0.4
    # B spends but acquires nobody: both rates (and LTV) are undefined.
    assert rows["B"]["pay_rate"] is None
    assert rows["B"]["retention_rate"] is None
    assert rows["B"]["ltv1"] is None
