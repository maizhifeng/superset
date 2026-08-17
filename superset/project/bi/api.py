from __future__ import annotations

import hashlib
import logging
import re
from concurrent.futures import as_completed, ThreadPoolExecutor
from typing import Any

import numpy as np
import pandas as pd
import rison
import sqlalchemy as sa
from flask import Blueprint, current_app, g, jsonify, request
from werkzeug.local import LocalProxy

# All superset model imports are lazy (inside functions) to avoid
# circular imports during app initialization.

logger = logging.getLogger(__name__)

bi_blueprint = Blueprint("bi_federated", __name__, url_prefix="/api/v1/bi")

# Aggregation methods that may be declared per metric for the cross-database
# re-aggregation step.  Anything else falls back to "sum" (additive default).
_VALID_AGGREGATIONS = frozenset(
    {"sum", "mean", "min", "max", "median", "first", "last"}
)


def _parse_extra(extra_raw: Any) -> dict[str, Any]:
    """Parse a dataset ``extra`` field that may be a JSON string or a dict."""
    if extra_raw is None:
        return {}
    if isinstance(extra_raw, dict):
        return extra_raw
    if isinstance(extra_raw, str):
        try:
            from superset.utils import json as _json

            return _json.loads(extra_raw)
        except (ValueError, TypeError):
            return {}
    return {}


def _read_federated_extra(datasource: Any) -> dict[str, Any]:
    """Return the ``federated`` sub-object of a dataset's extra JSON."""
    extra = _parse_extra(getattr(datasource, "extra", None))
    federated = extra.get("federated", {})
    return federated if isinstance(federated, dict) else {}


# Results are cached for at most 5 minutes; dashboard auto-refresh sends
# ``force`` to bypass the cache, so longer TTLs risk stale numbers.
_BI_CACHE_MAX_TTL = 300


def _cache_timeout() -> int:
    """Cache TTL for federated results, capped at ``_BI_CACHE_MAX_TTL``."""
    default = current_app.config.get("CACHE_DEFAULT_TIMEOUT", 300)
    try:
        default = int(default)
    except (TypeError, ValueError):
        default = 300
    return max(1, min(default, _BI_CACHE_MAX_TTL))


def _cache_key(prefix: str, *parts: Any) -> str:
    """Build a cache key including user identity so RLS results stay isolated."""
    user = g.get("user", None)
    user_id = getattr(user, "id", 0)
    roles = sorted(
        getattr(r, "name", str(r)) for r in getattr(user, "roles", None) or []
    )
    raw = "|".join([prefix, *[str(p) for p in parts], str(user_id), *roles])
    return "bi:" + hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _looks_non_additive(label: str) -> bool:
    """Heuristic: detect metric labels that are unlikely to be additive."""
    low = str(label).lower()
    prefixes = (
        "avg__",
        "mean__",
        "count_distinct__",
        "countd__",
        "min__",
        "max__",
    )
    if low.startswith(prefixes):
        return True
    keywords = ("distinct", "ratio", "avg", "average", "pct", "percent", "rate")
    return any(k in low for k in keywords)


def _warn_non_additive_metrics(metric_cols: list[str], agg_map: dict[str, str]) -> None:
    missing = [m for m in metric_cols if m not in agg_map and _looks_non_additive(m)]
    if missing:
        logger.warning(
            "Federated re-aggregation defaults to SUM for metrics that look "
            "non-additive %s; declare metric_aggregations in dataset extra to "
            "avoid incorrect merged values.",
            missing,
        )


def _build_predicate(col: Any, op: str | None, val: Any) -> Any | None:  # noqa: C901
    """Build a SQLAlchemy predicate for a simple filter op (parameterized)."""
    op = (op or "").lower()
    if op in ("in", "bounding_box"):
        vals = val if isinstance(val, (list, tuple)) else [val]
        clean = [v for v in vals if v not in (None, "")]
        return col.in_(clean) if clean else None
    if op in ("not_in",):
        vals = val if isinstance(val, (list, tuple)) else [val]
        clean = [v for v in vals if v not in (None, "")]
        return col.notin_(clean) if clean else None
    if op in ("eq", "=="):
        return col == val
    if op in ("ne", "!="):
        return col != val
    if op in ("gt", ">"):
        return col > val
    if op in ("ge", ">="):
        return col >= val
    if op in ("lt", "<"):
        return col < val
    if op in ("le", "<="):
        return col <= val
    if op in ("ct", "like", "contains"):
        return col.like(f"%{val}%")
    if op in ("nct", "not_like"):
        return col.notlike(f"%{val}%")
    if op in ("sw", "startswith"):
        return col.like(f"{val}%")
    if op in ("ew", "endswith"):
        return col.like(f"%{val}")
    if op in ("is_null",):
        return col.is_(None)
    if op in ("not_null", "not null"):
        return col.isnot(None)
    return None


_DATE_LIKE_COLUMNS: tuple[str, ...] = (
    "date",
    "ds",
    "day",
    "month",
    "year",
    "timestamp",
    "日期",
    "时间",
    "年月",
    "年",
    "月",
    "日",
)


def _find_date_column(columns: list[str]) -> str | None:
    """Return the first date-like column from *columns*, or ``None``."""
    col_lower_map = {c.lower(): c for c in columns}
    for keyword in _DATE_LIKE_COLUMNS:
        if keyword in col_lower_map:
            return col_lower_map[keyword]
    return None


def _side_query_dict(query_obj: Any, side_limit: int | None) -> dict[str, Any]:
    """Build a query dict for a single database side.

    Pagination (``row_offset``) is stripped so each side returns a recall-oriented
    window; the final global ordering and pagination are applied once on the
    merged result (see ``_apply_global_order_and_pagination``).

    Superset's ``get_sqla_query`` collapses ``columns`` into ``groupby`` whenever a
    GROUP BY is present (``columns = groupby or columns``), so column-level
    dimensions (pivot "columns") would otherwise be dropped from the generated SQL.
    Fold them into ``groupby`` here so the query groups by both row and column
    dimensions and the response carries the column dimension back to the renderer.
    """
    qdict = query_obj.to_dict()
    qdict.pop("row_offset", None)
    if side_limit is not None:
        qdict["row_limit"] = side_limit

    row_dims: list[str] = list(getattr(query_obj, "groupby", None) or [])
    col_dims: list[str] = list(getattr(query_obj, "columns", None) or [])
    if col_dims:
        qdict["groupby"] = row_dims + col_dims
        qdict.pop("columns", None)

    # Leave ``orderby`` untouched: ``get_sqla_query`` resolves dimension,
    # metric-label and adhoc-metric orderby entries itself, and dropping
    # metric orderbys here would break the per-side recall window for
    # metric-ordered Top-N queries.
    #
    # Drop orderby entries that reference plain columns the generated SQL
    # cannot order by: when the query groups rows, PostgreSQL rejects ORDER
    # BY columns that do not appear in GROUP BY; when the query aggregates
    # without GROUP BY (e.g. a pivot totals row) the same restriction
    # applies because the SELECT is fully aggregated.  The global sort on
    # the merged result still honours the dropped entries.
    grouped_dims = set(qdict.get("groupby") or [])
    metric_labels: set[str] = set()
    for metric in qdict.get("metrics") or []:
        if isinstance(metric, str):
            metric_labels.add(metric)
        elif isinstance(metric, dict) and metric.get("label"):
            metric_labels.add(metric["label"])
    valid_orderby_cols = grouped_dims | metric_labels
    has_grouped_dims = bool(grouped_dims)
    has_metrics = bool(qdict.get("metrics"))
    qdict["orderby"] = [
        entry
        for entry in (qdict.get("orderby") or [])
        if entry
        and (
            isinstance(entry[0], dict)
            or (
                isinstance(entry[0], str)
                and (
                    (has_grouped_dims and entry[0] in valid_orderby_cols)
                    or (not has_grouped_dims and not has_metrics)
                    or (
                        not has_grouped_dims
                        and has_metrics
                        and entry[0] in metric_labels
                    )
                )
            )
        )
    ]
    return qdict


# Ratio metrics follow the canonical ``CAST(SUM(num) AS NUMERIC) /
# NULLIF(SUM(den), 0)`` pattern (roi, ltv, cpa, natural-rate metrics, ...).
# Their per-side values cannot be merged by summation or averaging — the
# correct cross-database value is ``SUM(num)/SUM(den)`` over both sides, so
# the per-side SQL selects the component aggregates instead.
_RATIO_METRIC_RE = re.compile(
    r"^CAST\(\s*SUM\((?P<num>.*)\)\s+AS\s+(?:NUMERIC|DOUBLE|DECIMAL(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)\s*\)"
    r"\s*/\s*NULLIF\(\s*SUM\((?P<den>.*)\)\s*,\s*0\s*\)\s*$",
    re.IGNORECASE | re.DOTALL,
)


def _split_ratio_metrics(
    datasource: Any, metric_entries: list[Any]
) -> tuple[dict[str, tuple[str, str]], list[Any]]:
    """Replace ratio metrics with their ``__num``/``__den`` component metrics.

    Returns a map of ``label -> (numerator_expr, denominator_expr)`` for the
    metrics that were split, plus the transformed metric entries to run on
    each database side.
    """
    metrics_by_name = {m.metric_name: m for m in datasource.metrics}
    components: dict[str, tuple[str, str]] = {}
    out: list[Any] = []
    for entry in metric_entries:
        if isinstance(entry, str):
            metric = metrics_by_name.get(entry)
            expression = getattr(metric, "expression", None) if metric else None
            if expression:
                match = _RATIO_METRIC_RE.match(expression)
                if match:
                    num, den = match.group("num"), match.group("den")
                    components[entry] = (num, den)
                    out.extend(
                        [
                            {
                                "expressionType": "SQL",
                                "sqlExpression": f"SUM({num})",
                                "label": f"{entry}__num",
                            },
                            {
                                "expressionType": "SQL",
                                "sqlExpression": f"SUM({den})",
                                "label": f"{entry}__den",
                            },
                        ]
                    )
                    continue
        out.append(entry)
    return components, out


def _recompute_ratio_columns(
    df: pd.DataFrame, components: dict[str, tuple[str, str]]
) -> pd.DataFrame:
    """Recompute ratio metrics from merged ``__num``/``__den`` components."""
    for label, (_num, _den) in components.items():
        num_col, den_col = f"{label}__num", f"{label}__den"
        if num_col in df.columns and den_col in df.columns:
            denom = df[den_col].astype(float).replace(0, np.nan)
            df[label] = df[num_col].astype(float) / denom
    drop_cols = [
        col
        for label in components
        for col in (f"{label}__num", f"{label}__den")
        if col in df.columns
    ]
    return df.drop(columns=drop_cols)


def _restore_metric_labels(
    labels: list[str], components: dict[str, tuple[str, str]]
) -> list[str]:
    """Map component labels back to their original ratio labels in order."""
    component_to_parent: dict[str, str] = {}
    for label in components:
        component_to_parent[f"{label}__num"] = label
        component_to_parent[f"{label}__den"] = label
    result: list[str] = []
    seen: set[str] = set()
    for label in labels:
        target = component_to_parent.get(label, label)
        if target in seen:
            continue
        seen.add(target)
        result.append(target)
    return result


def _resolve_orderby_label(entry: Any) -> str | None:
    """Resolve an orderby column to a merged-result column label.

    Orderby columns may be plain labels, ``[metric_label]`` lists or adhoc
    metric dicts; anything unresolvable returns ``None``.
    """
    if not entry:
        return None
    col = entry[0]
    if isinstance(col, list):
        col = col[0] if col and isinstance(col[0], str) else None
    elif isinstance(col, dict):
        col = col.get("label")
    return col if isinstance(col, str) else None


def _apply_global_order_and_pagination(
    df: pd.DataFrame,
    query_obj: Any,
    labels_expected: list[str],
) -> pd.DataFrame:
    """Sort and paginate the merged cross-database result globally.

    Each database side was already fetched with a recall-oriented limit, so this
    produces a consistent global Top-N and honours the requested offset/limit.
    """
    orderby = getattr(query_obj, "orderby", None) or []
    try:
        sort_cols = [c for c in map(_resolve_orderby_label, orderby) if c in df.columns]
        ascending = [bool(o[1]) for o in orderby if o]
        if sort_cols:
            df = df.sort_values(sort_cols, ascending=ascending[: len(sort_cols)])
        elif len(labels_expected) > 1:
            groupby_cols = (
                list(getattr(query_obj, "columns", None) or [])
                or list(getattr(query_obj, "groupby", None) or [])
                or []
            )
            # Default to date ascending when a date dimension is in GROUP BY
            date_col = _find_date_column(groupby_cols)
            if date_col and date_col in df.columns:
                df = df.sort_values(date_col, ascending=True)
            else:
                groupby_set = set(groupby_cols)
                first_metric = next(
                    (
                        c
                        for c in labels_expected
                        if c not in groupby_set and c in df.columns
                    ),
                    labels_expected[-1] if labels_expected[-1] in df.columns else None,
                )
                if first_metric is not None:
                    df = df.sort_values(first_metric, ascending=False)
    except Exception:
        logger.warning("Federated global sort failed; keeping merge order")

    if offset := getattr(query_obj, "row_offset", 0) or 0:
        df = df.iloc[offset:]
    if limit := getattr(query_obj, "row_limit", None):
        df = df.head(int(limit))
    return df.reset_index(drop=True)


def _distinct_values(  # noqa: C901
    datasource: Any,
    column_name: str,
    limit: int,
    offset: int = 0,
    filters: list[dict[str, Any]] | None = None,
) -> list[Any]:
    """Distinct values for a column, honoring optional filter predicates.

    Mirrors ``SqlaTable.values_for_column`` but adds support for arbitrary
    (parameterized) filter predicates so dashboard sibling filters can narrow
    candidate values for federated datasets.
    """
    cols = {col.column_name: col for col in datasource.columns}
    if column_name not in cols:
        return []
    tp = datasource.get_template_processor()
    tbl, cte = datasource.get_from_clause(tp)
    target_col = (
        cols[column_name].get_sqla_col(template_processor=tp).label("column_values")
    )
    qry = sa.select([target_col]).select_from(tbl).distinct()
    if filters:
        preds = []
        for f in filters:
            col = f.get("col")
            if col not in cols:
                continue
            predicate = _build_predicate(
                cols[col].get_sqla_col(template_processor=tp),
                f.get("op"),
                f.get("val"),
            )
            if predicate is not None:
                preds.append(predicate)
        if preds:
            qry = qry.where(sa.and_(*preds))
    if limit:
        qry = qry.limit(limit)
    if offset:
        qry = qry.offset(offset)
    if datasource.fetch_values_predicate:
        qry = qry.where(datasource.get_fetch_values_predicate(template_processor=tp))
    rls_filters = datasource.get_sqla_row_level_filters(template_processor=tp)
    if rls_filters:
        qry = qry.where(sa.and_(*rls_filters))
    with datasource.database.get_sqla_engine() as engine:
        sql = str(qry.compile(engine, compile_kwargs={"literal_binds": True}))
        sql = datasource._apply_cte(sql, cte)
        if engine.dialect.identifier_preparer._double_percents:
            sql = sql.replace("%%", "%")
        sql = datasource.database.mutate_sql_based_on_config(sql)
        with engine.connect() as con:
            df = pd.read_sql_query(sql=datasource.text(sql), con=con)
            df = df.replace({np.nan: None})
            return df["column_values"].to_list()


def _get_federated_config(datasource: Any) -> tuple[str, str] | None:
    """Read federated database config from the dataset's extra JSON.

    Expected format in datasource.extra:
      {"federated": {"enabled": true, "databases": ["aliyun", "aliyun-oversea"]}}
    """
    from superset.utils import json

    extra_raw = getattr(datasource, "extra", None)
    if not extra_raw:
        return None
    try:
        extra = json.loads(extra_raw) if isinstance(extra_raw, str) else extra_raw
    except (json.JSONDecodeError, TypeError):
        return None
    federated = extra.get("federated", {})
    if not federated.get("enabled"):
        return None
    databases = federated.get("databases", [])
    if len(databases) != 2:
        return None
    return (str(databases[0]), str(databases[1]))


def _get_database(name: str) -> Any:
    from superset import db
    from superset.models.core import Database

    return (
        db.session.query(Database).filter(Database.database_name == name).one_or_none()
    )


def _merge_dataframes(
    dfs: list[pd.DataFrame],
    labels: list[str],
) -> pd.DataFrame:
    all_cols: list[str] = []
    for df in dfs:
        for col in df.columns:
            if col not in all_cols and col != "_db_source":
                all_cols.append(col)

    for df, label in zip(dfs, labels, strict=True):
        df["_db_source"] = label
        for col in all_cols:
            if col not in df.columns:
                df[col] = None

    return pd.concat(dfs, ignore_index=True)


def _get_partner_sql(
    datasource: Any,
    query_obj: Any,
    side_limit: int | None = None,
    metrics_override: list[Any] | None = None,
) -> tuple[str, str | None, str | None] | None:
    """Generate SQL for the partner (oversea) dataset side.

    Bound datasets share the same column structure but may have different
    table names.  Generate partner-specific SQL from the partner dataset
    using the identical query object so the GROUP BY / metric columns match.
    """
    from superset.utils import json as _json

    extra_raw = getattr(datasource, "extra", None) or "{}"
    try:
        extra = _json.loads(extra_raw) if isinstance(extra_raw, str) else extra_raw
    except Exception:
        return None
    partner_id = extra.get("federated", {}).get("partner_dataset_id")
    if not partner_id:
        return None
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    partner_ds = (
        db.session.query(SqlaTable).filter(SqlaTable.id == partner_id).one_or_none()
    )
    if not partner_ds:
        return None
    try:
        # Keep the user's orderby so the partner side's recall window retains
        # the top rows (merged Top-N stays correct across both databases).
        qdict = _side_query_dict(query_obj, side_limit)
        if metrics_override is not None:
            qdict["metrics"] = metrics_override
        partner_ext = partner_ds.get_query_str_extended(qdict)
        partner_sql_str = partner_ext.sql
        logger.info("Partner SQL (%d chars)", len(partner_sql_str))
        return (partner_sql_str, partner_ds.catalog, partner_ds.schema)
    except Exception as ex:
        logger.warning(
            "Partner SQL gen failed for dataset %s: %s", partner_id, ex, exc_info=True
        )
        return None


def _run_federated_query(  # noqa: C901
    query_obj: Any,
    query_context: Any,
    datasource: Any,
    aliyun_db: Any,
    oversea_db: Any,
    aliyun_db_name: str,
    oversea_db_name: str,
) -> dict[str, Any]:
    from superset.common.db_query_status import QueryStatus
    from superset.exceptions import QueryObjectValidationError
    from superset.utils.core import extract_dataframe_dtypes

    query_obj.validate()

    # Compute a recall-oriented per-side row limit so the merged cross-database
    # Top-N is not truncated prematurely by per-database pagination.  The final
    # global ordering + pagination is applied once, on the merged result.
    fed_extra = _read_federated_extra(datasource)
    multiplier = fed_extra.get("row_limit_multiplier", 1)
    try:
        multiplier = int(multiplier)
    except (TypeError, ValueError):
        multiplier = 1
    multiplier = max(1, multiplier)
    req_limit = getattr(query_obj, "row_limit", None)
    if req_limit and req_limit > 0:
        side_limit = req_limit * multiplier
    else:
        side_limit = current_app.config.get("FEDERATED_DEFAULT_SIDE_LIMIT", 50000)
    max_side = current_app.config.get("FEDERATED_MAX_SIDE_ROW_LIMIT", 100000)
    if side_limit and side_limit > max_side:
        side_limit = max_side

    partner_sql = partner_catalog = partner_schema = None
    metric_entries = list(getattr(query_obj, "metrics", None) or [])
    ratio_components, metric_entries_split = _split_ratio_metrics(
        datasource, metric_entries
    )
    use_components = bool(ratio_components)
    metrics_override = metric_entries_split if use_components else None
    if partner_result := _get_partner_sql(
        datasource, query_obj, side_limit, metrics_override
    ):
        partner_sql, partner_catalog, partner_schema = partner_result

    # Generate SQL from the primary dataset for the primary database
    primary_qdict = _side_query_dict(query_obj, side_limit)
    if metrics_override is not None:
        primary_qdict["metrics"] = metrics_override
    primary_ext = datasource.get_query_str_extended(primary_qdict)
    primary_sql = primary_ext.sql
    labels_expected = primary_ext.labels_expected
    final_labels = _restore_metric_labels(labels_expected, ratio_components)

    # Build side configurations for parallel execution.
    # Each side is a (db_conn, sql, label, catalog, schema) tuple.
    side_configs: list[tuple[Any, str, str, str | None, str | None]] = [
        (aliyun_db, primary_sql, aliyun_db_name, datasource.catalog, datasource.schema),
    ]
    if partner_sql:
        side_configs.append(
            (oversea_db, partner_sql, oversea_db_name, partner_catalog, partner_schema),
        )

    # Execute all sides with per-side error isolation.
    side_results, _failed_labels = _execute_federated_sides(
        side_configs, labels_expected
    )
    if not side_results:
        raise QueryObjectValidationError("All federated database sides failed")

    # Merge all successful side results.  Zero-row sides are kept so a query
    # that legitimately matches no rows yields an empty result instead of
    # surfacing as a hard failure.
    if len(side_results) == 1:
        merged_df = side_results[0][1]
    else:
        merged_df = _merge_dataframes(
            [df for _, df in side_results],
            [label for label, _ in side_results],
        )

    if "_db_source" in merged_df.columns:
        merged_df = merged_df.drop(columns=["_db_source"])
    if not merged_df.empty:
        merged_df = merged_df[labels_expected]

        # Re-aggregate: when both databases contribute rows for the same
        # dimension tuple, combine them so the chart shows a single merged
        # value per dimension.  Dimension columns are identified from the
        # actual GROUP BY / column labels rather than by position, so the
        # logic stays correct even when columns are interleaved (e.g. time
        # grains or pivot columns).  Everything not in the group-by set is
        # treated as a metric column.
        # Group by ALL dimensions (row + column) so the cross-database merge
        # re-aggregates each (row, column) tuple together instead of collapsing
        # the column dimension into a single group.
        groupby_cols = list(getattr(query_obj, "groupby", None) or []) + list(
            getattr(query_obj, "columns", None) or []
        )
        groupby_set = set(groupby_cols)
        dim_cols = [c for c in labels_expected if c in groupby_set]
        metric_cols = [c for c in labels_expected if c not in groupby_set]
        if not dim_cols and groupby_cols:
            # Group-by labels not found by name; fall back to positional split
            # to preserve the original behaviour for unusual schemas.
            dim_cols = labels_expected[: len(groupby_cols)]
            metric_cols = labels_expected[len(groupby_cols) :]

        # Per-metric aggregation semantics.  Additive metrics (SUM) are merged
        # by summation; non-additive metrics (AVG, COUNT DISTINCT, MIN/MAX,
        # ratios, ...) MUST be declared via extra.federated.metric_aggregations
        # keyed by metric label, otherwise they would be merged incorrectly.
        agg_map = _read_federated_extra(datasource).get("metric_aggregations", {})
        if not isinstance(agg_map, dict):
            agg_map = {}
        agg_spec: dict[str, str] = {}
        for m in metric_cols:
            method = str(agg_map.get(m, "sum")).lower()
            if method not in _VALID_AGGREGATIONS:
                method = "sum"
            agg_spec[m] = method
        # Ratio-metric components are plain SUMs and always merge additively.
        for label in ratio_components:
            agg_spec[f"{label}__num"] = "sum"
            agg_spec[f"{label}__den"] = "sum"
        _warn_non_additive_metrics(metric_cols, agg_map)

        before_len = len(merged_df)
        if dim_cols and metric_cols:
            merged_df = merged_df.groupby(dim_cols, as_index=False, sort=False).agg(
                agg_spec
            )
        elif metric_cols:
            # No GROUP BY (e.g. a grand-total / 合计行 query): collapse both
            # databases into a single row so the total reflects BOTH sides.
            totals = merged_df[metric_cols].agg(agg_spec)
            merged_df = totals.to_frame().T.reset_index(drop=True)
        elif dim_cols:
            merged_df = merged_df.drop_duplicates(subset=dim_cols)
        else:
            merged_df = merged_df.drop_duplicates()

        # Recompute ratio metrics from the merged components, then drop the
        # component columns and restore the canonical column order.
        merged_df = _recompute_ratio_columns(merged_df, ratio_components)
        merged_df = merged_df[final_labels]
        logger.info(
            "Re-aggregated %d rows → %d rows (groupby=%s, agg=%s)",
            before_len,
            len(merged_df),
            dim_cols,
            agg_spec,
        )

        try:
            result_df = datasource.normalize_df(merged_df, query_obj)
            result_df = query_obj.exec_post_processing(result_df)
            # Restore column order after post-processing (which may reorder)
            result_df = result_df[final_labels]
        except Exception:
            result_df = merged_df

        # Apply the requested global ordering and pagination to the merged
        # result so the cross-database Top-N and offsets are consistent (each
        # side was fetched with a recall-oriented limit instead).
        result_df = _apply_global_order_and_pagination(
            result_df, query_obj, final_labels
        )
    else:
        result_df = merged_df

    coltypes = extract_dataframe_dtypes(result_df, datasource)
    data_raw = query_context.get_data(result_df, coltypes)
    colnames = list(result_df.columns)

    if isinstance(data_raw, list) and len(data_raw) > 0:
        data_raw = [{c: row.get(c) for c in colnames} for row in data_raw]

    applied_filters = []
    for f in getattr(query_obj, "filter", None) or []:
        if isinstance(f, dict) and f.get("col"):
            applied_filters.append(
                {
                    "col": f.get("col"),
                    "op": f.get("op"),
                    "val": f.get("val"),
                }
            )

    payload: dict[str, Any] = {
        "status": QueryStatus.SUCCESS,
        "data": data_raw,
        "colnames": colnames,
        "coltypes": coltypes,
        "indexnames": list(result_df.index),
        "rowcount": len(result_df),
        "sql_rowcount": len(result_df),
        "sql": primary_sql,
        "result_format": query_context.result_format.value,
        "applied_filters": applied_filters,
        "rejected_filters": [],
        "from_dttm": query_obj.from_dttm,
        "to_dttm": query_obj.to_dttm,
    }
    for field in (
        "cache_key",
        "cached_dttm",
        "cache_timeout",
        "error",
        "is_cached",
        "queried_dttm",
        "annotation_data",
        "applied_template_filters",
        "stacktrace",
    ):
        payload[field] = None
    return payload


def _assign_label(
    df: pd.DataFrame,
    labels_expected: list[str],
) -> pd.DataFrame | None:
    if df is None:
        return df
    if df.empty:
        # Relabel a zero-row result to the expected labels so downstream
        # column handling stays consistent even when a side has no data.
        return df.reindex(columns=labels_expected)
    if len(df.columns) < len(labels_expected):
        return None
    if len(df.columns) > len(labels_expected):
        df = df.iloc[:, 0 : len(labels_expected)]
    df.columns = labels_expected
    return df


def _run_federated_side(
    side: tuple[Any, str, str, str | None, str | None],
    labels_expected: list[str],
    _app: Any,
    _user: Any,
) -> tuple[str, pd.DataFrame | None, bool]:
    from flask import g

    db_conn, sql, db_label, catalog, schema = side
    try:
        with _app.app_context():
            if _user is not None:
                g.user = _user
            logger.info(
                "Federated side [%s] SQL (%s chars, catalog=%s, schema=%s):\n%s",
                db_label,
                len(sql),
                catalog,
                schema,
                sql,
            )
            return (
                db_label,
                db_conn.get_df(
                    sql=sql,
                    catalog=catalog,
                    schema=schema,
                    mutator=lambda df: _assign_label(df, labels_expected),
                ),
                True,
            )
    except Exception as ex:
        logger.error(
            "Federated side [%s] failed: %s",
            db_label,
            ex,
            exc_info=True,
        )
        return db_label, None, False


def _execute_federated_sides(
    sides: list[tuple[Any, str, str, str | None, str | None]],
    labels_expected: list[str],
) -> tuple[list[tuple[str, pd.DataFrame]], list[str]]:
    """Execute multiple database sides with per-side error isolation.

    Each side runs in its own thread.  A single side failure does not
    affect other sides.  Returns ``(results, failed_labels)``: ``results``
    holds every side that executed successfully — including zero-row
    results, which are legitimate (e.g. a filter matches no rows) —
    while ``failed_labels`` holds the sides that raised.  An empty
    ``results`` list means every side errored.
    """
    from flask import current_app, g

    _app = current_app._get_current_object()
    from werkzeug.local import LocalProxy

    _user_raw = g.get("user", None)
    _user = (
        _user_raw._get_current_object()
        if isinstance(_user_raw, LocalProxy)
        else _user_raw
    )

    if not sides:
        return [], []

    with ThreadPoolExecutor(max_workers=min(len(sides), 5)) as pool:
        futures = {
            pool.submit(_run_federated_side, s, labels_expected, _app, _user): s
            for s in sides
        }
        results: list[tuple[str, pd.DataFrame]] = []
        failed: list[str] = []
        for future in as_completed(futures):
            label, df, ok = future.result()
            if ok and df is not None:
                results.append((label, df))
                if df.empty:
                    logger.warning(
                        "Federated side [%s] returned no rows",
                        label,
                    )
            else:
                failed.append(label)
                logger.warning(
                    "Federated side [%s] contributed no data",
                    label,
                )

    succeeded = len(results)
    total = len(sides)
    if succeeded < total:
        logger.warning(
            "Federated query: %d/%d sides succeeded (failed: %s)",
            succeeded,
            total,
            failed,
        )
    else:
        logger.info("Federated query: all %d sides succeeded", total)

    return results, failed


@bi_blueprint.route(
    "/filter-values/<int:datasource_id>/<column_name>/", methods=["GET"]
)
def filter_values(datasource_id: int, column_name: str) -> Any:
    from flask import current_app

    from superset.daos.datasource import DatasourceDAO
    from superset.daos.exceptions import DatasourceNotFound
    from superset.utils.core import DatasourceType

    default_limit = current_app.config.get("FILTER_SELECT_ROW_LIMIT", 10000)
    query_params: dict[str, Any] = {}
    q_str = request.args.get("q")
    if q_str:
        try:
            query_params = rison.loads(q_str)
        except Exception:  # noqa: S110
            query_params = {}
    filters = query_params.get("filters") or []
    if not isinstance(filters, list):
        filters = []
    page_size = int(query_params.get("page_size") or default_limit)
    page = int(query_params.get("page") or 0)

    try:
        datasource = DatasourceDAO.get_datasource(DatasourceType.TABLE, datasource_id)
    except DatasourceNotFound:
        return jsonify({"result": []}), 200

    values = _fetch_filter_values(
        datasource, datasource_id, column_name, q_str, page_size, page, filters
    )
    return jsonify({"result": values}), 200


def _fetch_filter_values(  # noqa: C901
    datasource: Any,
    datasource_id: int,
    column_name: str,
    q_str: str | None,
    page_size: int,
    page: int,
    filters: list[dict[str, Any]],
) -> list[Any]:
    """Fetch distinct filter values (primary + federated partner), cached.

    Results are cached in Redis for non-search requests (``filters`` empty),
    keyed by dataset, column, query string and the current user so RLS-aware
    results are never shared across users.
    """
    from superset.connectors.sqla.models import SqlaTable

    cache_key = _cache_key(
        "filter-values",
        datasource_id,
        column_name,
        q_str or "",
        page_size,
        page,
    )
    cacheable = not filters
    if cacheable:
        from superset import cache_manager

        cached = cache_manager.data_cache.get(cache_key)
        if cached is not None:
            return cached

    try:
        primary_vals = _distinct_values(
            datasource,
            column_name=column_name,
            limit=page_size,
            offset=page * page_size,
            filters=filters,
        )
    except Exception:
        logger.warning("Federated primary filter values failed", exc_info=True)
        primary_vals = []

    # Check for federated partner and merge values
    if partner_id := _read_federated_extra(datasource).get("partner_dataset_id"):
        from superset import db

        try:
            partner_ds = (
                db.session.query(SqlaTable)
                .filter(SqlaTable.id == partner_id)
                .one_or_none()
            )
            if partner_ds:
                partner_vals = _distinct_values(
                    partner_ds,
                    column_name=column_name,
                    limit=page_size,
                    offset=page * page_size,
                    filters=filters,
                )
                merged = list(set(primary_vals + partner_vals))
                merged.sort(key=lambda v: (v is None, str(v)))
                if cacheable:
                    from superset import cache_manager

                    cache_manager.data_cache.set(
                        cache_key, merged, timeout=_cache_timeout()
                    )
                return merged
        except Exception:
            logger.warning("Federated filter values merge failed", exc_info=True)

    result = list(primary_vals)
    result.sort(key=lambda v: (v is None, str(v)))
    if cacheable:
        from superset import cache_manager

        cache_manager.data_cache.set(cache_key, result, timeout=_cache_timeout())
    return result


@bi_blueprint.route("/federated-datasets", methods=["GET"])
def federated_datasets() -> Any:
    """Return the list of dataset IDs configured for federated queries.

    This is the single source of truth for "which datasets are federated",
    used by the frontend to decide whether to route to ``/bi/...`` endpoints.
    """
    from superset import db
    from superset.connectors.sqla.models import SqlaTable

    rows = db.session.query(SqlaTable.id, SqlaTable.extra).all()
    ids: list[int] = []
    for ds_id, extra_raw in rows:
        federated = _read_federated_extra({"extra": extra_raw})
        databases = federated.get("databases")
        if (
            federated.get("enabled")
            and isinstance(databases, (list, tuple))
            and len(databases) == 2
        ):
            ids.append(ds_id)
    return jsonify({"result": ids})


_AGG_STRIP_RE = re.compile(
    r"^(SUM|AVG|MIN|MAX|COUNT)\s*\(\s*(?P<body>.*?)\s*\)\s*$",
    re.IGNORECASE | re.DOTALL,
)


def _metric_wide_parts(  # noqa: C901
    datasource: Any,
    metric_entry: Any,
) -> tuple[list[Any], dict[str, Any]] | None:
    """Resolve one metric entry into wide-table (per-day) SQL expressions.

    Returns ``(expressions, meta)`` where each expression is a SQLAlchemy
    selectable labelled with the metric label (ratio metrics produce two
    component expressions ``label__num`` / ``label__den``).  ``meta`` carries
    the client-side aggregation semantics: ``{"agg": "sum" | "min" | "max" |
    "count" | "ratio", "num": ..., "den": ...}``.

    Returns ``None`` when the metric cannot be re-aggregated client-side
    (e.g. AVG or COUNT DISTINCT over per-day values).
    """
    cols = {col.column_name: col for col in datasource.columns}
    metrics_by_name = {m.metric_name: m for m in datasource.metrics}

    label = None
    if isinstance(metric_entry, dict):
        label = metric_entry.get("label")
        expr_type = metric_entry.get("expressionType")
        if expr_type == "SIMPLE":
            col_name = (
                (metric_entry.get("column") or {}).get("column_name")
                if isinstance(metric_entry.get("column"), dict)
                else None
            )
            aggregate = str(metric_entry.get("aggregate") or "SUM").lower()
            if aggregate in ("count_distinct", "avg"):
                return None
            if col_name is None or col_name not in cols:
                return None
            col_expr = cols[col_name].get_sqla_col(
                template_processor=datasource.get_template_processor()
            )
            if aggregate == "count":
                return [sa.literal(1).label(label or col_name)], {
                    "agg": "count",
                    "label": label or col_name,
                }
            return [col_expr.label(label or col_name)], {
                "agg": aggregate,
                "label": label or col_name,
            }
        if expr_type == "SQL":
            expression = str(metric_entry.get("sqlExpression") or "")
        else:
            return None
    else:
        label = str(metric_entry) if metric_entry else ""
        metric = metrics_by_name.get(label)
        expression = ""
        if metric and metric.expression and metric.expression != "NULL":
            expression = metric.expression
        if not expression:
            # Plain "AGG(col)" label such as "SUM(充值流水)" with no
            # dataset-level metric definition.
            match = _AGG_STRIP_RE.match(label)
            if not match:
                return None
            agg_name = match.group(1).lower()
            if agg_name in ("avg", "count_distinct"):
                return None
            col_name = match.group("body").strip('"')
            if col_name not in cols:
                return None
            return [
                cols[col_name]
                .get_sqla_col(template_processor=datasource.get_template_processor())
                .label(label)
            ], {"agg": agg_name, "label": label}

    if not expression or expression == "NULL":
        return None
    label = label or expression

    if ratio_match := _RATIO_METRIC_RE.match(expression):
        num_expr = ratio_match.group("num")
        den_expr = ratio_match.group("den")
        if "COUNT(DISTINCT" in num_expr.upper() or "COUNT(DISTINCT" in den_expr.upper():
            return None
        return [
            sa.literal_column(num_expr).label(f"{label}__num"),
            sa.literal_column(den_expr).label(f"{label}__den"),
        ], {
            "agg": "ratio",
            "label": label,
            "num": f"{label}__num",
            "den": f"{label}__den",
        }

    strip_match = _AGG_STRIP_RE.match(expression)
    if not strip_match:
        return None
    agg_name = strip_match.group(1).lower()
    if agg_name in ("avg",):
        return None
    if agg_name == "count" and strip_match.group("body").strip().upper() == "*":
        return [sa.literal(1).label(label)], {"agg": "count", "label": label}
    body = strip_match.group("body")
    if "DISTINCT" in body.upper():
        return None
    return [sa.literal_column(body).label(label)], {"agg": agg_name, "label": label}


def _wide_sql(  # noqa: C901
    datasource: Any,
    columns: list[str],
    metric_parts: list[tuple[list[Any], dict[str, Any]]],
    filters: list[dict[str, Any]],
) -> str | None:
    """Build the wide-table SQL for one database side (day-granularity)."""
    cols = {col.column_name: col for col in datasource.columns}
    tp = datasource.get_template_processor()
    tbl, cte = datasource.get_from_clause(tp)

    select_cols: list[Any] = []
    for dim in columns:
        if dim not in cols:
            continue
        select_cols.append(cols[dim].get_sqla_col(template_processor=tp).label(dim))
    for exprs, _meta in metric_parts:
        select_cols.extend(exprs)
    if not select_cols:
        return None

    qry = sa.select(select_cols).select_from(tbl)
    preds: list[Any] = []
    for f in filters:
        col = f.get("col")
        if col not in cols:
            continue
        predicate = _build_predicate(
            cols[col].get_sqla_col(template_processor=tp),
            f.get("op"),
            f.get("val"),
        )
        if predicate is not None:
            preds.append(predicate)
    if datasource.fetch_values_predicate:
        preds.append(datasource.get_fetch_values_predicate(template_processor=tp))
    rls_filters = datasource.get_sqla_row_level_filters(template_processor=tp)
    if rls_filters:
        preds.append(sa.and_(*rls_filters))
    if preds:
        qry = qry.where(sa.and_(*preds))

    with datasource.database.get_sqla_engine() as engine:
        sql = str(qry.compile(engine, compile_kwargs={"literal_binds": True}))
        sql = datasource._apply_cte(sql, cte)
        if engine.dialect.identifier_preparer._double_percents:
            sql = sql.replace("%%", "%")
        return datasource.database.mutate_sql_based_on_config(sql)


def _run_wide_side(
    side: tuple[Any, str, str, str | None, str | None],
    _app: Any,
    _user: Any,
) -> tuple[str, pd.DataFrame | None]:
    """Execute one wide-table side without column-alignment requirements."""
    from flask import g

    db_conn, sql, db_label, catalog, schema = side
    try:
        with _app.app_context():
            if _user is not None:
                g.user = _user
            df = db_conn.get_df(
                sql=sql,
                catalog=catalog,
                schema=schema,
            )
            return db_label, df
    except Exception as ex:
        logger.error("Wide side [%s] failed: %s", db_label, ex, exc_info=True)
        return db_label, None


def _run_wide_query(  # noqa: C901
    datasource: Any,
    partner_datasource: Any | None,
    aliyun_db: Any,
    oversea_db: Any,
    aliyun_db_name: str,
    oversea_db_name: str,
    columns: list[str],
    metric_parts: list[tuple[list[Any], dict[str, Any]]],
    filters: list[dict[str, Any]],
    row_limit: int | None,
) -> pd.DataFrame | None:
    """Fetch the day-granularity wide table from both sides and merge."""
    from werkzeug.local import LocalProxy

    _app = current_app._get_current_object()
    _user_raw = g.get("user", None)
    _user = (
        _user_raw._get_current_object()
        if isinstance(_user_raw, LocalProxy)
        else _user_raw
    )

    primary_sql = _wide_sql(datasource, columns, metric_parts, filters)
    if primary_sql is None:
        return None

    sides: list[tuple[Any, str, str, str | None, str | None]] = [
        (aliyun_db, primary_sql, aliyun_db_name, datasource.catalog, datasource.schema)
    ]
    if partner_datasource is not None:
        partner_sql = _wide_sql(partner_datasource, columns, metric_parts, filters)
        if partner_sql is not None:
            sides.append(
                (
                    oversea_db,
                    partner_sql,
                    oversea_db_name,
                    partner_datasource.catalog,
                    partner_datasource.schema,
                )
            )
        else:
            logger.warning("Wide query: partner side skipped (SQL construction failed)")

    with ThreadPoolExecutor(max_workers=min(len(sides), 5)) as pool:
        futures = {pool.submit(_run_wide_side, s, _app, _user): s for s in sides}
        side_dfs: list[tuple[str, pd.DataFrame]] = []
        for future in as_completed(futures):
            label, df = future.result()
            if df is not None and not df.empty:
                side_dfs.append((label, df))

    if not side_dfs:
        return None

    if len(side_dfs) == 1:
        merged = side_dfs[0][1]
    else:
        merged = _merge_dataframes(
            [df for _, df in side_dfs],
            [label for label, _ in side_dfs],
        )
    if "_db_source" in merged.columns:
        merged = merged.drop(columns=["_db_source"])
    if row_limit and len(merged) > row_limit:
        merged = merged.head(row_limit)
    return merged.reset_index(drop=True)


@bi_blueprint.route("/pivot/wide-data", methods=["POST"])
def pivot_wide_data() -> Any:  # noqa: C901
    """Day-granularity wide table for client-side pivot aggregation.

    Returns every requested dimension column plus per-day metric columns
    (ratio metrics as ``__num``/``__den`` component pairs), so the frontend
    can re-aggregate for arbitrary row/column layouts without further
    backend queries.  Metrics that cannot be re-aggregated client-side
    (AVG, COUNT DISTINCT) are rejected with 400.
    """
    from superset import db
    from superset.daos.exceptions import DatasourceNotFound
    from superset.utils.core import extract_dataframe_dtypes

    json_body = request.json
    if json_body is None:
        return jsonify({"error": "Request is not JSON"}), 400

    ds_id = int((json_body.get("datasource") or {}).get("id") or 0)
    if not ds_id:
        return jsonify({"error": "datasource.id is required"}), 400

    from superset.daos.datasource import DatasourceDAO
    from superset.utils.core import DatasourceType

    try:
        datasource = DatasourceDAO.get_datasource(DatasourceType.TABLE, ds_id)
    except DatasourceNotFound:
        return jsonify({"error": "Datasource not found"}), 404

    federated_config = _get_federated_config(datasource)
    if not federated_config:
        return jsonify({"error": "Dataset is not federated"}), 400

    columns = json_body.get("columns") or []
    if not isinstance(columns, list) or not columns:
        return jsonify({"error": "columns is required"}), 400
    metrics = json_body.get("metrics") or []
    if not isinstance(metrics, list) or not metrics:
        return jsonify({"error": "metrics is required"}), 400
    filters = json_body.get("filters") or []
    if not isinstance(filters, list):
        filters = []
    row_limit = int(json_body.get("row_limit") or 100000)
    if not filters:
        # Unfiltered wide tables cover the full history and can balloon to
        # tens of thousands of rows per side; cap them defensively.
        row_limit = min(row_limit, 50000)

    metric_parts: list[tuple[list[Any], dict[str, Any]]] = []
    components: dict[str, dict[str, Any]] = {}
    for entry in metrics:
        parts = _metric_wide_parts(datasource, entry)
        if parts is None:
            label = entry.get("label") if isinstance(entry, dict) else str(entry)
            # Skip metrics that cannot be re-aggregated client-side (AVG,
            # COUNT DISTINCT, undefined expressions) so dashboards that mix
            # them with aggregatable metrics still get the wide table.
            logger.warning("Wide metric skipped (not client-reaggregatable): %s", label)
            continue
        exprs, meta = parts
        metric_parts.append((exprs, meta))
        components[meta["label"]] = meta

    if not metric_parts:
        return jsonify(
            {
                "error": (
                    "No metric can be re-aggregated client-side "
                    "(AVG / COUNT DISTINCT unsupported)"
                )
            }
        ), 400

    aliyun_db_name, oversea_db_name = federated_config
    aliyun_db = _get_database(aliyun_db_name)
    if aliyun_db is None:
        return jsonify({"error": f"database '{aliyun_db_name}' not found"}), 404
    oversea_db = _get_database(oversea_db_name)
    if oversea_db is None:
        return jsonify({"error": f"database '{oversea_db_name}' not found"}), 404

    partner_datasource = None
    if partner_id := _read_federated_extra(datasource).get("partner_dataset_id"):
        from superset.connectors.sqla.models import SqlaTable

        partner_datasource = (
            db.session.query(SqlaTable).filter(SqlaTable.id == partner_id).one_or_none()
        )

    from superset import cache_manager
    from superset.utils import json as _json_lib

    force = bool(json_body.get("force"))
    metric_labels = [m["label"] for _e, m in metric_parts]
    cache_key = (
        None
        if force
        else _cache_key(
            "pivot-wide",
            ds_id,
            columns,
            metric_labels,
            json_body.get("filters") or [],
            row_limit,
        )
    )
    if cache_key is not None:
        cached = cache_manager.data_cache.get(cache_key)
        if cached is not None:
            return current_app.response_class(cached, mimetype="application/json")

    df = _run_wide_query(
        datasource,
        partner_datasource,
        aliyun_db,
        oversea_db,
        aliyun_db_name,
        oversea_db_name,
        columns,
        metric_parts,
        filters,
        row_limit,
    )
    if df is None:
        return jsonify({"error": "Wide query failed on all sides"}), 500

    colnames = list(df.columns)
    data_raw = df.replace({np.nan: None})
    data = _json_lib.loads(data_raw.to_json(orient="records", force_ascii=False))
    payload: dict[str, Any] = {
        "status": "success",
        "data": data,
        "colnames": colnames,
        "coltypes": extract_dataframe_dtypes(df, datasource),
        "rowcount": len(df),
        "sql_rowcount": len(df),
        "metric_components": components,
        "cached_dttm": None,
        "cache_key": cache_key,
        "is_cached": False,
        "queried_dttm": None,
        "error": None,
        "stacktrace": None,
    }
    result: dict[str, Any] = {"result": [payload]}
    body = _json_lib.dumps(result, sort_keys=False)
    if cache_key is not None:
        cache_manager.data_cache.set(cache_key, body, timeout=_cache_timeout())
    return current_app.response_class(body, mimetype="application/json")


@bi_blueprint.route("/chart/data", methods=["POST"])
def chart_data() -> Any:  # noqa: C901
    """
    Federated chart data endpoint.

    Accepts the same QueryContext JSON as ``POST /api/v1/chart/data``.
    For datasets with federation enabled in their ``extra`` JSON,
    it generates the chart's SQL
    and executes it against both configured databases, merging the results.

    The response format matches the standard chart data endpoint exactly,
    so charts render without any client-side changes.
    """
    from marshmallow import ValidationError

    from superset.charts.schemas import ChartDataQueryContextSchema
    from superset.common.chart_data import ChartDataResultType
    from superset.common.query_actions import get_query_results
    from superset.daos.exceptions import DatasourceNotFound
    from superset.exceptions import QueryObjectValidationError

    json_body = request.json
    if json_body is None:
        return jsonify({"error": "Request is not JSON"}), 400

    try:
        query_context = ChartDataQueryContextSchema().load(json_body)
    except DatasourceNotFound:
        return jsonify({"error": "Datasource not found"}), 404
    except (QueryObjectValidationError, ValidationError) as error:
        message = error.message if hasattr(error, "message") else str(error)
        return jsonify({"error": message}), 400

    datasource = query_context.datasource

    federated_config = _get_federated_config(datasource)
    if not federated_config:
        return jsonify(
            {
                "error": "Dataset is not configured for federated queries",
            }
        ), 400

    aliyun_db_name, oversea_db_name = federated_config
    aliyun_db = _get_database(aliyun_db_name)
    if aliyun_db is None:
        return jsonify({"error": f"database '{aliyun_db_name}' not found"}), 404
    oversea_db = _get_database(oversea_db_name)
    if oversea_db is None:
        return jsonify({"error": f"database '{oversea_db_name}' not found"}), 404

    # Superset's ``QueryObject`` folds the deprecated ``groupby`` field into
    # ``columns`` (see ``QueryObject._rename_deprecated_fields``) and discards the
    # genuine ``columns`` field (the pivot column dimension).  Recover the full
    # dimension set (row + column dimensions) from the raw request so the generated
    # SQL groups by both row and column dimensions and the pivot renderer receives
    # the column dimension back in the response.
    raw_queries = json_body.get("queries") or []
    for query_obj, raw_q in zip(query_context.queries, raw_queries, strict=False):
        row_dims = list((raw_q or {}).get("groupby") or [])
        col_dims = list((raw_q or {}).get("columns") or [])
        all_dims = row_dims + col_dims
        if all_dims:
            query_obj.columns = all_dims

    # Cache the full response (Redis) for non-forced requests.  Manual chart
    # refreshes and dashboard auto-refresh send ``force`` to bypass the cache.
    from superset import cache_manager
    from superset.common.db_query_status import QueryStatus
    from superset.utils import json as _json_lib

    force = bool(json_body.get("force"))
    cache_key: str | None = None
    cached_body: str | None = None
    if not force:
        cache_key = _cache_key("chart-data", datasource.id, json_body)
        cached_body = cache_manager.data_cache.get(cache_key)
        if cached_body is not None:
            return current_app.response_class(cached_body, mimetype="application/json")

    # Each query runs in its own thread (the two database sides inside
    # ``_run_federated_query`` are already parallel) with the request user
    # restored so RLS-aware SQL generation behaves identically.
    def _run_one(idx: int, query_obj: Any) -> dict[str, Any]:
        with _app.app_context():
            if _user is not None:
                g.user = _user
            result_type = query_obj.result_type or query_context.result_type

            if result_type in (
                ChartDataResultType.COLUMNS,
                ChartDataResultType.TIMEGRAINS,
                ChartDataResultType.QUERY,
            ):
                return get_query_results(result_type, query_context, query_obj, False)

            return _run_federated_query(
                query_obj,
                query_context,
                datasource,
                aliyun_db,
                oversea_db,
                aliyun_db_name,
                oversea_db_name,
            )

    _app = current_app._get_current_object()
    _user_raw = g.get("user", None)
    _user = (
        _user_raw._get_current_object()
        if isinstance(_user_raw, LocalProxy)
        else _user_raw
    )
    query_results: list[dict[str, Any] | None] = [None] * len(query_context.queries)
    try:
        with ThreadPoolExecutor(max_workers=min(len(query_context.queries), 4)) as pool:
            futures = {
                pool.submit(_run_one, idx, query_obj): idx
                for idx, query_obj in enumerate(query_context.queries)
            }
            for future in as_completed(futures):
                query_results[futures[future]] = future.result()
    except QueryObjectValidationError as ex:
        return jsonify({"error": ex.message}), 400

    # Use json.dumps directly to avoid Flask's JSON_SORT_KEYS=True
    result: dict[str, Any] = {"result": query_results}
    body = _json_lib.dumps(result, sort_keys=False)
    if cache_key is not None and all(
        r is not None and r.get("status") == QueryStatus.SUCCESS for r in query_results
    ):
        cache_manager.data_cache.set(cache_key, body, timeout=_cache_timeout())
    return current_app.response_class(body, mimetype="application/json")
