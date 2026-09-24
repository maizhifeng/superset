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
import logging
from typing import Any, Optional

from croniter import croniter
from flask import current_app as app
from flask_babel import gettext as _
from marshmallow import ValidationError

from superset.commands.base import BaseCommand
from superset.commands.report.exceptions import (
    ChartNotFoundValidationError,
    ChartNotSavedValidationError,
    DashboardNotFoundValidationError,
    DashboardNotSavedValidationError,
    ReportScheduleEitherChartOrDashboardError,
    ReportScheduleFrequencyNotAllowed,
    ReportScheduleOnlyChartOrDashboardError,
)
from superset.daos.chart import ChartDAO
from superset.daos.dashboard import DashboardDAO
from superset.reports.models import ReportCreationMethod, ReportScheduleType
from superset.reports.types import ReportScheduleExtra
from superset.utils import json

logger = logging.getLogger(__name__)


class BaseReportScheduleCommand(BaseCommand):
    _properties: dict[str, Any]

    def run(self) -> Any:
        pass

    def validate(self) -> None:
        pass

    def validate_chart_dashboard(
        self, exceptions: list[ValidationError], update: bool = False
    ) -> None:
        """Validate chart or dashboard relation"""
        chart_id = self._properties.get("chart")
        dashboard_id = self._properties.get("dashboard")
        creation_method = self._properties.get("creation_method")

        if creation_method == ReportCreationMethod.BRIEFING:
            # Briefing schedules reference a briefing config via
            # extra.briefing.config_id instead of a chart or dashboard.
            if chart_id or dashboard_id:
                exceptions.append(ReportScheduleOnlyChartOrDashboardError())
            return

        if creation_method == ReportCreationMethod.CHARTS and not chart_id:
            # User has not saved chart yet in Explore view
            exceptions.append(ChartNotSavedValidationError())
            return

        if creation_method == ReportCreationMethod.DASHBOARDS and not dashboard_id:
            exceptions.append(DashboardNotSavedValidationError())
            return

        self._resolve_chart_dashboard(exceptions, update=update)

    def _resolve_chart_dashboard(
        self, exceptions: list[ValidationError], update: bool
    ) -> None:
        """Resolve chart/dashboard objects and enforce mutual exclusivity."""
        chart_id = self._properties.get("chart")
        dashboard_id = self._properties.get("dashboard")

        if chart_id and dashboard_id:
            exceptions.append(ReportScheduleOnlyChartOrDashboardError())

        if chart_id:
            chart = ChartDAO.find_by_id(chart_id)
            if not chart:
                exceptions.append(ChartNotFoundValidationError())
            self._properties["chart"] = chart
        elif dashboard_id:
            dashboard = DashboardDAO.find_by_id(dashboard_id)
            if not dashboard:
                exceptions.append(DashboardNotFoundValidationError())
            self._properties["dashboard"] = dashboard
        elif not update:
            exceptions.append(ReportScheduleEitherChartOrDashboardError())

    def _validate_report_extra(self, exceptions: list[ValidationError]) -> None:
        extra: Optional[ReportScheduleExtra] = self._properties.get("extra")
        if extra is not None:
            self._validate_briefing_extra(extra, exceptions)

        # On PUT requests, dashboard may not be in the payload — fall back to the model
        model = getattr(self, "_model", None)
        dashboard = self._properties.get("dashboard") or getattr(
            model, "dashboard", None
        )

        if extra is None or dashboard is None:
            return

        dashboard_state = extra.get("dashboard")
        if not dashboard_state:
            return

        if not isinstance(dashboard_state, dict):
            exceptions.append(
                ValidationError(
                    _("extra.dashboard must be an object"),
                    "extra",
                )
            )
            return

        position_data = json.loads(dashboard.position_json or "{}")
        active_tabs = dashboard_state.get("activeTabs") or []
        invalid_tab_ids = set(active_tabs) - set(position_data.keys())

        if anchor := dashboard_state.get("anchor"):
            try:
                anchor_list: list[str] = json.loads(anchor)
                if _invalid_tab_ids := set(anchor_list) - set(position_data.keys()):
                    invalid_tab_ids.update(_invalid_tab_ids)
            except json.JSONDecodeError:
                if anchor not in position_data:
                    invalid_tab_ids.add(anchor)

        if invalid_tab_ids:
            exceptions.append(
                ValidationError(
                    _("Invalid tab ids: %(tab_ids)s", tab_ids=str(invalid_tab_ids)),
                    "extra",
                )
            )

        self._validate_native_filters(dashboard, dashboard_state, exceptions)

    def _validate_briefing_extra(
        self, extra: ReportScheduleExtra, exceptions: list[ValidationError]
    ) -> None:
        """Validate extra.briefing for briefing schedules.

        Briefing schedules must reference a stored briefing configuration
        (key_value ``daily_report_cfg`` entry) via ``extra.briefing.config_id``.
        """
        creation_method = self._properties.get("creation_method")
        model = getattr(self, "_model", None)
        if creation_method is None and model is not None:
            creation_method = getattr(model, "creation_method", None)
        if creation_method != ReportCreationMethod.BRIEFING:
            return

        briefing = extra.get("briefing")
        if not isinstance(briefing, dict):
            exceptions.append(
                ValidationError(
                    _("extra.briefing must be an object with a config_id"),
                    "extra",
                )
            )
            return

        config_id = briefing.get("config_id")
        if not isinstance(config_id, int) or isinstance(config_id, bool):
            exceptions.append(
                ValidationError(
                    _("extra.briefing.config_id must be an integer"),
                    "extra",
                )
            )
            return

        from superset.project.briefing.store import get_config

        if get_config(config_id) is None:
            exceptions.append(
                ValidationError(
                    _("Briefing configuration %(id)s not found", id=config_id),
                    "extra",
                )
            )

    def _validate_native_filters(
        self,
        dashboard: Any,
        dashboard_state: Any,
        exceptions: list[ValidationError],
    ) -> None:
        native_filters = dashboard_state.get("nativeFilters")
        if not native_filters:
            return

        if not isinstance(native_filters, list):
            exceptions.append(
                ValidationError(
                    _("nativeFilters must be a list"),
                    "extra",
                )
            )
            return

        required_keys = {"nativeFilterId", "filterType", "columnName", "filterValues"}
        valid_filter_ids: set[str] | None = None

        for idx, native_filter in enumerate(native_filters):
            if not isinstance(native_filter, dict):
                exceptions.append(
                    ValidationError(
                        _("nativeFilters[%(idx)s] must be an object", idx=idx),
                        "extra",
                    )
                )
                continue

            missing_keys = required_keys - set(native_filter.keys())
            if missing_keys:
                exceptions.append(
                    ValidationError(
                        _(
                            "nativeFilters[%(idx)s] missing required keys: %(keys)s",
                            idx=idx,
                            keys=", ".join(sorted(missing_keys)),
                        ),
                        "extra",
                    )
                )
                continue

            if not isinstance(native_filter["filterValues"], list):
                exceptions.append(
                    ValidationError(
                        _(
                            "nativeFilters[%(idx)s].filterValues must be a list",
                            idx=idx,
                        ),
                        "extra",
                    )
                )
                continue

            filter_id = native_filter["nativeFilterId"]
            if not isinstance(filter_id, str) or not filter_id:
                exceptions.append(
                    ValidationError(
                        _(
                            "nativeFilters[%(idx)s].nativeFilterId"
                            " must be a non-empty string",
                            idx=idx,
                        ),
                        "extra",
                    )
                )
                continue
            if valid_filter_ids is None:
                json_metadata = json.loads(dashboard.json_metadata or "{}")
                valid_filter_ids = {
                    f["id"]
                    for f in json_metadata.get("native_filter_configuration", [])
                    if "id" in f
                }
            if filter_id not in valid_filter_ids:
                exceptions.append(
                    ValidationError(
                        _(
                            "nativeFilters[%(idx)s].nativeFilterId '%(filter_id)s' "
                            "does not exist on the dashboard",
                            idx=idx,
                            filter_id=filter_id,
                        ),
                        "extra",
                    )
                )

    def validate_report_frequency(
        self,
        cron_schedule: str,
        report_type: str,
    ) -> None:
        """
        Validates if the report scheduled frequency doesn't exceed a limit
        configured in `config.py`.

        :param cron_schedule: The cron schedule configured.
        :param report_type: The report type (Alert/Report).
        """
        config_key = (
            "ALERT_MINIMUM_INTERVAL"
            if report_type == ReportScheduleType.ALERT
            else "REPORT_MINIMUM_INTERVAL"
        )
        minimum_interval = app.config.get(config_key, 0)
        if callable(minimum_interval):
            minimum_interval = minimum_interval()

        if not isinstance(minimum_interval, int):
            logger.error(
                "Invalid value for %s: %s", config_key, minimum_interval, exc_info=True
            )
            return

        # Since configuration is in minutes, we only need to validate
        # in case `minimum_interval` is <= 120 (2min)
        if minimum_interval < 120:
            return

        iterations = 60 if minimum_interval <= 3660 else 24
        schedule = croniter(cron_schedule)
        current_exec = next(schedule)

        for _i in range(iterations):
            next_exec = next(schedule)
            diff, current_exec = next_exec - current_exec, next_exec
            if int(diff) < minimum_interval:
                raise ReportScheduleFrequencyNotAllowed(
                    report_type=report_type, minimum_interval=minimum_interval
                )
