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

"""Selection and ordering of the 主游戏 × 渠道商 rows.

A combo is listed when it ranks in the top N by spend **or** by 充值流水.  The
listed rows then group a game's channels together, order the games by their
full spend, and keep the channels inside a game spend-descending.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _build_project_combo_rows,
    _build_project_summary_rows,
    PeriodBucket,
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
        "top_projects_count": 10,
    }
    base.update(overrides)
    return DailyReportConfig(**base)


# (project, channel, spend, recharge)
LAYOUT = [
    ("A", "taptap", 120.0, 30.0),
    ("A", "douyin", 100.0, 20.0),
    ("A", "huawei", 90.0, 10.0),
    ("B", "wechat", 140.0, 35.0),
    ("C", "ios", 150.0, 40.0),
    # Small ad spend, by far the biggest 充值流水: only the recharge cut keeps it.
    ("D", "organic", 10.0, 500.0),
]


def _frame(rows=LAYOUT) -> pd.DataFrame:
    return pd.DataFrame(
        {
            "report_date": ["2026-09-19"] * len(rows),
            "主游戏": [r[0] for r in rows],
            "渠道商": [r[1] for r in rows],
            "返点后消耗": [r[2] for r in rows],
            "新增进入": [10] * len(rows),
            "1日充值": [1.0] * len(rows),
            "充值流水": [r[3] for r in rows],
        }
    )


def _bucket() -> PeriodBucket:
    return PeriodBucket("2026-09-19", date(2026, 9, 19), date(2026, 9, 19))


def _rows(top_projects_count: int = 10, frame: pd.DataFrame | None = None):
    data = frame if frame is not None else _frame()
    return _build_project_combo_rows(
        data,
        "report_date",
        data,
        data.iloc[0:0],
        [_bucket()],
        _config(top_projects_count=top_projects_count),
        DailyReportContext(),
    )


def _pairs(rows) -> list[tuple[str, str]]:
    return [(r["project"], r["channel"]) for r in rows]


def test_rows_group_each_game_and_order_games_by_full_spend() -> None:
    # A = 310 (all channels), C = 150, B = 140, D = 10.
    assert _pairs(_rows()) == [
        ("A", "taptap"),
        ("A", "douyin"),
        ("A", "huawei"),
        ("C", "ios"),
        ("B", "wechat"),
        ("D", "organic"),
    ]


def test_channels_inside_a_game_stay_spend_descending() -> None:
    rows = _rows()
    spends = {
        game: [r["spend"] for r in rows if r["project"] == game]
        for game in ("A", "B", "C", "D")
    }
    assert spends["A"] == [120.0, 100.0, 90.0]
    assert spends["B"] == [140.0]
    assert spends["C"] == [150.0]
    assert spends["D"] == [10.0]


def test_row_ranking_only_by_recharge_is_no_longer_admitted() -> None:
    """Selection is spend-only: a revenue-only combo does not make the list."""
    frame = _frame(
        [
            ("O", "ios", 40.0, 5.0),
            ("Z", "ios", 0.0, 900.0),
            ("Y", "ios", 30.0, 1.0),
        ]
    )
    rows = _build_project_combo_rows(
        frame,
        "report_date",
        frame,
        frame.iloc[0:0],
        [_bucket()],
        _config(top_projects_count=10),
        DailyReportContext(),
    )

    assert _pairs(rows) == [("O", "ios"), ("Y", "ios")]


def test_zero_spend_rows_never_fill_the_cut() -> None:
    frame = _frame([("O", "ios", 40.0, 5.0), ("Z", "ios", 0.0, 1.0)])
    rows = _build_project_combo_rows(
        frame,
        "report_date",
        frame,
        frame.iloc[0:0],
        [_bucket()],
        _config(top_projects_count=10),
        DailyReportContext(),
    )

    assert _pairs(rows) == [("O", "ios")]


def test_exempt_channel_follows_a_listed_spending_game() -> None:
    """``third`` rides along when its game already has a spending row listed."""
    frame = _frame(
        [
            ("O", "ios", 40.0, 5.0),
            ("O", "third", 0.0, 900.0),  # would top any recharge ranking
            ("Z", "ios", 0.0, 1.0),
            ("Z", "third", 0.0, 800.0),
        ]
    )
    rows = _build_project_combo_rows(
        frame,
        "report_date",
        frame,
        frame.iloc[0:0],
        [_bucket()],
        _config(top_projects_count=1, uncapped_channels=["third"]),
        DailyReportContext(),
    )

    # O/ios is the only spend-bearing combo; O/third follows it, Z's rows are
    # both gone (Z never spends and its recharge no longer admits anything).
    assert _pairs(rows) == [("O", "ios"), ("O", "third")]


def test_group_order_uses_the_games_full_spend_not_the_listed_rows() -> None:
    """A game whose biggest channels fall outside both cuts still ranks by its
    full spend, so the table matches the 主游戏明细 chart."""
    frame = _frame(
        [
            ("A", "taptap", 120.0, 1.0),
            ("A", "douyin", 100.0, 1.0),
            ("A", "huawei", 90.0, 1.0),
            ("C", "ios", 150.0, 1.0),
            ("B", "wechat", 140.0, 1.0),
        ]
    )
    rows = _rows(top_projects_count=3, frame=frame)

    # Listed combos are C/ios 150, B/wechat 140, A/taptap 120 — but game A's full
    # total (310) leads, so A comes first despite its listed row being smallest.
    assert [(r["project"], r["channel"], r["spend"]) for r in rows] == [
        ("A", "taptap", 120.0),
        ("C", "ios", 150.0),
        ("B", "wechat", 140.0),
    ]


def test_project_view_keeps_every_spending_game_by_spend_desc() -> None:
    """The 95% accumulation is gone: all spending games are listed, biggest
    first, and zero-spend games are left out."""
    frame = _frame(
        [
            ("Big", "ios", 1000.0, 10.0),
            ("Small", "ios", 1.0, 1.0),
            ("Idle", "third", 0.0, 5.0),
        ]
    )
    rows = _build_project_summary_rows(frame, frame.iloc[0:0], _config())

    assert [r["project"] for r in rows] == ["Big", "Small"]
    assert [r["spend"] for r in rows] == [1000.0, 1.0]


def test_project_rows_carry_a_whole_game_daily_series() -> None:
    """The merged ("不分客户端") view needs a game's own daily rows, aggregated
    across every channel — not just the channels the cut happened to list."""
    frame = _frame([("A", "taptap", 100.0, 5.0), ("A", "ios", 50.0, 7.0)])
    rows = _build_project_summary_rows(
        frame,
        frame.iloc[0:0],
        _config(),
        frame,
        "report_date",
        [_bucket()],
        DailyReportContext(),
    )

    assert len(rows) == 1
    assert rows[0]["project"] == "A"
    assert rows[0]["spend"] == 150.0  # both channels
    assert [d["date"] for d in rows[0]["daily"]] == ["2026-09-19"]
    assert rows[0]["daily"][0]["spend"] == 150.0
    assert rows[0]["daily"][0]["recharge"] == 12.0
