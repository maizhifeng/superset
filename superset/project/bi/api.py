from __future__ import annotations

import logging
from typing import Any

import pandas as pd
from flask import Blueprint, jsonify, request

# All superset model imports are lazy (inside functions) to avoid
# circular imports during app initialization.

logger = logging.getLogger(__name__)

bi_blueprint = Blueprint("bi_federated", __name__, url_prefix="/api/v1/bi")


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
    datasource: Any, query_obj: Any
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
        qdict = query_obj.to_dict()
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

    partner_sql = partner_catalog = partner_schema = None
    if (partner_result := _get_partner_sql(datasource, query_obj)):
        partner_sql, partner_catalog, partner_schema = partner_result

    # Generate SQL from the primary dataset for the primary database
    primary_ext = datasource.get_query_str_extended(query_obj.to_dict())
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
        # Re-aggregate: when both databases contribute data, rows with
        # the same GROUP BY keys must be combined (summed) so the chart
        # shows a single merged value per dimension tuple.
        # labels_expected order: [groupby_cols..., metric_cols...]
        # Superset >= 3.0 uses ``columns``; older versions use ``groupby``.
        groupby_cols = (
            getattr(query_obj, "columns", None)
            or getattr(query_obj, "groupby", None)
            or []
        )
        if groupby_cols:
            gb_count = len(groupby_cols)
            if 0 < gb_count < len(labels_expected):
                dim_cols = labels_expected[:gb_count]
                metric_cols = labels_expected[gb_count:]
                before_len = len(merged_df)
                if metric_cols:
                    merged_df = merged_df.groupby(
                        dim_cols, as_index=False, sort=False,
                    )[metric_cols].sum()
                else:
                    merged_df = merged_df.drop_duplicates(subset=dim_cols)
                logger.info(
                    "Re-aggregated %d rows → %d rows (groupby=%s, dim_cols=%s)",
                    before_len, len(merged_df), groupby_cols, dim_cols,
                )
        try:
            result_df = datasource.normalize_df(merged_df, query_obj)
            result_df = query_obj.exec_post_processing(result_df)
            # Restore column order after post-processing (which may reorder)
            result_df = result_df[labels_expected]
        except Exception:
            result_df = merged_df
    else:
        result_df = merged_df

    coltypes = extract_dataframe_dtypes(result_df, datasource)
    data_raw = query_context.get_data(result_df, coltypes)
    colnames = list(result_df.columns)

    if isinstance(data_raw, list) and len(data_raw) > 0:
        data_raw = [{c: row.get(c) for c in colnames} for row in data_raw]

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
        "applied_filters": [],
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
    from superset.utils.core import apply_max_row_limit, DatasourceType

    try:
        datasource = DatasourceDAO.get_datasource(
            DatasourceType.TABLE, datasource_id
        )
    except DatasourceNotFound:
        return jsonify({"result": []}), 200

    row_limit = apply_max_row_limit(
        current_app.config.get("FILTER_SELECT_ROW_LIMIT", 10000)
    )
    try:
        primary_vals = datasource.values_for_column(
            column_name=column_name, limit=row_limit
        )
    except Exception:
        primary_vals = []

    # Check for federated partner and merge values
    from superset import db
    from superset.utils import json as _json
    extra_raw = getattr(datasource, "extra", None) or "{}"
    try:
        extra = _json.loads(extra_raw) if isinstance(extra_raw, str) else extra_raw
        partner_id = extra.get("federated", {}).get("partner_dataset_id")
        if partner_id:
            partner_ds = db.session.query(SqlaTable).filter(
                SqlaTable.id == partner_id
            ).one_or_none()
            if partner_ds:
                partner_vals = partner_ds.values_for_column(
                    column_name=column_name, limit=row_limit
                )
                merged = list(set(primary_vals + partner_vals))
                return jsonify({"result": merged})
    except Exception:
        logger.warning(
            "Federated filter values merge failed", exc_info=True
        )

    return jsonify({"result": primary_vals})


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
