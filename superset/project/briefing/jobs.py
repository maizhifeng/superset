"""
Background job manager for briefing generation.

Briefing generation can take tens of seconds (it fetches several days of
history from a Superset dataset), so it runs in a background thread instead of
blocking the HTTP request.  The manager keeps an in-memory registry of jobs so
the frontend can poll progress (live log), stop a running job, and re-run.  It
also guards against launching a duplicate concurrent run for the same report
configuration.
"""

from __future__ import annotations

import logging
import threading
import uuid
from datetime import datetime, timezone
from typing import Any

from flask import current_app

from superset.project.briefing.config import config_from_dict, DailyReportContext
from superset.project.briefing.service import CancelledError, run_briefing

logger = logging.getLogger(__name__)

# Keep at most this many finished jobs in the in-memory registry.
_MAX_FINISHED_JOBS = 50


class ReportJob:
    """A single background briefing generation."""

    def __init__(self, config_id: int):
        self.id = uuid.uuid4().hex[:12]
        self.config_id = config_id
        self.status: str = "running"  # running | done | error | cancelled
        self.logs: list[dict[str, str]] = []
        self.result: dict[str, Any] | None = None
        self.error: str | None = None
        self.created_at: str = datetime.now(timezone.utc).isoformat()
        self.finished_at: str | None = None
        self._cancel = False
        self._lock = threading.Lock()

    def cancel_requested(self) -> bool:
        with self._lock:
            return self._cancel

    def request_cancel(self) -> bool:
        """Ask the worker to stop.  Returns True if it was still running."""
        with self._lock:
            if self.status == "running":
                self._cancel = True
                return True
            return False

    def append_log(self, message: str, level: str = "info") -> None:
        with self._lock:
            self.logs.append(
                {
                    "ts": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    "level": level,
                    "message": message,
                }
            )

    def finish(self, result: dict[str, Any]) -> None:
        with self._lock:
            self.status = "done"
            self.result = result
            self.finished_at = datetime.now(timezone.utc).isoformat()

    def fail(self, error: str) -> None:
        with self._lock:
            self.status = "error"
            self.error = error
            self.finished_at = datetime.now(timezone.utc).isoformat()

    def cancel_finish(self) -> None:
        with self._lock:
            self.status = "cancelled"
            self.finished_at = datetime.now(timezone.utc).isoformat()

    def to_dict(self, include_result: bool = True) -> dict[str, Any]:
        with self._lock:
            out: dict[str, Any] = {
                "id": self.id,
                "config_id": self.config_id,
                "status": self.status,
                "logs": list(self.logs),
                "created_at": self.created_at,
                "finished_at": self.finished_at,
                "cancel_requested": self._cancel,
            }
            if include_result and self.result is not None:
                out["result"] = self.result
            if self.error:
                out["error"] = self.error
            return out


_registry: dict[str, ReportJob] = {}
_registry_lock = threading.Lock()


def _start_worker(
    job: ReportJob,
    app: Any,
    config_payload: dict[str, Any],
    override_date: str | None,
) -> None:
    """Worker thread body: run the report inside an app context."""
    with app.app_context():
        job.append_log(f"任务已启动（#{job.id}）")
        try:
            config = config_from_dict(config_payload)
            ctx = DailyReportContext(override_date=override_date)
            result = run_briefing(
                config,
                ctx,
                progress=lambda message, level="info": job.append_log(message, level),
                cancel=lambda: job.cancel_requested(),
            )
            if job.cancel_requested():
                job.cancel_finish()
                job.append_log("已停止", "warning")
            else:
                job.finish(result)
                # Persist the generated result so it survives navigation and
                # server restart; failures here must not break the job.  Include
                # the task (job) id so the report list can reference the run.
                try:
                    from superset.project.briefing.store import save_result

                    save_result(
                        job.config_id,
                        {
                            "job_id": job.id,
                            "finished_at": job.finished_at,
                            **result,
                        },
                    )
                except Exception:  # noqa: BLE001
                    logger.exception("Failed to persist briefing result")
        except CancelledError:
            job.cancel_finish()
            job.append_log("已停止", "warning")
        except Exception as exc:  # noqa: BLE001
            logger.exception("Briefing job %s failed", job.id)
            job.fail(str(exc))
            job.append_log(f"生成失败：{exc}", "error")


def start_job(
    config_id: int,
    config_payload: dict[str, Any],
    override_date: str | None = None,
) -> tuple[ReportJob, bool]:
    """Start a report job for a stored configuration.

    Returns ``(job, already_running)``.  If a job for the same ``config_id`` is
    already running, that running job is returned and ``already_running`` is
    True (no duplicate execution is launched).
    """
    with _registry_lock:
        # Deduplicate: reuse an in-flight job for the same report config.
        for existing in _registry.values():
            if (
                existing.config_id == config_id
                and existing.status == "running"
                and not existing.cancel_requested()
            ):
                return existing, True

        job = ReportJob(config_id)
        _registry[job.id] = job
        _prune_finished()

    # Resolve the real Flask app once; the worker pushes its own app context.
    app = current_app._get_current_object()
    thread = threading.Thread(
        target=_start_worker,
        args=(job, app, config_payload, override_date),
        name=f"briefing-{job.id}",
        daemon=True,
    )
    thread.start()
    return job, False


def get_job(job_id: str) -> ReportJob | None:
    with _registry_lock:
        return _registry.get(job_id)


def cancel_job(job_id: str) -> bool:
    """Request a stop for a running job.  Returns True if accepted."""
    job = get_job(job_id)
    if job is None:
        return False
    job.append_log("收到停止请求，正在终止…", "warning")
    return job.request_cancel()


def list_jobs(limit: int = 20) -> list[dict[str, Any]]:
    with _registry_lock:
        items = sorted(_registry.values(), key=lambda j: j.created_at, reverse=True)[
            :limit
        ]
        return [j.to_dict(include_result=False) for j in items]


def _prune_finished() -> None:
    """Drop oldest finished jobs to bound the registry size."""
    finished = [j for j in _registry.values() if j.status != "running"]
    if len(finished) <= _MAX_FINISHED_JOBS:
        return
    excess = len(finished) - _MAX_FINISHED_JOBS
    for job in sorted(finished, key=lambda j: j.created_at)[:excess]:
        _registry.pop(job.id, None)
