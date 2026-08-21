"""
Daily report service.

Fetches raw UA rows from a configured Superset dataset and computes the daily
report indicators (CPA, LTV, ROI, top projects, media performance, alerts).
This mirrors the logic of ``AI/daily_report_workflow`` but sources its data
from Superset's own datasources instead of Power BI.

The source dataset is assumed to hold *segment-level* rows: one row per
project/channel/region (optionally per day) carrying additive spend / new-user
columns plus the per-segment LTV / ROI metrics.  Weighted overall values are
recomputed from these segment rows.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date, datetime, timedelta
from typing import Any, Iterable

import pandas as pd
import sqlalchemy as sa

from superset.project.daily_report.config import DailyReportConfig, DailyReportContext

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


def _resolve_datasource(config: DailyReportConfig) -> Any:
    """Resolve the configured Superset dataset (SqlaTable)."""
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    if config.datasource_id:
        ds = (
            db.session.query(SqlaTable)
            .filter(SqlaTable.id == config.datasource_id)
            .one_or_none()
        )
        if ds is not None:
            return ds

    query = db.session.query(SqlaTable)
    if config.table_name:
        query = query.filter(SqlaTable.table_name == config.table_name)
    if config.schema:
        query = query.filter(SqlaTable.schema == config.schema)
    if config.database_name:
        from superset.models.core import Database

        db_row = (
            db.session.query(Database)
            .filter(Database.database_name == config.database_name)
            .one_or_none()
        )
        if db_row is not None:
            query = query.filter(SqlaTable.database_id == db_row.id)
    return query.first()


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
    missing = requested - available
    date_col = config.date_column

    _emit(progress, f"数据集可用列：{len(cols)} 个")
    if missing:
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
# Date helpers
# --------------------------------------------------------------------------- #


def _reference_dates(
    ctx: DailyReportContext, days: int
) -> tuple[date, date, list[date]]:
    """Return (yesterday, day_before_yesterday, history_dates).

    ``days`` is the number of history days to cover (resolved from the config
    and/or context before calling; see ``run_daily_report``).
    """
    if ctx.override_date:
        override = datetime.strptime(ctx.override_date, "%Y-%m-%d").date()
    else:
        override = date.today()
    yesterday = override - timedelta(days=1)
    day_before = override - timedelta(days=2)
    history = [override - timedelta(days=i) for i in range(1, days + 1)]
    return yesterday, day_before, history


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


def _day_subset(df: pd.DataFrame, date_col: str, label: str | None) -> pd.DataFrame:
    """Return the rows of ``df`` whose date column matches ``label`` (ISO date).

    Returns an empty frame (preserving columns) when ``label`` is missing, the
    date column is absent, or the date fails to parse, so callers can always
    aggregate over the result safely.
    """
    if not label or date_col not in df.columns:
        return df.iloc[0:0]
    try:
        target = datetime.strptime(label, "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return df.iloc[0:0]
    return df[pd.to_datetime(df[date_col], errors="coerce").dt.date == target]


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
    history_dates: list[str],
) -> list[dict[str, Any]]:
    """Build the day-by-day comparison series across ``history_dates``.

    Each entry carries the headline metrics for that day (newest first) so the
    UI can render a trend and compute day-over-day deltas without a second
    query.  Days with no rows are emitted with zeroed metrics so the trend
    stays continuous over the requested window.
    """
    if not history_dates:
        return []
    parsed = (
        pd.to_datetime(df[date_col], errors="coerce")
        if date_col in df.columns
        else pd.Series([], dtype="datetime64[ns]")
    )
    series: list[dict[str, Any]] = []
    for d in history_dates:
        try:
            target = datetime.strptime(d, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        if parsed.empty:
            day_df = df.iloc[0:0]
        else:
            day_df = df[parsed.dt.date == target]
        cm = _build_core_metrics(day_df, config, ctx)
        # LTV1-LTV7 are emitted per day (in addition to the headline LTV1/ROI1)
        # so the frontend 分天展开 table can show the LTV maturation curve.
        ltv_extra = {
            f"ltv{key}": cm.get(f"LTV{key}", 0.0)
            for key in (2, 3, 4, 5, 6, 7)
        }
        series.append(
            {
                "date": d,
                "spend": cm["spend"],
                "new_users": cm["new_users"],
                "cpa": cm["cpa"],
                "ltv1": cm.get("LTV1", 0.0),
                "roi1": cm.get("ROI1", 0.0),
                **ltv_extra,
            }
        )
    # ``history_dates`` is already newest-first, so the series preserves that
    # order for display convenience.
    return series


def _build_project_summary_for_day(
    day_df: pd.DataFrame,
    prev_df: pd.DataFrame,
    config: DailyReportConfig,
    ctx: DailyReportContext,
) -> list[dict[str, Any]]:
    """Per-game metrics for a single day (used for day → 主游戏 drill-down).

    Mirrors the shape of ``project_summary`` (spend / new_users / cpa / ltv1 /
    roi1 plus an optional day-over-day ``prev``) but for an arbitrary day frame
    so the frontend can expand a point on the 分天对比 chart into the game
    breakdown for that specific date.
    """
    project_col = config.project_column
    spend_col = config.spend_column
    users_col = config.new_users_column
    if day_df.empty or project_col not in day_df.columns:
        return []
    g = (
        day_df.groupby(project_col, dropna=False)
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
        sub = day_df[day_df[project_col].astype(str) == proj]
        row: dict[str, Any] = {
            "project": proj,
            "spend": su,
            "new_users": int(nu),
            "cpa": su / nu if nu else 0.0,
        }
        if config.ltv_columns:
            row["ltv1"] = _weighted_ratio(
                sub, config.ltv_columns[0], users_col,
                weighted=config.ltv_weighted_average,
            )
        if config.roi_columns:
            row["roi1"] = _weighted_ratio(
                sub, config.roi_columns[0], spend_col,
                weighted=config.roi_weighted_average,
            )
        if has_prev:
            psub = prev_df[prev_df[project_col].astype(str) == proj]
            psu = float(pd.to_numeric(psub[spend_col], errors="coerce").sum())
            pnu = float(pd.to_numeric(psub[users_col], errors="coerce").sum())
            prev: dict[str, Any] = {"spend": psu, "new_users": int(pnu)}
            if config.ltv_columns:
                prev["ltv1"] = _weighted_ratio(
                    psub, config.ltv_columns[0], users_col,
                    weighted=config.ltv_weighted_average,
                )
            if config.roi_columns:
                prev["roi1"] = _weighted_ratio(
                    psub, config.roi_columns[0], spend_col,
                    weighted=config.roi_weighted_average,
                )
            row["prev"] = prev
        rows.append(row)
    rows.sort(key=lambda p: p["spend"], reverse=True)
    top_n = ctx.top_projects_count or config.top_projects_count or 10
    return rows[:top_n]


def _build_report(
    df: pd.DataFrame,
    config: DailyReportConfig,
    ctx: DailyReportContext,
    yesterday_label: str,
    previous_label: str,
    history_dates: list[str],
) -> dict[str, Any]:
    """Assemble the report JSON from the fetched rows (segment-level)."""
    project_col = config.project_column
    region_col = config.region_column
    channel_col = config.channel_column
    ad_channel_col = config.ad_channel_column
    spend_col = config.spend_column
    users_col = config.new_users_column
    date_col = config.date_column

    # ---- Overall core metrics (yesterday) ----
    if date_col in df.columns and yesterday_label:
        try:
            target = datetime.strptime(yesterday_label, "%Y-%m-%d").date()
            yesterday_df = df[
                pd.to_datetime(df[date_col], errors="coerce").dt.date == target
            ]
        except (TypeError, ValueError):
            yesterday_df = df.copy()
    else:
        yesterday_df = df.copy()

    core = _build_core_metrics(yesterday_df, config, ctx)

    # ---- Previous-day core metrics (for day-over-day comparison) ----
    core_previous = _build_core_metrics(
        _day_subset(df, date_col, previous_label), config, ctx
    )

    # ---- Day-by-day comparison series ----
    daily = _build_daily_series(df, config, ctx, date_col, history_dates)

    # ---- Per-day, per-game breakdown (for 分天对比 → 主游戏 drill-down) ----
    # For each history date, compute the game-level metrics so a clicked day on
    # the trend chart can expand into that day's 主游戏 contribution.
    parsed_global = (
        pd.to_datetime(df[date_col], errors="coerce")
        if date_col in df.columns
        else pd.Series([], dtype="datetime64[ns]")
    )
    daily_projects: list[dict[str, Any]] = []
    for i, d in enumerate(history_dates):
        try:
            target = datetime.strptime(d, "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        day_df = (
            df[parsed_global.dt.date == target]
            if not parsed_global.empty
            else df.iloc[0:0]
        )
        prev_d = history_dates[i + 1] if i + 1 < len(history_dates) else None
        prev_df = df.iloc[0:0]
        if prev_d:
            try:
                prev_target = datetime.strptime(prev_d, "%Y-%m-%d").date()
                prev_df = (
                    df[parsed_global.dt.date == prev_target]
                    if not parsed_global.empty
                    else df.iloc[0:0]
                )
            except (TypeError, ValueError):
                prev_df = df.iloc[0:0]
        for r in _build_project_summary_for_day(day_df, prev_df, config, ctx):
            r["date"] = d
            daily_projects.append(r)

    # ---- Project (主游戏) summary — primary perspective ----
    # One row per 主游戏 (aggregated across all its channels/regions), carrying
    # yesterday's metrics AND the previous day's metrics so the UI can show
    # per-game day-over-day deltas and attribute total changes to games.
    project_summary: list[dict[str, Any]] = []
    if not yesterday_df.empty and project_col in yesterday_df.columns:
        pg = (
            yesterday_df.groupby(project_col, dropna=False)
            .agg(
                **{
                    "spend": (spend_col, "sum"),
                    "new_users": (users_col, "sum"),
                }
            )
            .reset_index()
        )
        prev_game_map: dict[str, dict[str, float]] = {}
        prev_game_df = _day_subset(df, date_col, previous_label)
        if not prev_game_df.empty and project_col in prev_game_df.columns:
            ppg = (
                prev_game_df.groupby(project_col, dropna=False)
                .agg(
                    **{
                        "spend": (spend_col, "sum"),
                        "new_users": (users_col, "sum"),
                    }
                )
                .reset_index()
            )
            for _, pr in ppg.iterrows():
                g = str(pr.get(project_col) or "")
                psu = float(pr.get("spend") or 0)
                pnu = float(pr.get("new_users") or 0)
                gsub = prev_game_df[
                    prev_game_df[project_col].astype(str) == g
                ]
                prev_game_map[g] = {
                    "spend": psu,
                    "new_users": int(pnu),
                    "cpa": psu / pnu if pnu else 0.0,
                    "ltv1": (
                        _weighted_ratio(
                            gsub,
                            config.ltv_columns[0],
                            users_col,
                            weighted=config.ltv_weighted_average,
                        )
                        if config.ltv_columns
                        else 0.0
                    ),
                    "roi1": (
                        _weighted_ratio(
                            gsub,
                            config.roi_columns[0],
                            spend_col,
                            weighted=config.roi_weighted_average,
                        )
                        if config.roi_columns
                        else 0.0
                    ),
                }
        for _, r in pg.iterrows():
            g = str(r.get(project_col) or "")
            if g in SCATTERED_PROJECT_LABELS:
                continue
            su = float(r.get("spend") or 0)
            nu = float(r.get("new_users") or 0)
            gsub = yesterday_df[yesterday_df[project_col].astype(str) == g]
            row: dict[str, Any] = {
                "project": g,
                "spend": su,
                "new_users": int(nu),
                "cpa": su / nu if nu else 0.0,
            }
            if config.ltv_columns:
                row["ltv1"] = _weighted_ratio(
                    gsub,
                    config.ltv_columns[0],
                    users_col,
                    weighted=config.ltv_weighted_average,
                )
            if config.roi_columns:
                row["roi1"] = _weighted_ratio(
                    gsub,
                    config.roi_columns[0],
                    spend_col,
                    weighted=config.roi_weighted_average,
                )
            row["prev"] = prev_game_map.get(g, {})
            project_summary.append(row)
        project_summary.sort(key=lambda p: p["spend"], reverse=True)
        # Drop the long tail: keep the games that make up ~95% of total spend
        # so the primary view stays focused on material contributors.
        _cap_long_tail(project_summary)

    # ---- Project rows (主游戏 × 渠道商, combo level) ----
    projects: list[dict[str, Any]] = []
    if not yesterday_df.empty and project_col in yesterday_df.columns:
        parsed = (
            pd.to_datetime(df[date_col], errors="coerce")
            if date_col in df.columns
            else pd.Series([], dtype="datetime64[ns]")
        )
        group_key = [
            c
            for c in (project_col, channel_col, region_col)
            if c in yesterday_df.columns
        ]
        if not group_key:
            group_key = [project_col]
        g = (
            yesterday_df.groupby(group_key, dropna=False)
            .agg(
                **{
                    "spend": (spend_col, "sum"),
                    "new_users": (users_col, "sum"),
                }
            )
            .reset_index()
        )

        # Previous-day combo metrics for day-over-day deltas.
        prev_combo_map: dict[tuple, dict[str, float]] = {}
        prev_combo_df = _day_subset(df, date_col, previous_label)
        if not prev_combo_df.empty and all(
            c in prev_combo_df.columns for c in group_key
        ):
            pg_prev = (
                prev_combo_df.groupby(group_key, dropna=False)
                .agg(
                    **{
                        "spend": (spend_col, "sum"),
                        "new_users": (users_col, "sum"),
                    }
                )
                .reset_index()
            )
            for _, pr in pg_prev.iterrows():
                key = tuple(str(pr.get(c) or "") for c in group_key)
                psu = float(pr.get("spend") or 0)
                pnu = float(pr.get("new_users") or 0)
                mask = prev_combo_df.copy()
                for c in group_key:
                    mask = mask[mask[c].astype(str) == str(pr.get(c) or "")]
                prev_combo_map[key] = {
                    "spend": psu,
                    "new_users": int(pnu),
                    "cpa": psu / pnu if pnu else 0.0,
                    "ltv1": (
                        _weighted_ratio(
                            mask,
                            config.ltv_columns[0],
                            users_col,
                            weighted=config.ltv_weighted_average,
                        )
                        if config.ltv_columns
                        else 0.0
                    ),
                    "roi1": (
                        _weighted_ratio(
                            mask,
                            config.roi_columns[0],
                            spend_col,
                            weighted=config.roi_weighted_average,
                        )
                        if config.roi_columns
                        else 0.0
                    ),
                }

        def _combo_sub(frame: pd.DataFrame, key_vals: list[Any]) -> pd.DataFrame:
            sub = frame.copy()
            for c, v in zip(group_key, key_vals):
                sub = sub[sub[c].astype(str) == str(v)]
            return sub

        for _, r in g.iterrows():
            g = str(r.get(project_col) or "")
            if g in SCATTERED_PROJECT_LABELS:
                continue
            key_vals = [r.get(c) for c in group_key]
            combo_sub = _combo_sub(yesterday_df, key_vals)
            su = float(r.get("spend") or 0)
            nu = float(r.get("new_users") or 0)
            row = {
                "project": str(r.get(project_col) or ""),
                "channel": str(r.get(channel_col) or "") if channel_col in r else "",
                "region": str(r.get(region_col) or "") if region_col in r else "",
                "spend": su,
                "new_users": int(nu),
                "cpa": su / nu if nu else 0.0,
            }
            if config.ltv_columns:
                row["ltv1"] = _weighted_ratio(
                    combo_sub,
                    config.ltv_columns[0],
                    users_col,
                    weighted=config.ltv_weighted_average,
                )
            if config.roi_columns:
                row["roi1"] = _weighted_ratio(
                    combo_sub,
                    config.roi_columns[0],
                    spend_col,
                    weighted=config.roi_weighted_average,
                )
            row["prev"] = prev_combo_map.get(
                tuple(str(r.get(c) or "") for c in group_key), {}
            )
            # Per-combo day-by-day series so the UI can expand a row into its
            # own分天对比 (spend / new-users / ROI1 / LTV1 over the history
            # window), not just yesterday-vs-previous.
            combo_daily: list[dict[str, Any]] = []
            for d in history_dates:
                try:
                    target = datetime.strptime(d, "%Y-%m-%d").date()
                except (TypeError, ValueError):
                    continue
                day_df = (
                    df[parsed.dt.date == target]
                    if not parsed.empty
                    else df.iloc[0:0]
                )
                combo_day = _combo_sub(day_df, key_vals)
                cm = _build_core_metrics(combo_day, config, ctx)
                combo_daily.append(
                    {
                        "date": d,
                        "spend": cm["spend"],
                        "new_users": cm["new_users"],
                        "cpa": cm["cpa"],
                        "ltv1": cm.get("LTV1", 0.0),
                        "roi1": cm.get("ROI1", 0.0),
                        **{
                            f"ltv{key}": cm.get(f"LTV{key}", 0.0)
                            for key in (2, 3, 4, 5, 6, 7)
                        },
                    }
                )
            row["daily"] = combo_daily
            projects.append(row)
        projects.sort(key=lambda p: p["spend"], reverse=True)
        top_n = ctx.top_projects_count or config.top_projects_count
        projects = projects[:top_n]

    # ---- Media breakdown ----
    media: list[dict[str, Any]] = []
    if not yesterday_df.empty and ad_channel_col in yesterday_df.columns:
        mg = (
            yesterday_df.groupby(ad_channel_col, dropna=False)
            .agg(
                **{
                    "spend": (spend_col, "sum"),
                    "new_users": (users_col, "sum"),
                }
            )
            .reset_index()
        )
        # Drop media with no rebate-adjusted spend: a channel that carried no
        # real cost on the report day adds nothing to the analysis, so exclude
        # it from the media breakdown and quality comparison.
        mg = mg[mg["spend"].fillna(0) > 0]

        # Previous-day per-channel metrics, used for day-over-day (环比) deltas
        # in the media table.  Computed from the previous day's rows even when a
        # channel had no spend (so a channel re-appearing today still compares).
        media_previous: dict[str, dict[str, float]] = {}
        prev_media_df = _day_subset(df, date_col, previous_label)
        if not prev_media_df.empty:
            pg = (
                prev_media_df.groupby(ad_channel_col, dropna=False)
                .agg(
                    **{
                        "spend": (spend_col, "sum"),
                        "new_users": (users_col, "sum"),
                    }
                )
                .reset_index()
            )
            for _, pr in pg.iterrows():
                pch = str(pr.get(ad_channel_col) or "")
                psu = float(pr.get("spend") or 0)
                pnu = float(pr.get("new_users") or 0)
                psub = prev_media_df[
                    prev_media_df[ad_channel_col].astype(str) == pch
                ]
                media_previous[pch] = {
                    "spend": psu,
                    "new_users": int(pnu),
                    "cpa": psu / pnu if pnu else 0.0,
                    "ltv1": (
                        _weighted_ratio(
                            psub,
                            config.ltv_columns[0],
                            users_col,
                            weighted=config.ltv_weighted_average,
                        )
                        if config.ltv_columns
                        else 0.0
                    ),
                    "roi1": (
                        _weighted_ratio(
                            psub,
                            config.roi_columns[0],
                            spend_col,
                            weighted=config.roi_weighted_average,
                        )
                        if config.roi_columns
                        else 0.0
                    ),
                }

        for _, r in mg.iterrows():
            su = float(r.get("spend") or 0)
            nu = float(r.get("new_users") or 0)
            media_channel = str(r.get(ad_channel_col) or "")
            media_sub = yesterday_df[
                yesterday_df[ad_channel_col].astype(str) == media_channel
            ]
            row: dict[str, Any] = {
                "channel": media_channel,
                "spend": su,
                "new_users": int(nu),
                "cpa": su / nu if nu else 0.0,
            }
            if config.ltv_columns:
                row["ltv1"] = _weighted_ratio(
                    media_sub,
                    config.ltv_columns[0],
                    users_col,
                    weighted=config.ltv_weighted_average,
                )
            if config.roi_columns:
                row["roi1"] = _weighted_ratio(
                    media_sub,
                    config.roi_columns[0],
                    spend_col,
                    weighted=config.roi_weighted_average,
                )
            row["prev"] = media_previous.get(media_channel, {})
            media.append(row)
        media.sort(key=lambda m: m["spend"], reverse=True)
        # Drop the long-tail media (negligible spend) to keep the auxiliary
        # media view focused on the channels that matter.
        _cap_long_tail(media)

    alerts = _detect_alerts(core, config)

    return {
        "report_date": yesterday_label,
        "previous_date": previous_label,
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
    chosen: list[str] = []
    for idx in indices:
        for col in candidates:
            if re.search(rf"(?:[_-]{idx}$)|(?:(?:^|[^0-9]){idx}日)", col):
                chosen.append(col)
                break
    return chosen


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
# Public API
# --------------------------------------------------------------------------- #


def get_config_payload(config: DailyReportConfig) -> dict[str, Any]:
    """Serialize the effective config so the frontend can render labels."""
    return {
        "datasource_id": config.datasource_id,
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
        "baseline_thresholds": config.baseline_thresholds,
        "project_targets": config.project_targets,
        "default_breakeven_line": config.default_breakeven_line,
        "static_filters": config.static_filters,
    }


def run_daily_report(
    config: DailyReportConfig,
    ctx: DailyReportContext,
    progress: ProgressFn | None = None,
    cancel: CancelFn | None = None,
) -> dict[str, Any]:
    """Run the daily report end to end and return the JSON payload.

    When ``progress`` is provided it is called with ``(message, level)`` at each
    stage so a background job can stream a live log.  When ``cancel`` is provided
    it is polled between heavy stages and may abort execution early.
    """
    _emit(progress, "正在解析数据源…")
    _maybe_cancel(cancel)
    # Resolve history depth: an explicit per-request/context value wins,
    # otherwise honour the report configuration's days_of_history (falling
    # back to the 30-day default).
    days = ctx.days_of_history or config.days_of_history or 30
    yesterday, day_before, history = _reference_dates(ctx, days)

    ds = _resolve_datasource(config)
    if ds is None:
        _emit(progress, "数据源未找到：请检查报告参数（数据集 ID / 表名）", "error")
        raise RuntimeError(
            "Daily report datasource not found. Configure superset/project/"
            "daily_report/config.py with a valid datasource id or table name."
        )

    # The field mapping (date / project / channel / ad channel / metrics) is
    # derived automatically from the dataset's columns at run time; it is not a
    # report parameter.  This keeps the report working regardless of which UA
    # dataset is active (English or Chinese column names).
    dttm_cols = {c.column_name for c in ds.columns if getattr(c, "is_dttm", False)}
    auto_map = suggest_field_map(sorted(_billable_columns(ds)), dttm_columns=dttm_cols)
    for field, value in auto_map.items():
        setattr(config, field, value)
    _emit(
        progress,
        f"字段映射已按数据集自动解析（项目={config.project_column}、"
        f"渠道={config.channel_column}、广告渠道={config.ad_channel_column}）",
    )

    start = min(history)
    _emit(
        progress,
        f"正在从数据集拉取数据（{start.isoformat()} ~ {yesterday.isoformat()}）…",
    )
    _maybe_cancel(cancel)
    df = _fetch_rows(
        config, ctx, ds, start, yesterday, cancel=cancel, progress=progress
    )
    if df.empty:
        _emit(progress, "所选日期范围内没有数据", "warning")
        return {
            "report_date": yesterday.isoformat(),
            "previous_date": day_before.isoformat(),
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
            "history_dates": [d.isoformat() for d in history],
            "daily": [],
            "daily_projects": [],
            "core_previous": {},
            "project_summary": [],
            "thresholds": {
                "roi_critical_line": config.roi_critical_line,
                "roi_warning_line": config.roi_warning_line,
                "default_breakeven_line": config.default_breakeven_line,
            },
            "empty": True,
        }

    _emit(progress, f"数据行数：{len(df)}，开始计算指标…")
    _set_stage("compute", "正在计算核心指标 / Top 项目 / 媒体分析")
    _maybe_cancel(cancel)
    t_build = time.perf_counter()
    payload = _build_report(
        df,
        config,
        ctx,
        yesterday.isoformat(),
        day_before.isoformat(),
        [d.isoformat() for d in history],
    )
    _timed(progress, "指标计算", t_build)
    _maybe_cancel(cancel)
    payload["history_dates"] = [d.isoformat() for d in history]
    _emit(
        progress,
        f"报告生成完成：{len(payload.get('projects', []))} 个项目、"
        f"{len(payload.get('media', []))} 个媒体频道。",
        "success",
    )
    _set_stage("done", "报告生成完成")
    return payload
