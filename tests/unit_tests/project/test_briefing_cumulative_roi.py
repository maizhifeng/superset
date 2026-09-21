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

"""累计ROI / 流水ROI.

Both share ROI1's spend denominator and differ only in the numerator: the
account's lifetime recharge (``累计充值``) and the period's own recharge flow
(``充值流水``).  They mirror the datasets' saved ``累计roi`` metric and its
flow counterpart, so the invariants pinned here are the numerator each one
reads and that both stay additive-over-spend rather than averages of ratios.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _build_core_metrics,
    _build_daily_series,
    _build_project_combo_rows,
    _canonicalize_frame,
    _ratio_fields,
    PeriodBucket,
    suggest_field_map,
)

BUCKET = PeriodBucket("2026-09-20", date(2026, 9, 20), date(2026, 9, 20))


def _frame() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "report_date": ["2026-09-20", "2026-09-20"],
            "主游戏": ["A", "B"],
            "渠道商": ["c1", "c1"],
            "平台": ["oversea", "mobile"],
            "返点后消耗": [400.0, 100.0],
            "新增进入": [100, 50],
            # Lifetime recharge is a different column from the period flow.
            "累计充值": [600.0, 50.0],
            "充值流水": [900.0, 100.0],
            "1日充值": [200.0, 40.0],
        }
    )


def _config(**overrides) -> DailyReportConfig:
    base: dict[str, Any] = {
        "date_column": "report_date",
        "project_column": "主游戏",
        "channel_column": "渠道商",
        "platform_column": "平台",
        "spend_column": "返点后消耗",
        "new_users_column": "新增进入",
        "cpa_column": "返点后消耗",
        "recharge_column": "充值流水",
        "cumulative_recharge_column": "累计充值",
        "ltv_columns": ("1日充值",),
        "roi_columns": ("1日充值",),
        "ltv_weighted_average": False,
        "roi_weighted_average": False,
    }
    base.update(overrides)
    return DailyReportConfig(**base)


def test_ratios_use_the_right_numerator_over_spend() -> None:
    fields = _ratio_fields(_frame(), _config())

    # 累计充值 650 / 消耗 500, 充值流水 1000 / 消耗 500.
    assert fields["roi_cum"] == 650.0 / 500.0
    assert fields["roi_flow"] == 1000.0 / 500.0
    # ROI1 keeps reading the backdated 1日充值 numerator, not either of these.
    assert fields["roi1"] == 240.0 / 500.0


def test_ratios_are_additive_over_spend_not_average_of_ratios() -> None:
    """A segment's own ratio must not pull the total toward itself."""
    fields = _ratio_fields(_frame(), _config())

    # The plain mean of the per-game ratios (1.5 and 0.5) would be 1.0.
    assert fields["roi_cum"] == 1.3
    assert fields["roi_cum"] != (600.0 / 400.0 + 50.0 / 100.0) / 2


def test_ratios_are_null_when_spend_is_zero() -> None:
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-20"],
            "主游戏": ["A"],
            "渠道商": ["c1"],
            "返点后消耗": [0.0],
            "新增进入": [10],
            "累计充值": [50.0],
            "充值流水": [80.0],
            "1日充值": [20.0],
        }
    )
    fields = _ratio_fields(frame, _config())

    # No spend means no denominator: undefined, not "zero return".
    assert fields["roi_cum"] is None
    assert fields["roi_flow"] is None


def test_an_unmapped_numerator_drops_its_key() -> None:
    """Matching 1日付费率/2日留存率: no column, no key."""
    frame = _frame()

    no_cum = _ratio_fields(frame, _config(cumulative_recharge_column=""))
    assert "roi_cum" not in no_cum
    assert no_cum["roi_flow"] == 2.0  # the flow one is independent

    no_flow = _ratio_fields(frame, _config(recharge_column=""))
    assert "roi_flow" not in no_flow
    assert no_flow["roi_cum"] == 1.3


def test_core_and_bucket_series_carry_both_ratios() -> None:
    frame = _frame()
    config = _config()

    core = _build_core_metrics(frame, config, DailyReportContext())
    assert core["roi_cum"] == 650.0 / 500.0
    assert core["roi_flow"] == 1000.0 / 500.0

    series = _build_daily_series(
        frame, config, DailyReportContext(), "report_date", [BUCKET]
    )
    assert series[0]["roi_cum"] == 650.0 / 500.0
    assert series[0]["roi_flow"] == 1000.0 / 500.0


def test_combo_rows_carry_both_ratios_per_game() -> None:
    frame = _frame()
    rows = {
        row["project"]: row
        for row in _build_project_combo_rows(
            frame,
            "report_date",
            frame,
            frame.iloc[0:0],
            [BUCKET],
            _config(),
            DailyReportContext(),
        )
    }

    assert rows["A"]["roi_cum"] == 600.0 / 400.0
    assert rows["A"]["roi_flow"] == 900.0 / 400.0
    assert rows["B"]["roi_cum"] == 50.0 / 100.0
    # The per-game daily rows disclose the same columns as the parent row.
    assert rows["A"]["daily"][0]["roi_cum"] == 600.0 / 400.0
    assert rows["A"]["daily"][0]["roi_flow"] == 900.0 / 400.0


def test_multi_dataset_frames_align_the_lifetime_recharge_column() -> None:
    canonical = {"cumulative_recharge_column": "累计充值", "spend_column": "返点后消耗"}
    own = {"cumulative_recharge_column": "total_paid_money", "spend_column": "cost"}
    frame = pd.DataFrame({"total_paid_money": [10.0], "cost": [5.0]})

    out = _canonicalize_frame(frame, own, canonical)

    assert "累计充值" in out.columns
    assert out["累计充值"].tolist() == [10.0]


def test_multi_dataset_zero_fills_a_missing_lifetime_recharge_column() -> None:
    canonical = {
        "cumulative_recharge_column": "累计充值",
        "spend_column": "返点后消耗",
    }
    out = _canonicalize_frame(
        pd.DataFrame({"返点后消耗": [5.0]}),
        {"cumulative_recharge_column": ""},
        canonical,
    )

    # Zero-filled like the other additive numerators, so a source without the
    # column reports 0 rather than shifting the ratio's meaning.
    assert out["累计充值"].tolist() == [0.0]
    assert _ratio_fields(out, _config())["roi_cum"] == 0.0


def test_suggest_field_map_finds_the_lifetime_recharge_column() -> None:
    mapping = suggest_field_map(["累计充值", "充值流水", "返点后消耗", "新增进入"])

    assert mapping["cumulative_recharge_column"] == "累计充值"
    assert mapping["recharge_column"] == "充值流水"
    # A dataset without the column must not borrow the flow one for it.
    without = suggest_field_map(["充值流水", "返点后消耗"])
    assert without["cumulative_recharge_column"] == ""
