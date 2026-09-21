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

"""自然新增% (organic share of new users) carried through every briefing view.

The ratio mirrors the datasets' saved ``自然新增%`` metric —
``SUM(自然量新增) / SUM(新增进入)`` — so these tests also pin that it stays a
plain 0~1 share of the ``新增进入`` column rather than a growth rate or a
per-media average.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _bucket_group_metrics,
    _build_core_metrics,
    _build_daily_series,
    _build_media_rows,
    _build_project_combo_rows,
    _build_project_summary_rows,
    _natural_rate,
    PeriodBucket,
)

BUCKET = PeriodBucket("2026-09-19", date(2026, 9, 19), date(2026, 9, 19))

# Two games, each with organic plus paid traffic.  100 of the 160 new users
# arrive organically, so the report's 自然新增% is 100/160 = 62.5%.
FRAME_USERS = 160
FRAME_ORGANIC = 100


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "report_date": ["2026-09-19"] * 5,
            "主游戏": ["A", "A", "A", "B", "B"],
            "渠道商": ["c1", "c1", "c1", "c1", "c1"],
            "媒体": ["自然量", "今日头条", "广点通", "自然量", "今日头条"],
            "返点后消耗": [0.0, 300.0, 100.0, 0.0, 200.0],
            "新增进入": [60, 30, 10, 40, 20],
            "1日充值": [120.0, 90.0, 20.0, 80.0, 40.0],
            "充值流水": [200.0, 150.0, 30.0, 120.0, 60.0],
        }
    )


def _config(**overrides) -> DailyReportConfig:
    base: dict = {
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


def test_natural_rate_matches_the_saved_metric_expression() -> None:
    """SUM(自然量新增) / SUM(新增进入), as a 0~1 share."""
    assert _natural_rate(_frame(), _config()) == FRAME_ORGANIC / FRAME_USERS


def test_natural_rate_is_null_when_the_ratio_is_undefined() -> None:
    """No denominator, or no media column, must not read as "no organic"."""
    users_only = pd.DataFrame({"新增进入": [5, 5]})
    assert _natural_rate(users_only, _config()) is None  # 媒体 not mapped

    no_users = pd.DataFrame({"媒体": ["自然量"], "新增进入": [0]})
    assert _natural_rate(no_users, _config()) is None  # 0 / 0

    unmapped = pd.DataFrame({"媒体": ["自然量"], "新增进入": [7]})
    assert _natural_rate(unmapped, _config(ad_channel_column="")) is None


def test_natural_rate_follows_the_configured_organic_label() -> None:
    frame = pd.DataFrame({"媒体": ["Organic", "paid"], "新增进入": [3, 7]})

    assert _natural_rate(frame, _config()) == 0.0  # default label not present
    assert _natural_rate(frame, _config(natural_media_label="Organic")) == 0.3


def test_organic_share_is_not_a_per_media_average() -> None:
    """Every paid media row reads 0%; the report share is a sum over rows."""
    frame = _frame()

    media = {
        row["channel"]: row
        for row in _build_media_rows(frame, frame.iloc[0:0], _config())
    }

    # 自然量 itself is dropped from the paid-media view (it carries no spend),
    # so every listed media row is a paid one and reads 0%.
    assert media["今日头条"]["natural_rate"] == 0.0
    assert media["广点通"]["natural_rate"] == 0.0
    assert _natural_rate(frame, _config()) == FRAME_ORGANIC / FRAME_USERS
    assert _natural_rate(frame, _config()) != 0.0


def test_core_metrics_carry_the_natural_share() -> None:
    core = _build_core_metrics(_frame(), _config(), DailyReportContext())

    assert core["natural_rate"] == FRAME_ORGANIC / FRAME_USERS
    # The additive core metrics stay untouched by the new ratio.
    assert core["new_users"] == FRAME_USERS
    assert core["spend"] == 600.0


def test_core_metrics_report_an_undefined_natural_share_as_null() -> None:
    empty = _build_core_metrics(pd.DataFrame(), _config(), DailyReportContext())

    assert empty["natural_rate"] is None


def test_natural_share_flows_through_every_view() -> None:
    frame = _frame()
    config = _config()
    overall = FRAME_ORGANIC / FRAME_USERS

    core = _build_core_metrics(frame, config, DailyReportContext())
    assert core["natural_rate"] == overall

    series = _build_daily_series(
        frame, config, DailyReportContext(), "report_date", [BUCKET]
    )
    assert series[0]["natural_rate"] == overall

    summary = {
        row["project"]: row
        for row in _build_project_summary_rows(frame, frame.iloc[0:0], config)
    }
    assert summary["A"]["natural_rate"] == 60 / 100  # game A: 60 of 100 users
    assert summary["B"]["natural_rate"] == 40 / 60  # game B: 40 of 60 users

    combos = {
        row["project"]: row
        for row in _build_project_combo_rows(
            frame,
            "report_date",
            frame,
            frame.iloc[0:0],
            [BUCKET],
            config,
            DailyReportContext(),
        )
    }
    assert combos["A"]["natural_rate"] == 60 / 100
    # The per-combo daily rows expose the same field as the parent row.
    assert combos["A"]["daily"][0]["natural_rate"] == 60 / 100

    grouped = _bucket_group_metrics(frame, ["主游戏"], config)
    assert grouped[("A",)]["natural_rate"] == 60 / 100
    assert grouped[("B",)]["natural_rate"] == 40 / 60


def test_project_rows_carry_the_previous_periods_natural_share() -> None:
    """The 环比 comparison needs the previous period on the same footing."""
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-19", "2026-09-19", "2026-09-18"],
            "主游戏": ["A", "A", "A"],
            "渠道商": ["c1", "c1", "c1"],
            "媒体": ["自然量", "今日头条", "今日头条"],
            "返点后消耗": [0.0, 500.0, 500.0],
            "新增进入": [25, 75, 100],
            "1日充值": [50.0, 150.0, 200.0],
            "充值流水": [80.0, 260.0, 300.0],
        }
    )
    config = _config()
    current = frame[frame["report_date"] == "2026-09-19"]
    previous = frame[frame["report_date"] == "2026-09-18"]

    rows = _build_project_summary_rows(current, previous, config)

    assert rows[0]["natural_rate"] == 25 / 100
    assert rows[0]["prev"]["natural_rate"] == 0.0  # paid-only the day before


def test_natural_share_is_recomputed_over_the_merged_datasets() -> None:
    """A multi-dataset briefing aggregates the union, so the share is too."""
    first = pd.DataFrame(
        {
            "report_date": ["2026-09-19"],
            "主游戏": ["A"],
            "渠道商": ["c1"],
            "媒体": ["自然量"],
            "返点后消耗": [0.0],
            "新增进入": [10],
            "1日充值": [20.0],
            "充值流水": [30.0],
        }
    )
    second = pd.DataFrame(
        {
            "report_date": ["2026-09-19"],
            "主游戏": ["B"],
            "渠道商": ["system"],
            # Each dataset normalizes its own organic source onto the shared
            # label in SQL (``pad_id = 0`` / ``Rastar自然量``), so the merged
            # frame carries one label for both.
            "媒体": ["自然量"],
            "返点后消耗": [0.0],
            "新增进入": [30],
            "1日充值": [60.0],
            "充值流水": [90.0],
        }
    )
    merged = pd.concat([first, second], ignore_index=True)

    assert _natural_rate(merged, _config()) == 1.0  # 40 organic of 40
    core = _build_core_metrics(merged, _config(), DailyReportContext())
    assert core["natural_rate"] == 1.0
