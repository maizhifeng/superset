"""Reconcile the executed (narrow) analysis SQL against the historical wide view.

The ``cost`` and ``project-compare`` topics run on the two branches their
historical wide views (``report_sygame_ad_data_view`` /
``report_minigame_ad_data_view``) union internally: the cost branch plus the
attribution/payment branch, for both the mobile and the mini-game sources.
That keeps queries fast, but the numbers must stay identical to what the old
dataset returned.

This module compiles the *same* analysis query twice — once against the narrow
sources and once against the historical wide views — executes both on the
mainland database and compares the results row by row.  The metric set is
selected per topic: ``cost`` compares its cost metrics, ``project-compare``
also compares the cumulative payment columns (累计充值 / 累计付费数) and their
ratios.

Usage (inside the Superset container)::

    python -m superset.project.bi.analysis_consistency
    python -m superset.project.bi.analysis_consistency --topic project-compare
    python -m superset.project.bi.analysis_consistency --all
    python -m superset.project.bi.analysis_consistency --output /app/report.json

Exit code is 0 when every check matches, 1 otherwise, so it can be wired into
a scheduled reconciliation job.
"""

from __future__ import annotations

import argparse
import logging
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

import pandas as pd

from superset.project.bi.analysis_topics import (
    ANALYSIS_TOPICS,
    compile_query,
    get_topic,
    historical_topic,
)
from superset.utils import json

logger = logging.getLogger(__name__)

# Window matrix: recent ranges, the mature window, the source switch boundary
# (2026-06-01) and the archived history all need to agree.
DEFAULT_WINDOWS: tuple[tuple[str, str], ...] = (
    ("2026-10-11", "2026-11-09"),  # 近 30 天（KPI 当前期）
    ("2026-09-11", "2026-10-10"),  # 成熟窗口（留存/LTV 专题用，成本同样校验）
    ("2026-08-11", "2026-11-09"),  # 近 90 天
    ("2026-05-20", "2026-06-10"),  # 跨 2026-06-01 数据切换点
    ("2025-03-01", "2025-03-31"),  # 归档历史
    ("2026-11-08", "2026-11-09"),  # 最近一天
)

DIMENSIONS: tuple[str, ...] = ("主游戏", "媒体", "渠道商", "平台", "地区", "日期")


@dataclass(frozen=True)
class CheckResult:
    window: str
    spec: str
    rows_wide: int
    rows_narrow: int
    mismatched_cells: int
    max_abs_diff: float
    max_rel_diff: float
    ok: bool
    error: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "window": self.window,
            "spec": self.spec,
            "rows_wide": self.rows_wide,
            "rows_narrow": self.rows_narrow,
            "mismatched_cells": self.mismatched_cells,
            "max_abs_diff": self.max_abs_diff,
            "max_rel_diff": self.max_rel_diff,
            "ok": self.ok,
            "error": self.error,
        }


def _raw_column(name: str) -> dict[str, Any]:
    return {
        "expressionType": "SIMPLE",
        "column": {"column_name": name},
        "aggregate": "SUM",
        "label": name,
    }


# The cost topic's full breakdown metric set (raw components + ratio metrics).
METRICS: tuple[Any, ...] = (
    _raw_column("消耗"),
    _raw_column("返点后消耗"),
    _raw_column("新增进入"),
    "自然新增%",
    "cpa",
    "cpp",
    "ltv_1",
    "roi_1",
)

# ``project-compare`` exposes 24 columns: 17 raw ones plus 21 named ratios.
PROJECT_COMPARE_METRICS: tuple[Any, ...] = (
    _raw_column("消耗"),
    _raw_column("返点后消耗"),
    _raw_column("新增进入"),
    _raw_column("2日留存数"),
    _raw_column("3日留存数"),
    _raw_column("7日留存数"),
    _raw_column("2日充值"),
    _raw_column("3日充值"),
    _raw_column("4日充值"),
    _raw_column("5日充值"),
    _raw_column("6日充值"),
    _raw_column("7日充值"),
    _raw_column("充值流水"),
    _raw_column("商户充值"),
    _raw_column("1日充值"),
    _raw_column("1日付费数"),
    _raw_column("累计充值"),
    _raw_column("累计付费数"),
    "cpa",
    "cpp",
    "自然新增%",
    "ltv_1",
    "roi_1",
    "ltv_cum",
    "累计roi",
    "流水ROI",
    "1日付费率",
    "2日留存率",
    "3日留存率",
    "7日留存率",
    "roi_2",
    "roi_3",
    "roi_4",
    "roi_5",
    "roi_6",
    "roi_7",
    "ltv_2",
    "ltv_3",
    "ltv_4",
    "ltv_5",
    "ltv_6",
    "ltv_7",
)

METRICS_BY_TOPIC: dict[str, tuple[Any, ...]] = {
    "cost": METRICS,
    "project-compare": PROJECT_COMPARE_METRICS,
}


def default_specs(topic_id: str = "cost") -> list[tuple[str, dict[str, Any]]]:
    """Build the default comparison query matrix for one topic."""
    metrics = METRICS_BY_TOPIC.get(topic_id)
    if metrics is None:
        raise SystemExit(f"unknown analysis topic: {topic_id}")
    specs: list[tuple[str, dict[str, Any]]] = [
        ("总计", {"metrics": list(metrics), "groupby": []}),
    ]
    for dimension in DIMENSIONS:
        specs.append(
            (
                f"按{dimension}",
                {"metrics": list(metrics), "groupby": [dimension]},
            )
        )
    specs.append(
        (
            "按主游戏×日期",
            {"metrics": list(metrics), "groupby": ["主游戏", "日期"]},
        )
    )
    return specs


def _query_spec(window: tuple[str, str], spec: dict[str, Any]) -> dict[str, Any]:
    return {
        "result_type": "full",
        "columns": [],
        "filters": [],
        "granularity": "日期",
        "time_range": f"{window[0]} : {window[1]}",
        "row_limit": 100000,
        **spec,
    }


def _read_pair(
    database: Any, narrow_sql: str, wide_sql: str
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Read both variants inside one ``REPEATABLE READ`` snapshot.

    The source tables keep receiving writes while the check runs; reading both
    statements from the same snapshot keeps the comparison deterministic.
    """
    from sqlalchemy import text

    with database.get_sqla_engine() as engine:
        with engine.connect() as connection:
            connection = connection.execution_options(isolation_level="REPEATABLE READ")
            with connection.begin():
                narrow = pd.read_sql_query(text(narrow_sql), con=connection)
                wide = pd.read_sql_query(text(wide_sql), con=connection)
            return narrow, wide


def _numeric(value: Any) -> float | None:
    if value is None:
        return None
    try:
        as_float = float(value)
    except (TypeError, ValueError):
        return None
    if pd.isna(as_float):
        return None
    return as_float


def _compare_frames(  # noqa: C901
    wide: pd.DataFrame,
    narrow: pd.DataFrame,
    dimensions: list[str],
) -> tuple[int, int, float, float]:
    """Return ``(mismatched_cells, rows, max_abs_diff, max_rel_diff)``."""
    if set(wide.columns) != set(narrow.columns):
        return -1, max(len(wide), len(narrow)), float("inf"), float("inf")

    columns = list(wide.columns)
    wide = wide.sort_values(by=dimensions, na_position="first").reset_index(drop=True)
    narrow = narrow.sort_values(by=dimensions, na_position="first").reset_index(
        drop=True
    )
    if len(wide) != len(narrow):
        return -1, max(len(wide), len(narrow)), float("inf"), float("inf")

    mismatched = 0
    max_abs = 0.0
    max_rel = 0.0
    for column in columns:
        wide_series = wide[column]
        narrow_series = narrow[column]
        if column in dimensions:
            if not wide_series.astype(str).equals(narrow_series.astype(str)):
                mismatched += len(wide_series)
            continue
        for wide_value, narrow_value in zip(wide_series, narrow_series, strict=False):
            wide_num = _numeric(wide_value)
            narrow_num = _numeric(narrow_value)
            if wide_num is None and narrow_num is None:
                continue
            if wide_num is None or narrow_num is None:
                mismatched += 1
                max_abs = float("inf")
                max_rel = float("inf")
                continue
            abs_diff = abs(wide_num - narrow_num)
            scale = max(abs(wide_num), abs(narrow_num), 1e-12)
            rel_diff = abs_diff / scale
            max_abs = max(max_abs, abs_diff)
            max_rel = max(max_rel, rel_diff)
            if abs_diff > 1e-6 and rel_diff > 1e-9:
                mismatched += 1
    return mismatched, len(wide), max_abs, max_rel


def check_topic(
    topic_id: str,
    windows: tuple[tuple[str, str], ...] = DEFAULT_WINDOWS,
    specs: list[tuple[str, dict[str, Any]]] | None = None,
) -> dict[str, Any]:
    """Compare narrow vs historical-wide results for one topic.

    ``specs`` defaults to the metric matrix registered for ``topic_id`` so each
    topic is checked with the exact columns its page queries.
    """
    from superset import db
    from superset.models.core import Database

    topic = get_topic(topic_id)
    if topic is None:
        raise SystemExit(f"unknown analysis topic: {topic_id}")
    wide_topic = historical_topic(topic)
    database = (
        db.session.query(Database)
        .filter(Database.database_name == topic.mainland.database)
        .one()
    )
    specs = specs or default_specs(topic_id)
    results: list[CheckResult] = []
    for window in windows:
        for spec_name, spec in specs:
            query = _query_spec(window, spec)
            window_label = f"{window[0]} ~ {window[1]}"
            try:
                narrow_sql = compile_query(topic, query).mainland_sql
                wide_sql = compile_query(wide_topic, query).mainland_sql
                narrow_df, wide_df = _read_pair(database, narrow_sql, wide_sql)
                mismatched, rows, max_abs, max_rel = _compare_frames(
                    wide_df, narrow_df, list(spec.get("groupby") or [])
                )
                result = CheckResult(
                    window=window_label,
                    spec=spec_name,
                    rows_wide=len(wide_df),
                    rows_narrow=len(narrow_df),
                    mismatched_cells=mismatched,
                    max_abs_diff=max_abs,
                    max_rel_diff=max_rel,
                    ok=mismatched == 0,
                )
                logger.info(
                    "%-26s %-16s rows=%s/%s mismatched=%s max_rel=%.2e",
                    window_label,
                    spec_name,
                    result.rows_wide,
                    result.rows_narrow,
                    mismatched,
                    max_rel,
                )
            except Exception as error:  # noqa: BLE001
                result = CheckResult(
                    window=window_label,
                    spec=spec_name,
                    rows_wide=-1,
                    rows_narrow=-1,
                    mismatched_cells=-1,
                    max_abs_diff=float("inf"),
                    max_rel_diff=float("inf"),
                    ok=False,
                    error=f"{type(error).__name__}: {error}",
                )
                logger.error("%s %s failed: %s", window_label, spec_name, error)
            results.append(result)

    return {
        "topic": topic_id,
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "windows": [f"{start} ~ {end}" for start, end in windows],
        "checks": [result.as_dict() for result in results],
        "ok": all(result.ok for result in results),
        "summary": {
            "checks": len(results),
            "failed": sum(1 for result in results if not result.ok),
            "rows_compared": sum(result.rows_narrow for result in results if result.ok),
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--topic", default="cost")
    parser.add_argument(
        "--all",
        action="store_true",
        help="check every registered topic instead of a single --topic",
    )
    parser.add_argument("--output", default="")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(message)s")

    from superset.app import create_app

    app = create_app()
    with app.app_context():
        topic_ids = sorted(ANALYSIS_TOPICS) if args.all else [args.topic]
        reports = [check_topic(topic_id) for topic_id in topic_ids]
    if len(reports) == 1:
        payload = reports[0]
    else:
        payload = {
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "topics": reports,
            "ok": all(report["ok"] for report in reports),
            "summary": {
                "topics": len(reports),
                "checks": sum(report["summary"]["checks"] for report in reports),
                "failed": sum(report["summary"]["failed"] for report in reports),
                "rows_compared": sum(
                    report["summary"]["rows_compared"] for report in reports
                ),
            },
        }
    if args.output:
        Path(args.output).write_text(json.dumps(payload, ensure_ascii=False, indent=1))
        print(f"report written to {args.output}")
    else:
        print(json.dumps(payload, ensure_ascii=False, indent=1))
    return 0 if payload["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
