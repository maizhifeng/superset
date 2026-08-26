"""
Briefing service (daily and weekly report types).

Fetches raw UA rows from a configured Superset dataset and computes the
briefing indicators (CPA, LTV, ROI, top projects, media performance, alerts).
This mirrors the logic of ``AI/daily_report_workflow`` but sources its data
from Superset's own datasources instead of Power BI.

Daily briefings aggregate a single day (yesterday) and compare it with the day
before; weekly briefings aggregate a complete natural week (Sunday–Saturday)
and compare it with the preceding week.

The source dataset is assumed to hold *segment-level* rows: one row per
project/channel/region (optionally per day) carrying additive spend / new-user
columns plus the per-segment LTV / ROI metrics.  Weighted overall values are
recomputed from these segment rows.
"""

from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass, replace
from datetime import date, datetime, timedelta
from typing import Any, Iterable

import pandas as pd
import sqlalchemy as sa

from superset.project.briefing.config import (
    DailyReportConfig,
    DailyReportContext,
    normalize_report_type,
)

logger = logging.getLogger(__name__)

# A progress callable receives ``(message, level)``; a cancel callable returns
# True when the (background) execution should abort eagerly.  Both are optional
# and default to no-ops so the service stays usable standalone.
ProgressFn = Any
CancelFn = Any


class CancelledError(RuntimeError):
    """Raised when a background report generation is manually stopped."""


# A marker for an active phase, so the UI can show "still working" between
# stage boundaries when a step (e.g. a slow SQL query) is long-running.
CURRENT_STAGE: dict[str, str] = {}

# Canonical LTV/ROI day indices.  Report core metrics are always emitted under
# stable keys ``LTV{idx}`` / ``ROI{idx}`` regardless of how the underlying
# dataset names the column (``1日充值``, ``rt_paid_money_1``, ``LTV1``, ...).
_METRIC_KEYS: tuple[int, ...] = (1, 2, 3, 4, 5, 6, 7, 14, 30)

# Catch-all / scattered project labels excluded from the primary (主游戏) view so
# the long-tail "其他" bucket doesn't dilute rankings and attribution.
SCATTERED_PROJECT_LABELS: set[str] = {
    "其他",
    "其他项目",
    "未知",
    "未分类",
    "汇总",
    "总计",
}


def _set_stage(stage: str, message: str | None = None) -> None:
    """Record the current long-running stage (shared, for the frontend)."""
    CURRENT_STAGE["stage"] = stage
    CURRENT_STAGE["message"] = message or stage


def _emit(progress: ProgressFn | None, message: str, level: str = "info") -> None:
    """Forward a progress log line to the caller (progress stream + server)."""
    logger.info("daily-report: %s", message)
    if progress is not None:
        try:
            progress(message, level)
        except Exception:  # noqa: S110
            logger.warning("progress callback failed", exc_info=True)


def _timed(progress: ProgressFn | None, stage: str, start: float) -> float:
    """Emit a completed-phase line with the elapsed duration and return now."""
    elapsed = time.perf_counter() - start
    _emit(progress, f"[{stage}] 完成，耗时 {elapsed:.1f}s")
    logger.info("daily-report: phase '%s' took %.2fs", stage, elapsed)
    return time.perf_counter()


def _maybe_cancel(cancel: CancelFn | None) -> None:
    """Raise a cancellation if the caller requested a stop."""
    if cancel is not None:
        try:
            if cancel():
                raise CancelledError("Report generation cancelled")
        except CancelledError:
            raise
        except Exception:  # noqa: S110
            logger.warning("cancel callback failed", exc_info=True)


# --------------------------------------------------------------------------- #
# Datasource / SQL helpers
# --------------------------------------------------------------------------- #


def _resolve_datasource_by_ref(
    ds_id: int | None,
    table_name: str | None = None,
    schema: str | None = None,
    database_name: str | None = None,
) -> Any:
    """Resolve a Superset dataset (SqlaTable) from id / table coordinates."""
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    if ds_id:
        ds = db.session.query(SqlaTable).filter(SqlaTable.id == ds_id).one_or_none()
        if ds is not None:
            return ds

    query = db.session.query(SqlaTable)
    if table_name:
        query = query.filter(SqlaTable.table_name == table_name)
    if schema:
        query = query.filter(SqlaTable.schema == schema)
    if database_name:
        from superset.models.core import Database

        db_row = (
            db.session.query(Database)
            .filter(Database.database_name == database_name)
            .one_or_none()
        )
        if db_row is not None:
            query = query.filter(SqlaTable.database_id == db_row.id)
    return query.first()


def _resolve_datasource(config: DailyReportConfig) -> Any:
    """Resolve the configured Superset dataset (SqlaTable)."""
    return _resolve_datasource_by_ref(
        config.datasource_id,
        config.table_name,
        config.schema,
        config.database_name,
    )


def _run_sql(ds: Any, sql: str) -> pd.DataFrame:
    """Execute SQL against the dataset's database and return a DataFrame."""
    with ds.database.get_sqla_engine() as engine:
        with engine.connect() as con:
            return pd.read_sql_query(sql, con=con)


def _quote_ident(identifier: str, dialect: Any) -> str:
    """Quote a column/table identifier for the active dialect."""
    return str(dialect.identifier_preparer.quote(identifier))


def _table_ref(ds: Any, dialect: Any) -> str:
    """Build a quoted schema.table reference using the dataset's catalog/schema."""
    parts = []
    if getattr(ds, "catalog", None):
        parts.append(_quote_ident(str(ds.catalog), dialect))
    if getattr(ds, "schema", None):
        parts.append(_quote_ident(str(ds.schema), dialect))
    parts.append(_quote_ident(str(ds.table_name), dialect))
    return ".".join(parts)


def _billable_columns(ds: Any) -> set[str]:
    """Return the set of accessible column names on the dataset."""
    return {c.column_name for c in ds.columns}


def _validate_columns(
    config: DailyReportConfig,
    cols: set[str],
    progress: ProgressFn | None,
) -> tuple[list[str], str]:
    """Validate the configured field mapping against the dataset's columns.

    Returns ``(wanted, date_col)`` where ``wanted`` is the ordered list of
    matched columns to SELECT.  Emits helpful diagnostics when configured
    columns are missing, and raises a clear ``RuntimeError`` instead of
    allowing a ``SELECT *`` / full-table scan to run (which would hang).
    """
    requested = {
        config.date_column,
        config.project_column,
        config.channel_column,
        config.ad_channel_column,
        config.region_column,
        config.business_column,
        config.channel_type_column,
        config.spend_column,
        config.new_users_column,
        config.cpa_column,
        *config.ltv_columns,
        *config.roi_columns,
    }
    # An empty-string field means the user intentionally left it unmapped
    # (e.g. no region column); exclude it from selection and diagnostics.
    requested = {c for c in requested if c}
    available = {c for c in requested if c in cols}
    date_col = config.date_column

    _emit(progress, f"数据集可用列：{len(cols)} 个")
    if missing := requested - available:
        _emit(
            progress,
            f"配置字段未命中（可能写错了列名）：{sorted(missing)}",
            "warning",
        )
        _emit(
            progress,
            f"数据集实际可用列（前 60）：{sorted(cols)[:60]}",
            "warning",
        )

    if date_col not in cols:
        raise RuntimeError(
            f"日期列 '{date_col}' 不存在于数据集，无法按日期过滤（会全表扫描）。"
            f"可用列：{sorted(cols)[:60]}"
        )
    if not available:
        raise RuntimeError(
            "配置的字段与数据集列完全不匹配，无法生成报告。请在「编辑参数」里"
            "核实字段映射，或参考上方的可用列列表。"
        )
    return sorted(c for c in requested if c in cols), date_col


def _build_date_predicates(
    cols_map: dict[str, Any],
    tp: Any,
    date_col: str,
    start_date: date,
    end_date: date,
) -> list[Any]:
    """Build the date-range WHERE predicates for the fetch query.

    Integer date columns (e.g. ``report_date`` = 20260816) are compared as
    integers — a ``'2026-08-16'`` string fails with "invalid input syntax for
    integer".  Real date/string columns bind an explicit String literal so
    literal inlining renders ``'2026-08-16'`` (String always has a literal
    renderer; a raw ``datetime.date`` against a DATE column throws "No literal
    value renderer ... datatype DATE" under literal_binds).
    """
    if date_col not in cols_map:
        return []
    if isinstance(start_date, datetime):
        start_date = start_date.date()
    if isinstance(end_date, datetime):
        end_date = end_date.date()
    date_sqla = cols_map[date_col].get_sqla_col(template_processor=tp)
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    col_type = getattr(cols_map[date_col], "type", None)
    if col_type is not None and isinstance(col_type, sa.Integer):
        return [
            date_sqla >= int(start_date.strftime("%Y%m%d")),
            date_sqla <= int(end_date.strftime("%Y%m%d")),
        ]
    return [
        date_sqla >= sa.literal(start_str, sa.String()),
        date_sqla <= sa.literal(end_str, sa.String()),
    ]


def _query_sql(
    ds: Any,
    wanted: list[str],
    date_col: str,
    start_date: date,
    end_date: date,
    static_filters: dict[str, str],
) -> str:
    """Build the fetch SELECT SQL through Superset's from-clause machinery.

    Using ``get_from_clause`` means SQL-based (virtual) datasets — whose
    ``dataset.sql`` is the real source — are wrapped as a subquery/CTE instead
    of being referenced by a physical table name (which does not exist for
    them).
    """
    cols_map = {c.column_name: c for c in ds.columns}
    tp = ds.get_template_processor()
    tbl, cte = ds.get_from_clause(tp)

    select_cols: list[Any] = []
    for name in wanted:
        if name in cols_map:
            select_cols.append(
                cols_map[name].get_sqla_col(template_processor=tp).label(name)
            )

    qry = sa.select(select_cols).select_from(tbl)
    preds = _build_date_predicates(cols_map, tp, date_col, start_date, end_date)
    for col, val in static_filters.items():
        if col in cols_map:
            preds.append(cols_map[col].get_sqla_col(template_processor=tp) == val)
    if preds:
        qry = qry.where(sa.and_(*preds))

    with ds.database.get_sqla_engine() as engine:
        sql = str(qry.compile(engine, compile_kwargs={"literal_binds": True}))
        sql = ds._apply_cte(sql, cte)
        if engine.dialect.identifier_preparer._double_percents:
            sql = sql.replace("%%", "%")
        return ds.database.mutate_sql_based_on_config(sql)


def _fetch_rows(
    config: DailyReportConfig,
    ctx: DailyReportContext,
    ds: Any,
    start_date: date,
    end_date: date,
    cancel: CancelFn | None = None,
    progress: ProgressFn | None = None,
) -> pd.DataFrame:
    """Fetch raw rows for a date range, selecting only configured columns."""
    _maybe_cancel(cancel)
    cols = _billable_columns(ds)
    wanted, date_col = _validate_columns(config, cols, progress)
    dialect = ds.database.get_dialect()
    sql = _query_sql(ds, wanted, date_col, start_date, end_date, config.static_filters)

    fetch_msg = (
        f"正在执行数据库查询（{len(wanted)} 列，范围 {start_date} ~ {end_date}）…"
    )
    _emit(progress, fetch_msg)
    _set_stage("fetch", f"执行查询：{_table_ref(ds, dialect)}")
    logger.info(
        "daily-report: executing fetch SQL (%d chars)\n%s",
        len(sql),
        sql,
    )
    t0 = time.perf_counter()
    _maybe_cancel(cancel)
    df = _run_sql(ds, sql)
    elapsed = time.perf_counter() - t0
    _timed(progress, "数据库查询", t0)
    _emit(progress, f"查询返回 {len(df)} 行（耗时 {elapsed:.1f}s），正在处理…")
    _set_stage("fetch_done", f"已取回 {len(df)} 行")
    if df.empty:
        return df
    if date_col in df.columns:
        _emit(progress, "正在解析日期列…")
        df[date_col] = pd.to_datetime(df[date_col], errors="coerce")
    return df


# --------------------------------------------------------------------------- #
# Date / period helpers
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class PeriodBucket:
    """One comparison bucket of the briefing series.

    A daily briefing buckets by single days; a weekly briefing buckets by
    complete natural weeks (Sunday–Saturday).  ``label`` is the ISO start date
    — the stable key used across payloads — while ``range_label`` renders the
    covered range for chart/table display.
    """

    label: str
    start: date
    end: date

    @property
    def range_label(self) -> str:
        if self.start == self.end:
            return self.label
        if self.start.year == self.end.year:
            return f"{self.start.strftime('%m-%d')} ~ {self.end.strftime('%m-%d')}"
        return f"{self.start.isoformat()} ~ {self.end.isoformat()}"


def _week_start(d: date) -> date:
    """Return the Sunday that starts the week containing ``d``."""
    return d - timedelta(days=(d.weekday() + 1) % 7)


def _week_containing(d: date) -> tuple[date, date]:
    """Return the (Sunday, Saturday) bounds of the natural week containing ``d``."""
    start = _week_start(d)
    return start, start + timedelta(days=6)


def _reference_periods(
    ctx: DailyReportContext, config: DailyReportConfig
) -> tuple[PeriodBucket, PeriodBucket, list[PeriodBucket]]:
    """Resolve the (reported, compared-against, history) buckets.

    Daily briefings report on yesterday (or the day before an explicit override
    date) and compare against the day before, with a trailing window of
    ``days_of_history`` days.  Weekly briefings aggregate complete natural
    weeks: without an override this is the last *complete* week; with one, the
    week containing the given date.  Comparison is against the preceding week,
    and history covers ``weeks_of_history`` weeks ending at the reported week.
    All buckets are ordered newest-first.
    """
    if ctx.override_date:
        override = datetime.strptime(ctx.override_date, "%Y-%m-%d").date()
    else:
        override = date.today()

    if normalize_report_type(config.report_type) == "weekly":
        if ctx.override_date:
            cur_start, cur_end = _week_containing(override)
        else:
            # Anchor a week back so the default window is always complete,
            # regardless of today's weekday.
            cur_start, cur_end = _week_containing(
                _week_start(override) - timedelta(days=7)
            )
        weeks = max(int(config.weeks_of_history or 1), 1)
        history = [
            PeriodBucket(
                (cur_start - timedelta(days=7 * i)).isoformat(),
                cur_start - timedelta(days=7 * i),
                cur_end - timedelta(days=7 * i),
            )
            for i in range(weeks)
        ]
        prev_start = cur_start - timedelta(days=7)
        previous = PeriodBucket(
            prev_start.isoformat(), prev_start, prev_start + timedelta(days=6)
        )
        current = PeriodBucket(cur_start.isoformat(), cur_start, cur_end)
        return current, previous, history

    yesterday = override - timedelta(days=1)
    day_before = override - timedelta(days=2)
    days = max(int(ctx.days_of_history or config.days_of_history or 30), 1)
    history = [
        PeriodBucket(
            (override - timedelta(days=i)).isoformat(),
            override - timedelta(days=i),
            override - timedelta(days=i),
        )
        for i in range(1, days + 1)
    ]
    return (
        PeriodBucket(yesterday.isoformat(), yesterday, yesterday),
        PeriodBucket(day_before.isoformat(), day_before, day_before),
        history,
    )


# --------------------------------------------------------------------------- #
# Report computation
# --------------------------------------------------------------------------- #


def _weighted_ratio(
    df: pd.DataFrame,
    numerator_col: str,
    denominator_col: str,
    weighted: bool = True,
) -> float:
    """Compute a weighted ratio over the given segment-level rows.

    With ``weighted`` (default), the metric is a per-segment rate and the result
    is SUM(value * weight) / SUM(weight).  Otherwise the column is an additive
    numerator and the result is SUM(value) / SUM(weight).
    """
    if numerator_col not in df.columns or denominator_col not in df.columns:
        return 0.0
    weight = pd.to_numeric(df[denominator_col], errors="coerce").fillna(0.0)
    if weighted:
        value = pd.to_numeric(df[numerator_col], errors="coerce").fillna(0.0)
        num = float((value * weight).sum())
    else:
        num = float(pd.to_numeric(df[numerator_col], errors="coerce").sum())
    den = float(weight.sum())
    return (num / den) if den else 0.0


def _range_subset(
    df: pd.DataFrame, date_col: str, start: date, end: date
) -> pd.DataFrame:
    """Return the rows of ``df`` whose date column falls within ``[start, end]``.

    Both bounds are inclusive.  Returns an empty frame (preserving columns) when
    the date column is absent, so callers can always aggregate over the result
    safely.  Unparseable dates simply never match.
    """
    if date_col not in df.columns or df.empty:
        return df.iloc[0:0]
    parsed = pd.to_datetime(df[date_col], errors="coerce")
    mask = (parsed.dt.date >= start) & (parsed.dt.date <= end)
    return df[mask]


def _bucket_subset(
    df: pd.DataFrame, date_col: str, bucket: PeriodBucket
) -> pd.DataFrame:
    """Return the rows belonging to a comparison bucket."""
    return _range_subset(df, date_col, bucket.start, bucket.end)


def _cap_long_tail(rows: list[dict[str, Any]]) -> None:
    """Keep only entries whose cumulative spend reaches ~95% of the total.

    Drops the long tail of negligible contributors while preserving the existing
    (descending-by-spend) order, so the primary view stays focused.
    """
    total = sum(float(r.get("spend") or 0) for r in rows)
    if not total:
        return
    cum = 0.0
    cut = len(rows)
    for i, r in enumerate(rows):
        cum += float(r.get("spend") or 0)
        if cum >= 0.95 * total:
            cut = i + 1
            break
    rows[:] = rows[:cut]


def _build_core_metrics(
    day_df: pd.DataFrame,
    config: DailyReportConfig,
    ctx: DailyReportContext,
) -> dict[str, Any]:
    """Compute the overall core metrics (spend, new users, CPA, LTV/ROI) for a
    single day's segment-level rows.

    Returns a dict with stable keys so callers can reuse it both for the
    headline (yesterday) metrics and for each entry of the day-by-day series.
    """
    spend_col = config.spend_column
    users_col = config.new_users_column
    if day_df.empty:
        core: dict[str, Any] = {"spend": 0.0, "new_users": 0, "cpa": 0.0}
        for key in _METRIC_KEYS:
            core[f"LTV{key}"] = 0.0
            core[f"ROI{key}"] = 0.0
        return core
    total_spend = float(pd.to_numeric(day_df[spend_col], errors="coerce").sum())
    total_users = float(pd.to_numeric(day_df[users_col], errors="coerce").sum())
    cpa = total_spend / total_users if total_users else 0.0
    core = {"spend": total_spend, "new_users": int(total_users), "cpa": cpa}
    for key, col in zip(_METRIC_KEYS, config.ltv_columns, strict=False):
        core[f"LTV{key}"] = _weighted_ratio(
            day_df, col, users_col, weighted=config.ltv_weighted_average
        )
    for key, col in zip(_METRIC_KEYS, config.roi_columns, strict=False):
        core[f"ROI{key}"] = _weighted_ratio(
            day_df, col, spend_col, weighted=config.roi_weighted_average
        )
    return core


def _build_daily_series(
    df: pd.DataFrame,
    config: DailyReportConfig,
    ctx: DailyReportContext,
    date_col: str,
    history: list[PeriodBucket],
) -> list[dict[str, Any]]:
    """Build the bucket-by-bucket comparison series across ``history``.

    Each entry carries the headline metrics for that bucket (newest first) so
    the UI can render a trend and compute deltas without a second query.
    Buckets with no rows are emitted with zeroed metrics so the trend stays
    continuous over the requested window.
    """
    if not history:
        return []
    series: list[dict[str, Any]] = []
    for bucket in history:
        day_df = _bucket_subset(df, date_col, bucket)
        cm = _build_core_metrics(day_df, config, ctx)
        # LTV1-LTV7 are emitted per bucket (in addition to the headline
        # LTV1/ROI1) so the frontend 展开表格 can show the LTV maturation curve.
        ltv_extra = {
            f"ltv{key}": cm.get(f"LTV{key}", 0.0) for key in (2, 3, 4, 5, 6, 7)
        }
        series.append(
            {
                "date": bucket.label,
                "label": bucket.range_label,
                "spend": cm["spend"],
                "new_users": cm["new_users"],
                "cpa": cm["cpa"],
                "ltv1": cm.get("LTV1", 0.0),
                "roi1": cm.get("ROI1", 0.0),
                **ltv_extra,
            }
        )
    # ``history`` is newest-first, so the series preserves that order for
    # display convenience.
    return series


def _build_project_summary_for_period(
    period_df: pd.DataFrame,
    prev_df: pd.DataFrame,
    config: DailyReportConfig,
    ctx: DailyReportContext,
) -> list[dict[str, Any]]:
    """Per-game metrics for a single bucket (used for the drill-down).

    Mirrors the shape of ``project_summary`` (spend / new_users / cpa / ltv1 /
    roi1 plus an optional previous-bucket ``prev``) but for an arbitrary period
    frame so the frontend can expand a point on the trend chart into the game
    breakdown for that specific bucket.
    """
    project_col = config.project_column
    spend_col = config.spend_column
    users_col = config.new_users_column
    if period_df.empty or project_col not in period_df.columns:
        return []
    g = (
        period_df.groupby(project_col, dropna=False)
        .agg(
            **{
                "spend": (spend_col, "sum"),
                "new_users": (users_col, "sum"),
            }
        )
        .reset_index()
    )
    has_prev = not prev_df.empty and project_col in prev_df.columns
    rows: list[dict[str, Any]] = []
    for _, r in g.iterrows():
        proj = str(r.get(project_col) or "")
        if proj in SCATTERED_PROJECT_LABELS:
            continue
        su = float(r.get("spend") or 0)
        nu = float(r.get("new_users") or 0)
        sub = period_df[period_df[project_col].astype(str) == proj]
        row: dict[str, Any] = {
            "project": proj,
            "spend": su,
            "new_users": int(nu),
            "cpa": su / nu if nu else 0.0,
        }
        if config.ltv_columns:
            row["ltv1"] = _weighted_ratio(
                sub,
                config.ltv_columns[0],
                users_col,
                weighted=config.ltv_weighted_average,
            )
        if config.roi_columns:
            row["roi1"] = _weighted_ratio(
                sub,
                config.roi_columns[0],
                spend_col,
                weighted=config.roi_weighted_average,
            )
        if has_prev:
            psub = prev_df[prev_df[project_col].astype(str) == proj]
            psu = float(pd.to_numeric(psub[spend_col], errors="coerce").sum())
            pnu = float(pd.to_numeric(psub[users_col], errors="coerce").sum())
            prev: dict[str, Any] = {"spend": psu, "new_users": int(pnu)}
            if config.ltv_columns:
                prev["ltv1"] = _weighted_ratio(
                    psub,
                    config.ltv_columns[0],
                    users_col,
                    weighted=config.ltv_weighted_average,
                )
            if config.roi_columns:
                prev["roi1"] = _weighted_ratio(
                    psub,
                    config.roi_columns[0],
                    spend_col,
                    weighted=config.roi_weighted_average,
                )
            row["prev"] = prev
        rows.append(row)
    rows.sort(key=lambda p: p["spend"], reverse=True)
    top_n = ctx.top_projects_count or config.top_projects_count or 10
    return rows[:top_n]


def _ltv_roi_fields(sub: pd.DataFrame, config: DailyReportConfig) -> dict[str, float]:
    """Headline ``ltv1``/``roi1`` fields for a segment-level frame.

    A key is only present when the corresponding metric column is configured,
    matching the historical payload shape.
    """
    fields: dict[str, float] = {}
    if config.ltv_columns:
        fields["ltv1"] = _weighted_ratio(
            sub,
            config.ltv_columns[0],
            config.new_users_column,
            weighted=config.ltv_weighted_average,
        )
    if config.roi_columns:
        fields["roi1"] = _weighted_ratio(
            sub,
            config.roi_columns[0],
            config.spend_column,
            weighted=config.roi_weighted_average,
        )
    return fields


def _agg_spend_users(
    bucket_df: pd.DataFrame,
    group_cols: list[str],
    config: DailyReportConfig,
) -> pd.DataFrame:
    """Sum spend / new users per group over one bucket's rows."""
    return (
        bucket_df.groupby(group_cols, dropna=False)
        .agg(
            **{
                "spend": (config.spend_column, "sum"),
                "new_users": (config.new_users_column, "sum"),
            }
        )
        .reset_index()
    )


def _bucket_group_metrics(
    bucket_df: pd.DataFrame,
    group_cols: list[str],
    config: DailyReportConfig,
) -> dict[tuple[str, ...], dict[str, Any]]:
    """Per-group metrics ({spend, new_users, cpa} + LTV1/ROI1) for a bucket.

    Keyed by stringified group values so callers can look a group up without
    worrying about the original cell types (NaN, numpy scalars, ...).
    """
    result: dict[tuple[str, ...], dict[str, Any]] = {}
    if bucket_df.empty or not all(c in bucket_df.columns for c in group_cols):
        return result
    for _, row in _agg_spend_users(bucket_df, group_cols, config).iterrows():
        key = tuple(str(row.get(c) or "") for c in group_cols)
        sub = bucket_df
        for c, v in zip(group_cols, key, strict=True):
            sub = sub[sub[c].astype(str) == v]
        su = float(row.get("spend") or 0)
        nu = float(row.get("new_users") or 0)
        entry: dict[str, Any] = {
            "spend": su,
            "new_users": int(nu),
            "cpa": su / nu if nu else 0.0,
        }
        entry.update(_ltv_roi_fields(sub, config))
        result[key] = entry
    return result


def _build_project_summary_rows(
    current_df: pd.DataFrame,
    prev_df: pd.DataFrame,
    config: DailyReportConfig,
) -> list[dict[str, Any]]:
    """主游戏 summary — one row per game across all its channels/regions.

    Each row carries the reported period's metrics plus the previous period's
    (``prev``) so the UI can show per-game deltas, and is capped to the games
    making up ~95% of total spend.
    """
    project_col = config.project_column
    rows: list[dict[str, Any]] = []
    if current_df.empty or project_col not in current_df.columns:
        return rows
    prev_map = _bucket_group_metrics(prev_df, [project_col], config)
    for _, r in _agg_spend_users(current_df, [project_col], config).iterrows():
        g = str(r.get(project_col) or "")
        if g in SCATTERED_PROJECT_LABELS:
            continue
        sub = current_df[current_df[project_col].astype(str) == g]
        su = float(r.get("spend") or 0)
        nu = float(r.get("new_users") or 0)
        row: dict[str, Any] = {
            "project": g,
            "spend": su,
            "new_users": int(nu),
            "cpa": su / nu if nu else 0.0,
        }
        row.update(_ltv_roi_fields(sub, config))
        row["prev"] = prev_map.get((g,), {})
        rows.append(row)
    rows.sort(key=lambda p: p["spend"], reverse=True)
    # Drop the long tail: keep the games that make up ~95% of total spend
    # so the primary view stays focused on material contributors.
    _cap_long_tail(rows)
    return rows


def _combo_bucket_series(
    df: pd.DataFrame,
    date_col: str,
    history: list[PeriodBucket],
    group_cols: list[str],
    key_vals: tuple[str, ...],
    config: DailyReportConfig,
    ctx: DailyReportContext,
) -> list[dict[str, Any]]:
    """Per-bucket headline metrics for one combo across the history window."""
    series: list[dict[str, Any]] = []
    for bucket in history:
        day_df = _bucket_subset(df, date_col, bucket)
        sub = day_df
        for c, v in zip(group_cols, key_vals, strict=True):
            sub = sub[sub[c].astype(str) == v]
        cm = _build_core_metrics(sub, config, ctx)
        series.append(
            {
                "date": bucket.label,
                "label": bucket.range_label,
                "spend": cm["spend"],
                "new_users": cm["new_users"],
                "cpa": cm["cpa"],
                "ltv1": cm.get("LTV1", 0.0),
                "roi1": cm.get("ROI1", 0.0),
                **{f"ltv{key}": cm.get(f"LTV{key}", 0.0) for key in (2, 3, 4, 5, 6, 7)},
            }
        )
    return series


def _build_project_combo_rows(
    df: pd.DataFrame,
    date_col: str,
    current_df: pd.DataFrame,
    prev_df: pd.DataFrame,
    history: list[PeriodBucket],
    config: DailyReportConfig,
    ctx: DailyReportContext,
) -> list[dict[str, Any]]:
    """主游戏 × 渠道商 (× 地区) combo rows with a per-bucket mini-series."""
    project_col = config.project_column
    rows: list[dict[str, Any]] = []
    if current_df.empty or project_col not in current_df.columns:
        return rows
    group_key = [
        c
        for c in (project_col, config.channel_column, config.region_column)
        if c in current_df.columns
    ] or [project_col]

    cur_map = _bucket_group_metrics(current_df, group_key, config)
    prev_map = _bucket_group_metrics(prev_df, group_key, config)
    for key_vals, base in cur_map.items():
        if key_vals[0] in SCATTERED_PROJECT_LABELS:
            continue
        sub = current_df
        for c, v in zip(group_key, key_vals, strict=True):
            sub = sub[sub[c].astype(str) == v]
        row: dict[str, Any] = {
            "project": key_vals[0],
            "channel": key_vals[1] if len(key_vals) > 1 else "",
            "region": key_vals[2] if len(key_vals) > 2 else "",
            "spend": base["spend"],
            "new_users": base["new_users"],
            "cpa": base["cpa"],
        }
        row.update(_ltv_roi_fields(sub, config))
        row["prev"] = prev_map.get(key_vals, {})
        # Per-combo bucket series so the UI can expand a row into its own
        # trend (spend / new-users / ROI1 / LTV1 over the history window),
        # not just current-vs-previous.
        row["daily"] = _combo_bucket_series(
            df, date_col, history, group_key, key_vals, config, ctx
        )
        rows.append(row)
    rows.sort(key=lambda p: p["spend"], reverse=True)
    top_n = ctx.top_projects_count or config.top_projects_count
    return rows[:top_n]


def _build_media_rows(
    current_df: pd.DataFrame,
    prev_df: pd.DataFrame,
    config: DailyReportConfig,
) -> list[dict[str, Any]]:
    """Media breakdown rows with period-over-period (环比) comparisons."""
    ad_channel_col = config.ad_channel_column
    rows: list[dict[str, Any]] = []
    if current_df.empty or ad_channel_col not in current_df.columns:
        return rows
    cur_map = _bucket_group_metrics(current_df, [ad_channel_col], config)
    prev_map = _bucket_group_metrics(prev_df, [ad_channel_col], config)
    for (media_channel,), base in cur_map.items():
        # Drop media with no rebate-adjusted spend: a channel that carried no
        # real cost during the reported period adds nothing to the analysis.
        if base["spend"] <= 0:
            continue
        sub = current_df[current_df[ad_channel_col].astype(str) == media_channel]
        row: dict[str, Any] = {
            "channel": media_channel,
            "spend": base["spend"],
            "new_users": base["new_users"],
            "cpa": base["cpa"],
        }
        row.update(_ltv_roi_fields(sub, config))
        row["prev"] = prev_map.get((media_channel,), {})
        rows.append(row)
    rows.sort(key=lambda m: m["spend"], reverse=True)
    # Drop the long-tail media (negligible spend) to keep the auxiliary
    # media view focused on the channels that matter.
    _cap_long_tail(rows)
    return rows


def _build_report(
    df: pd.DataFrame,
    config: DailyReportConfig,
    ctx: DailyReportContext,
    current: PeriodBucket,
    previous: PeriodBucket,
    history: list[PeriodBucket],
) -> dict[str, Any]:
    """Assemble the report JSON from the fetched rows (segment-level).

    ``current`` is the reported bucket (a single day for daily briefings, a
    complete week for weekly ones), ``previous`` the comparison bucket, and
    ``history`` the newest-first trend buckets.
    """
    report_type = normalize_report_type(config.report_type)
    date_col = config.date_column

    # ---- Overall core metrics (reported period) ----
    current_df = _bucket_subset(df, date_col, current)
    core = _build_core_metrics(current_df, config, ctx)

    # ---- Previous-period core metrics (for period-over-period comparison) ----
    core_previous = _build_core_metrics(
        _bucket_subset(df, date_col, previous), config, ctx
    )

    # ---- Bucket-by-bucket comparison series ----
    daily = _build_daily_series(df, config, ctx, date_col, history)

    # ---- Per-bucket, per-game breakdown (trend → 主游戏 drill-down) ----
    daily_projects: list[dict[str, Any]] = []
    for i, bucket in enumerate(history):
        day_df = _bucket_subset(df, date_col, bucket)
        prev_df = (
            _bucket_subset(df, date_col, history[i + 1])
            if i + 1 < len(history)
            else df.iloc[0:0]
        )
        for r in _build_project_summary_for_period(day_df, prev_df, config, ctx):
            r["date"] = bucket.label
            r["label"] = bucket.range_label
            daily_projects.append(r)

    prev_df = _bucket_subset(df, date_col, previous)
    project_summary = _build_project_summary_rows(current_df, prev_df, config)
    projects = _build_project_combo_rows(
        df, date_col, current_df, prev_df, history, config, ctx
    )
    media = _build_media_rows(current_df, prev_df, config)

    alerts = _detect_alerts(core, config)

    return {
        "report_type": report_type,
        # ``report_date``/``previous_date`` keep the single-date keys the
        # frontend already renders; weekly briefings carry them as the period's
        # end dates alongside the explicit period bounds below.
        "report_date": current.end.isoformat(),
        "previous_date": previous.end.isoformat(),
        "period_start": current.start.isoformat(),
        "period_end": current.end.isoformat(),
        "previous_period_start": previous.start.isoformat(),
        "previous_period_end": previous.end.isoformat(),
        "core": core,
        "core_previous": core_previous,
        "daily": daily,
        "daily_projects": daily_projects,
        "project_summary": project_summary,
        "projects": projects,
        "media": media,
        "alerts": alerts,
        "thresholds": {
            "roi_critical_line": config.roi_critical_line,
            "roi_warning_line": config.roi_warning_line,
            "default_breakeven_line": config.default_breakeven_line,
        },
        "empty": False,
    }


def _detect_alerts(
    core: dict[str, Any],
    config: DailyReportConfig,
) -> list[dict[str, Any]]:
    """Detect alerts on overall core metrics."""
    alerts: list[dict[str, Any]] = []
    roi = core.get("ROI1") or 0.0
    critical_line = config.roi_critical_line
    warning_line = config.roi_warning_line
    if roi and roi < critical_line:
        alerts.append(
            {
                "level": "critical",
                "metric": "ROI1",
                "message": (
                    f"整体 ROI1 严重低于盈亏线（{roi:.3f} < {critical_line:.2f}）"
                ),
            }
        )
    elif roi and roi < warning_line:
        alerts.append(
            {
                "level": "warning",
                "metric": "ROI1",
                "message": f"整体 ROI1 低于盈亏线（{roi:.3f} < {warning_line:.2f}）",
            }
        )
    return alerts


def _select_by_indices(candidates: list[str], indices: list[int]) -> list[str]:
    """Pick candidate columns whose names refer to the given metric indices.

    Supports English suffixes (``rt_paid_money_14``) and Chinese day suffixes
    (``14日充值``).  The separator/prefix rule prevents e.g. ``rt_paid_money_12``
    or ``14日充值`` from matching the index ``2``/``4``.
    """
    first_by_index: dict[int, str] = {}
    for col in candidates:
        idx = _metric_index(col)
        if idx is not None and idx not in first_by_index:
            first_by_index[idx] = col
    return [first_by_index[idx] for idx in indices if idx in first_by_index]


def _money_columns(columns: list[str]) -> list[str]:
    """Return backdated/cumulative revenue columns (additive LTV/ROI numerators).

    Matches English patterns (``rt_paid_money_14``, ``paid_money_*``,
    ``*_money_*``) and Chinese day-recharge columns (``14日充值``,
    ``累计充值``).
    """
    result: list[str] = []
    for col in columns:
        low = col.lower()
        if any(s in low for s in ("rt_paid_money", "paid_money", "money_")):
            result.append(col)
        elif "日充值" in col or col == "累计充值":
            result.append(col)
    return result


def _resolve_metric_columns(
    rate_cols: list[str],
    money_cols: list[str],
    indices: list[int],
) -> tuple[list[str], bool]:
    """Resolve LTV/ROI columns to use and whether they are weighted averages.

    Rate-based columns (e.g. ``ltv_N``/``roi_N``) are weighted averages over the
    segment weight; return-based additive columns (e.g. ``rt_paid_money_N``) are
    plain numerators (``SUM(col)/SUM(weight)``, ``weighted=False``).
    """
    if rate_cols:
        cols = _select_by_indices(rate_cols, indices) or rate_cols[:9]
        return cols, True
    if money_cols:
        cols = _select_by_indices(money_cols, indices) or money_cols[:9]
        return cols, False
    return [], True


def suggest_field_map(
    columns: list[str], dttm_columns: Iterable[str] | None = None
) -> dict[str, Any]:
    """Guess a report field mapping from a dataset's column names.

    ``dttm_columns`` lists the dataset's real date/time columns (``is_dttm``);
    these take priority for the date field so an integer ``report_date`` (e.g.
    20260816) is not mistaken for a date.

    Returns a dict shaped like the stored config parameters (see
    ``config_from_dict``).  It is a *suggestion*: the frontend overlays it onto
    the report being edited and the user can still adjust individual fields.
    """
    lower = {c.lower(): c for c in columns if c}
    dttm = set(dttm_columns or [])

    def pick(*keys: str) -> str:
        return next((lower[k] for k in keys if k in lower), "")

    def like(*subs: str) -> list[str]:
        return [c for c in columns if any(s in c.lower() for s in subs)]

    # --- Dimensions ---
    # Prefer a genuinely date-typed (is_dttm / 日期) column over e.g. an integer
    # `report_date` (20260816) that only *looks* like a date by name.
    date_col = ""
    for key in ("日期", "报告日期", "report_date", "created_at", "create_time", "时间"):
        if key in lower and key in dttm:
            date_col = lower[key]
            break
    if not date_col:
        for col in columns:
            if col in dttm and any(
                s in col.lower() for s in ("日期", "date", "time", "_dt")
            ):
                date_col = col
                break
    if not date_col:
        date_col = pick("日期", "report_date", "created_at", "create_time", "时间")
    project_col = pick(
        "ad_gid", "主游戏[ID]", "主游戏", "papp_id", "app_id", "项目名称", "game"
    )
    channel_col = pick("渠道商", "cch_id", "channel", "渠道名称")
    ad_channel_col = pick(
        "ad_aid", "ad_cmedia", "ad_pmedia", "媒体[ID]", "媒体", "广告渠道名称"
    )
    region_col = pick("region", "country", "area", "主要地区")
    spend_col = pick("ad_real_cost", "ad_cost", "返点后消耗", "消耗", "spend", "cost")
    new_users_col = pick("n_unum", "act_num", "新增进入", "new_users", "激活")

    # --- Return-based (additive) vs rate-based (weighted) LTV/ROI columns ---
    money_cols = _money_columns(columns)
    ltv_rate_cols = like("ltv_")
    roi_rate_cols = like("roi_")
    indices = [1, 2, 3, 4, 5, 6, 7, 14, 30]

    ltv_cols, ltv_weighted = _resolve_metric_columns(ltv_rate_cols, money_cols, indices)
    roi_cols, roi_weighted = _resolve_metric_columns(roi_rate_cols, money_cols, indices)

    return {
        "date_column": date_col,
        "project_column": project_col,
        "channel_column": channel_col,
        "ad_channel_column": ad_channel_col,
        "region_column": region_col or "",
        "spend_column": spend_col,
        "new_users_column": new_users_col,
        "cpa_column": spend_col,
        "ltv_columns": ltv_cols,
        "roi_columns": roi_cols,
        "ltv_weighted_average": ltv_weighted,
        "roi_weighted_average": roi_weighted,
    }


# --------------------------------------------------------------------------- #
# Multi-dataset support
# --------------------------------------------------------------------------- #

# Upper bound on explicitly selected datasets per briefing, so a runaway
# configuration cannot fire an unbounded number of queries.
MAX_DATASETS_PER_BRIEFING = 10

# Canonical (first-dataset) field names every merged frame is renamed onto.
_CANONICAL_DIMENSION_FIELDS = (
    "date_column",
    "project_column",
    "channel_column",
    "ad_channel_column",
    "region_column",
    "spend_column",
    "new_users_column",
    "cpa_column",
)

_METRIC_INDEX_RE = re.compile(r"(?:[_-](\d+)$)|(?:(?:^|[^0-9])(\d+)日)")


def _metric_index(column: str) -> int | None:
    """Extract the metric day-index from a column name (``14日充值`` → 14)."""
    match = _METRIC_INDEX_RE.search(str(column))
    if not match:
        return None
    return int(match.group(1) or match.group(2))


def effective_datasource_ids(config: DailyReportConfig) -> list[int]:
    """Return the deduplicated dataset ids a briefing run should fetch.

    ``datasource_ids`` wins when present; otherwise the legacy single
    ``datasource_id`` applies.  Order is preserved (the first entry provides
    the canonical field mapping) and the list is capped at
    ``MAX_DATASETS_PER_BRIEFING``.
    """
    raw = list(config.datasource_ids or [])
    if not raw and config.datasource_id:
        raw = [config.datasource_id]
    ids: list[int] = []
    for value in raw:
        try:
            ds_id = int(value)
        except (TypeError, ValueError):
            continue
        if ds_id > 0 and ds_id not in ids:
            ids.append(ds_id)
    if len(ids) > MAX_DATASETS_PER_BRIEFING:
        logger.warning(
            "Briefing datasource_ids capped from %d to %d",
            len(ids),
            MAX_DATASETS_PER_BRIEFING,
        )
        ids = ids[:MAX_DATASETS_PER_BRIEFING]
    return ids


def _auto_map_for(ds: Any) -> dict[str, Any]:
    """Auto-resolve the briefing field mapping for one dataset's columns."""
    dttm_cols = {c.column_name for c in ds.columns if getattr(c, "is_dttm", False)}
    return suggest_field_map(sorted(_billable_columns(ds)), dttm_columns=dttm_cols)


def _canonicalize_metric_columns(
    out: pd.DataFrame,
    own_map: dict[str, Any],
    canonical_map: dict[str, Any],
) -> pd.DataFrame:
    """Align a frame's LTV/ROI columns onto canonical names by day-index.

    Source columns whose index has no canonical counterpart are dropped;
    canonical indices missing from this dataset are zero-filled afterwards by
    ``_canonicalize_frame``.
    """
    for metrics_field in ("ltv_columns", "roi_columns"):
        canonical_cols = canonical_map.get(metrics_field) or []
        canonical_by_idx = {
            idx: name
            for idx, name in zip(
                (_metric_index(c) for c in canonical_cols),
                canonical_cols,
                strict=False,
            )
            if idx is not None
        }
        for col in own_map.get(metrics_field) or []:
            if col not in out.columns:
                continue
            idx = _metric_index(col)
            target = canonical_by_idx.get(idx) if idx is not None else None
            if target and target != col:
                out = out.rename(columns={col: target})
            elif target is None:
                out = out.drop(columns=[col])
    return out


def _canonicalize_frame(
    df: pd.DataFrame,
    own_map: dict[str, Any],
    canonical_map: dict[str, Any],
) -> pd.DataFrame:
    """Rename one dataset's fetched frame onto the canonical field mapping.

    Dimension columns are renamed 1:1 via the two auto-mappings; metric
    columns are aligned per dataset by their day-index so a dataset lacking
    e.g. a ``30日充值`` column cannot shift the others.
    """
    out = df.copy()
    rename: dict[str, str] = {}
    for field in _CANONICAL_DIMENSION_FIELDS:
        src, dst = own_map.get(field) or "", canonical_map.get(field) or ""
        if src and dst and src != dst and src in out.columns:
            rename[src] = dst
    out = out.rename(columns=rename)
    out = _canonicalize_metric_columns(out, own_map, canonical_map)

    # Ensure every canonical column exists: optional dimensions as empty
    # strings, additive metric numerators as zeros.
    for field in _CANONICAL_DIMENSION_FIELDS:
        dst = canonical_map.get(field) or ""
        if dst and dst not in out.columns:
            out[dst] = ""
    for metrics_field in ("ltv_columns", "roi_columns"):
        for col in canonical_map.get(metrics_field) or []:
            if col and col not in out.columns:
                out[col] = 0.0
    return out


# --------------------------------------------------------------------------- #
# Public API
# --------------------------------------------------------------------------- #


def get_config_payload(config: DailyReportConfig) -> dict[str, Any]:
    """Serialize the effective config so the frontend can render labels."""
    return {
        "datasource_id": config.datasource_id,
        "datasource_ids": list(config.datasource_ids or []),
        "table_name": config.table_name,
        "date_column": config.date_column,
        "project_column": config.project_column,
        "channel_column": config.channel_column,
        "ad_channel_column": config.ad_channel_column,
        "region_column": config.region_column,
        "spend_column": config.spend_column,
        "new_users_column": config.new_users_column,
        "cpa_column": config.cpa_column,
        "ltv_columns": list(config.ltv_columns),
        "roi_columns": list(config.roi_columns),
        "alert_critical_threshold": config.alert_critical_threshold,
        "alert_warning_threshold": config.alert_warning_threshold,
        "roi_critical_line": config.roi_critical_line,
        "roi_warning_line": config.roi_warning_line,
        "top_projects_count": config.top_projects_count,
        "days_of_history": config.days_of_history,
        "weeks_of_history": config.weeks_of_history,
        "report_type": normalize_report_type(config.report_type),
        "baseline_thresholds": config.baseline_thresholds,
        "project_targets": config.project_targets,
        "default_breakeven_line": config.default_breakeven_line,
        "static_filters": config.static_filters,
    }


def _empty_payload(
    current: PeriodBucket, previous: PeriodBucket, history: list[PeriodBucket]
) -> dict[str, Any]:
    """Assemble the empty-result payload (no rows in the fetched window).

    The caller stamps the actual ``report_type``/``thresholds`` afterwards.
    """
    return {
        "report_type": "daily",
        "report_date": current.end.isoformat(),
        "previous_date": previous.end.isoformat(),
        "period_start": current.start.isoformat(),
        "period_end": current.end.isoformat(),
        "previous_period_start": previous.start.isoformat(),
        "previous_period_end": previous.end.isoformat(),
        "core": {},
        "projects": [],
        "media": [],
        "alerts": [
            {
                "level": "warning",
                "metric": "data",
                "message": "所选日期范围内没有数据，请检查数据集/字段映射配置。",
            }
        ],
        "history_dates": [b.label for b in history],
        "daily": [],
        "daily_projects": [],
        "core_previous": {},
        "project_summary": [],
        "thresholds": {},
        "empty": True,
    }


def run_briefing(
    config: DailyReportConfig,
    ctx: DailyReportContext,
    progress: ProgressFn | None = None,
    cancel: CancelFn | None = None,
) -> dict[str, Any]:
    """Run the briefing end to end and return the JSON payload.

    The briefing type (``config.report_type``) decides how the reporting
    windows are resolved: a single day for daily briefings, complete natural
    weeks for weekly ones.

    When ``progress`` is provided it is called with ``(message, level)`` at each
    stage so a background job can stream a live log.  When ``cancel`` is provided
    it is polled between heavy stages and may abort execution early.
    """
    report_type = normalize_report_type(config.report_type)
    config.report_type = report_type
    type_label = "周报" if report_type == "weekly" else "日报"
    _emit(progress, f"正在解析数据源（{type_label}）…")
    _maybe_cancel(cancel)
    current, previous, history = _reference_periods(ctx, config)

    ds_ids = effective_datasource_ids(config)
    datasets: list[tuple[int, str, Any]] = []
    for ds_id in ds_ids:
        ds = _resolve_datasource_by_ref(ds_id)
        if ds is None:
            raise RuntimeError(
                f"数据集 id={ds_id} 未找到，请检查简报参数中的数据集配置。"
            )
        datasets.append((ds_id, getattr(ds, "table_name", "") or "", ds))

    # Each dataset gets its own auto-resolved field mapping (column names
    # differ across datasets); rows are renamed onto the FIRST dataset's
    # canonical mapping and merged via UNION ALL before computation.
    frames: list[pd.DataFrame] = []
    canonical_map: dict[str, Any] | None = None
    window_start = min(b.start for b in history)
    window_end = max(b.end for b in history)
    if report_type == "weekly":
        _emit(
            progress,
            f"报告周期：{current.start.isoformat()} ~ {current.end.isoformat()}"
            f"（对比 {previous.start.isoformat()} ~ {previous.end.isoformat()}）",
        )
    total = len(datasets)
    for position, (ds_id, table_name, ds) in enumerate(datasets, start=1):
        label = f"{table_name}(id={ds_id})"
        own_map = _auto_map_for(ds)
        ds_config = replace(config, **own_map)
        if canonical_map is None:
            canonical_map = dict(own_map)
            for field_name, value in own_map.items():
                setattr(config, field_name, value)
            _emit(
                progress,
                f"字段映射已按数据集自动解析（项目={config.project_column}、"
                f"渠道={config.channel_column}、广告渠道={config.ad_channel_column}）",
            )
        _emit(
            progress,
            f"数据集[{position}/{total}] {label}：正在拉取数据"
            f"（{window_start.isoformat()} ~ {window_end.isoformat()}）…",
        )
        _maybe_cancel(cancel)
        frame = _fetch_rows(
            ds_config,
            ctx,
            ds,
            window_start,
            window_end,
            cancel=cancel,
            progress=progress,
        )
        # Strict failure policy: any selected dataset that fails aborts the
        # run (the fetch above raises), so numbers never silently omit a source.
        frames.append(_canonicalize_frame(frame, own_map, canonical_map or own_map))
        _emit(
            progress,
            f"数据集[{position}/{total}] {label}：返回 {len(frame)} 行",
        )

    df = (
        pd.concat(frames, ignore_index=True)
        if len(frames) > 1
        else (frames[0] if frames else pd.DataFrame())
    )
    if df.empty:
        _emit(progress, "所选日期范围内没有数据", "warning")
        payload = _empty_payload(current, previous, history)
        payload["report_type"] = report_type
        payload["thresholds"] = {
            "roi_critical_line": config.roi_critical_line,
            "roi_warning_line": config.roi_warning_line,
            "default_breakeven_line": config.default_breakeven_line,
        }
        return payload

    _emit(progress, f"合并后数据行数：{len(df)}，开始计算指标…")
    _set_stage("compute", "正在计算核心指标 / Top 项目 / 媒体分析")
    _maybe_cancel(cancel)
    t_build = time.perf_counter()
    payload = _build_report(df, config, ctx, current, previous, history)
    _timed(progress, "指标计算", t_build)
    _maybe_cancel(cancel)
    payload["history_dates"] = [b.label for b in history]
    _emit(
        progress,
        f"报告生成完成：{len(payload.get('projects', []))} 个项目、"
        f"{len(payload.get('media', []))} 个媒体频道。",
        "success",
    )
    _set_stage("done", "报告生成完成")
    return payload
