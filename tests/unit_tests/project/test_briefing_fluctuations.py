"""§1「关键指标波动」: metric gating and factor decomposition.

A metric is listed when its 环比 clears ``FLUCTUATION_MIN_PCT`` on a base above
``baseline_thresholds``; additive metrics decompose the absolute 增量, ratio
metrics the move of the ratio (费率效应 + 结构效应), and every dimension's
contributions add up to the metric's change exactly.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pandas as pd
import pytest

from superset.project.briefing.config import DailyReportConfig, DailyReportContext
from superset.project.briefing.service import (
    _baseline_zscore,
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


def _factor_stats(
    rows: list[dict[str, Any]],
    days: list[date],
    config: DailyReportConfig | None = None,
) -> dict[tuple[str, str, str], dict[str, Any]]:
    from superset.project.briefing.service import (
        _dimension_factor_baselines,
        PeriodBucket,
    )

    frame = pd.DataFrame(rows)
    history = [PeriodBucket(day.isoformat(), day, day) for day in reversed(days)]
    return _dimension_factor_baselines(
        frame, "report_date", history, config or _config()
    )


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


def test_fluctuation_metrics_expose_their_value_format() -> None:
    from superset.project.briefing.service import _fluctuation_metrics

    formats = {
        metric.key: metric.value_format for metric in _fluctuation_metrics(_config())
    }

    assert formats == {
        "spend": "money",
        "recharge": "money",
        "new_users": "count",
        "natural_rate": "percent",
        "cpa": "per_user",
        "ltv1": "per_user",
        "roi1": "percent",
    }


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
    assert entry["driver"] == "volume"

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
    assert entry["value_format"] == "percent"
    assert entry["driver"] == "efficiency"
    assert entry["driver_dimension"] == "project"
    assert entry["efficiency_delta"] == pytest.approx(0.05)
    assert entry["mix_delta"] == pytest.approx(-0.025)

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
    assert entry["driver"] == "efficiency"
    assert entry["efficiency_delta"] == pytest.approx(0.1)
    assert entry["mix_delta"] == pytest.approx(0.0)
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
    assert entry["driver"] == "structure"
    assert entry["efficiency_delta"] == pytest.approx(0.0)
    assert entry["mix_delta"] == pytest.approx(-0.05)
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


def test_natural_rate_uses_an_absolute_percentage_point_gate() -> None:
    prev = [
        {"媒体": "自然量", "新增进入": 800, "返点后消耗": 100.0},
        {"媒体": "paid", "新增进入": 200, "返点后消耗": 100.0},
    ]
    cur = [
        {"媒体": "自然量", "新增进入": 734, "返点后消耗": 100.0},
        {"媒体": "paid", "新增进入": 266, "返点后消耗": 100.0},
    ]

    entry = _entry(
        _build_fluctuations(_frame(cur), _frame(prev), _config()), "natural_rate"
    )

    assert entry["delta"] == pytest.approx(-0.066)
    assert entry["delta_pct"] == pytest.approx(-0.0825)
    assert entry["driver"] == "structure"
    assert entry["efficiency_delta"] == pytest.approx(0.0)
    assert entry["mix_delta"] == pytest.approx(-0.066)


def test_natural_rate_below_the_pp_gate_is_not_listed() -> None:
    prev = [
        {"媒体": "自然量", "新增进入": 800, "返点后消耗": 100.0},
        {"媒体": "paid", "新增进入": 200, "返点后消耗": 100.0},
    ]
    cur = [
        {"媒体": "自然量", "新增进入": 795, "返点后消耗": 100.0},
        {"媒体": "paid", "新增进入": 205, "返点后消耗": 100.0},
    ]

    assert _build_fluctuations(_frame(cur), _frame(prev), _config()) == []


def test_natural_rate_ignores_a_large_relative_move_below_one_point() -> None:
    prev = [
        {"媒体": "自然量", "新增进入": 20, "返点后消耗": 100.0},
        {"媒体": "paid", "新增进入": 980, "返点后消耗": 100.0},
    ]
    cur = [
        {"媒体": "自然量", "新增进入": 25, "返点后消耗": 100.0},
        {"媒体": "paid", "新增进入": 975, "返点后消耗": 100.0},
    ]

    assert _build_fluctuations(_frame(cur), _frame(prev), _config()) == []


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


# ---- 历史基线（核心指标自动异常检测） ------------------------------------- #


def test_robust_baseline_uses_median_and_mad() -> None:
    from superset.project.briefing.service import _robust_baseline

    baseline = _robust_baseline([0.01, 0.02, 0.03, 0.04, 0.05, 0.06])

    assert baseline["method"] == "robust"
    assert baseline["samples"] == 6
    assert baseline["median"] == pytest.approx(0.035)
    assert baseline["mad"] == pytest.approx(0.015)
    assert baseline["low"] == pytest.approx(0.035 - 3 * 1.4826 * 0.015)
    assert baseline["high"] == pytest.approx(0.035 + 3 * 1.4826 * 0.015)


def test_robust_baseline_needs_enough_history() -> None:
    from superset.project.briefing.service import _robust_baseline

    baseline = _robust_baseline([0.01, 0.02])

    assert baseline["method"] == "insufficient"
    assert baseline["samples"] == 2
    assert baseline["low"] is None
    assert baseline["high"] is None


def test_fluctuation_baselines_exclude_the_judged_move() -> None:
    from superset.project.briefing.service import _fluctuation_baselines

    # Newest first: the current bucket leads, then seven older ones.
    daily = [{"spend": value} for value in (100, 105, 110, 120, 130, 140, 150, 160)]

    baseline = _fluctuation_baselines(daily, _config())["spend"]

    # 8 buckets -> 7 adjacent deltas; the newest one is the move under test.
    assert baseline["samples"] == 6
    assert baseline["method"] == "robust"


def test_severity_combines_business_and_statistical_gates() -> None:
    from superset.project.briefing.service import _attach_fluctuation_baseline

    baseline = {
        "samples": 6,
        "method": "robust",
        "median": 0.0,
        "mad": 0.01,
        "p10": -0.01,
        "p90": 0.01,
        "low": -0.044,
        "high": 0.044,
    }
    entry = {"key": "spend", "delta_pct": 0.20, "new": False}
    _attach_fluctuation_baseline(entry, baseline)
    assert entry["severity"] == "abnormal"
    assert entry["zscore"] == pytest.approx(0.6745 * 0.20 / 0.01)
    assert "高于" in entry["reason"]

    watch = {"key": "spend", "delta_pct": 0.037, "new": False}
    _attach_fluctuation_baseline(watch, baseline)
    assert watch["severity"] == "watch"

    normal = {"key": "spend", "delta_pct": 0.005, "new": False}
    _attach_fluctuation_baseline(normal, baseline)
    assert normal["severity"] == "normal"


def test_severity_reports_insufficient_history() -> None:
    from superset.project.briefing.service import _attach_fluctuation_baseline

    entry = {"key": "spend", "delta_pct": 0.20, "new": False}
    _attach_fluctuation_baseline(
        entry,
        {
            "samples": 3,
            "method": "insufficient",
            "median": None,
            "mad": None,
            "p10": None,
            "p90": None,
            "low": None,
            "high": None,
        },
    )
    assert entry["severity"] is None
    assert "历史数据不足" in entry["reason"]
    assert "10% 业务阈值" in entry["reason"]


def test_dimension_factor_baselines_use_each_factor_own_scale() -> None:
    days = [date(2026, 9, day) for day in range(10, 18)]
    spend_a = [100.0, 105.0, 102.0, 108.0, 110.0, 107.0, 104.0, 300.0]
    spend_b = [50.0, 51.0, 49.0, 52.0, 50.0, 51.0, 50.0, 52.0]
    rows: list[dict[str, Any]] = []
    for offset, day in enumerate(days):
        for platform, spend in (("A", spend_a[offset]), ("B", spend_b[offset])):
            rows.append(
                {
                    "report_date": day.isoformat(),
                    "平台": platform,
                    "媒体": f"m-{platform}",
                    "主游戏": f"g-{platform}",
                    "返点后消耗": spend,
                    "新增进入": 10,
                    "1日充值": spend * 0.2,
                    "充值流水": spend * 0.3,
                }
            )

    stats = _factor_stats(rows, days)

    factor = stats[("spend", "platform", "A")]
    assert factor["severity"] == "abnormal"
    assert factor["baseline"]["method"] == "own"
    assert factor["baseline"]["samples"] == 6
    assert factor["baseline"]["pooled_samples"] >= 6
    # B only moved 4%, inside its own band.
    assert stats[("spend", "platform", "B")]["severity"] != "abnormal"


def test_factor_baseline_ignores_a_stale_delta_when_latest_move_is_incomparable() -> (
    None
):
    days = [date(2026, 9, day) for day in range(1, 13)]
    recharge = [0.0, 0.0, 134.6, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 243.5]
    rows = [
        {
            "report_date": day.isoformat(),
            "平台": "A",
            "媒体": "m1",
            "主游戏": "G_new",
            "新增进入": 10,
            "1日充值": value,
        }
        for day, value in zip(days, recharge, strict=True)
    ]

    stats = _factor_stats(rows, days)

    factor = stats[("ltv1", "project", "G_new")]
    assert factor["zscore"] is None
    assert factor["severity"] is None
    assert "无可比" in factor["reason"]
    assert factor["baseline"]["samples"] == 1


def test_factor_baseline_requires_a_comparable_previous_base() -> None:
    days = [date(2026, 9, day) for day in range(1, 9)]
    spend = [5.0] * 7 + [5000.0]
    rows = [
        {
            "report_date": day.isoformat(),
            "平台": "A",
            "主游戏": "G1",
            "返点后消耗": value,
            "新增进入": 10,
        }
        for day, value in zip(days, spend, strict=True)
    ]

    stats = _factor_stats(rows, days)

    factor = stats[("spend", "platform", "A")]
    assert factor["zscore"] is None
    assert factor["severity"] is None
    assert "基数不足" in factor["reason"]


def test_factor_baseline_requires_enough_history() -> None:
    days = [date(2026, 9, day) for day in range(1, 4)]
    spend = [100.0, 101.0, 102.0]
    rows = [
        {
            "report_date": day.isoformat(),
            "平台": "A",
            "主游戏": "G1",
            "返点后消耗": value,
            "新增进入": 10,
        }
        for day, value in zip(days, spend, strict=True)
    ]

    stats = _factor_stats(rows, days)

    factor = stats[("spend", "platform", "A")]
    assert factor["zscore"] is None
    assert factor["severity"] is None
    assert "历史有效波动不足" in factor["reason"]


def test_factor_baseline_flat_history_has_no_infinite_zscore() -> None:
    days = [date(2026, 9, day) for day in range(1, 9)]
    spend = [100.0] * 7 + [110.0]
    rows = [
        {
            "report_date": day.isoformat(),
            "平台": "A",
            "主游戏": "G1",
            "返点后消耗": value,
            "新增进入": 10,
        }
        for day, value in zip(days, spend, strict=True)
    ]

    stats = _factor_stats(rows, days)

    factor = stats[("spend", "platform", "A")]
    assert factor["zscore"] is None
    assert factor["severity"] is None
    assert "无波动" in factor["reason"]


def test_revenue_flow_factor_uses_the_spend_floor() -> None:
    days = [date(2026, 9, day) for day in range(1, 9)]
    recharge = [150.0] * 7 + [1_767_511.0]
    rows = [
        {
            "report_date": day.isoformat(),
            "平台": "A",
            "主游戏": "G1",
            "充值流水": value,
        }
        for day, value in zip(days, recharge, strict=True)
    ]
    config = _config(baseline_thresholds={"返点后消耗": 1000.0, "新增进入": 10.0})

    stats = _factor_stats(rows, days, config)

    factor = stats[("recharge", "platform", "A")]
    assert factor["zscore"] is None
    assert factor["severity"] is None
    assert "基数不足" in factor["reason"]


def test_stable_baseline_does_not_return_an_infinite_zscore() -> None:
    baseline = {
        "samples": 6,
        "method": "stable",
        "median": 0.0,
        "mad": 0.0,
        "p10": -0.01,
        "p90": 0.01,
        "low": -0.01,
        "high": 0.01,
    }

    z = _baseline_zscore(0.02, baseline)

    assert z == pytest.approx(2.5632)
    flat = {**baseline, "p10": 0.0, "p90": 0.0, "low": 0.0, "high": 0.0}
    assert _baseline_zscore(0.02, flat) is None


def test_metric_efficiency_baselines_track_the_rate_component() -> None:
    from superset.project.briefing.service import (
        _metric_efficiency_baselines,
        PeriodBucket,
    )

    days = [date(2026, 9, day) for day in range(1, 9)]
    rows: list[dict[str, Any]] = []
    for index, day in enumerate(days):
        if index < 7:
            a_spend, a_recharge = 100.0, 10.0
            b_spend, b_recharge = 100.0, 30.0
        else:
            a_spend, a_recharge = 150.0, 15.0
            b_spend, b_recharge = 50.0, 15.0
        for platform, spend, recharge in (
            ("A", a_spend, a_recharge),
            ("B", b_spend, b_recharge),
        ):
            rows.append(
                {
                    "report_date": day.isoformat(),
                    "平台": platform,
                    "媒体": f"m-{platform}",
                    "主游戏": f"g-{platform}",
                    "返点后消耗": spend,
                    "1日充值": recharge,
                }
            )
    frame = pd.DataFrame(rows)
    history = [PeriodBucket(day.isoformat(), day, day) for day in reversed(days)]

    stats = _metric_efficiency_baselines(frame, "report_date", history, _config())

    roi = stats["roi1"]
    assert roi["current"] == pytest.approx(0.0)
    assert roi["mix"] == pytest.approx(-0.05)
    assert roi["dimension"] == "project"
    assert roi["baseline"]["samples"] == 6


def test_structure_driven_move_uses_efficiency_for_severity() -> None:
    prev = [
        {"平台": "A", "返点后消耗": 100.0, "1日充值": 10.0},
        {"平台": "B", "返点后消耗": 100.0, "1日充值": 30.0},
    ]
    cur = [
        {"平台": "A", "返点后消耗": 150.0, "1日充值": 15.0},
        {"平台": "B", "返点后消耗": 50.0, "1日充值": 15.0},
    ]
    total_baseline = {
        "samples": 6,
        "method": "robust",
        "median": 0.0,
        "mad": 0.0001,
        "p10": -0.0002,
        "p90": 0.0002,
        "low": -0.0004,
        "high": 0.0004,
    }
    efficiency_baseline = {
        "samples": 6,
        "method": "robust",
        "median": 0.0,
        "mad": 0.01,
        "p10": -0.02,
        "p90": 0.02,
        "low": -0.044,
        "high": 0.044,
    }

    entry = _entry(
        _build_fluctuations(
            _frame(cur),
            _frame(prev),
            _config(),
            baselines={"roi1": total_baseline},
            efficiency_baselines={
                "roi1": {
                    "baseline": efficiency_baseline,
                    "current": 0.0,
                    "mix": -0.05,
                    "dimension": "platform",
                }
            },
        ),
        "roi1",
    )

    assert entry["driver"] == "structure"
    assert entry["efficiency_zscore"] == pytest.approx(0.0)
    assert entry["severity"] == "normal"
    assert entry["severity_basis"] == "efficiency"
    assert "结构变化为主" in entry["reason"]
