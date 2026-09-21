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

"""分地区: the region subdivision of the 主游戏 × 渠道商 table.

The region is deliberately *not* part of the channel view's group key, so the
default table keeps listing whole channels no matter what the dataset maps.
These tests pin that separation and the invariant that makes the switch safe:
subdividing must add rows without moving any money.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _build_project_combo_rows,
    _build_project_region_rows,
    PeriodBucket,
    suggest_field_map,
)

BUCKET = PeriodBucket("2026-09-20", date(2026, 9, 20), date(2026, 9, 20))


def _frame() -> pd.DataFrame:
    """Three (游戏, 渠道) combos; one of them split across two regions."""
    return pd.DataFrame(
        {
            "report_date": ["2026-09-20"] * 4,
            "主游戏": ["A", "A", "B", "A"],
            "渠道商": ["c1", "c1", "c2", "c2"],
            "地区": ["TH", "ID", "TH", "TH"],
            "返点后消耗": [400.0, 100.0, 200.0, 50.0],
            "新增进入": [100, 50, 80, 10],
            "1日充值": [200.0, 40.0, 80.0, 10.0],
            "充值流水": [900.0, 100.0, 300.0, 20.0],
            "累计充值": [600.0, 50.0, 200.0, 10.0],
        }
    )


def _config(**overrides: Any) -> DailyReportConfig:
    base: dict[str, Any] = {
        "date_column": "report_date",
        "project_column": "主游戏",
        "channel_column": "渠道商",
        "region_column": "地区",
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


def _combos(frame: pd.DataFrame, config: DailyReportConfig, **ctx_kwargs: Any):
    return _build_project_combo_rows(
        frame,
        "report_date",
        frame,
        frame.iloc[0:0],
        [BUCKET],
        config,
        DailyReportContext(**ctx_kwargs),
    )


def _regions(
    frame: pd.DataFrame,
    config: DailyReportConfig,
    combos: list[dict[str, Any]],
    **ctx_kwargs: Any,
):
    return _build_project_region_rows(
        frame,
        "report_date",
        frame,
        frame.iloc[0:0],
        [BUCKET],
        config,
        DailyReportContext(**ctx_kwargs),
        combos,
    )


def test_the_channel_view_ignores_the_region_column() -> None:
    """Mapping a region must not re-split the default table."""
    rows = _combos(_frame(), _config())

    # Games lead by total spend and keep their channels adjacent, so A (550)
    # comes before B (200) with both of A's channels together.
    assert [(r["project"], r["channel"]) for r in rows] == [
        ("A", "c1"),
        ("A", "c2"),
        ("B", "c2"),
    ]
    # A region-mapped dataset still leaves the channel rows region-less, which
    # is what keeps the 地区 column hidden until 分地区 is switched on.
    assert all(r["region"] == "" for r in rows)
    assert rows[0]["spend"] == 500.0  # the two TH/ID rows rolled into (A, c1)


def test_region_rows_subdivide_each_listed_combo() -> None:
    frame = _frame()
    config = _config()
    combos = _combos(frame, config)

    regions = _regions(frame, config, combos)

    assert [(r["project"], r["channel"], r["region"]) for r in regions] == [
        ("A", "c1", "TH"),
        ("A", "c1", "ID"),
        ("A", "c2", "TH"),
        ("B", "c2", "TH"),
    ]


def test_region_rows_sum_back_to_their_parent_combo() -> None:
    """The switch adds rows; it must not move any spend or users."""
    frame = _frame()
    config = _config()
    combos = _combos(frame, config)
    regions = _regions(frame, config, combos)

    for combo in combos:
        members = [
            r
            for r in regions
            if r["project"] == combo["project"] and r["channel"] == combo["channel"]
        ]
        assert members, combo["project"]
        for additive in ("spend", "new_users", "recharge"):
            assert sum(m[additive] for m in members) == combo[additive]
    # And the subdivision covers the same whole.
    assert sum(r["spend"] for r in regions) == sum(c["spend"] for c in combos)
    assert sum(r["new_users"] for r in regions) == sum(c["new_users"] for c in combos)


def test_region_rows_only_cover_the_combos_the_cut_kept() -> None:
    """A combo dropped by the channel view's Top-N must not reappear."""
    frame = _frame()
    config = _config()
    combos = _combos(frame, config, top_projects_count=1)
    assert len(combos) == 1  # only the biggest combo survives the cut

    regions = _regions(frame, config, combos, top_projects_count=1)

    assert {(r["project"], r["channel"]) for r in regions} == {("A", "c1")}
    assert len(regions) == 2  # TH + ID, not the other games


def test_region_rows_follow_the_parent_tables_order() -> None:
    frame = _frame()
    config = _config()
    combos = _combos(frame, config)

    regions = _regions(frame, config, combos)

    order = [(r["project"], r["channel"]) for r in combos]
    seen = [(r["project"], r["channel"]) for r in regions]
    # Each combo's own rows stay contiguous and inherit the parent's sequence.
    collapsed: list[tuple[str, str]] = []
    for pair in seen:
        if not collapsed or collapsed[-1] != pair:
            collapsed.append(pair)
    assert collapsed == order
    # ...and inside a combo the regions are spend-descending.
    assert [r["region"] for r in regions[:2]] == ["TH", "ID"]


def test_a_region_that_neither_spent_nor_earned_is_hidden() -> None:
    """Zero regions are noise in the split view but still count in the roll-up."""
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-20"] * 3,
            "主游戏": ["A", "A", "A"],
            "渠道商": ["c1", "c1", "c1"],
            "地区": ["TH", "ID", "AE"],
            "返点后消耗": [400.0, 100.0, 0.0],
            "新增进入": [100, 50, 7],
            "1日充值": [200.0, 40.0, 0.0],
            "充值流水": [900.0, 100.0, 0.0],
            "累计充值": [600.0, 50.0, 0.0],
        }
    )
    config = _config()
    combos = _combos(frame, config)

    regions = _regions(frame, config, combos)

    assert [r["region"] for r in regions] == ["TH", "ID"]  # AE dropped
    # ...yet its 7 users still count towards the combo the channel view shows,
    # which is what "只在分地区关闭时纳入汇总" means.
    assert len(combos) == 1
    assert combos[0]["spend"] == 500.0
    assert combos[0]["new_users"] == 157
    assert sum(r["new_users"] for r in regions) == 150
    assert combos[0]["new_users"] - sum(r["new_users"] for r in regions) == 7


def test_a_region_with_only_recharge_survives_the_filter() -> None:
    """The rule drops both-zero rows, not zero-spend ones."""
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-20"] * 2,
            "主游戏": ["A", "A"],
            "渠道商": ["c1", "c1"],
            "地区": ["TH", "TH2"],
            "返点后消耗": [400.0, 0.0],
            "新增进入": [100, 5],
            "1日充值": [200.0, 30.0],
            "充值流水": [900.0, 30.0],
            "累计充值": [600.0, 10.0],
        }
    )
    config = _config()

    regions = _regions(frame, config, _combos(frame, config))

    assert [r["region"] for r in regions] == ["TH", "TH2"]
    assert regions[1]["spend"] == 0.0
    assert regions[1]["recharge"] == 30.0


def test_a_region_with_only_spend_survives_the_filter() -> None:
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-20"] * 2,
            "主游戏": ["A", "A"],
            "渠道商": ["c1", "c1"],
            "地区": ["TH", "TH2"],
            "返点后消耗": [400.0, 60.0],
            "新增进入": [100, 15],
            "1日充值": [200.0, 0.0],
            "充值流水": [900.0, 0.0],
            "累计充值": [600.0, 0.0],
        }
    )
    config = _config()

    regions = _regions(frame, config, _combos(frame, config))

    assert [r["region"] for r in regions] == ["TH", "TH2"]
    assert regions[1]["recharge"] == 0.0


def test_region_rows_carry_the_ratio_fields() -> None:
    frame = _frame()
    config = _config()
    regions = _regions(frame, config, _combos(frame, config))
    th = regions[0]

    assert th["region"] == "TH"
    assert th["spend"] == 400.0
    assert th["new_users"] == 100
    assert th["ltv1"] == 200.0 / 100
    assert th["roi1"] == 200.0 / 400.0
    assert th["roi_cum"] == 600.0 / 400.0
    assert th["roi_flow"] == 900.0 / 400.0


def test_region_rows_are_empty_without_a_mapped_region() -> None:
    frame = _frame()
    combos = _combos(frame, _config())

    assert _regions(frame, _config(region_column=""), combos) == []
    assert _regions(frame, _config(region_column="并不存在的列"), combos) == []
    # No combos to subdivide means nothing to build.
    assert _regions(frame, _config(), []) == []


def test_region_rows_carry_the_previous_period_split_by_region() -> None:
    frame = pd.DataFrame(
        {
            "report_date": ["2026-09-20", "2026-09-20", "2026-09-19"],
            "主游戏": ["A", "A", "A"],
            "渠道商": ["c1", "c1", "c1"],
            "地区": ["TH", "ID", "TH"],
            "返点后消耗": [400.0, 100.0, 300.0],
            "新增进入": [100, 50, 90],
            "1日充值": [200.0, 40.0, 60.0],
            "充值流水": [900.0, 100.0, 200.0],
            "累计充值": [600.0, 50.0, 300.0],
        }
    )
    config = _config()
    current = frame[frame["report_date"] == "2026-09-20"]
    previous = frame[frame["report_date"] == "2026-09-19"]
    combos = _build_project_combo_rows(
        frame, "report_date", current, previous, [BUCKET], config, DailyReportContext()
    )

    regions = _build_project_region_rows(
        frame,
        "report_date",
        current,
        previous,
        [BUCKET],
        config,
        DailyReportContext(),
        combos,
    )

    by_region = {r["region"]: r for r in regions}
    assert by_region["TH"]["prev"]["spend"] == 300.0
    # The previous period only had TH, so ID's 环比 is undefined, not zero.
    assert by_region["ID"]["prev"].get("spend", 0) == 0


def test_suggest_field_map_finds_the_region_column() -> None:
    mapping = suggest_field_map(["地区", "主游戏", "渠道商", "返点后消耗"])

    assert mapping["region_column"] == "地区"
    # A dataset without a region must not borrow an unrelated column.
    assert suggest_field_map(["主游戏", "渠道商"])["region_column"] == ""
