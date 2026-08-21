"""
Daily report REST API.

Exposes the daily report workflow and its persisted report configurations to
the ``superset-frontend-new`` MUI frontend.  The data source is Superset's own
datasets.  Report generation runs as a background job (``jobs``) so the
frontend can stream a live progress log, stop a running job, and re-run.
"""

from __future__ import annotations

import logging
from typing import Any

from flask import Blueprint, current_app, jsonify, request

logger = logging.getLogger(__name__)

daily_report_blueprint = Blueprint(
    "daily_report", __name__, url_prefix="/api/v1/daily-report"
)


def _get_default_config() -> Any:
    """Load the effective default config, preferring Flask overrides."""
    from superset.project.daily_report.config import DailyReportConfig

    config = current_app.config.get("DAILY_REPORT_CONFIG", DailyReportConfig())
    if config is None:
        config = DailyReportConfig()
    return config


def _default_config_payload() -> dict[str, Any]:
    """Return the default config as a plain dict (ad-hoc run payload)."""
    payload: dict[str, Any] = {"name": "ad-hoc"}
    default = _get_default_config()
    for name in (
        "datasource_id",
        "table_name",
        "schema",
        "database_name",
        "date_column",
        "project_column",
        "channel_column",
        "ad_channel_column",
        "region_column",
        "spend_column",
        "new_users_column",
        "cpa_column",
        "ltv_columns",
        "roi_columns",
        "top_projects_count",
        "days_of_history",
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


@daily_report_blueprint.route("/configs", methods=["GET"])
def list_configs() -> Any:
    """Return all stored report configurations, annotated with the latest run.

    Each configuration carries ``last_job_id`` / ``last_report_date`` /
    ``last_finished_at`` from its most recently generated result, so the report
    list can surface the task that produced it.
    """
    from superset.project.daily_report.store import (
        get_latest_result_meta,
        list_configs,
    )

    result = []
    for cfg in list_configs():
        meta = get_latest_result_meta(cfg["id"])
        if meta:
            cfg = {**cfg, **meta}
        result.append(cfg)
    return jsonify({"result": result}), 200


@daily_report_blueprint.route("/configs", methods=["POST"])
def create_config() -> Any:
    """Create a new report configuration."""
    from superset.project.daily_report.store import create_config

    data = request.get_json(force=True) or {}
    if not data.get("name"):
        return jsonify({"error": "name is required"}), 400
    created = create_config(data)
    return jsonify({"result": created}), 201


@daily_report_blueprint.route("/configs/<int:config_id>", methods=["PUT"])
def update_config(config_id: int) -> Any:
    """Update an existing report configuration."""
    from superset.project.daily_report.store import update_config

    data = request.get_json(force=True) or {}
    data["id"] = config_id
    updated = update_config(config_id, data)
    if updated is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": updated}), 200


@daily_report_blueprint.route("/configs/<int:config_id>", methods=["DELETE"])
def delete_config_route(config_id: int) -> Any:
    """Delete a report configuration."""
    from superset.project.daily_report.store import delete_config

    if not delete_config(config_id):
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": "ok"}), 200


@daily_report_blueprint.route("/configs/<int:config_id>", methods=["GET"])
def get_config(config_id: int) -> Any:
    """Return a single stored report configuration."""
    from superset.project.daily_report.store import get_config

    cfg = get_config(config_id)
    if cfg is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": cfg}), 200


@daily_report_blueprint.route("/configs/<int:config_id>/result", methods=["GET"])
def get_latest_result_route(config_id: int) -> Any:
    """Return the most recently persisted generated result for a config.

    Returns ``{"result": null}`` when no result has been generated yet, so the
    frontend can restore a briefing after navigating away without treating the
    absence as an error.
    """
    from superset.project.daily_report.store import get_latest_result

    return jsonify({"result": get_latest_result(config_id)}), 200


# --------------------------------------------------------------------------- #
# Dataset metadata (for the report parameter editor)
# --------------------------------------------------------------------------- #


@daily_report_blueprint.route("/datasets", methods=["GET"])
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


@daily_report_blueprint.route("/datasets/<int:ds_id>/columns", methods=["GET"])
def dataset_columns(ds_id: int) -> Any:
    """Return a dataset's column names plus a suggested report field mapping."""
    from superset import db
    from superset.connectors.sqla.models import SqlaTable
    from superset.models.core import Database
    from superset.project.daily_report.service import suggest_field_map

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


def _start_from_payload(
    config_id: int, payload: dict[str, Any], override_date: str | None = None
) -> Any:
    """Start a background report job for a config payload."""
    from superset.project.daily_report.jobs import start_job

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


@daily_report_blueprint.route("/jobs", methods=["POST"])
def create_job() -> Any:
    """Start a report job.  Body: ``{"config_id": int, "override_date": str?}``."""
    from superset.project.daily_report.store import get_config

    data = request.get_json(force=True) or {}
    config_id = int(data.get("config_id") or 0)
    if not config_id:
        return jsonify({"error": "config_id is required"}), 400
    cfg = get_config(config_id)
    if cfg is None:
        return jsonify({"error": "not found"}), 404
    return _start_from_payload(config_id, cfg, data.get("override_date"))


@daily_report_blueprint.route("/configs/<int:config_id>/run", methods=["GET"])
def run_config(config_id: int) -> Any:
    """Start (or reuse) a background job for a stored report configuration."""
    from superset.project.daily_report.store import get_config

    cfg = get_config(config_id)
    if cfg is None:
        return jsonify({"error": "not found"}), 404
    return _start_from_payload(config_id, cfg, _parse_ctx().get("override_date"))


@daily_report_blueprint.route("/run", methods=["GET"])
def run_report() -> Any:
    """Start a background job with the default configuration (ad-hoc)."""
    return _start_from_payload(
        0, _default_config_payload(), _parse_ctx().get("override_date")
    )


@daily_report_blueprint.route("/jobs", methods=["GET"])
def list_jobs_endpoint() -> Any:
    """Return recent report jobs (without full results)."""
    from superset.project.daily_report.jobs import list_jobs

    return jsonify({"result": list_jobs()}), 200


@daily_report_blueprint.route("/jobs/<job_id>", methods=["GET"])
def get_job(job_id: str) -> Any:
    """Return a job's status, progress log and (when done) its result."""
    from superset.project.daily_report.jobs import get_job

    job = get_job(job_id)
    if job is None:
        return jsonify({"error": "not found"}), 404
    return jsonify({"result": job.to_dict()}), 200


@daily_report_blueprint.route("/jobs/<job_id>/cancel", methods=["POST"])
def cancel_job_route(job_id: str) -> Any:
    """Request a stop for a running report job."""
    from superset.project.daily_report.jobs import cancel_job

    if not cancel_job(job_id):
        return jsonify({"error": "not found or not running"}), 404
    return jsonify({"result": "ok"}), 200


# --------------------------------------------------------------------------- #
# Defaults
# --------------------------------------------------------------------------- #


@daily_report_blueprint.route("/config", methods=["GET"])
def get_default_config() -> Any:
    """Return the default report configuration (labels & thresholds)."""
    from superset.project.daily_report.service import get_config_payload

    return jsonify({"result": get_config_payload(_get_default_config())}), 200


def _parse_ctx() -> dict[str, Any]:
    """Parse per-request options from query string (rison ``q`` or plain args)."""
    ctx: dict[str, Any] = {}
    q_str = request.args.get("q")
    if q_str:
        try:
            import rison

            q = rison.loads(q_str)
        except Exception:  # noqa: S110
            q = {}
        if isinstance(q, dict):
            ctx.update(q)
    for key in (
        "override_date",
        "top_projects_count",
        "days_of_history",
        "datasource_id",
    ):
        if (val := request.args.get(key)) is not None:
            ctx[key] = val
    return ctx
