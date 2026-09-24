"""
Briefing REST API.

Exposes the briefing workflow (daily and weekly report types) and its persisted
report configurations to the ``superset-frontend-new`` MUI frontend.  The data
source is Superset's own datasets.  Report generation runs as a background job
(``jobs``) so the frontend can stream a live progress log, stop a running job,
and re-run.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from flask import Blueprint, current_app, g, jsonify, request

logger = logging.getLogger(__name__)

# Supported briefing types.  Anything else normalizes to "daily".
REPORT_TYPES = ("daily", "weekly")

# Manual runs are refused this many minutes before/after each automatic
# schedule trigger so a manual job cannot overlap a scheduled execution.
MANUAL_RUN_LOCKOUT_MINUTES = 5

briefing_blueprint = Blueprint("briefing", __name__, url_prefix="/api/v1/briefing")


def _authenticated_user() -> Any | None:
    """Resolve the request's user: JWT bearer first (MUI frontend), then the
    Flask-Login session (classic frontend / integration tests).

    Mirrors ``superset/project/menu/api.py``.  Returns ``None`` when the
    request is unauthenticated — callers must respond 401 instead of letting
    commands fall back to ``g.user = AnonymousUserMixin``.
    """
    user = None
    try:
        from flask_jwt_extended import get_jwt, verify_jwt_in_request

        from superset import security_manager

        verify_jwt_in_request()
        subject = get_jwt().get("sub")
        if subject:
            user = security_manager.get_user_by_id(int(subject))
    except Exception:  # noqa: BLE001  # pylint: disable=broad-except
        user = None

    if user is not None:
        return user

    from flask_login import current_user

    if getattr(current_user, "is_authenticated", False):
        return current_user
    return None


def normalize_report_type(value: Any) -> str:
    """Map an arbitrary stored/requested report type onto a supported one."""
    return value if value in REPORT_TYPES else "daily"


def _get_default_config() -> Any:
    """Load the effective default config, preferring Flask overrides."""
    from superset.project.briefing.config import DailyReportConfig

    config = current_app.config.get("DAILY_REPORT_CONFIG", DailyReportConfig())
    if config is None:
        config = DailyReportConfig()
    return config


def _default_config_payload(report_type: str | None = None) -> dict[str, Any]:
    """Return the default config as a plain dict (ad-hoc run payload)."""
    payload: dict[str, Any] = {
        "name": "ad-hoc",
        "report_type": normalize_report_type(report_type or "daily"),
    }
    default = _get_default_config()
    for name in (
        "datasource_id",
        "datasource_ids",
        "table_name",
        "schema",
        "database_name",
        "date_column",
        "project_column",
        "channel_column",
        "ad_channel_column",
        "region_column",
        "platform_column",
        "spend_column",
        "new_users_column",
        "cpa_column",
        "ltv_columns",
        "roi_columns",
        "top_projects_count",
        "days_of_history",
        "weeks_of_history",
        "alert_critical_threshold",
        "alert_warning_threshold",
        "roi_critical_line",
        "roi_warning_line",
        "default_breakeven_line",
        "static_filters",
        "project_targets",
    ):
        if hasattr(default, name):
            payload[name] = getattr(default, name)
    return payload


# --------------------------------------------------------------------------- #
# Report configurations (CRUD)
# --------------------------------------------------------------------------- #


@briefing_blueprint.route("/configs", methods=["GET"])
def list_configs() -> Any:
    """Return all stored report configurations, annotated with the latest run.

    Each configuration carries ``last_job_id`` / ``last_report_date`` /
    ``last_finished_at`` (and ``last_report_type``) from its most recently
    generated result, so the report list can surface the task that produced it.
    """
    from superset.project.briefing.store import (
        get_latest_result_meta,
        list_configs,
    )

    schedules = _briefing_schedules_by_config()
    result = []
    for cfg in list_configs():
        meta = get_latest_result_meta(cfg["id"])
        if meta:
            cfg = {**cfg, **meta}
        normalized = _normalize_config_read(cfg)
        config_key = normalized.get("id")
        schedule = schedules.get(config_key) if isinstance(config_key, int) else None
        normalized["schedule"] = _serialize_schedule(schedule) if schedule else None
        result.append(normalized)
    return jsonify({"result": result}), 200


def _normalize_config_payload(data: dict[str, Any]) -> dict[str, Any]:
    """Normalize the stored-shape fields of a config payload in place.

    ``report_type`` maps onto a supported type; ``datasource_ids`` becomes a
    deduplicated int list (capped at ``MAX_DATASETS_PER_BRIEFING``) that falls
    back to the legacy single ``datasource_id``, whose first entry is mirrored
    back onto ``datasource_id`` for display and run-time fallback.
    """
    from superset.project.briefing.service import MAX_DATASETS_PER_BRIEFING

    data["report_type"] = normalize_report_type(data.get("report_type"))
    raw = data.get("datasource_ids")
    if not isinstance(raw, (list, tuple)):
        raw = [raw] if raw else []
    ids: list[int] = []
    candidates = [*raw, data.get("datasource_id")]
    for value in candidates:
        try:
            ds_id = int(value)
        except (TypeError, ValueError):
            continue
        if ds_id and ds_id not in ids:
            ids.append(ds_id)
    data["datasource_ids"] = ids[:MAX_DATASETS_PER_BRIEFING]
    if ids:
        data["datasource_id"] = ids[0]
    if "uncapped_channels" in data:
        raw_channels = data.get("uncapped_channels")
        if not isinstance(raw_channels, (list, tuple)):
            raw_channels = [raw_channels] if raw_channels else []
        seen: list[str] = []
        for value in raw_channels:
            name = str(value or "").strip()
            if name and name not in seen:
                seen.append(name)
        data["uncapped_channels"] = seen
    return data


def _normalize_config_read(cfg: dict[str, Any]) -> dict[str, Any]:
    """Normalize a stored config for API responses (type + dataset id list)."""
    cfg["report_type"] = normalize_report_type(cfg.get("report_type"))
    ids = cfg.get("datasource_ids")
    if not isinstance(ids, list):
        legacy = cfg.get("datasource_id")
        ids = [legacy] if legacy else []
    cfg["datasource_ids"] = ids
    return cfg


@briefing_blueprint.route("/configs", methods=["POST"])
def create_config() -> Any:
    """Create a new report configuration."""
    from superset.project.briefing.store import create_config

    data = request.get_json(force=True) or {}
    if not data.get("name"):
        return jsonify({"error": "name is required"}), 400
    created = create_config(_normalize_config_payload(data))
    return jsonify({"result": created}), 201


@briefing_blueprint.route("/configs/<int:config_id>", methods=["PUT"])
def update_config(config_id: int) -> Any:
    """Update an existing report configuration."""
    from superset.project.briefing.store import update_config

    data = request.get_json(force=True) or {}
    data["id"] = config_id
    updated = update_config(config_id, _normalize_config_payload(data))
    if updated is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": updated}), 200


@briefing_blueprint.route("/configs/<int:config_id>", methods=["DELETE"])
def delete_config_route(config_id: int) -> Any:
    """Delete a stored report configuration and its briefing schedule."""
    from superset.project.briefing.store import delete_config

    user = _authenticated_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    g.user = user

    # Remove the native schedule first so no orphaned ReportSchedule keeps
    # referencing a deleted configuration.
    if (schedule := _briefing_schedules_by_config().get(config_id)) is not None:
        from superset.commands.exceptions import CommandException
        from superset.commands.report.delete import DeleteReportScheduleCommand

        try:
            DeleteReportScheduleCommand([schedule.id]).run()
        except CommandException:
            logger.exception(
                "Failed to delete briefing schedule %s for config %s",
                schedule.id,
                config_id,
            )

    if not delete_config(config_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": "ok"}), 200


@briefing_blueprint.route("/configs/<int:config_id>", methods=["GET"])
def get_config(config_id: int) -> Any:
    """Return a single stored report configuration."""
    from superset.project.briefing.store import get_config

    cfg = get_config(config_id)
    if cfg is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": _normalize_config_read(cfg)}), 200


# --------------------------------------------------------------------------- #
# Schedules (native ReportSchedule with creation_method="briefing")
# --------------------------------------------------------------------------- #


def _briefing_schedules_by_config() -> dict[int, Any]:
    """Map briefing config_id -> its ReportSchedule (first match wins)."""
    from superset import db
    from superset.reports.models import ReportCreationMethod, ReportSchedule

    rows = (
        db.session.query(ReportSchedule)
        .filter(ReportSchedule.creation_method == ReportCreationMethod.BRIEFING.value)
        .all()
    )
    by_config: dict[int, Any] = {}
    for schedule in rows:
        extra = schedule.extra or {}
        briefing = extra.get("briefing")
        if not isinstance(briefing, dict):
            continue
        config_id = briefing.get("config_id")
        if isinstance(config_id, int) and not isinstance(config_id, bool):
            by_config.setdefault(config_id, schedule)
    return by_config


def _serialize_schedule(schedule: Any) -> dict[str, Any]:
    """Serialize a briefing ReportSchedule for the frontend."""
    from superset.utils import json as _json

    recipients = []
    for recipient in schedule.recipients or []:
        try:
            config = _json.loads(recipient.recipient_config_json or "{}")
        except ValueError:
            config = {}
        recipients.append({"type": recipient.type, "recipient_config_json": config})
    try:
        humanized = schedule.crontab_humanized()
    except Exception:  # noqa: BLE001
        humanized = schedule.crontab
    return {
        "id": schedule.id,
        "name": schedule.name,
        "description": schedule.description,
        "crontab": schedule.crontab,
        "crontab_humanized": humanized,
        "timezone": schedule.timezone,
        "active": schedule.active,
        "email_subject": schedule.email_subject,
        "working_timeout": schedule.working_timeout,
        "last_state": schedule.last_state,
        # last_eval_dttm is stored as naive UTC (datetime.utcnow); tag it with
        # the UTC offset so the frontend renders it in the viewer's local time
        # instead of misreading it as a local timestamp (off by the UTC gap).
        "last_eval_dttm": schedule.last_eval_dttm.replace(
            tzinfo=timezone.utc
        ).isoformat()
        if schedule.last_eval_dttm
        else None,
        "next_run_at": _next_run_at(schedule),
        "recipients": recipients,
    }


def _next_run_at(schedule: Any) -> str | None:
    """Compute the next fire time of a schedule as a timezone-aware ISO string.

    Returns an absolute timestamp (with UTC offset) so the frontend can run a
    countdown against ``Date.now()`` regardless of the viewer's timezone.
    ``None`` when the crontab or timezone is invalid.
    """
    from croniter import croniter
    from pytz import timezone as pytz_timezone

    try:
        tz = pytz_timezone(schedule.timezone or "UTC")
        next_run = croniter(schedule.crontab, datetime.now(tz)).get_next(datetime)
        return next_run.isoformat()
    except Exception:  # noqa: BLE001
        return None


@briefing_blueprint.route("/configs/<int:config_id>/schedule", methods=["GET"])
def get_schedule(config_id: int) -> Any:
    """Return the briefing schedule attached to a config (or null)."""
    from superset.project.briefing.store import get_config

    if get_config(config_id) is None:
        return jsonify({"error": "not found"}), 404
    schedule = _briefing_schedules_by_config().get(config_id)
    return (
        jsonify({"result": _serialize_schedule(schedule) if schedule else None}),
        200,
    )


def _schedule_payload(
    config_id: int, data: dict[str, Any], config_name: str
) -> dict[str, Any]:
    """Build a ReportSchedule create/update payload for a briefing config."""
    from superset.reports.models import ReportCreationMethod, ReportScheduleType

    payload: dict[str, Any] = {
        "type": ReportScheduleType.REPORT.value,
        "creation_method": ReportCreationMethod.BRIEFING.value,
        "extra": {"briefing": {"config_id": config_id}},
        "name": data.get("name") or f"简报-{config_name}"[:150],
        "crontab": data.get("crontab"),
        "timezone": data.get("timezone") or "UTC",
        "active": data.get("active", True),
        "working_timeout": data.get("working_timeout") or 600,
    }
    for key in ("description", "email_subject"):
        if key in data:
            payload[key] = data[key]
    if "recipients" in data:
        payload["recipients"] = data["recipients"]
    return payload


@briefing_blueprint.route("/configs/<int:config_id>/schedule", methods=["PUT"])
def put_schedule(config_id: int) -> Any:
    """Create or update the briefing schedule for a config.

    Body: ``{crontab, timezone?, active?, name?, description?, email_subject?,
    working_timeout?, recipients?}``.  Recipients may be empty — the briefing
    then only persists its result without notifying anyone.
    """
    from superset.commands.exceptions import CommandException
    from superset.commands.report.create import CreateReportScheduleCommand
    from superset.commands.report.exceptions import ReportScheduleInvalidError
    from superset.commands.report.update import UpdateReportScheduleCommand
    from superset.project.briefing.store import get_config

    user = _authenticated_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    # Create/Update commands populate owners from g.user; without this the
    # AnonymousUserMixin would be cascaded into the relationship (500).
    g.user = user

    cfg = get_config(config_id)
    if cfg is None:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(force=True) or {}
    if not data.get("crontab"):
        return jsonify({"error": "crontab is required"}), 400

    payload = _schedule_payload(config_id, data, str(cfg.get("name") or config_id))
    existing = _briefing_schedules_by_config().get(config_id)
    try:
        if existing is not None:
            payload.pop("creation_method", None)
            payload.pop("extra", None)
            schedule = UpdateReportScheduleCommand(existing.id, payload).run()
        else:
            schedule = CreateReportScheduleCommand(payload).run()
    except ReportScheduleInvalidError as ex:
        return jsonify({"error": ex.normalized_messages()}), 422
    except CommandException as ex:
        return jsonify({"error": str(ex)}), 400
    return jsonify({"result": _serialize_schedule(schedule)}), 200


@briefing_blueprint.route("/configs/<int:config_id>/schedule", methods=["DELETE"])
def delete_schedule(config_id: int) -> Any:
    """Delete the briefing schedule attached to a config."""
    from superset.commands.exceptions import CommandException
    from superset.commands.report.delete import DeleteReportScheduleCommand

    user = _authenticated_user()
    if user is None:
        return jsonify({"error": "unauthorized"}), 401
    g.user = user

    schedule = _briefing_schedules_by_config().get(config_id)
    if schedule is None:
        return jsonify({"result": "ok"}), 200
    try:
        DeleteReportScheduleCommand([schedule.id]).run()
    except CommandException as ex:
        return jsonify({"error": str(ex)}), 400
    return jsonify({"result": "ok"}), 200


@briefing_blueprint.route("/configs/<int:config_id>/result", methods=["GET"])
def get_latest_result_route(config_id: int) -> Any:
    """Return the most recently persisted generated result for a config.

    Returns ``{"result": null}`` when no result has been generated yet, so the
    frontend can restore a briefing after navigating away without treating the
    absence as an error.
    """
    from superset.project.briefing.store import get_latest_result

    return jsonify({"result": get_latest_result(config_id)}), 200


# --------------------------------------------------------------------------- #
# Dataset metadata (for the report parameter editor)
# --------------------------------------------------------------------------- #


@briefing_blueprint.route("/datasets", methods=["GET"])
def list_datasets() -> Any:
    """Return candidate Superset datasets for building a report parameter map."""
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.models.core import Database

    rows = (
        db.session.query(SqlaTable, Database.database_name)
        .join(Database, SqlaTable.database_id == Database.id)
        .order_by(SqlaTable.id)
        .all()
    )
    result = []
    for ds, database_name in rows:
        schema = ds.schema or ""
        name = f"{database_name}.{ds.name}"
        result.append(
            {
                "id": ds.id,
                "table_name": ds.table_name,
                "schema": schema,
                "database_name": database_name,
                "name": name,
                "column_count": len(ds.columns),
            }
        )
    return jsonify({"result": result}), 200


@briefing_blueprint.route("/datasets/<int:ds_id>/columns", methods=["GET"])
def dataset_columns(ds_id: int) -> Any:
    """Return a dataset's column names plus a suggested report field mapping."""
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.models.core import Database
    from superset.project.briefing.service import suggest_field_map

    ds = db.session.query(SqlaTable).filter(SqlaTable.id == ds_id).one_or_none()
    if ds is None:
        return jsonify({"error": "not found"}), 404
    database = db.session.query(Database).get(ds.database_id)
    columns = sorted({c.column_name for c in ds.columns})
    schema = ds.schema or ""
    suggested = suggest_field_map(columns)
    return jsonify(
        {
            "result": {
                "id": ds.id,
                "table_name": ds.table_name,
                "schema": schema,
                "database_name": database.database_name if database else "",
                "name": f"{(database.database_name if database else '')}"
                f".{schema + '.' if schema else ''}{ds.table_name}",
                "columns": columns,
                "suggested_map": suggested,
            }
        }
    ), 200


# --------------------------------------------------------------------------- #
# Report generation jobs
# --------------------------------------------------------------------------- #


def _manual_run_lockout_reason(config_id: int) -> str | None:
    """Return a 409 reason when now falls inside the schedule trigger window.

    A manual run is blocked when the current time is within
    ``MANUAL_RUN_LOCKOUT_MINUTES`` of the config's active schedule trigger
    (either just after the previous trigger or just before the next one), so
    manual and scheduled executions cannot overlap.  Returns ``None`` when
    running manually is allowed (no schedule, disabled, invalid cron, or far
    from any trigger).
    """
    from croniter import croniter
    from pytz import timezone as pytz_timezone

    schedule = _briefing_schedules_by_config().get(config_id)
    if schedule is None or not schedule.active:
        return None
    try:
        tz = pytz_timezone(schedule.timezone or "UTC")
        now = datetime.now(tz)
        prev_trigger = croniter(schedule.crontab, now).get_prev(datetime)
        next_trigger = croniter(schedule.crontab, now).get_next(datetime)
    except Exception:  # noqa: BLE001  # pylint: disable=broad-except
        return None

    window = timedelta(minutes=MANUAL_RUN_LOCKOUT_MINUTES)
    if (now - prev_trigger) <= window or (next_trigger - now) <= window:
        return (
            f"定时任务自动执行前后 {MANUAL_RUN_LOCKOUT_MINUTES} 分钟内"
            "禁止手动运行，请错开时间再试"
        )
    return None


def _start_from_payload(
    config_id: int, payload: dict[str, Any], override_date: str | None = None
) -> Any:
    """Start a background report job for a config payload."""
    from superset.project.briefing.jobs import start_job

    if (lockout := _manual_run_lockout_reason(config_id)) is not None:
        return jsonify({"error": lockout}), 409

    payload = {
        **payload,
        "report_type": normalize_report_type(payload.get("report_type")),
    }
    job, already_running = start_job(config_id, payload, override_date)
    return jsonify(
        {
            "result": {
                "job_id": job.id,
                "status": job.status,
                "already_running": already_running,
            }
        }
    ), 200


@briefing_blueprint.route("/jobs", methods=["POST"])
def create_job() -> Any:
    """Start a report job.  Body: ``{"config_id": int, "override_date": str?}``."""
    from superset.project.briefing.store import get_config

    data = request.get_json(force=True) or {}
    config_id = int(data.get("config_id") or 0)
    if not config_id:
        return jsonify({"error": "config_id is required"}), 400
    cfg = get_config(config_id)
    if cfg is None:
        return jsonify({"error": "not found"}), 404
    return _start_from_payload(config_id, cfg, data.get("override_date"))


@briefing_blueprint.route("/configs/<int:config_id>/run", methods=["GET"])
def run_config(config_id: int) -> Any:
    """Start (or reuse) a background job for a stored report configuration."""
    from superset.project.briefing.store import get_config

    cfg = get_config(config_id)
    if cfg is None:
        return jsonify({"error": "not found"}), 404
    return _start_from_payload(config_id, cfg, _parse_ctx().get("override_date"))


@briefing_blueprint.route("/run", methods=["GET"])
def run_report() -> Any:
    """Start a background job with the default configuration (ad-hoc).

    Accepts ``?q=(report_type:"weekly")`` (or ``?report_type=weekly``) to run
    the ad-hoc briefing as a weekly report; defaults to daily.
    """
    ctx = _parse_ctx()
    return _start_from_payload(
        0,
        _default_config_payload(ctx.get("report_type")),
        ctx.get("override_date"),
    )


@briefing_blueprint.route("/jobs", methods=["GET"])
def list_jobs_endpoint() -> Any:
    """Return recent report jobs (without full results)."""
    from superset.project.briefing.jobs import list_jobs

    return jsonify({"result": list_jobs()}), 200


@briefing_blueprint.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id: str) -> Any:
    """Return a job's status, progress log and (when done) its result."""
    from superset.project.briefing.jobs import get_job

    job = get_job(job_id)
    if job is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": job.to_dict()}), 200


@briefing_blueprint.route("/jobs/<job_id>/cancel", methods=["POST"])
def cancel_job_route(job_id: str) -> Any:
    """Request a stop for a running report job."""
    from superset.project.briefing.jobs import cancel_job

    if not cancel_job(job_id):
        return jsonify({"error": "not found or not running"}), 404
    return jsonify({"result": "ok"}), 200


# --------------------------------------------------------------------------- #
# Defaults
# --------------------------------------------------------------------------- #


@briefing_blueprint.route("/config", methods=["GET"])
def get_default_config() -> Any:
    """Return the default report configuration (labels & thresholds)."""
    from superset.project.briefing.service import get_config_payload

    return jsonify({"result": get_config_payload(_get_default_config())}), 200


def _parse_ctx() -> dict[str, Any]:
    """Parse per-request options from query string (rison ``q`` or plain args)."""
    ctx: dict[str, Any] = {}
    if q_str := request.args.get("q"):
        try:
            import rison

            q = rison.loads(q_str)
        except Exception:  # noqa: S110
            q = {}
        if isinstance(q, dict):
            ctx.update(q)
    for key in (
        "override_date",
        "report_type",
        "top_projects_count",
        "days_of_history",
        "datasource_id",
    ):
        if (val := request.args.get(key)) is not None:
            ctx[key] = val
    return ctx
