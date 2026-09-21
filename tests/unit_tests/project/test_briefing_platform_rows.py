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

"""分平台核心指标 (the 核心指标速览 platform breakdown).

The headline stat band and its 查看数据表 table have to agree, so the key
invariant pinned here is that a platform row's additive metrics sum back to the
band's totals — and that no platform is dropped to make that true.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _build_core_metrics,
    _build_platform_rows,
    _canonicalize_frame,
    PeriodBucket,
    suggest_field_map,
)

BUCKET = PeriodBucket("2026-09-20", date(2026, 9, 20), date(2026, 9, 20))


def _frame() -> pd.DataFrame:
    """One report day split across three client platforms."""
    return pd.DataFrame(
        {
            "report_date": ["2026-09-20"] * 4,
            "平台": ["oversea", "mobile", "mini_game", "oversea"],
            "主游戏": ["A", "A", "B", "B"],
            "渠道商": ["c1", "c1", "c1", "c2"],
            "媒体": ["自然量", "今日头条", "自然量", "广点通"],
            "返点后消耗": [400.0, 100.0, 60.0, 40.0],
            "新增进入": [100, 50, 80, 20],
            "1日充值": [200.0, 90.0, 40.0, 10.0],
            "充值流水": [300.0, 120.0, 70.0, 20.0],
        }
    )


def _config(**overrides) -> DailyReportConfig:
    base: dict[str, Any] = {
        "date_column": "report_date",
        "project_column": "主游戏",
        "channel_column": "渠道商",
        "ad_channel_column": "媒体",
        "platform_column": "平台",
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


def test_platform_rows_are_sorted_by_spend_and_split_every_platform() -> None:
    rows = _build_platform_rows(_frame(), _frame().iloc[0:0], _config())

    assert [r["platform"] for r in rows] == ["oversea", "mobile", "mini_game"]
    by_platform = {r["platform"]: r for r in rows}
    assert by_platform["oversea"]["spend"] == 440.0  # two oversea rows rolled up
    assert by_platform["oversea"]["new_users"] == 120
    assert by_platform["mobile"]["spend"] == 100.0


def test_platform_rows_sum_back_to_the_headline_band() -> None:
    """The table must add up to the stat band it sits under."""
    frame = _frame()
    config = _config()
    core = _build_core_metrics(frame, config, DailyReportContext())
    rows = _build_platform_rows(frame, frame.iloc[0:0], config)

    for additive in ("spend", "new_users", "recharge"):
        assert sum(r[additive] for r in rows) == core[additive]
    # spend 600 + new users 250 over the whole day.
    assert core["spend"] == 600.0
    assert core["new_users"] == 250


def test_platform_rows_carry_the_ratio_fields_the_band_shows() -> None:
    rows = _build_platform_rows(_frame(), _frame().iloc[0:0], _config())
    oversea = next(r for r in rows if r["platform"] == "oversea")

    # oversea rolls up two rows: spend 440, users 120, 1日充值 210.
    # 自然新增%: only the 自然量 row (100 users) is organic.
    assert oversea["natural_rate"] == 100 / 120
    assert oversea["cpa"] == 440.0 / 120
    assert oversea["ltv1"] == 210.0 / 120
    assert oversea["roi1"] == 210.0 / 440.0
    # 充值流水 is additive, so it is the plain sum rather than a ratio.
    assert oversea["recharge"] == 320.0


def test_platform_rows_carry_the_previous_periods_figures() -> None:
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-20", "2026-09-19"],
            "平台": ["oversea", "oversea"],
            "主游戏": ["A", "A"],
            "渠道商": ["c1", "c1"],
            "媒体": ["自然量", "今日头条"],
            "返点后消耗": [400.0, 500.0],
            "新增进入": [100, 80],
            "1日充值": [200.0, 50.0],
            "充值流水": [300.0, 90.0],
        }
    )
    current = frame[frame["report_date"] == "2026-09-20"]
    previous = frame[frame["report_date"] == "2026-09-19"]

    rows = _build_platform_rows(current, previous, _config())

    assert rows[0]["prev"]["spend"] == 500.0
    assert rows[0]["prev"]["new_users"] == 80
    assert rows[0]["prev"]["natural_rate"] == 0.0


def test_a_platform_with_no_spend_is_still_listed() -> None:
    """Unlike the media view, platform rows are a fixed slice of the business.

    Dropping the spend-less platform would make the table's rows stop adding
    up to the headline without saying so.
    """
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-20", "2026-09-20"],
            "平台": ["oversea", "oversea"],
            "主游戏": ["A", "A"],
            "渠道商": ["c1", "c1"],
            "媒体": ["今日头条", "自然量"],
            "返点后消耗": [400.0, 0.0],
            "新增进入": [100, 20],
            "1日充值": [200.0, 40.0],
            "充值流水": [300.0, 60.0],
        }
    )

    rows = _build_platform_rows(frame, frame.iloc[0:0], _config())

    # One row per platform, not one per (platform, media).
    assert len(rows) == 1
    assert rows[0]["spend"] == 400.0
    assert rows[0]["new_users"] == 120


def test_platform_rows_are_empty_when_the_column_is_unmapped() -> None:
    frame = _frame()

    assert (
        _build_platform_rows(frame, frame.iloc[0:0], _config(platform_column="")) == []
    )
    assert (
        _build_platform_rows(
            frame, frame.iloc[0:0], _config(platform_column="并不存在的列")
        )
        == []
    )
    assert _build_platform_rows(pd.DataFrame(), pd.DataFrame(), _config()) == []


def test_suggest_field_map_finds_the_platform_column() -> None:
    assert (
        suggest_field_map(["平台", "主游戏", "新增进入"])["platform_column"] == "平台"
    )
    assert (
        suggest_field_map(["platform", "game", "new_users"])["platform_column"]
        == "platform"
    )
    # Unrelated columns must not be mistaken for the platform split.
    assert suggest_field_map(["主游戏", "新增进入"])["platform_column"] == ""


def test_multi_dataset_frames_align_on_the_platform_column() -> None:
    """A second dataset's own platform column is renamed onto the canonical one.

    The UA datasets happen to agree on ``平台`` today, but the multi-dataset
    merge renames every dimension through the per-dataset map, so a differently
    named column has to survive the merge rather than silently vanish.
    """
    canonical = {"platform_column": "平台", "spend_column": "返点后消耗"}
    own = {"platform_column": "client_os", "spend_column": "cost"}
    frame = pd.DataFrame(
        {
            "client_os": ["oversea"],
            "cost": [10.0],
            "date_column": ["2026-09-20"],
        }
    )

    out = _canonicalize_frame(frame, own, canonical)

    assert "平台" in out.columns
    assert out["平台"].tolist() == ["oversea"]
    assert "client_os" not in out.columns


def test_multi_dataset_adds_the_platform_column_when_a_source_lacks_it() -> None:
    """A dataset with no platform column gets an empty one, not a missing one."""
    canonical = {"platform_column": "平台"}
    out = _canonicalize_frame(
        pd.DataFrame({"x": [1]}), {"platform_column": ""}, canonical
    )

    assert "平台" in out.columns
    assert out["平台"].tolist() == [""]
