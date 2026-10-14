"""§1「关键指标波动」: metric gating and factor decomposition.

A metric is listed when its 环比 clears ``FLUCTUATION_MIN_PCT`` on a base above
``baseline_thresholds``; additive metrics decompose the absolute 增量, ratio
metrics the move of the ratio (费率效应 + 结构效应), and every dimension's
contributions add up to the metric's change exactly.
"""

from __future__ import annotations

from typing import Any

import pandas as pd
import pytest

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _build_core_metrics,
    _build_fluctuations,
)


def _config(**overrides: Any) -> DailyReportConfig:
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
        # 测试数据很小，用显式阈值而不是线上默认的 1 万/1000。
        "baseline_thresholds": {"返点后消耗": 100.0, "新增进入": 10.0},
        "top_projects_count": 10,
    }
    base.update(overrides)
    return DailyReportConfig(**base)


def _frame(rows: list[dict[str, Any]]) -> pd.DataFrame:
    return pd.DataFrame([{"report_date": "2026-09-19", **row} for row in rows])


def _entry(entries: list[dict[str, Any]], key: str) -> dict[str, Any]:
    match = next((e for e in entries if e["key"] == key), None)
    assert match is not None, f"{key} missing from {[e['key'] for e in entries]}"
    return match


def _dimension(entry: dict[str, Any], key: str) -> dict[str, Any]:
    match = next((d for d in entry["dimensions"] if d["key"] == key), None)
    keys = [d["key"] for d in entry["dimensions"]]
    assert match is not None, f"{key} missing from {keys}"
    return match


def _contribution_sum(entry: dict[str, Any], key: str) -> float:
    return sum(item["contribution"] for item in _dimension(entry, key)["items"])


# ---- 加法指标 -------------------------------------------------------------- #

ADDITIVE_CUR = [
    {
        "平台": "A",
        "媒体": "m1",
        "主游戏": "G1",
        "返点后消耗": 150.0,
        "新增进入": 30,
    },
    {
        "平台": "B",
        "媒体": "m2",
        "主游戏": "G2",
        "返点后消耗": 90.0,
        "新增进入": 30,
    },
    {
        "平台": "C",
        "媒体": "m1",
        "主游戏": "G1",
        "返点后消耗": 60.0,
        "新增进入": 30,
    },
]
ADDITIVE_PREV = [
    {
        "平台": "A",
        "媒体": "m1",
        "主游戏": "G1",
        "返点后消耗": 100.0,
        "新增进入": 30,
    },
    {
        "平台": "B",
        "媒体": "m2",
        "主游戏": "G2",
        "返点后消耗": 100.0,
        "新增进入": 30,
    },
    {
        "平台": "C",
        "媒体": "m1",
        "主游戏": "G1",
        "返点后消耗": 50.0,
        "新增进入": 30,
    },
]


def test_additive_metric_lists_every_dimension_and_sums_to_the_delta() -> None:
    entries = _build_fluctuations(
        _frame(ADDITIVE_CUR), _frame(ADDITIVE_PREV), _config()
    )
    entry = _entry(entries, "spend")

    assert entry["kind"] == "additive"
    assert entry["current"] == 300.0
    assert entry["previous"] == 250.0
    assert entry["delta"] == 50.0
    assert entry["delta_pct"] == pytest.approx(0.2)
    assert entry["new"] is False

    assert [d["key"] for d in entry["dimensions"]] == ["platform", "media", "project"]
    for dimension in ("platform", "media", "project"):
        assert _contribution_sum(entry, dimension) == pytest.approx(entry["delta"])

    platforms = _dimension(entry, "platform")["items"]
    # Ties on |contribution| break by name, so B (−10) precedes C (+10).
    assert [item["name"] for item in platforms] == ["A", "B", "C"]
    assert platforms[0]["contribution"] == pytest.approx(50.0)
    assert platforms[0]["rank"] == "primary"
    assert platforms[1]["rank"] == "secondary"
    assert platforms[2]["rank"] == "secondary"
    c_item = next(i for i in platforms if i["name"] == "C")
    assert c_item["share"] == pytest.approx(0.2)


def test_metric_value_matches_the_headline_the_band_shows() -> None:
    """The section explains the band's number, it never re-defines it."""
    core = _build_core_metrics(_frame(ADDITIVE_CUR), _config(), DailyReportContext())
    entries = _build_fluctuations(
        _frame(ADDITIVE_CUR), _frame(ADDITIVE_PREV), _config()
    )

    assert _entry(entries, "spend")["current"] == core["spend"]


# ---- 比率指标 -------------------------------------------------------------- #

RATIO_PREV = [
    {"平台": "A", "媒体": "m1", "主游戏": "G1", "返点后消耗": 100.0, "1日充值": 10.0},
    {"平台": "B", "媒体": "m2", "主游戏": "G2", "返点后消耗": 100.0, "1日充值": 30.0},
]
# Rate and mix both move: A's rate doubles while B's weight halves.
RATIO_CUR = [
    {"平台": "A", "媒体": "m1", "主游戏": "G1", "返点后消耗": 150.0, "1日充值": 30.0},
    {"平台": "B", "媒体": "m2", "主游戏": "G2", "返点后消耗": 50.0, "1日充值": 15.0},
]


def test_ratio_metric_splits_into_rate_and_mix_that_sum_to_the_move() -> None:
    entries = _build_fluctuations(_frame(RATIO_CUR), _frame(RATIO_PREV), _config())
    entry = _entry(entries, "roi1")

    assert entry["kind"] == "ratio"
    assert entry["current"] == pytest.approx(45.0 / 200.0)
    assert entry["previous"] == pytest.approx(40.0 / 200.0)
    assert entry["delta"] == pytest.approx(0.025)

    platforms = _dimension(entry, "platform")["items"]
    a_item = next(i for i in platforms if i["name"] == "A")
    b_item = next(i for i in platforms if i["name"] == "B")
    # A: rate 0.10→0.20 at half the weight, weight doubles at the new rate.
    assert a_item["rate_effect"] == pytest.approx(0.05)
    assert a_item["mix_effect"] == pytest.approx(0.05)
    assert a_item["contribution"] == pytest.approx(0.10)
    # B: rate held, weight halved — pure mix, and it drags the ratio down.
    assert b_item["rate_effect"] == pytest.approx(0.0)
    assert b_item["mix_effect"] == pytest.approx(-0.075)
    assert a_item["contribution"] + b_item["contribution"] == pytest.approx(
        entry["delta"]
    )
    for dimension in ("platform", "media", "project"):
        assert _contribution_sum(entry, dimension) == pytest.approx(entry["delta"])


def test_ratio_metric_pure_rate_move_has_no_mix_effect() -> None:
    """Weights unchanged: every item's move is entirely 费率效应."""
    prev = [
        {"平台": "A", "返点后消耗": 100.0, "1日充值": 10.0},
        {"平台": "B", "返点后消耗": 100.0, "1日充值": 30.0},
    ]
    cur = [
        {"平台": "A", "返点后消耗": 100.0, "1日充值": 20.0},
        {"平台": "B", "返点后消耗": 100.0, "1日充值": 40.0},
    ]

    entry = _entry(_build_fluctuations(_frame(cur), _frame(prev), _config()), "roi1")

    assert entry["delta"] == pytest.approx(0.1)
    for item in _dimension(entry, "platform")["items"]:
        assert item["mix_effect"] == pytest.approx(0.0)
        assert item["rate_effect"] == pytest.approx(0.05)


def test_ratio_metric_pure_mix_move_has_no_rate_effect() -> None:
    """Rates held, weights shifted: the move is entirely 结构效应."""
    prev = [
        {"平台": "A", "返点后消耗": 100.0, "1日充值": 10.0},
        {"平台": "B", "返点后消耗": 100.0, "1日充值": 30.0},
    ]
    cur = [
        {"平台": "A", "返点后消耗": 150.0, "1日充值": 15.0},
        {"平台": "B", "返点后消耗": 50.0, "1日充值": 15.0},
    ]

    entry = _entry(_build_fluctuations(_frame(cur), _frame(prev), _config()), "roi1")

    assert entry["delta"] == pytest.approx(-0.05)
    for item in _dimension(entry, "platform")["items"]:
        assert item["rate_effect"] == pytest.approx(0.0)
    contributions = {
        item["name"]: item["contribution"]
        for item in _dimension(entry, "platform")["items"]
    }
    assert contributions == pytest.approx({"A": 0.025, "B": -0.075})


# ---- 波动门槛 -------------------------------------------------------------- #


def test_gate_skips_moves_below_the_minimum_percentage() -> None:
    prev = [{"平台": "A", "返点后消耗": 100.0}]
    under = [{"平台": "A", "返点后消耗": 109.0}]
    over = [{"平台": "A", "返点后消耗": 111.0}]

    assert _build_fluctuations(_frame(under), _frame(prev), _config()) == []
    assert _entry(_build_fluctuations(_frame(over), _frame(prev), _config()), "spend")[
        "delta_pct"
    ] == pytest.approx(0.11)


def test_gate_skips_bases_below_the_threshold() -> None:
    config = _config(baseline_thresholds={"返点后消耗": 1000.0, "新增进入": 10.0})
    prev = [{"平台": "A", "返点后消耗": 100.0}]
    cur = [{"平台": "A", "返点后消耗": 150.0}]  # +50 %, but only on a 150 base

    assert _build_fluctuations(_frame(cur), _frame(prev), config) == []


def test_gate_admits_a_move_from_zero_as_new_without_a_percentage() -> None:
    prev = [{"平台": "A", "返点后消耗": 0.0}]
    cur = [{"平台": "A", "返点后消耗": 200.0}]

    entry = _entry(_build_fluctuations(_frame(cur), _frame(prev), _config()), "spend")

    assert entry["new"] is True
    assert entry["delta_pct"] is None
    assert entry["delta"] == 200.0


def test_ratio_metrics_are_judged_on_their_denominator_base() -> None:
    """A wild ROI swing on a tiny spend base is noise, not a fluctuation."""
    config = _config(baseline_thresholds={"返点后消耗": 1000.0, "新增进入": 10.0})
    prev = [{"平台": "A", "返点后消耗": 100.0, "1日充值": 10.0}]
    cur = [{"平台": "A", "返点后消耗": 100.0, "1日充值": 20.0}]

    assert _build_fluctuations(_frame(cur), _frame(prev), config) == []


# ---- 尾部折叠与排序 -------------------------------------------------------- #


def test_tail_folds_into_other_and_keeps_the_dimension_summing_to_the_delta() -> None:
    prev = [{"主游戏": f"G{i:02d}", "返点后消耗": 20.0} for i in range(1, 11)]
    cur = [{"主游戏": f"G{i:02d}", "返点后消耗": 20.0 + (11 - i)} for i in range(1, 11)]

    entry = _entry(_build_fluctuations(_frame(cur), _frame(prev), _config()), "spend")

    items = _dimension(entry, "project")["items"]
    assert len(items) == 9  # 8 strongest + 其他
    assert items[-1]["name"] == "其他"
    assert "rank" not in items[-1]
    assert items[-1]["contribution"] == pytest.approx(2.0 + 1.0)
    assert _contribution_sum(entry, "project") == pytest.approx(entry["delta"])


def test_entries_order_the_biggest_relative_move_first_and_new_on_top() -> None:
    prev = [{"平台": "A", "返点后消耗": 0.0, "充值流水": 100.0}]
    cur = [{"平台": "A", "返点后消耗": 1000.0, "充值流水": 150.0}]

    entries = _build_fluctuations(_frame(cur), _frame(prev), _config())

    assert [e["key"] for e in entries] == ["spend", "recharge"]
    assert entries[0]["new"] is True
    assert entries[1]["delta_pct"] == pytest.approx(0.5)


# ---- 边界 ------------------------------------------------------------------- #


def test_missing_columns_and_empty_frames_yield_no_entries() -> None:
    assert _build_fluctuations(pd.DataFrame(), pd.DataFrame(), _config()) == []

    # Frames without any of the three dimension columns: nothing to attribute.
    prev = [{"返点后消耗": 100.0}]
    cur = [{"返点后消耗": 200.0}]
    assert _build_fluctuations(_frame(cur), _frame(prev), _config()) == []


def test_decomposition_is_deterministic() -> None:
    first = _build_fluctuations(_frame(RATIO_CUR), _frame(RATIO_PREV), _config())
    second = _build_fluctuations(_frame(RATIO_CUR), _frame(RATIO_PREV), _config())

    assert first == second
