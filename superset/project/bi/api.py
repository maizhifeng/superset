from __future__ import annotations

import logging
from typing import Any

import numpy as np
import pandas as pd
import rison
import sqlalchemy as sa
from flask import Blueprint, current_app, jsonify, request

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


def _side_query_dict(query_obj: Any, side_limit: int | None) -> dict[str, Any]:
    """Build a query dict for a single database side.

    Pagination (``row_offset``) is stripped so each side returns a recall-oriented
    window; the final global ordering and pagination are applied once on the
    merged result (see ``_apply_global_order_and_pagination``).
    """
    qdict = query_obj.to_dict()
    qdict.pop("row_offset", None)
    if side_limit is not None:
        qdict["row_limit"] = side_limit
    return qdict


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
        sort_cols = [o[0] for o in orderby if o and o[0] in df.columns]
        ascending = [bool(o[1]) for o in orderby if o and o[0] in df.columns]
        if sort_cols:
            df = df.sort_values(sort_cols, ascending=ascending)
        elif len(labels_expected) > 1 and labels_expected[-1] in df.columns:
            # Default: first metric column, descending.
            df = df.sort_values(labels_expected[-1], ascending=False)
    except Exception:
        logger.warning("Federated global sort failed; keeping merge order")

    offset = getattr(query_obj, "row_offset", 0) or 0
    limit = getattr(query_obj, "row_limit", None)
    if offset:
        df = df.iloc[offset:]
    if limit:
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
        db.session.query(Database)
        .filter(Database.database_name == name)
        .one_or_none()
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
    datasource: Any, query_obj: Any, side_limit: int | None = None
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
        db.session.query(SqlaTable)
        .filter(SqlaTable.id == partner_id)
        .one_or_none()
    )
    if not partner_ds:
        return None
    try:
        qdict = _side_query_dict(query_obj, side_limit)
        partner_ext = partner_ds.get_query_str_extended(qdict)
        partner_sql_str = partner_ext.sql
        logger.info(
            "Partner SQL (%d chars):\n%s\n---END---",
            len(partner_sql_str), partner_sql_str,
        )
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
    if (partner_result := _get_partner_sql(datasource, query_obj, side_limit)):
        partner_sql, partner_catalog, partner_schema = partner_result

    # Generate SQL from the primary dataset for the primary database
    primary_ext = datasource.get_query_str_extended(
        _side_query_dict(query_obj, side_limit)
    )
    primary_sql = primary_ext.sql
    labels_expected = primary_ext.labels_expected
    logger.info("labels_expected: %s", labels_expected)

    df_aliyun = _execute_federated_side(
        aliyun_db, primary_sql, datasource, labels_expected, "aliyun"
    )
    if df_aliyun is None:
        raise QueryObjectValidationError("aliyun federated query failed")

    df_oversea = pd.DataFrame()
    if partner_sql:
        df_oversea = _execute_federated_side(
            oversea_db, partner_sql, datasource, labels_expected, "aliyun-oversea",
            catalog_override=partner_catalog, schema_override=partner_schema,
        )

    if df_oversea is None or df_oversea.empty:
        merged_df = df_aliyun
    elif df_aliyun.empty:
        merged_df = df_oversea
    else:
        merged_df = _merge_dataframes(
            [df_aliyun, df_oversea],
            [aliyun_db_name, oversea_db_name],
        )

    if not merged_df.empty:
        if "_db_source" in merged_df.columns:
            merged_df = merged_df.drop(columns=["_db_source"])
        merged_df = merged_df[labels_expected]

        # Re-aggregate: when both databases contribute rows for the same
        # dimension tuple, combine them so the chart shows a single merged
        # value per dimension.  Dimension columns are identified from the
        # actual GROUP BY / column labels rather than by position, so the
        # logic stays correct even when columns are interleaved (e.g. time
        # grains or pivot columns).  Everything not in the group-by set is
        # treated as a metric column.
        groupby_cols = (
            list(getattr(query_obj, "columns", None) or [])
            or list(getattr(query_obj, "groupby", None) or [])
            or []
        )
        groupby_set = set(groupby_cols)
        dim_cols = [c for c in labels_expected if c in groupby_set]
        metric_cols = [c for c in labels_expected if c not in groupby_set]
        if not dim_cols and groupby_cols:
            # Group-by labels not found by name; fall back to positional split
            # to preserve the original behaviour for unusual schemas.
            dim_cols = labels_expected[: len(groupby_cols)]
            metric_cols = labels_expected[len(groupby_cols):]

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

        # Restore canonical column order (dimensions then metrics as declared).
        merged_df = merged_df[labels_expected]
        logger.info(
            "Re-aggregated %d rows → %d rows (groupby=%s, agg=%s)",
            before_len, len(merged_df), dim_cols, agg_spec,
        )

        try:
            result_df = datasource.normalize_df(merged_df, query_obj)
            result_df = query_obj.exec_post_processing(result_df)
            # Restore column order after post-processing (which may reorder)
            result_df = result_df[labels_expected]
        except Exception:
            result_df = merged_df

        # Apply the requested global ordering and pagination to the merged
        # result so the cross-database Top-N and offsets are consistent (each
        # side was fetched with a recall-oriented limit instead).
        result_df = _apply_global_order_and_pagination(
            result_df, query_obj, labels_expected
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


def _execute_federated_side(
    db_conn: Any,
    sql: str,
    datasource: Any,
    labels_expected: list[str],
    db_label: str = "",
    catalog_override: str | None = None,
    schema_override: str | None = None,
) -> pd.DataFrame | None:
    from superset.exceptions import QueryObjectValidationError
    def assign_column_label(df: pd.DataFrame) -> pd.DataFrame:
        if df is not None and not df.empty:
            if len(df.columns) < len(labels_expected):
                raise QueryObjectValidationError(
                    "Db engine did not return all queried columns"
                )
            if len(df.columns) > len(labels_expected):
                df = df.iloc[:, 0 : len(labels_expected)]
            df.columns = labels_expected
        return df

    try:
        cat = catalog_override if catalog_override is not None else datasource.catalog
        sch = schema_override if schema_override is not None else datasource.schema
        logger.info(
            "Executing federated side (%s): SQL (%s chars) catalog=%s schema=%s",
            db_label, len(sql), cat, sch,
        )
        return db_conn.get_df(
            sql=sql,
            catalog=cat,
            schema=sch,
            mutator=assign_column_label,
        )
    except Exception as ex:
        logger.warning("Federated side query failed: %s", ex)
        return None


@bi_blueprint.route(
    "/filter-values/<int:datasource_id>/<column_name>/", methods=["GET"]
)
def filter_values(datasource_id: int, column_name: str) -> Any:
    from flask import current_app

    from superset.connectors.sqla.models import SqlaTable
    from superset.daos.datasource import DatasourceDAO
    from superset.daos.exceptions import DatasourceNotFound
    from superset.utils.core import DatasourceType

    try:
        datasource = DatasourceDAO.get_datasource(
            DatasourceType.TABLE, datasource_id
        )
    except DatasourceNotFound:
        return jsonify({"result": []}), 200

    default_limit = current_app.config.get("FILTER_SELECT_ROW_LIMIT", 10000)
    q_str = request.args.get("q")
    query_params: dict[str, Any] = {}
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
    partner_id = _read_federated_extra(datasource).get("partner_dataset_id")
    if partner_id:
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
                return jsonify({"result": merged})
        except Exception:
            logger.warning("Federated filter values merge failed", exc_info=True)

    result = list(primary_vals)
    result.sort(key=lambda v: (v is None, str(v)))
    return jsonify({"result": result})


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


@bi_blueprint.route("/chart/data", methods=["POST"])
def chart_data() -> Any:
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
        return jsonify({
            "error": "Dataset is not configured for federated queries",
        }), 400

    aliyun_db_name, oversea_db_name = federated_config
    aliyun_db = _get_database(aliyun_db_name)
    if aliyun_db is None:
        return jsonify({"error": f"database '{aliyun_db_name}' not found"}), 404
    oversea_db = _get_database(oversea_db_name)
    if oversea_db is None:
        return jsonify({"error": f"database '{oversea_db_name}' not found"}), 404

    query_results: list[dict[str, Any]] = []
    try:
        for query_obj in query_context.queries:
            result_type = query_obj.result_type or query_context.result_type

            if result_type in (
                ChartDataResultType.COLUMNS,
                ChartDataResultType.TIMEGRAINS,
                ChartDataResultType.QUERY,
            ):
                payload = get_query_results(
                    result_type, query_context, query_obj, False
                )
                query_results.append(payload)
                continue

            payload = _run_federated_query(
                query_obj, query_context, datasource,
                aliyun_db, oversea_db, aliyun_db_name, oversea_db_name,
            )
            query_results.append(payload)
    except QueryObjectValidationError as ex:
        return jsonify({"error": ex.message}), 400

    # Use json.dumps directly to avoid Flask's JSON_SORT_KEYS=True
    from flask import current_app

    from superset.utils import json as _json_lib

    result: dict[str, Any] = {"result": query_results}
    return current_app.response_class(
        _json_lib.dumps(result, sort_keys=False),
        mimetype="application/json",
    )
