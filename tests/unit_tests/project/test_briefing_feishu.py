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
"""Briefing Feishu push orchestration tests.

Covers settings normalization/validation, the deployment status surfaced to the
UI, the dry-run switch, per-target delivery reporting (including the
``last_push`` record) and the graceful degradation of the group picker.  The
channel itself is stubbed: its wire contract is pinned by
``tests/unit_tests/reports/notifications/feishu_tests.py``.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import pytest

from superset.project.briefing import feishu as briefing_feishu
from superset.reports.notifications.exceptions import (
    NotificationParamException,
    NotificationUnprocessableException,
)

# Captured before the autouse stub replaces it, for the tests that exercise the
# real implementation.
_REAL_PUBLISH_DOC = briefing_feishu.publish_briefing_doc


@pytest.fixture(autouse=True)
def stub_doc_export(monkeypatch: pytest.MonkeyPatch) -> None:
    """Keep the tests off the network: the HTML export is exercised elsewhere."""
    monkeypatch.setattr(
        briefing_feishu,
        "publish_briefing_doc",
        lambda html, *, title, targets=None: {
            "doc_url": "",
            "html_url": "https://example.feishu.cn/file/StubFile",
            "doc_token": "StubFile",
        },
    )


RESULT: dict[str, Any] = {
    "report_type": "daily",
    "report_date": "2026-09-27",
    "core": {"spend": 100.0},
    "alerts": [],
    "empty": False,
}


class StubNotification:
    """Records sends and returns a scripted outcome per call."""

    calls: list[dict[str, Any]] = []
    errors: list[Exception] = []

    def __init__(self, recipient: Any, content: Any, max_tries: int = 5) -> None:
        self.recipient = recipient
        self.content = content
        self.max_tries = max_tries
        self.trim_notes: list[str] = []

    def send(self) -> None:
        StubNotification.calls.append(
            {
                "config": self.recipient.recipient_config_json,
                "content": self.content,
                "max_tries": self.max_tries,
            }
        )
        if StubNotification.errors:
            raise StubNotification.errors.pop(0)


@pytest.fixture(autouse=True)
def stub_channel(monkeypatch: pytest.MonkeyPatch) -> None:
    StubNotification.calls = []
    StubNotification.errors = []
    monkeypatch.setattr(briefing_feishu, "FeishuNotification", StubNotification)


@pytest.fixture(autouse=True)
def captured_last_push(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    captured: list[dict[str, Any]] = []
    monkeypatch.setattr(
        "superset.project.briefing.store.record_last_push",
        lambda config_id, info: captured.append({"config_id": config_id, **info}),
    )
    return captured


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #


def test_normalize_settings_coerces_and_caps() -> None:
    settings = briefing_feishu.normalize_settings(
        {
            "enabled": "true",
            "msg_type": "nope",
            "targets": [
                {"receive_id_type": "chat_id", "receive_id": f"oc_{index}"}
                for index in range(8)
            ],
            "unknown": "dropped",
        }
    )
    assert settings["enabled"] is True
    assert settings["msg_type"] == "interactive"
    assert len(settings["targets"]) == briefing_feishu.MAX_TARGETS
    assert "unknown" not in settings


def test_normalize_settings_carries_the_tables_switch() -> None:
    """Sub-tables are an explicit, per-configuration opt-in."""
    assert briefing_feishu.normalize_settings({})["include_tables"] is False
    assert (
        briefing_feishu.normalize_settings({"include_tables": "true"})["include_tables"]
        is True
    )


def test_normalize_settings_accepts_aliases_and_skips_blank() -> None:
    settings = briefing_feishu.normalize_settings(
        {
            "targets": [
                {"type": "open_id", "id": "ou_1"},
                {"receive_id": "  "},
                "junk",
            ]
        }
    )
    assert settings["targets"] == [{"receive_id_type": "open_id", "receive_id": "ou_1"}]


def test_validate_settings_rejects_enabled_without_targets() -> None:
    errors = briefing_feishu.validate_settings({"enabled": True, "targets": []})
    assert errors
    assert "至少一个目标" in errors[0]


def test_validate_settings_reports_each_problem() -> None:
    errors = briefing_feishu.validate_settings(
        {
            "msg_type": "post",
            "targets": [
                {"receive_id_type": "phone", "receive_id": "1"},
                {"receive_id_type": "chat_id", "receive_id": ""},
                "junk",
            ],
        }
    )
    joined = " ".join(errors)
    assert "消息类型" in joined
    assert "目标类型不支持" in joined
    assert "不能为空" in joined
    assert "格式不正确" in joined


def test_validate_settings_accepts_well_formed_payload() -> None:
    assert (
        briefing_feishu.validate_settings(
            {
                "enabled": True,
                "msg_type": "text",
                "targets": [{"receive_id_type": "chat_id", "receive_id": "oc_1"}],
            }
        )
        == []
    )


def test_is_enabled_requires_switch_and_target() -> None:
    assert briefing_feishu.is_enabled(
        {"enabled": True, "targets": [{"receive_id": "oc_1"}]}
    )
    assert not briefing_feishu.is_enabled({"enabled": False, "targets": []})
    assert not briefing_feishu.is_enabled({"enabled": True, "targets": []})


# --------------------------------------------------------------------------- #
# Deployment status / links / dry run
# --------------------------------------------------------------------------- #


def test_app_status_masks_app_id(app: Any) -> None:
    app.config["FEISHU_APP_ID"] = "cli_a1b2c3d4e5"
    app.config["FEISHU_APP_SECRET"] = "test-app-secret"  # noqa: S105
    app.config["FEISHU_API_BASE"] = "https://open.feishu.cn"
    status = briefing_feishu.app_status()
    assert status["app_configured"] is True
    assert status["app_id_masked"] == "cli_a1****"
    assert "secret" not in str(status)


def test_app_status_without_credentials(app: Any) -> None:
    app.config["FEISHU_APP_ID"] = ""
    app.config["FEISHU_APP_SECRET"] = ""
    assert briefing_feishu.app_status()["app_configured"] is False


def test_scheduled_dry_run_inherits_global(app: Any) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = None
    app.config["ALERT_REPORTS_NOTIFICATION_DRY_RUN"] = True
    assert briefing_feishu.scheduled_dry_run() is True
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    assert briefing_feishu.scheduled_dry_run() is False


def test_frontend_url_prefers_dedicated_base(app: Any) -> None:
    app.config["BRIEFING_FRONTEND_BASE_URL"] = "http://localhost:9000/"
    assert briefing_feishu.frontend_url(7) == "http://localhost:9000/briefing/7"
    app.config["BRIEFING_FRONTEND_BASE_URL"] = ""
    app.config["WEBDRIVER_BASEURL_USER_FRIENDLY"] = "http://superset.example.com/"
    assert briefing_feishu.frontend_url(7) == "http://superset.example.com/briefing/7"


# --------------------------------------------------------------------------- #
# Pushing
# --------------------------------------------------------------------------- #


def test_push_result_forwards_the_tables_switch(app: Any) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    briefing_feishu.push_result(
        3,
        RESULT,
        kind="manual",
        settings={
            "include_tables": True,
            "targets": [{"receive_id_type": "chat_id", "receive_id": "oc_1"}],
        },
        dry_run=False,
    )
    assert '"include_tables": true' in StubNotification.calls[0]["config"]


def test_push_result_reports_trimmed_tables(app: Any) -> None:
    """A card squeezed by the 30 KB limit says what it dropped."""
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False

    class TrimmingNotification(StubNotification):
        def send(self) -> None:
            super().send()
            self.trim_notes = ["子表格行数已裁剪到每表 3 行"]

    monkey = TrimmingNotification
    briefing_feishu.FeishuNotification = monkey  # type: ignore[misc]
    try:
        outcome = briefing_feishu.push_result(
            3,
            RESULT,
            kind="manual",
            settings={"targets": [{"receive_id": "oc_1"}]},
            dry_run=False,
        )
    finally:
        briefing_feishu.FeishuNotification = StubNotification  # type: ignore[misc]
    assert outcome["sent"][0]["trimmed"] == ["子表格行数已裁剪到每表 3 行"]


def test_push_result_sends_to_every_target(app: Any) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    app.config["BRIEFING_FRONTEND_BASE_URL"] = "http://localhost:9000"
    outcome = briefing_feishu.push_result(
        3,
        RESULT,
        kind="manual",
        settings={
            "msg_type": "interactive",
            "targets": [
                {"receive_id_type": "chat_id", "receive_id": "oc_1"},
                {"receive_id_type": "open_id", "receive_id": "ou_2"},
            ],
        },
        dry_run=False,
    )
    assert outcome["ok"] is True
    assert [entry["target"] for entry in outcome["sent"]] == [
        "chat_id:oc_1",
        "open_id:ou_2",
    ]
    assert len(StubNotification.calls) == 2
    # One target per notification so a failure cannot hide the others.
    assert "oc_1" in StubNotification.calls[0]["config"]
    assert "ou_2" in StubNotification.calls[1]["config"]


def test_push_result_records_last_push(
    app: Any, captured_last_push: list[dict[str, Any]]
) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    briefing_feishu.push_result(
        3,
        RESULT,
        kind="schedule",
        settings={"targets": [{"receive_id": "oc_1"}]},
        dry_run=False,
    )
    assert captured_last_push[0]["config_id"] == 3
    assert captured_last_push[0]["ok"] is True
    assert captured_last_push[0]["kind"] == "schedule"


def test_push_result_dry_run_skips_http(
    app: Any, captured_last_push: list[dict[str, Any]]
) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = True
    app.config["ALERT_REPORTS_NOTIFICATION_DRY_RUN"] = False
    outcome = briefing_feishu.push_result(
        3,
        RESULT,
        kind="schedule",
        settings={"targets": [{"receive_id": "oc_1"}]},
    )
    assert outcome["dry_run"] is True
    assert outcome["ok"] is True
    assert StubNotification.calls == []
    assert captured_last_push[0]["dry_run"] is True


def test_push_result_extracts_targets_from_store(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        "superset.project.briefing.store.get_feishu_settings",
        lambda config_id: {"enabled": True, "targets": [{"receive_id": "oc_9"}]},
    )
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    outcome = briefing_feishu.push_result(5, RESULT, kind="manual", dry_run=False)
    assert "oc_9" in StubNotification.calls[0]["config"]
    assert outcome["ok"] is True


def test_push_result_without_targets_raises(app: Any) -> None:
    with pytest.raises(NotificationParamException, match="未配置飞书推送目标"):
        briefing_feishu.push_result(
            5, RESULT, kind="manual", settings={}, dry_run=False
        )


def test_push_result_reports_param_and_transient_failures(
    app: Any, captured_last_push: list[dict[str, Any]]
) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    StubNotification.errors = [
        NotificationParamException("目标不存在"),
        NotificationUnprocessableException("飞书 503"),
    ]
    outcome = briefing_feishu.push_result(
        3,
        RESULT,
        kind="test",
        settings={"targets": [{"receive_id": "oc_1"}, {"receive_id": "oc_2"}]},
        dry_run=False,
    )
    assert outcome["ok"] is False
    assert outcome["error_kind"] == "param"
    assert "目标不存在" in outcome["error"]
    assert "飞书 503" in outcome["error"]
    assert [entry["ok"] for entry in outcome["sent"]] == [False, False]
    assert captured_last_push[0]["ok"] is False


def test_push_scheduled_skips_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        "superset.project.briefing.store.get_feishu_settings",
        lambda config_id: {"enabled": False, "targets": [{"receive_id": "oc_1"}]},
    )
    assert briefing_feishu.push_scheduled(1, RESULT) is None
    assert StubNotification.calls == []


def test_push_scheduled_swallows_failures(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A broken Feishu target must never fail the scheduled briefing."""
    monkeypatch.setattr(
        "superset.project.briefing.store.get_feishu_settings",
        lambda config_id: {
            "enabled": True,
            "targets": [{"receive_id": "oc_1"}],
        },
    )
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    StubNotification.errors = [NotificationUnprocessableException("boom")]
    outcome = briefing_feishu.push_scheduled(1, RESULT)
    assert outcome is not None
    assert outcome["ok"] is False

    monkeypatch.setattr(
        "superset.project.briefing.store.get_feishu_settings",
        lambda config_id: (_ for _ in ()).throw(RuntimeError("db down")),
    )
    assert briefing_feishu.push_scheduled(1, RESULT) is None


def test_push_test_sends_the_real_report(app: Any) -> None:
    """A test push carries the latest report, never fabricated numbers."""
    app.config["BRIEFING_FEISHU_DRY_RUN"] = True  # test pushes ignore dry run
    real = {**RESULT, "core": {"spend": 591567.48}, "report_date": "2026-09-27"}
    outcome = briefing_feishu.push_test(
        3,
        real,
        settings={"enabled": False, "targets": [{"receive_id": "oc_1"}]},
        name="111",
    )
    assert outcome["ok"] is True
    assert outcome["dry_run"] is False
    assert StubNotification.calls[0]["max_tries"] == 1
    content = StubNotification.calls[0]["content"]
    assert content.briefing_result["core"]["spend"] == 591567.48
    assert content.briefing_result["report_date"] == "2026-09-27"


def test_latest_result_meta_flags_stale_daily_reports(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The dialog needs to know when the stored result is not current."""
    monkeypatch.setattr(
        "superset.project.briefing.store.get_latest_result",
        lambda config_id: None,
    )
    assert briefing_feishu.latest_result_meta(3) is None

    monkeypatch.setattr(
        "superset.project.briefing.store.get_latest_result",
        lambda config_id: {
            "report_type": "daily",
            "report_date": "2026-09-27",
            "finished_at": "2026-09-28T01:00:50+00:00",
            "job_id": "schedule-abc",
            "daily": [1, 2, 3],
            "alerts": [],
        },
    )
    monkeypatch.setattr(briefing_feishu, "_briefing_schedule", lambda config_id: None)
    meta = briefing_feishu.latest_result_meta(3)
    assert meta is not None
    assert meta["report_date"] == "2026-09-27"
    assert meta["points"] == 3
    assert meta["expected_report_date"]
    assert meta["age_hours"] is not None
    # A result generated minutes ago is fresh whatever its report date says.
    assert meta["stale"] is (meta["report_date"] != meta["expected_report_date"])


def test_latest_result_meta_flags_old_results(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An old stored result is stale even when its report date looks right."""
    old = (datetime.now(timezone.utc) - timedelta(days=35)).isoformat()
    monkeypatch.setattr(
        "superset.project.briefing.store.get_latest_result",
        lambda config_id: {
            "report_type": "weekly",
            "report_date": "2026-08-29",
            "finished_at": old,
            "daily": [],
            "alerts": [],
        },
    )
    meta = briefing_feishu.latest_result_meta(3)
    assert meta is not None
    assert meta["age_hours"] > briefing_feishu.STALE_AFTER_HOURS
    assert meta["stale"] is True
    # Weekly results get no daily-specific expectation, only the age rule.
    assert "expected_report_date" not in meta


def test_latest_result_meta_flags_an_old_report_day(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A daily result for an older day is stale even when just generated."""
    monkeypatch.setattr(
        "superset.project.briefing.store.get_latest_result",
        lambda config_id: {
            "report_type": "daily",
            "report_date": "2026-01-01",
            "finished_at": datetime.now(timezone.utc).isoformat(),
            "daily": [1],
            "alerts": [],
        },
    )
    monkeypatch.setattr(briefing_feishu, "_briefing_schedule", lambda config_id: None)
    meta = briefing_feishu.latest_result_meta(3)
    assert meta is not None
    assert meta["stale"] is True
    assert meta["expected_report_date"] != "2026-01-01"


# --------------------------------------------------------------------------- #
# Group picker
# --------------------------------------------------------------------------- #


def test_list_bot_chats_without_credentials(app: Any) -> None:
    app.config["FEISHU_APP_ID"] = ""
    result = briefing_feishu.list_bot_chats()
    assert result["available"] is False
    assert "FEISHU_APP_ID" in result["reason"]
    assert result["chats"] == []


def test_list_bot_chats_returns_groups(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.config["FEISHU_APP_ID"] = "cli_x"
    app.config["FEISHU_APP_SECRET"] = "s"  # noqa: S105
    monkeypatch.setattr(briefing_feishu, "tenant_access_token", lambda *a, **k: "t")

    def fake_request(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        return {
            "code": 0,
            "data": {
                "items": [
                    {"chat_id": "oc_1", "name": "日报群"},
                    {"chat_id": "", "name": "坏的"},
                ],
                "has_more": False,
            },
        }

    monkeypatch.setattr(briefing_feishu, "feishu_request", fake_request)
    result = briefing_feishu.list_bot_chats()
    assert result["available"] is True
    assert result["chats"] == [{"chat_id": "oc_1", "name": "日报群"}]


def test_list_bot_chats_degrades_on_missing_scope(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.config["FEISHU_APP_ID"] = "cli_x"
    app.config["FEISHU_APP_SECRET"] = "s"  # noqa: S105
    monkeypatch.setattr(briefing_feishu, "tenant_access_token", lambda *a, **k: "t")

    def fake_request(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        raise NotificationParamException("缺少 im:chat:read 权限")

    monkeypatch.setattr(briefing_feishu, "feishu_request", fake_request)
    result = briefing_feishu.list_bot_chats()
    assert result["available"] is False
    assert "im:chat:read" in result["reason"]


def test_publish_briefing_doc_returns_none_without_credentials(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A deployment without Feishu credentials simply ships no detail doc."""
    monkeypatch.setattr(briefing_feishu, "publish_briefing_doc", _REAL_PUBLISH_DOC)
    monkeypatch.setattr(briefing_feishu, "credentials", lambda: None)
    assert briefing_feishu.publish_briefing_doc("<html></html>", title="日报") is None


def test_clean_receive_id_extracts_the_bare_id() -> None:
    """A label written by the old group picker is reduced to its id."""
    label = "数据支撑组(4人组)（oc_2510749359c8b7601e3b5f5fec211ff2）"
    assert (
        briefing_feishu.clean_receive_id(label) == "oc_2510749359c8b7601e3b5f5fec211ff2"
    )
    assert (
        briefing_feishu.clean_receive_id("oc_2510749359c8b7601e3b5f5fec211ff2")
        == "oc_2510749359c8b7601e3b5f5fec211ff2"
    )
    # Other target types pass through unchanged.
    assert briefing_feishu.clean_receive_id("someone@example.com") == (
        "someone@example.com"
    )
    assert briefing_feishu.clean_receive_id("  ") == ""


def test_settings_normalize_a_labelled_chat_id() -> None:
    """The stored label must not reach the API as a receive_id."""
    normalized = briefing_feishu.normalize_settings(
        {
            "targets": [
                {
                    "receive_id_type": "chat_id",
                    "receive_id": (
                        "数据支撑组(4人组)（oc_2510749359c8b7601e3b5f5fec211ff2）"
                    ),
                }
            ]
        }
    )
    assert normalized["targets"] == [
        {
            "receive_id_type": "chat_id",
            "receive_id": "oc_2510749359c8b7601e3b5f5fec211ff2",
        }
    ]


def test_publish_briefing_doc_returns_the_html_file_url(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The upload is the deliverable: the card links the interactive HTML file."""
    monkeypatch.setattr(briefing_feishu, "publish_briefing_doc", _REAL_PUBLISH_DOC)
    monkeypatch.setattr(
        briefing_feishu, "credentials", lambda: ("cli_a", "secret", "https://open", 5)
    )
    monkeypatch.setattr(briefing_feishu, "tenant_access_token", lambda *a, **k: "t-1")
    monkeypatch.setattr(briefing_feishu, "_drive_root_token", lambda *a, **k: "fld_1")
    monkeypatch.setattr(
        briefing_feishu,
        "_file_browser_url",
        lambda *a, **k: "https://x.feishu.cn/file/file_1",
    )
    shared: list[tuple[str, str]] = []
    monkeypatch.setattr(
        briefing_feishu,
        "_share_document",
        lambda api, headers, timeout, token, targets, file_type="docx": shared.append(
            (token, file_type)
        ),
    )

    def fake_upload(*args: Any, **kwargs: Any) -> Any:
        return type(
            "Response",
            (),
            {"json": staticmethod(lambda: {"data": {"file_token": "file_1"}})},
        )()

    monkeypatch.setattr("requests.post", fake_upload)
    published = briefing_feishu.publish_briefing_doc("<html></html>", title="111明细")
    assert published == {
        "doc_url": "",
        "html_url": "https://x.feishu.cn/file/file_1",
        "doc_token": "file_1",
    }
    # The HTML file is shared with the targets, and only it.
    assert shared == [("file_1", "file")]


def test_push_result_links_the_detail_document(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The exported document URL lands in the outcome, shared with the targets."""
    seen: dict[str, Any] = {}

    def fake_publish(html: str, *, title: str, targets: Any = None) -> dict[str, str]:
        seen["targets"] = targets
        return {
            "doc_url": "",
            "html_url": "https://x.feishu.cn/file/File2",
            "doc_token": "File2",
        }

    monkeypatch.setattr(briefing_feishu, "publish_briefing_doc", fake_publish)
    monkeypatch.setattr(
        briefing_feishu,
        "build_briefing_html",
        lambda result, *, name, report_type: "<html></html>",
    )
    monkeypatch.setattr(briefing_feishu.FeishuNotification, "send", lambda self: None)
    monkeypatch.setattr(briefing_feishu, "_record", lambda *a, **k: None)
    outcome = briefing_feishu.push_result(
        7,
        {**RESULT, "report_type": "daily"},
        kind="test",
        name="111",
        dry_run=False,
        settings={
            "enabled": True,
            "include_doc": True,
            "targets": [{"receive_id_type": "chat_id", "receive_id": "oc_1"}],
        },
    )
    assert not outcome["doc_url"]
    assert outcome["html_url"] == "https://x.feishu.cn/file/File2"
    assert outcome["ok"] is True
    # The document is shared with the push targets, or the button opens 无权限.
    assert seen["targets"] == [{"receive_id_type": "chat_id", "receive_id": "oc_1"}]


def test_share_document_grants_link_and_member_permissions(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The exported document is shared with the recipient, not just the app."""
    calls: list[dict[str, Any]] = []

    def fake_request(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        calls.append({"method": method, "url": url, **kwargs})
        return {"code": 0}

    monkeypatch.setattr(briefing_feishu, "feishu_request", fake_request)
    briefing_feishu._share_document(
        "https://open.feishu.cn",
        {"Authorization": "Bearer t"},
        5,
        "DocToken",
        [
            {"receive_id_type": "open_id", "receive_id": "ou_1"},
            {"receive_id_type": "unknown", "receive_id": "x"},
        ],
    )
    # Link sharing is switched off; the targets are granted read individually.
    assert calls[0]["method"] == "PATCH"
    assert "DocToken/public" in calls[0]["url"]
    assert calls[0]["json_body"] == {"link_share_entity": "closed"}
    members = [call for call in calls if call["method"] == "POST"]
    # open_id is granted directly; the chat is expanded to its members (see the
    # dedicated test below) because Feishu refuses a group as a member.
    assert [call["json_body"]["member_type"] for call in members] == ["openid"]
    assert all(call["json_body"]["perm"] == "view" for call in members)
    # The helper also shares plain Drive files (the raw HTML the card links to).
    calls.clear()
    briefing_feishu._share_document(
        "https://open.feishu.cn",
        {"Authorization": "Bearer t"},
        5,
        "FileToken",
        [{"receive_id_type": "open_id", "receive_id": "ou_1"}],
        file_type="file",
    )
    assert calls[0]["params"] == {"type": "file"}
    assert calls[1]["params"]["type"] == "file"


def test_group_targets_are_granted_through_their_members(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A chat cannot be a document member: share with its members instead."""
    monkeypatch.setattr(
        briefing_feishu,
        "_chat_member_ids",
        lambda *a, **k: ["ou_1", "ou_2"],
    )
    grants: list[dict[str, Any]] = []

    def fake_request(method: str, url: str, **kwargs: Any) -> dict[str, Any]:
        if method == "POST":
            grants.append(kwargs["json_body"])
        return {"code": 0}

    monkeypatch.setattr(briefing_feishu, "feishu_request", fake_request)
    briefing_feishu._share_document(
        "https://open.feishu.cn",
        {"Authorization": "Bearer t"},
        5,
        "FileToken",
        [{"receive_id_type": "chat_id", "receive_id": "oc_group"}],
        file_type="file",
    )
    assert grants == [
        {"member_type": "openid", "member_id": "ou_1", "perm": "view"},
        {"member_type": "openid", "member_id": "ou_2", "perm": "view"},
    ]


def test_group_member_lookup_failure_is_not_fatal(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    def boom(*args: Any, **kwargs: Any) -> list[str]:
        raise RuntimeError("1063001 Invalid parameter")

    monkeypatch.setattr(briefing_feishu, "_chat_member_ids", boom)
    monkeypatch.setattr(briefing_feishu, "feishu_request", lambda *a, **k: {"code": 0})
    # Must not raise: the card still ships even when the grant cannot happen.
    briefing_feishu._share_document(
        "https://open.feishu.cn",
        {"Authorization": "Bearer t"},
        5,
        "FileToken",
        [{"receive_id_type": "chat_id", "receive_id": "oc_group"}],
    )
