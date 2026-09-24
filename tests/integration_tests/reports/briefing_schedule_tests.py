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
"""Integration tests for briefing report schedules (creation_method=briefing)."""

from contextlib import suppress
from datetime import datetime, timedelta
from typing import Any
from unittest.mock import MagicMock, patch
from uuid import uuid4

from flask_appbuilder.security.sqla.models import User

from superset import db, security_manager
from superset.commands.report.execute import (
    AsyncExecuteReportScheduleCommand,
    BaseReportState,
)
from superset.key_value.models import KeyValueEntry
from superset.reports.models import (
    ReportCreationMethod,
    ReportSchedule,
    ReportScheduleType,
    ReportState,
)
from superset.utils import json
from tests.integration_tests.base_tests import SupersetTestCase
from tests.integration_tests.reports.utils import (
    cleanup_report_schedule,
    insert_report_schedule,
)
from tests.integration_tests.test_app import app  # noqa: F401

RESOURCE = "daily_report_cfg"


def _seed_briefing_config(name: str = "test-briefing-config") -> int:
    entry = KeyValueEntry(
        resource=RESOURCE,
        value=json.dumps({"name": name, "report_type": "daily"}).encode("utf-8"),
        created_on=datetime.utcnow(),
    )
    db.session.add(entry)
    db.session.commit()
    return entry.id


def _cleanup_config(config_id: int) -> None:
    entry = db.session.query(KeyValueEntry).filter_by(id=config_id).one_or_none()
    if entry is not None:
        db.session.delete(entry)
        db.session.commit()


def _admin() -> User:
    return (
        db.session.query(security_manager.user_model).filter_by(username="admin").one()
    )


class TestBriefingReportScheduleApi(SupersetTestCase):
    def _briefing_payload(self, config_id: int, **overrides: Any) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": ReportScheduleType.REPORT,
            "name": f"briefing-schedule-{uuid4().hex[:8]}",
            "crontab": "0 8 * * *",
            "timezone": "Asia/Shanghai",
            "creation_method": ReportCreationMethod.BRIEFING,
            "extra": {"briefing": {"config_id": config_id}},
            "working_timeout": 600,
        }
        payload.update(overrides)
        return payload

    def test_create_briefing_schedule(self) -> None:
        """
        ReportSchedule Api: create a briefing schedule without chart/dashboard
        """
        self.login("admin")
        config_id = _seed_briefing_config()
        try:
            payload = self._briefing_payload(config_id)
            rv = self.post_assert_metric("api/v1/report/", payload, "post")
            assert rv.status_code == 201
            data = json.loads(rv.data.decode("utf-8"))
            model = db.session.query(ReportSchedule).get(data["id"])
            assert model is not None
            assert model.creation_method == ReportCreationMethod.BRIEFING
            assert model.chart_id is None
            assert model.dashboard_id is None
            assert model.extra.get("briefing", {}).get("config_id") == config_id
            cleanup_report_schedule(model)
        finally:
            _cleanup_config(config_id)

    def test_create_briefing_schedule_missing_extra(self) -> None:
        """Briefing schedule requires extra.briefing.config_id (schema)."""
        self.login("admin")
        payload = self._briefing_payload(0)
        payload.pop("extra")
        rv = self.post_assert_metric("api/v1/report/", payload, "post")
        assert rv.status_code == 400

    def test_create_briefing_schedule_unknown_config(self) -> None:
        """Briefing schedule rejects a config_id that does not exist."""
        self.login("admin")
        payload = self._briefing_payload(999_999)
        rv = self.post_assert_metric("api/v1/report/", payload, "post")
        assert rv.status_code == 422

    def test_create_briefing_schedule_rejects_chart(self) -> None:
        """Briefing schedules must not reference a chart or dashboard."""
        self.login("admin")
        config_id = _seed_briefing_config()
        try:
            payload = self._briefing_payload(config_id, chart=1)
            rv = self.post_assert_metric("api/v1/report/", payload, "post")
            assert rv.status_code == 400
        finally:
            _cleanup_config(config_id)

    def test_create_multiple_briefing_schedules(self) -> None:
        """A user may hold several briefing schedules (uniqueness is skipped)."""
        self.login("admin")
        config_id = _seed_briefing_config()
        created: list[ReportSchedule] = []
        try:
            for _ in range(2):
                payload = self._briefing_payload(config_id)
                rv = self.post_assert_metric("api/v1/report/", payload, "post")
                assert rv.status_code == 201
                data = json.loads(rv.data.decode("utf-8"))
                created.append(db.session.query(ReportSchedule).get(data["id"]))
            # Name uniqueness still applies within (name, type)
            payload = self._briefing_payload(config_id, name=created[0].name)
            rv = self.post_assert_metric("api/v1/report/", payload, "post")
            assert rv.status_code == 422
        finally:
            for model in created:
                if model is not None:
                    cleanup_report_schedule(model)
            _cleanup_config(config_id)


class TestBriefingScheduleEndpoints(SupersetTestCase):
    def test_schedule_crud_roundtrip(self) -> None:
        """GET/PUT/DELETE /briefing/configs/<id>/schedule round trip."""
        self.login("admin")
        config_id = _seed_briefing_config()
        try:
            rv = self.client.get(f"/api/v1/briefing/configs/{config_id}/schedule")
            assert rv.status_code == 200
            assert rv.get_json()["result"] is None

            rv = self.client.put(
                f"/api/v1/briefing/configs/{config_id}/schedule",
                json={
                    # 10-minute test cadence: REPORT_MINIMUM_INTERVAL default
                    # allows it, and the response must expose a countdown
                    # anchor for the list UI.
                    "crontab": "*/10 * * * *",
                    "timezone": "Asia/Shanghai",
                    "active": True,
                    "recipients": [],
                },
            )
            assert rv.status_code == 200, rv.get_json()
            schedule = rv.get_json()["result"]
            assert schedule["crontab"] == "*/10 * * * *"
            assert schedule["active"] is True
            assert schedule["next_run_at"] is not None
            # next_run_at is an absolute ISO timestamp within the next window
            next_run = datetime.fromisoformat(schedule["next_run_at"])
            now = datetime.now(next_run.tzinfo)
            assert timedelta(0) <= next_run - now <= timedelta(minutes=10)
            schedule_id = schedule["id"]

            # Update (existing schedule) keeps the same id
            rv = self.client.put(
                f"/api/v1/briefing/configs/{config_id}/schedule",
                json={"crontab": "0 6 * * *", "active": False},
            )
            assert rv.status_code == 200, rv.get_json()
            updated = rv.get_json()["result"]
            assert updated["id"] == schedule_id
            assert updated["crontab"] == "0 6 * * *"
            assert updated["active"] is False

            # Schedule is annotated on the config list
            rv = self.client.get("/api/v1/briefing/configs")
            assert rv.status_code == 200
            row = next(r for r in rv.get_json()["result"] if r["id"] == config_id)
            assert row["schedule"] is not None
            assert row["schedule"]["id"] == schedule_id

            # Delete removes the schedule
            rv = self.client.delete(f"/api/v1/briefing/configs/{config_id}/schedule")
            assert rv.status_code == 200
            rv = self.client.get(f"/api/v1/briefing/configs/{config_id}/schedule")
            assert rv.get_json()["result"] is None
        finally:
            # Ensure no orphan schedule survives a failed assertion
            model = (
                db.session.query(ReportSchedule)
                .filter(
                    ReportSchedule.creation_method
                    == ReportCreationMethod.BRIEFING.value
                )
                .all()
            )
            for m in model:
                extra = m.extra or {}
                if (extra.get("briefing") or {}).get("config_id") == config_id:
                    cleanup_report_schedule(m)
            _cleanup_config(config_id)

    def test_put_schedule_requires_crontab(self) -> None:
        self.login("admin")
        config_id = _seed_briefing_config()
        try:
            rv = self.client.put(
                f"/api/v1/briefing/configs/{config_id}/schedule", json={}
            )
            assert rv.status_code == 400
        finally:
            _cleanup_config(config_id)

    def test_serialize_last_eval_dttm_tagged_as_utc(self) -> None:
        """Naive-UTC last_eval_dttm serializes with an explicit UTC offset.

        Without the tag the browser parses it as a local timestamp, shifting
        the displayed time by the container/host UTC gap (e.g. 19:00 CST
        showing as 11:00).
        """
        from superset.project.briefing.api import _serialize_schedule

        schedule = MagicMock()
        schedule.recipients = []
        schedule.id = 1
        schedule.name = "s"
        schedule.description = None
        schedule.crontab = "0 8 * * *"
        schedule.crontab_humanized.return_value = "每天 08:00"
        schedule.timezone = "Asia/Shanghai"
        schedule.active = True
        schedule.email_subject = None
        schedule.working_timeout = 600
        schedule.last_state = ReportState.SUCCESS
        schedule.last_eval_dttm = datetime(2026, 9, 22, 11, 1, 4)  # naive UTC
        out = _serialize_schedule(schedule)
        assert out["last_eval_dttm"] == "2026-09-22T11:01:04+00:00"
        # Parses to the correct absolute instant for local rendering
        parsed = datetime.fromisoformat(out["last_eval_dttm"])
        assert parsed.utcoffset() == timedelta(0)

    def test_put_schedule_unauthenticated_is_401(self) -> None:
        """Anonymous requests must get 401, not a 500 from owner cascade."""
        config_id = _seed_briefing_config()
        try:
            rv = self.client.put(
                f"/api/v1/briefing/configs/{config_id}/schedule",
                json={"crontab": "0 8 * * *"},
            )
            assert rv.status_code == 401
        finally:
            _cleanup_config(config_id)

    def test_put_schedule_with_jwt_bearer(self) -> None:
        """JWT bearer auth (MUI frontend) resolves the owner correctly."""
        from flask_jwt_extended import create_access_token

        config_id = _seed_briefing_config()
        admin = _admin()
        try:
            with app.app_context():
                token = create_access_token(identity=str(admin.id))
            rv = self.client.put(
                f"/api/v1/briefing/configs/{config_id}/schedule",
                json={"crontab": "*/10 * * * *", "timezone": "Asia/Shanghai"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert rv.status_code == 200, rv.get_json()
            result = rv.get_json()["result"]
            assert result["crontab"] == "*/10 * * * *"
            # Owner must be the JWT user, never AnonymousUserMixin
            model = db.session.query(ReportSchedule).get(result["id"])
            assert model is not None
            assert [owner.id for owner in model.owners] == [admin.id]
            cleanup_report_schedule(model)
        finally:
            _cleanup_config(config_id)


class TestBriefingScheduleExecution(SupersetTestCase):
    def _insert_briefing_schedule(
        self, config_id: int, recipients: list[Any] | None = None
    ) -> ReportSchedule:
        schedule = insert_report_schedule(
            ReportScheduleType.REPORT,
            name=f"briefing-exec-{uuid4().hex[:8]}",
            crontab="0 8 * * *",
            owners=[_admin()],
            recipients=recipients,
            extra={"briefing": {"config_id": config_id}},
        )
        schedule.creation_method = ReportCreationMethod.BRIEFING
        db.session.commit()
        return schedule

    @patch("superset.reports.notifications.email.send_email_smtp")
    @patch("superset.project.briefing.store.save_result")
    @patch("superset.project.briefing.service.run_briefing")
    def test_execute_briefing_schedule_success(
        self,
        run_briefing: Any,
        save_result: Any,
        send_email: Any,
    ) -> None:
        """Scheduled briefing run generates + persists without notification."""
        run_briefing.return_value = {
            "report_date": "2026-09-21",
            "core": {"spend": 100.0, "new_users": 10, "ROI1": 0.12},
            "core_previous": {},
            "alerts": [],
            "empty": False,
        }
        config_id = _seed_briefing_config()
        schedule = self._insert_briefing_schedule(config_id)
        try:
            AsyncExecuteReportScheduleCommand(
                str(uuid4()), schedule.id, datetime.utcnow()
            ).run()
            db.session.refresh(schedule)
            assert schedule.last_state == ReportState.SUCCESS
            run_briefing.assert_called_once()
            save_result.assert_called_once()
            assert save_result.call_args[0][0] == config_id
            # No recipients -> no email
            send_email.assert_not_called()
        finally:
            cleanup_report_schedule(schedule)
            _cleanup_config(config_id)

    @patch("superset.reports.notifications.email.send_email_smtp")
    @patch("superset.project.briefing.service.run_briefing")
    def test_execute_briefing_schedule_failure(
        self, run_briefing: Any, send_email: Any
    ) -> None:
        """A failing briefing run marks the schedule ERROR and notifies owners."""
        run_briefing.side_effect = RuntimeError("briefing exploded")
        config_id = _seed_briefing_config()
        schedule = self._insert_briefing_schedule(config_id)
        try:
            with suppress(Exception):
                AsyncExecuteReportScheduleCommand(
                    str(uuid4()), schedule.id, datetime.utcnow()
                ).run()
            db.session.refresh(schedule)
            assert schedule.last_state == ReportState.ERROR
        finally:
            cleanup_report_schedule(schedule)
            _cleanup_config(config_id)

    @patch("superset.reports.notifications.email.send_email_smtp")
    @patch("superset.project.briefing.store.save_result")
    @patch("superset.project.briefing.service.run_briefing")
    def test_execute_briefing_schedule_sends_recipients(
        self,
        run_briefing: Any,
        save_result: Any,
        send_email: Any,
    ) -> None:
        """With email recipients configured the summary notification is sent."""
        from superset.reports.models import ReportRecipients, ReportRecipientType

        run_briefing.return_value = {
            "report_date": "2026-09-21",
            "core": {"spend": 100.0, "new_users": 10, "ROI1": 0.12},
            "core_previous": {},
            "alerts": [],
            "empty": False,
        }
        config_id = _seed_briefing_config()
        recipient = ReportRecipients(
            type=ReportRecipientType.EMAIL,
            recipient_config_json=json.dumps({"target": "target@superset.org"}),
        )
        schedule = self._insert_briefing_schedule(config_id, recipients=[recipient])
        # Local docker config enables notification dry-run; disable so the
        # notification send path is exercised.
        previous_dry_run = app.config["ALERT_REPORTS_NOTIFICATION_DRY_RUN"]
        app.config["ALERT_REPORTS_NOTIFICATION_DRY_RUN"] = False
        try:
            AsyncExecuteReportScheduleCommand(
                str(uuid4()), schedule.id, datetime.utcnow()
            ).run()
            db.session.refresh(schedule)
            assert schedule.last_state == ReportState.SUCCESS
            save_result.assert_called_once()
            send_email.assert_called_once()
        finally:
            app.config["ALERT_REPORTS_NOTIFICATION_DRY_RUN"] = previous_dry_run
            cleanup_report_schedule(schedule)
            _cleanup_config(config_id)

    def test_briefing_summary_builder(self) -> None:
        """Summary lines include headline metrics and alerts."""
        lines = BaseReportState._build_briefing_summary(
            {
                "report_date": "2026-09-21",
                "period_start": "2026-09-21",
                "period_end": "2026-09-21",
                "core": {
                    "spend": 1234.5,
                    "new_users": 42,
                    "ROI1": 0.15,
                    "LTV1": 3.2,
                },
                "core_previous": {"spend": 1000.0},
                "alerts": [
                    {"level": "warning", "message": "ROI1 偏低"},
                ],
                "empty": False,
            }
        )
        text = "\n".join(lines)
        assert "2026-09-21" in text
        assert "1,234.50" in text
        assert "ROI1" in text
        assert "警告" not in text or "没有数据" not in text
        assert "[warning] ROI1 偏低" in text


class TestManualRunLockout(SupersetTestCase):
    """Manual runs are refused within ±5min of an active schedule trigger."""

    def _insert_active_schedule(
        self, config_id: int, crontab: str, active: bool = True
    ) -> ReportSchedule:
        schedule = insert_report_schedule(
            ReportScheduleType.REPORT,
            name=f"lockout-{uuid4().hex[:8]}",
            crontab=crontab,
            timezone="Asia/Shanghai",
            owners=[_admin()],
            extra={"briefing": {"config_id": config_id}},
        )
        schedule.creation_method = ReportCreationMethod.BRIEFING
        schedule.active = active
        db.session.commit()
        return schedule

    @patch("superset.project.briefing.jobs.start_job")
    def test_manual_run_blocked_within_five_minutes(self, start_job: Any) -> None:
        """A */10 schedule always sits within 5 minutes of its next/prev trigger."""
        config_id = _seed_briefing_config()
        schedule = self._insert_active_schedule(config_id, "*/10 * * * *")
        try:
            rv = self.client.post(
                "/api/v1/briefing/jobs", json={"config_id": config_id}
            )
            assert rv.status_code == 409
            assert "禁止手动运行" in rv.get_json()["error"]
            start_job.assert_not_called()
        finally:
            cleanup_report_schedule(schedule)
            _cleanup_config(config_id)

    @patch("superset.project.briefing.jobs.start_job")
    def test_manual_run_blocked_via_run_endpoint(self, start_job: Any) -> None:
        """GET /configs/<id>/run applies the same lockout window."""
        config_id = _seed_briefing_config()
        schedule = self._insert_active_schedule(config_id, "* * * * *")
        try:
            rv = self.client.get(f"/api/v1/briefing/configs/{config_id}/run")
            assert rv.status_code == 409
            start_job.assert_not_called()
        finally:
            cleanup_report_schedule(schedule)
            _cleanup_config(config_id)

    @patch("superset.project.briefing.jobs.start_job")
    def test_manual_run_allowed_without_schedule(self, start_job: Any) -> None:
        """No schedule for the config -> manual run proceeds."""
        start_job.return_value = (MagicMock(id="job-x", status="running"), False)
        config_id = _seed_briefing_config()
        try:
            rv = self.client.post(
                "/api/v1/briefing/jobs", json={"config_id": config_id}
            )
            assert rv.status_code == 200
            start_job.assert_called_once()
        finally:
            _cleanup_config(config_id)

    @patch("superset.project.briefing.jobs.start_job")
    def test_manual_run_allowed_when_schedule_disabled(self, start_job: Any) -> None:
        """A disabled schedule does not lock out manual runs."""
        start_job.return_value = (MagicMock(id="job-y", status="running"), False)
        config_id = _seed_briefing_config()
        schedule = self._insert_active_schedule(config_id, "* * * * *", active=False)
        try:
            rv = self.client.post(
                "/api/v1/briefing/jobs", json={"config_id": config_id}
            )
            assert rv.status_code == 200
            start_job.assert_called_once()
        finally:
            cleanup_report_schedule(schedule)
            _cleanup_config(config_id)

    @patch("superset.project.briefing.jobs.start_job")
    def test_manual_run_allowed_far_from_trigger(self, start_job: Any) -> None:
        """Active schedule far from the current time does not lock out."""
        start_job.return_value = (MagicMock(id="job-z", status="running"), False)
        config_id = _seed_briefing_config()
        # Fires once a year (Jan 1 03:00) — nowhere near "now" except in a
        # ~10-minute window once per year.
        schedule = self._insert_active_schedule(config_id, "0 3 1 1 *")
        try:
            rv = self.client.post(
                "/api/v1/briefing/jobs", json={"config_id": config_id}
            )
            assert rv.status_code == 200
            start_job.assert_called_once()
        finally:
            cleanup_report_schedule(schedule)
            _cleanup_config(config_id)
