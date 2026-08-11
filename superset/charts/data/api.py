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
from __future__ import annotations

import contextlib
import logging
import re
from datetime import datetime
from typing import Any, Callable, TYPE_CHECKING

from flask import current_app as app, g, make_response, request, Response
from flask_appbuilder.api import expose, protect
from flask_babel import gettext as _
from marshmallow import ValidationError
from werkzeug.utils import secure_filename

from superset import is_feature_enabled, security_manager
from superset.async_events.async_query_manager import AsyncQueryTokenException
from superset.charts.api import ChartRestApi
from superset.charts.client_processing import apply_client_processing
from superset.charts.data.dashboard_filter_context import (
    DashboardFilterContext,
    get_dashboard_filter_context,
)
from superset.charts.data.query_context_cache_loader import QueryContextCacheLoader
from superset.charts.schemas import ChartDataQueryContextSchema
from superset.commands.chart.data.create_async_job_command import (
    CreateAsyncChartDataJobCommand,
)
from superset.commands.chart.data.get_data_command import ChartDataCommand
from superset.commands.chart.data.streaming_export_command import (
    StreamingCSVExportCommand,
)
from superset.commands.chart.exceptions import (
    ChartDataCacheLoadError,
    ChartDataQueryFailedError,
)
from superset.common.chart_data import ChartDataResultFormat, ChartDataResultType
from superset.connectors.sqla.models import BaseDatasource
from superset.constants import (
    CACHE_DISABLED_TIMEOUT,
    EXTRA_FORM_DATA_OVERRIDE_EXTRA_KEYS,
    EXTRA_FORM_DATA_OVERRIDE_REGULAR_MAPPINGS,
)
from superset.daos.exceptions import DatasourceNotFound
from superset.exceptions import QueryObjectValidationError, SupersetSecurityException
from superset.extensions import event_logger
from superset.models.sql_lab import Query
from superset.utils import json
from superset.utils.core import (
    create_zip,
    DatasourceType,
    get_user_id,
)
from superset.utils.decorators import logs_context
from superset.views.base import CsvResponse, generate_download_headers, XlsxResponse
from superset.views.base_api import statsd_metrics

if TYPE_CHECKING:
    from superset.common.query_context import QueryContext

logger = logging.getLogger(__name__)


class ChartDataRestApi(ChartRestApi):
    include_route_methods = {"get_data", "data", "data_from_cache", "agent_data"}

    @expose("/agent-data", methods=("POST",))
    def agent_data(self) -> Response:
        """
        Internal endpoint for Pi agent queries. Bypasses standard auth/CSRF
        and uses X-Internal-Agent / X-User-Id headers for identity.
        """
        username = request.headers.get("X-User-Id")
        if not username:
            return self.response_400()
        user = security_manager.find_user(username=username)
        if not user:
            return self.response_404()
        g.user = user
        json_body = request.json or {}
        try:
            query_context = self._create_query_context_from_form(json_body)
            command = ChartDataCommand(query_context)
            command.validate()
        except DatasourceNotFound:
            return self.response_404()
        except (QueryObjectValidationError, ValidationError) as error:
            return self.response_400(
                message=error.message if hasattr(error, "message") else str(error)
            )

        # Federated datasets must be queried through the cross-database merge
        # path (same as /api/v1/bi/chart/data); the standard ChartDataCommand
        # would only hit the primary database side.
        from superset.project.bi.api import _get_federated_config

        if federated_config := _get_federated_config(query_context.datasource):
            return self._agent_data_federated(
                json_body, query_context, federated_config
            )

        cache_timeout = query_context.get_cache_timeout()
        use_async = (
            is_feature_enabled("GLOBAL_ASYNC_QUERIES")
            and query_context.result_format == ChartDataResultFormat.JSON
            and query_context.result_type == ChartDataResultType.FULL
            and cache_timeout != CACHE_DISABLED_TIMEOUT
        )
        if use_async:
            return self._run_async(json_body, command, lambda **kwargs: None)
        return self._get_data_response(
            command,
            form_data=json_body.get("form_data"),
            datasource=query_context.datasource,
            add_extra_log_payload=lambda **kwargs: None,
        )

    def _agent_data_federated(  # noqa: C901
        self,
        json_body: dict[str, Any],
        query_context: QueryContext,
        federated_config: tuple[str, str],
    ) -> Response:
        """Run a federated (cross-database) query for the Pi agent.

        Mirrors the ``/api/v1/bi/chart/data`` endpoint: the query SQL is
        generated once and executed against both configured databases in
        parallel, then the results are merged and re-aggregated.  The
        response payload matches the standard chart data result format so
        the Pi agent tool parsing is unaffected.
        """
        from concurrent.futures import ThreadPoolExecutor

        from superset.common.db_query_status import QueryStatus
        from superset.project.bi.api import _get_database, _run_federated_query
        from superset.utils import json as _json_lib

        datasource = query_context.datasource
        aliyun_db_name, oversea_db_name = federated_config
        aliyun_db = _get_database(aliyun_db_name)
        if aliyun_db is None:
            return self.response_400(message=f"database '{aliyun_db_name}' not found")
        oversea_db = _get_database(oversea_db_name)
        if oversea_db is None:
            return self.response_400(message=f"database '{oversea_db_name}' not found")

        # Recover the full dimension set (row + column) from the raw request,
        # same as /bi/chart/data, since QueryObject folds groupby into columns.
        raw_queries = json_body.get("queries") or []
        for query_obj, raw_q in zip(query_context.queries, raw_queries, strict=False):
            row_dims = list((raw_q or {}).get("groupby") or [])
            col_dims = list((raw_q or {}).get("columns") or [])
            all_dims = row_dims + col_dims
            if all_dims:
                query_obj.columns = all_dims

        # Each query runs in its own thread (the two database sides inside
        # ``_run_federated_query`` are already parallel) with the request
        # user restored so RLS-aware SQL generation behaves identically.
        _app = app._get_current_object()
        _user = g.get("user", None)

        def _run_one(query_obj: Any) -> dict[str, Any]:
            with _app.app_context():
                if _user is not None:
                    g.user = _user
                return _run_federated_query(
                    query_obj,
                    query_context,
                    datasource,
                    aliyun_db,
                    oversea_db,
                    aliyun_db_name,
                    oversea_db_name,
                )

        with ThreadPoolExecutor(max_workers=min(len(query_context.queries), 4)) as pool:
            query_results = list(pool.map(_run_one, query_context.queries))

        # Use json.dumps directly to avoid Flask's JSON_SORT_KEYS=True
        result: dict[str, Any] = {"result": query_results}
        body = _json_lib.dumps(result, sort_keys=False)
        if all(
            r is not None and r.get("status") == QueryStatus.SUCCESS
            for r in query_results
        ):
            logger.info(
                "agent federated query succeeded for %d query(s)",
                len(query_results),
            )
        return app.response_class(body, mimetype="application/json")

    @expose("/<int:pk>/data/", methods=("GET",))
    @protect()
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.data",
        log_to_statsd=False,
        allow_extra_payload=True,
    )
    def get_data(  # noqa: C901
        self,
        pk: int,
        add_extra_log_payload: Callable[..., None] = lambda **kwargs: None,
    ) -> Response:
        """
        Take a chart ID and uses the query context stored when the chart was saved
        to return payload data response.
        ---
        get:
          summary: Return payload data response for a chart
          description: >-
            Takes a chart ID and uses the query context stored when the chart was saved
            to return payload data response. When filters_dashboard_id is provided,
            the chart's compiled SQL includes in scope dashboard filter
            default values.
          parameters:
          - in: path
            schema:
              type: integer
            name: pk
            description: The chart ID
          - in: query
            name: format
            description: The format in which the data should be returned
            schema:
              type: string
          - in: query
            name: type
            description: The type in which the data should be returned
            schema:
              type: string
          - in: query
            name: force
            description: Should the queries be forced to load from the source
            schema:
                type: boolean
          - in: query
            name: filters_dashboard_id
            description: >-
              Dashboard ID whose filter defaults should be applied to the
              chart's query context. The chart must belong to the specified dashboard.
              Only in scope filters with static default values are applied; filters that
              require a database query (I.E. defaultToFirstItem) or have no default are
              reported in the dashboard_filters response metadata.
            schema:
              type: integer
          responses:
            200:
              description: Query result
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ChartDataResponseSchema"
            202:
              description: Async job details
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ChartDataAsyncResponseSchema"
            400:
              $ref: '#/components/responses/400'
            401:
              $ref: '#/components/responses/401'
            403:
              $ref: '#/components/responses/403'
            404:
              $ref: '#/components/responses/404'
            500:
              $ref: '#/components/responses/500'
        """
        chart = self.datamodel.get(pk, self._base_filters)
        if not chart:
            return self.response_404()

        try:
            json_body = json.loads(chart.query_context)
        except (TypeError, json.JSONDecodeError):
            json_body = None

        if json_body is None:
            return self.response_400(
                message=_(
                    "Chart has no query context saved. Please save the chart again."
                )
            )

        # override saved query context
        json_body["result_format"] = request.args.get(
            "format", ChartDataResultFormat.JSON
        )
        json_body["result_type"] = request.args.get("type", ChartDataResultType.FULL)
        json_body["force"] = request.args.get("force")

        # Apply dashboard filter context when filters_dashboard_id is provided
        dashboard_filter_context: DashboardFilterContext | None = None
        if "filters_dashboard_id" in request.args:
            raw = request.args.get("filters_dashboard_id")
            try:
                filters_dashboard_id = int(raw)
            except (ValueError, TypeError):
                return self.response_400(
                    message="filters_dashboard_id must be an integer"
                )
        else:
            filters_dashboard_id = None

        if filters_dashboard_id is not None:
            try:
                dashboard_filter_context = get_dashboard_filter_context(
                    dashboard_id=filters_dashboard_id,
                    chart_id=pk,
                )
            except ValueError as error:
                return self.response_400(message=str(error))
            except SupersetSecurityException:
                return self.response_403()

            if dashboard_filter_context.extra_form_data:
                efd = dashboard_filter_context.extra_form_data
                extra_filters = efd.get("filters", [])

                for query in json_body.get("queries", []):
                    if extra_filters:
                        existing = query.get("filters") or []
                        query["filters"] = existing + [
                            {**f, "isExtra": True} for f in extra_filters
                        ]

                    extras = query.get("extras") or {}
                    for key in EXTRA_FORM_DATA_OVERRIDE_EXTRA_KEYS:
                        if key in efd:
                            extras[key] = efd[key]
                    if extras:
                        query["extras"] = extras

                    for (
                        src_key,
                        target_key,
                    ) in EXTRA_FORM_DATA_OVERRIDE_REGULAR_MAPPINGS.items():
                        if src_key in efd:
                            query[target_key] = efd[src_key]

                    query["extra_form_data"] = efd

                # We need to apply the form data to the global context as jinja
                # templating pulls form data from the request globally, so this
                # fallback ensures it has the filters and extra_form_data applied
                # when used in get_sqla_query which constructs the final query.

        # Jinja macros like metric() resolve dataset context from g.form_data
        # when not given an explicit dataset_id. For GET requests there is no
        # JSON body, so we must always expose the saved query context here.
        g.form_data = json_body

        try:
            query_context = self._create_query_context_from_form(json_body)
            command = ChartDataCommand(query_context)
            command.validate()
        except DatasourceNotFound:
            return self.response_404()
        except QueryObjectValidationError as error:
            return self.response_400(message=error.message)
        except ValidationError as error:
            return self.response_400(
                message=_(
                    "Request is incorrect: %(error)s", error=error.normalized_messages()
                )
            )

        # TODO: support CSV, SQL query and other non-JSON types
        # Don't use async queries when cache is disabled (cache_timeout=-1)
        # as async queries depend on caching to retrieve results
        cache_timeout = query_context.get_cache_timeout()
        use_async = (
            is_feature_enabled("GLOBAL_ASYNC_QUERIES")
            and query_context.result_format == ChartDataResultFormat.JSON
            and query_context.result_type == ChartDataResultType.FULL
            and cache_timeout != CACHE_DISABLED_TIMEOUT
        )
        if use_async:
            return self._run_async(json_body, command, add_extra_log_payload)

        try:
            form_data = json.loads(chart.params)
        except (TypeError, json.JSONDecodeError):
            form_data = {}

        return self._get_data_response(
            command=command,
            form_data=form_data,
            datasource=query_context.datasource,
            add_extra_log_payload=add_extra_log_payload,
            dashboard_filter_context=dashboard_filter_context,
        )

    @expose("/data", methods=("POST",))
    @protect()
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: f"{self.__class__.__name__}.data",
        log_to_statsd=False,
        allow_extra_payload=True,
    )
    def data(  # noqa: C901
        self, add_extra_log_payload: Callable[..., None] = lambda **kwargs: None
    ) -> Response:
        """
        Take a query context constructed in the client and return payload
        data response for the given query
        ---
        post:
          summary: Return payload data response for the given query
          description: >-
            Takes a query context constructed in the client and returns payload data
            response for the given query.
          requestBody:
            description: >-
              A query context consists of a datasource from which to fetch data
              and one or many query objects.
            required: true
            content:
              application/json:
                schema:
                  $ref: "#/components/schemas/ChartDataQueryContextSchema"
          responses:
            200:
              description: Query result
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ChartDataResponseSchema"
            202:
              description: Async job details
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ChartDataAsyncResponseSchema"
            400:
              $ref: '#/components/responses/400'
            401:
              $ref: '#/components/responses/401'
            500:
              $ref: '#/components/responses/500'
        """
        json_body = None
        if request.is_json:
            json_body = request.json
        elif request.form.get("form_data"):
            # CSV export submits regular form data
            with contextlib.suppress(TypeError, json.JSONDecodeError):
                json_body = json.loads(request.form["form_data"])
        if json_body is None:
            return self.response_400(message=_("Request is not JSON"))

        try:
            query_context = self._create_query_context_from_form(json_body)
            command = ChartDataCommand(query_context)
            command.validate()
        except DatasourceNotFound:
            return self.response_404()
        except QueryObjectValidationError as error:
            return self.response_400(message=error.message)
        except ValidationError as error:
            return self.response_400(
                message=_(
                    "Request is incorrect: %(error)s", error=error.normalized_messages()
                )
            )

        # TODO: support CSV, SQL query and other non-JSON types
        # Don't use async queries when cache is disabled (cache_timeout=-1)
        # as async queries depend on caching to retrieve results
        cache_timeout = query_context.get_cache_timeout()
        use_async = (
            is_feature_enabled("GLOBAL_ASYNC_QUERIES")
            and query_context.result_format == ChartDataResultFormat.JSON
            and query_context.result_type == ChartDataResultType.FULL
            and cache_timeout != CACHE_DISABLED_TIMEOUT
        )
        if use_async:
            return self._run_async(json_body, command, add_extra_log_payload)

        form_data = json_body.get("form_data")
        filename, expected_rows = self._extract_export_params_from_request()

        return self._get_data_response(
            command,
            form_data=form_data,
            datasource=query_context.datasource,
            add_extra_log_payload=add_extra_log_payload,
            filename=filename,
            expected_rows=expected_rows,
        )

    @expose("/data/<cache_key>", methods=("GET",))
    @protect()
    @statsd_metrics
    @event_logger.log_this_with_context(
        action=lambda self, *args, **kwargs: (
            f"{self.__class__.__name__}.data_from_cache"
        ),
        log_to_statsd=False,
    )
    def data_from_cache(self, cache_key: str) -> Response:
        """
        Take a query context cache key and return payload
        data response for the given query.
        ---
        get:
          summary: Return payload data response for the given query
          description: >-
            Takes a query context cache key and returns payload data
            response for the given query.
          parameters:
          - in: path
            schema:
              type: string
            name: cache_key
          responses:
            200:
              description: Query result
              content:
                application/json:
                  schema:
                    $ref: "#/components/schemas/ChartDataResponseSchema"
            400:
              $ref: '#/components/responses/400'
            401:
              $ref: '#/components/responses/401'
            404:
              $ref: '#/components/responses/404'
            422:
              $ref: '#/components/responses/422'
            500:
              $ref: '#/components/responses/500'
        """
        try:
            cached_data = self._load_query_context_form_from_cache(cache_key)
            # Set form_data in Flask Global as it is used as a fallback
            # for async queries with jinja context
            g.form_data = cached_data
            query_context = self._create_query_context_from_form(cached_data)
            command = ChartDataCommand(query_context)
            command.validate()
        except ChartDataCacheLoadError:
            return self.response_404()
        except ValidationError as error:
            return self.response_400(
                message=_("Request is incorrect: %(error)s", error=error.messages)
            )

        return self._get_data_response(command, True)

    def _run_async(
        self,
        form_data: dict[str, Any],
        command: ChartDataCommand,
        add_extra_log_payload: Callable[..., None] | None = None,
    ) -> Response:
        """
        Execute command as an async query.
        """
        # First, look for the chart query results in the cache,
        # but only if we're not forcing a refresh.
        if not form_data.get("force"):
            with contextlib.suppress(ChartDataCacheLoadError):
                result = command.run(force_cached=True)
                if result is not None:
                    # Log is_cached if extra payload callback is provided.
                    # This indicates no async job was triggered - data was already
                    # cached and a synchronous response is being returned immediately.
                    self._log_is_cached(result, add_extra_log_payload)
                    return self._send_chart_response(result)
        # Otherwise, kick off a background job to run the chart query.
        # Clients will either poll or be notified of query completion,
        # at which point they will call the /data/<cache_key> endpoint
        # to retrieve the results.
        async_command = CreateAsyncChartDataJobCommand()
        try:
            async_command.validate(request)
        except AsyncQueryTokenException:
            return self.response_401()

        result = async_command.run(form_data, get_user_id())
        return self.response(202, **result)

    FIELD_MAP = {
        "渠道商分成": "渠道商分成",
        "研发分成": "研发分成",
        "IP分成": "IP分成",
        "分成方式": "分成方式",
        "上线时间": "上线时间",
        "分成比例": "分成比例",
    }
    DISPLAY_FIELDS = list(FIELD_MAP.keys())
    INJECT_FIELDS_SET = set(DISPLAY_FIELDS)

    def _ensure_profit_sharing_metrics(
        self,
        datasource: Any,
        display_fields: list[str],
    ) -> None:
        from superset import db
        from superset.connectors.sqla.models import SqlMetric

        ds_id = getattr(datasource, "id", None)
        if not ds_id:
            return
        # Clean up old metric names that were renamed
        old_names = {"分成比例", "渠道分成"}
        for m in getattr(datasource, "metrics", []) or []:
            if m.metric_name in old_names and m.metric_name not in display_fields:
                try:
                    db.session.delete(m)
                except Exception:
                    logger.warning("Failed to delete old metric: %s", m.metric_name)
        existing = {m.metric_name for m in getattr(datasource, "metrics", []) or []}
        created = False
        for field in display_fields:
            if field not in existing:
                try:
                    db.session.add(
                        SqlMetric(
                            metric_name=field,
                            expression="NULL",
                            verbose_name=field,
                            table_id=ds_id,
                        )
                    )
                    created = True
                except Exception:
                    logger.warning("Failed to add metric: %s", field)
        if created:
            try:
                db.session.commit()
            except Exception:
                db.session.rollback()

    def _inject_profit_sharing(self, result: dict[str, Any]) -> dict[str, Any]:  # noqa: C901
        qc: QueryContext | None = result.get("query_context")
        if not qc:
            logger.debug("_inject_profit_sharing: no query_context")
            return result

        ds = qc.datasource
        ds_id = getattr(ds, "id", None)
        ds_extra_raw = getattr(ds, "extra", None)
        logger.debug(
            "_inject_profit_sharing: ds.id=%s extra=%s",
            ds_id,
            ds_extra_raw,
        )
        ds_extra = json.loads(ds_extra_raw or "{}")
        ps_config = ds_extra.get("profit_sharing")
        computed = ds_extra.get("computed_columns", [])

        if not ps_config and not computed:
            logger.debug(
                "_inject_profit_sharing: no config (ps=%s computed=%s)",
                bool(ps_config),
                bool(computed),
            )
            return result

        from superset import db
        from superset.models.profit_sharing import ProfitSharing

        papp_col = ps_config["papp_name_column"] if ps_config else None
        channel_col = ps_config["channel_name_column"] if ps_config else None
        profit_shares = db.session.query(ProfitSharing).all()
        logger.debug(
            "_inject_profit_sharing: papp_col=%s channel_col=%s profit_shares=%d",
            papp_col,
            channel_col,
            len(profit_shares),
        )
        ps_map = {(ps.papp_name, ps.channel_name): ps for ps in profit_shares}

        # Ensure SqlMetric records exist (appear in metrics selector under "指标")
        self._ensure_profit_sharing_metrics(ds, self.DISPLAY_FIELDS)

        # Ensure SqlMetric records exist for computed columns too
        if computed:
            from superset.connectors.sqla.models import SqlMetric

            ds_id_inner = getattr(ds, "id", None)
            if ds_id_inner:
                existing = {m.metric_name for m in getattr(ds, "metrics", []) or []}
                cc_created = False
                for cc in computed:
                    name = cc.get("name", "")
                    if name and name not in existing:
                        try:
                            db.session.add(
                                SqlMetric(
                                    metric_name=name,
                                    expression="NULL",
                                    verbose_name=name,
                                    table_id=ds_id_inner,
                                )
                            )
                            cc_created = True
                        except Exception:
                            logger.warning("Failed to create computed column")
                if cc_created:
                    try:
                        db.session.commit()
                    except Exception:
                        db.session.rollback()

        # Determine which inject fields the user selected in this query
        requested_inject: set[str] = set()
        for query_obj in getattr(qc, "queries", []) or []:
            for metric in getattr(query_obj, "metrics", None) or []:
                if isinstance(metric, str) and metric in self.INJECT_FIELDS_SET:
                    requested_inject.add(metric)
        # Also include fields stripped from groupby/columns by _get_data_response
        requested_inject |= getattr(self, "_requested_inject_fields", set())

        active_inject = list(requested_inject) if requested_inject else []

        for query in result.get("queries") or []:
            colnames: list[str] = query.get("colnames") or []
            data = query.get("data") or []
            new_cols: list[str] = []

            # Step 1: Profit sharing injection (match by game+channel name)
            if (
                ps_config
                and active_inject
                and papp_col
                and channel_col
                and papp_col in colnames
                and channel_col in colnames
            ):
                new_cols.extend(active_inject)
                matched = 0
                for row in data:
                    for field in active_inject:
                        row[field] = None
                    try:
                        key = (str(row.get(papp_col)), str(row.get(channel_col)))
                    except (ValueError, TypeError, KeyError):
                        continue
                    ps = ps_map.get(key)
                    if ps:
                        for field in active_inject:
                            attr = self.FIELD_MAP.get(field, field)
                            val = getattr(ps, attr, None)
                            if field == "分成比例" and not val:
                                val = "100"
                            row[field] = val
                        matched += 1
                    elif "分成比例" in active_inject:
                        row["分成比例"] = "100"
                logger.debug(
                    "_inject_profit_sharing: matched=%d/%d active=%s cols=%s",
                    matched,
                    len(data),
                    active_inject,
                    colnames,
                )
            # Step 1b: For aggregate-only queries (e.g. totals sub-query), init defaults
            elif (
                ps_config
                and active_inject
                and any(f in colnames for f in active_inject)
            ):
                new_cols.extend(active_inject)
                for row in data:
                    for field in active_inject:
                        row[field] = row.get(field) or None

            # Step 2: Computed columns (inject per user via metrics/columns)
            if computed:
                requested_computed: set[str] = set()
                for query_obj in getattr(qc, "queries", []) or []:
                    for metric in getattr(query_obj, "metrics", None) or []:
                        if isinstance(metric, str):
                            requested_computed.add(metric)
                requested_computed |= getattr(self, "_requested_inject_fields", set())
                computed_names_set = {c["name"] for c in computed}
                active_computed = [
                    c
                    for c in computed
                    if c["name"] in (requested_computed & computed_names_set)
                ]

                if active_computed:
                    new_cols.extend(c["name"] for c in active_computed)
                    for row in data:
                        local_vars: dict[str, Any] = {
                            **row,
                            "float": float,
                            "int": int,
                            "str": str,
                            "round": round,
                        }
                        for key in list(row.keys()):
                            m = re.match(r"^(\w+)\((.+)\)$", str(key))
                            if m and m.group(2) not in local_vars:
                                local_vars[m.group(2)] = row[key]
                        for cc in active_computed:
                            try:
                                row[cc["name"]] = eval(  # noqa: S307
                                    cc["formula"],
                                    {"__builtins__": {}},
                                    local_vars,
                                )
                            except Exception:
                                row[cc["name"]] = None

            if new_cols:
                existing_lower = {c.lower() for c in colnames}
                query["colnames"] = colnames + [
                    c for c in new_cols if c.lower() not in existing_lower
                ]

        return result

    def _send_chart_response(  # noqa: C901
        self,
        result: dict[Any, Any],
        form_data: dict[str, Any] | None = None,
        datasource: BaseDatasource | Query | None = None,
        filename: str | None = None,
        expected_rows: int | None = None,
        dashboard_filter_context: DashboardFilterContext | None = None,
    ) -> Response:
        result = self._inject_profit_sharing(result)
        result_type = result["query_context"].result_type
        result_format = result["query_context"].result_format

        # Post-process the data so it matches the data presented in the chart.
        # This is needed for sending reports based on text charts that do the
        # post-processing of data, eg, the pivot table.
        if result_type == ChartDataResultType.POST_PROCESSED:
            result = apply_client_processing(result, form_data, datasource)

        if result_format in ChartDataResultFormat.table_like():
            # Verify user has permission to export file
            if is_feature_enabled("GRANULAR_EXPORT_CONTROLS"):
                has_export_perm = security_manager.can_access(
                    "can_export_data", "Superset"
                )
            else:
                has_export_perm = security_manager.can_access("can_csv", "Superset")
            if not has_export_perm:
                return self.response_403()

            if not result["queries"]:
                return self.response_400(_("Empty query result"))

            is_csv_format = result_format == ChartDataResultFormat.CSV

            # Check if we should use streaming for large datasets
            if is_csv_format and self._should_use_streaming(result, form_data):
                return self._create_streaming_csv_response(
                    result, form_data, filename=filename, expected_rows=expected_rows
                )

            if len(result["queries"]) == 1:
                # return single query results
                data = result["queries"][0]["data"]
                if is_csv_format:
                    return CsvResponse(data, headers=generate_download_headers("csv"))

                return XlsxResponse(data, headers=generate_download_headers("xlsx"))

            # return multi-query results bundled as a zip file
            def _process_data(query_data: Any) -> Any:
                if result_format == ChartDataResultFormat.CSV:
                    encoding = app.config["CSV_EXPORT"].get("encoding", "utf-8")
                    return query_data.encode(encoding)
                return query_data

            files = {
                f"query_{idx + 1}.{result_format}": _process_data(query["data"])
                for idx, query in enumerate(result["queries"])
            }
            return Response(
                create_zip(files),
                headers=generate_download_headers("zip"),
                mimetype="application/zip",
            )

        if result_format == ChartDataResultFormat.JSON:
            queries = result["queries"]
            if security_manager.is_guest_user():
                for query in queries:
                    query.pop("query", None)

            payload: dict[str, Any] = {"result": queries}
            if dashboard_filter_context is not None:
                payload["dashboard_filters"] = dashboard_filter_context.to_dict()

            with event_logger.log_context(f"{self.__class__.__name__}.json_dumps"):
                response_data = json.dumps(
                    payload,
                    default=json.json_int_dttm_ser,
                    ignore_nan=True,
                )
            resp = make_response(response_data, 200)
            resp.headers["Content-Type"] = "application/json; charset=utf-8"
            return resp

        return self.response_400(message=f"Unsupported result_format: {result_format}")

    def _log_is_cached(
        self,
        result: dict[str, Any],
        add_extra_log_payload: Callable[..., None] | None,
    ) -> None:
        """
        Log is_cached values from query results to event logger.

        Extracts is_cached from each query in the result and logs it.
        If there's a single query, logs the boolean value directly.
        If multiple queries, logs as a list.
        """
        if add_extra_log_payload and result and "queries" in result:
            is_cached_values = [query.get("is_cached") for query in result["queries"]]
            if len(is_cached_values) == 1:
                add_extra_log_payload(is_cached=is_cached_values[0])
            elif is_cached_values:
                add_extra_log_payload(is_cached=is_cached_values)

    @event_logger.log_this
    def _get_data_response(  # noqa: C901
        self,
        command: ChartDataCommand,
        force_cached: bool = False,
        form_data: dict[str, Any] | None = None,
        datasource: BaseDatasource | Query | None = None,
        filename: str | None = None,
        expected_rows: int | None = None,
        add_extra_log_payload: Callable[..., None] | None = None,
        dashboard_filter_context: DashboardFilterContext | None = None,
    ) -> Response:
        """Get data response and optionally log is_cached information."""
        # Strip virtual columns from GROUP BY to avoid SQL errors (GROUP BY NULL)
        qc = command._query_context
        self._requested_inject_fields: set[str] = set()

        # Read computed column names from datasource
        computed_names: set[str] = set()
        ds_extra_raw = getattr(qc.datasource, "extra", "{}") or "{}"
        ds_extra = (
            json.loads(ds_extra_raw) if isinstance(ds_extra_raw, str) else ds_extra_raw
        )
        for cc in ds_extra.get("computed_columns", []):
            if name := cc.get("name"):
                computed_names.add(name)

        for q in getattr(qc, "queries", []) or []:
            cols = getattr(q, "columns", None)
            if cols:
                for c in cols:
                    if isinstance(c, str):
                        if c in self.INJECT_FIELDS_SET:
                            self._requested_inject_fields.add(c)
                        elif c in computed_names:
                            self._requested_inject_fields.add(c)
                q.columns = [
                    c
                    for c in cols
                    if c not in self.INJECT_FIELDS_SET and c not in computed_names
                ]

            # Strip computed columns from metrics to prevent NULL-valued columns
            # in the SQL result when the user hasn't selected them
            metrics = getattr(q, "metrics", None)
            if metrics:
                for m in metrics:
                    if isinstance(m, str) and m in computed_names:
                        self._requested_inject_fields.add(m)
                q.metrics = [
                    m
                    for m in metrics
                    if not (isinstance(m, str) and m in computed_names)
                ]
        try:
            result = command.run(force_cached=force_cached)
        except ChartDataCacheLoadError as exc:
            return self.response_422(message=exc.message)
        except ChartDataQueryFailedError as exc:
            return self.response_400(message=exc.message)

            # Log is_cached if extra payload callback is provided
        if add_extra_log_payload and result and "queries" in result:
            is_cached_values = [query.get("is_cached") for query in result["queries"]]
            add_extra_log_payload(is_cached=is_cached_values)

        return self._send_chart_response(
            result,
            form_data,
            datasource,
            filename,
            expected_rows,
            dashboard_filter_context=dashboard_filter_context,
        )

    def _extract_export_params_from_request(self) -> tuple[str | None, int | None]:
        """Extract filename and expected_rows from request for streaming exports."""
        filename = request.form.get("filename")
        if filename:
            logger.info("FRONTEND PROVIDED FILENAME: %s", filename)

        expected_rows = None
        if expected_rows_str := request.form.get("expected_rows"):
            try:
                expected_rows = int(expected_rows_str)
                logger.info("FRONTEND PROVIDED EXPECTED ROWS: %d", expected_rows)
            except (ValueError, TypeError):
                logger.warning("Invalid expected_rows value: %s", expected_rows_str)

        return filename, expected_rows

    # pylint: disable=invalid-name
    def _load_query_context_form_from_cache(self, cache_key: str) -> dict[str, Any]:
        return QueryContextCacheLoader.load(cache_key)

    def _map_form_data_datasource_to_dataset_id(
        self, form_data: dict[str, Any]
    ) -> dict[str, Any]:
        return {
            "dashboard_id": form_data.get("form_data", {}).get("dashboardId"),
            "dataset_id": (
                form_data.get("datasource", {}).get("id")
                if isinstance(form_data.get("datasource"), dict)
                and form_data.get("datasource", {}).get("type")
                == DatasourceType.TABLE.value
                else None
            ),
            "slice_id": form_data.get("form_data", {}).get("slice_id"),
        }

    @logs_context(context_func=_map_form_data_datasource_to_dataset_id)
    def _create_query_context_from_form(
        self, form_data: dict[str, Any]
    ) -> QueryContext:
        """
        Create the query context from the form data.

        :param form_data: The chart form data
        :returns: The query context
        :raises ValidationError: If the request is incorrect
        """

        try:
            return ChartDataQueryContextSchema().load(form_data)
        except KeyError as ex:
            raise ValidationError("Request is incorrect") from ex

    def _should_use_streaming(
        self, result: dict[Any, Any], form_data: dict[str, Any] | None = None
    ) -> bool:
        """Determine if streaming should be used based on actual row count threshold."""
        query_context = result["query_context"]
        result_format = query_context.result_format

        # Only support CSV streaming currently
        if result_format.lower() != "csv":
            return False

        # Get streaming threshold from config
        threshold = app.config.get("CSV_STREAMING_ROW_THRESHOLD", 100000)

        # Extract actual row count (same logic as frontend)
        actual_row_count: int | None = None
        viz_type = form_data.get("viz_type") if form_data else None

        # For table viz, try to get actual row count from query results
        if viz_type == "table" and result.get("queries"):
            # Check if we have rowcount in the second query result (like frontend does)
            queries = result.get("queries", [])
            if len(queries) > 1 and queries[1].get("data"):
                data = queries[1]["data"]
                if isinstance(data, list) and len(data) > 0:
                    rowcount = data[0].get("rowcount")
                    actual_row_count = int(rowcount) if rowcount else None

        # Fallback to row_limit if actual count not available
        if actual_row_count is None:
            if form_data and "row_limit" in form_data:
                row_limit = form_data.get("row_limit", 0)
                actual_row_count = int(row_limit) if row_limit else 0
            elif query_context.form_data and "row_limit" in query_context.form_data:
                row_limit = query_context.form_data.get("row_limit", 0)
                actual_row_count = int(row_limit) if row_limit else 0

        # Use streaming if row count meets or exceeds threshold
        return actual_row_count is not None and actual_row_count >= threshold

    def _create_streaming_csv_response(
        self,
        result: dict[Any, Any],
        form_data: dict[str, Any] | None = None,
        filename: str | None = None,
        expected_rows: int | None = None,
    ) -> Response:
        """Create a streaming CSV response for large datasets."""
        query_context = result["query_context"]

        # Use filename from frontend if provided, otherwise generate one
        if not filename:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            chart_name = "export"

            if form_data and form_data.get("slice_name"):
                chart_name = form_data["slice_name"]
            elif form_data and form_data.get("viz_type"):
                chart_name = form_data["viz_type"]

            # Sanitize chart name for filename
            filename = secure_filename(f"superset_{chart_name}_{timestamp}.csv")

        logger.info("Creating streaming CSV response: %s", filename)
        if expected_rows:
            logger.info("Using expected_rows from frontend: %d", expected_rows)

        # Execute streaming command
        # TODO: Make chunk size configurable via SUPERSET_CONFIG
        chunk_size = 1024
        command = StreamingCSVExportCommand(query_context, chunk_size)
        command.validate()

        # Get the callable that returns the generator
        csv_generator_callable = command.run()

        # Get encoding from config
        encoding = app.config.get("CSV_EXPORT", {}).get("encoding", "utf-8")

        # Create response with streaming headers
        response = Response(
            csv_generator_callable(),  # Call the callable to get generator
            mimetype=f"text/csv; charset={encoding}",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",  # Disable nginx buffering
            },
            direct_passthrough=False,  # Flask must iterate generator
        )

        # Force chunked transfer encoding
        response.implicit_sequence_conversion = False

        return response
