"""
Daily report configuration.

The daily report workflow (originally under ``AI/daily_report_workflow``) is
adapted here to source its raw data from Superset itself instead of Power BI.
This module is the single switchboard for mapping a Superset physical
dataset/table to the report's logical UA fields.  Adjust the values below to
point at your UA dataset before first use.
"""

from __future__ import annotations

from dataclasses import dataclass, field, fields
from typing import Any


@dataclass
class DailyReportConfig:
    """Configurable mapping between the UA dataset and report fields."""

    # ---- Superset datasource ----
    # The canonical UA dataset (ad_combined_report).  The field mapping below is
    # hardcoded for this dataset; the backend auto-resolves fields at run time,
    # so it is not exposed as a report parameter.
    datasource_id: int = 26
    table_name: str = "ad_combined_report"
    schema: str = "sj_report_data"
    database_name: str = "aliyun"

    # ---- Dimension columns (column_name on the dataset) ----
    date_column: str = "report_date"
    project_column: str = "主游戏"
    channel_column: str = "渠道商"
    ad_channel_column: str = "媒体"
    region_column: str = ""
    business_column: str = ""
    channel_type_column: str = ""

    # ---- Metric columns ----
    spend_column: str = "返点后消耗"
    new_users_column: str = "新增进入"
    cpa_column: str = "返点后消耗"
    ltv_columns: tuple[str, ...] = (
        "1日充值",
        "2日充值",
        "3日充值",
        "4日充值",
        "5日充值",
        "6日充值",
        "7日充值",
        "14日充值",
        "30日充值",
    )
    roi_columns: tuple[str, ...] = (
        "1日充值",
        "2日充值",
        "3日充值",
        "4日充值",
        "5日充值",
        "6日充值",
        "7日充值",
        "14日充值",
        "30日充值",
    )

    # ---- Metric aggregation semantics ----
    # The backdated recharge columns (N日充值) are additive numerators, so the
    # overall LTV/ROI is SUM(col)/SUM(weight) with weighted=False.
    ltv_weighted_average: bool = False
    roi_weighted_average: bool = False

    # ---- Analysis parameters ----
    # 紧急告警阈值 (%), 预警阈值 (%)
    alert_critical_threshold: float = 40.0
    alert_warning_threshold: float = 20.0
    roi_critical_line: float = 0.05
    roi_warning_line: float = 0.10
    top_projects_count: int = 5
    days_of_history: int = 30

    # 基数阈值：低于此值不参与异常判断
    baseline_thresholds: dict[str, float] = field(
        default_factory=lambda: {
            "返点后消耗": 10000.0,
            "新增进入": 1000.0,
        }
    )

    # 项目目标 ROI（预留；可按项目名称 + 渠道配置，默认用盈亏线）
    project_targets: dict[str, dict[str, float]] = field(default_factory=dict)
    default_breakeven_line: float = 0.10

    # ---- Filter (optional) ----
    # Optional fixed filter applied to every query, e.g. {"业务板块": "游戏"}
    static_filters: dict[str, str] = field(default_factory=dict)


@dataclass
class DailyReportContext:
    """Per-request values assembled from the query/request parameters."""

    # 覆盖日期（"今天"，用于回溯测试），None 表示使用真实今天
    override_date: str | None = None
    top_projects_count: int | None = None
    days_of_history: int | None = None
    datasource_id: int | None = None


DEFAULT_CONFIG = DailyReportConfig()


def config_from_dict(data: dict[str, Any] | None) -> DailyReportConfig:
    """Build a ``DailyReportConfig`` from a (possibly partial) parameter dict.

    Any field present in ``data`` overrides the dataclass default; unknown keys
    are ignored.  This lets a stored report configuration carry only the
    parameters it wants to override.
    """
    config = DailyReportConfig()
    if not data:
        return config
    known = {f.name for f in fields(config)}
    for key, value in data.items():
        if key in known and value is not None:
            try:
                setattr(config, key, value)
            except (TypeError, ValueError):
                # Ignore type-incompatible values so a bad stored payloads never
                # crashes report runs.
                continue
    return config
