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
        lambda html, *, title, targets=None, folder_token=None: {
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


def test_shareable_frontend_url_drops_loopback_hosts(app: Any) -> None:
    """A shared card must not carry a page link only the host can open."""
    app.config["WEBDRIVER_BASEURL_USER_FRIENDLY"] = ""
    for base in (
        "http://localhost:9000",
        "http://127.0.0.1:9000",
        "http://0.0.0.0:9000",
        "https://localhost",
        "http://localhost:9000/",
    ):
        app.config["BRIEFING_FRONTEND_BASE_URL"] = base
        assert briefing_feishu.shareable_frontend_url(7) == "", base
    app.config["BRIEFING_FRONTEND_BASE_URL"] = "https://bi.example.com/"
    assert (
        briefing_feishu.shareable_frontend_url(7) == "https://bi.example.com/briefing/7"
    )
    app.config["BRIEFING_FRONTEND_BASE_URL"] = ""
    assert briefing_feishu.shareable_frontend_url(7) == ""


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


# --------------------------------------------------------------------------- #
# Weekly HTML pipeline (interactive HTML file in the weekly folder)
# --------------------------------------------------------------------------- #

WEEKLY_RESULT: dict[str, Any] = {
    "report_type": "weekly",
    "report_date": "2026-08-29",
    "period_start": "2026-08-23",
    "period_end": "2026-08-29",
    "previous_period_start": "2026-08-16",
    "previous_period_end": "2026-08-22",
    "generated_at": "2026-08-30 01:00:50",
    "core": {"spend": 591567.48, "new_users": 40518, "ROI1": 0.152},
    "core_previous": {"spend": 400000.0},
    "thresholds": {"default_breakeven_line": 0.1, "roi_critical_line": 0.05},
    "daily": [
        {
            "date": "2026-08-23",
            "label": "2026-08-23 ~ 2026-08-29",
            "spend": 42400,
            "new_users": 39125,
            "recharge": 1627000,
            "roi1": 0.355,
            "roi_cum": 0.61,
        },
        {
            "date": "2026-08-29",
            "label": "2026-08-29 ~ 2026-08-29",
            "spend": 59156.748,
            "new_users": 40518,
            "recharge": 1367042.7,
            "roi1": 0.152,
            "roi_cum": 0.18,
        },
    ],
    "platforms": [
        {"platform": "mobile", "spend": 101600, "new_users": 48950, "roi1": 0.158}
    ],
    "projects": [
        {
            "project": "游戏A",
            "channel": "android",
            "spend": 106100,
            "new_users": 26660,
            "roi1": 0.062,
        }
    ],
    "media": [
        {
            "channel": "今日头条",
            "spend": 170200,
            "new_users": 45710,
            "roi1": 0.127,
        }
    ],
    "alerts": [],
    "empty": False,
}

FOLDER_LINK = "https://acme.feishu.cn/drive/folder/FldWeeklyDocToken0123456789"
FOLDER_TOKEN = "FldWeeklyDocToken0123456789"  # noqa: S105
HTML_URL = "https://acme.feishu.cn/file/File1"


def _no_deployment_folder(app: Any, monkeypatch: pytest.MonkeyPatch) -> None:
    """Make the deployment default empty so only settings can configure it."""
    app.config["FEISHU_WEEKLY_DOC_FOLDER_TOKEN"] = ""
    monkeypatch.delenv("FEISHU_WEEKLY_DOC_FOLDER_TOKEN", raising=False)


def _stub_weekly_push(
    monkeypatch: pytest.MonkeyPatch, *, im_file_key: str | None = "file_v3_key_1"
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Stub the Drive archive upload and the IM file upload.

    Returns the captured ``publish_briefing_doc`` / ``_upload_weekly_html_to_im``
    calls; ``im_file_key=None`` simulates a refused IM upload (card fallback).
    """
    uploads: list[dict[str, Any]] = []

    def fake_publish(
        html_text: str,
        *,
        title: str,
        targets: Any = None,
        folder_token: str | None = None,
    ) -> dict[str, str]:
        uploads.append(
            {
                "html": html_text,
                "title": title,
                "targets": targets,
                "folder_token": folder_token,
            }
        )
        return {"doc_url": "", "html_url": HTML_URL, "doc_token": "File1"}

    im_uploads: list[dict[str, Any]] = []

    def fake_im_upload(html_text: str, *, file_name: str) -> str | None:
        im_uploads.append({"html": html_text, "file_name": file_name})
        return im_file_key

    monkeypatch.setattr(briefing_feishu, "publish_briefing_doc", fake_publish)
    monkeypatch.setattr(briefing_feishu, "_upload_weekly_html_to_im", fake_im_upload)
    return uploads, im_uploads


def _card_button(card: dict[str, Any]) -> dict[str, Any]:
    """The action button of a doc-share card (the card has exactly one)."""
    return next(
        element
        for element in card["body"]["elements"]
        if element.get("tag") == "button"
    )


def test_resolve_doc_folder_token_accepts_links_and_tokens() -> None:
    assert briefing_feishu.resolve_doc_folder_token(FOLDER_LINK) == FOLDER_TOKEN
    assert (
        briefing_feishu.resolve_doc_folder_token(FOLDER_LINK + "?from=drive")
        == FOLDER_TOKEN
    )
    assert briefing_feishu.resolve_doc_folder_token(FOLDER_TOKEN) == FOLDER_TOKEN
    assert briefing_feishu.resolve_doc_folder_token("  ") == ""
    # Other Feishu objects are not folders.
    assert (
        briefing_feishu.resolve_doc_folder_token(
            "https://acme.feishu.cn/docx/doxcnAbcdefg"
        )
        == ""
    )
    assert briefing_feishu.resolve_doc_folder_token("not a folder") == ""
    assert briefing_feishu.resolve_doc_folder_token("short") == ""


def test_normalize_settings_extracts_the_weekly_folder_token() -> None:
    assert (
        briefing_feishu.normalize_settings({"doc_folder": FOLDER_LINK})["doc_folder"]
        == FOLDER_TOKEN
    )
    assert briefing_feishu.normalize_settings({})["doc_folder"] == ""


def test_validate_settings_rejects_an_invalid_weekly_folder() -> None:
    errors = briefing_feishu.validate_settings(
        {"doc_folder": "https://acme.feishu.cn/docx/doxcnAbcdefg"}
    )
    assert errors
    assert "周报文档文件夹" in errors[0]
    assert (
        briefing_feishu.validate_settings(
            {
                "doc_folder": FOLDER_LINK,
                "targets": [{"receive_id_type": "chat_id", "receive_id": "oc_1"}],
            }
        )
        == []
    )


def test_weekly_doc_folder_token_settings_beat_the_deployment(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.config["FEISHU_WEEKLY_DOC_FOLDER_TOKEN"] = "fldDeployment1"  # noqa: S105
    monkeypatch.delenv("FEISHU_WEEKLY_DOC_FOLDER_TOKEN", raising=False)
    assert briefing_feishu.weekly_doc_folder_token({}) == "fldDeployment1"
    assert (
        briefing_feishu.weekly_doc_folder_token(
            {"doc_folder": "https://acme.feishu.cn/drive/folder/fldConfigured1"}
        )
        == "fldConfigured1"
    )
    app.config["FEISHU_WEEKLY_DOC_FOLDER_TOKEN"] = ""
    assert briefing_feishu.weekly_doc_folder_token({}) == ""


def test_publish_briefing_doc_uploads_into_the_weekly_folder(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``folder_token`` picks the weekly folder instead of the export root."""
    monkeypatch.setattr(briefing_feishu, "publish_briefing_doc", _REAL_PUBLISH_DOC)
    monkeypatch.setattr(
        briefing_feishu, "credentials", lambda: ("cli_a", "secret", "https://open", 5)
    )
    monkeypatch.setattr(briefing_feishu, "tenant_access_token", lambda *a, **k: "t-1")
    monkeypatch.setattr(
        briefing_feishu,
        "_drive_root_token",
        lambda *a, **k: (_ for _ in ()).throw(AssertionError("must use folder_token")),
    )
    monkeypatch.setattr(
        briefing_feishu,
        "_file_browser_url",
        lambda *a, **k: "https://x.feishu.cn/file/file_1",
    )
    uploads: list[dict[str, Any]] = []

    def fake_upload(*args: Any, **kwargs: Any) -> Any:
        uploads.append(kwargs)
        return type(
            "Response",
            (),
            {"json": staticmethod(lambda: {"data": {"file_token": "file_1"}})},
        )()

    monkeypatch.setattr("requests.post", fake_upload)
    shared: list[tuple[str, str, Any]] = []
    monkeypatch.setattr(
        briefing_feishu,
        "_share_document",
        lambda api, headers, timeout, token, targets, file_type="docx": shared.append(
            (token, file_type, targets)
        ),
    )
    targets = [{"receive_id_type": "open_id", "receive_id": "ou_1"}]

    published = briefing_feishu.publish_briefing_doc(
        "<html></html>",
        title="222周报 · 2026-08-23 ~ 2026-08-29",
        targets=targets,
        folder_token=FOLDER_TOKEN,
    )
    assert published == {
        "doc_url": "",
        "html_url": "https://x.feishu.cn/file/file_1",
        "doc_token": "file_1",
    }
    assert uploads[0]["data"]["parent_node"] == FOLDER_TOKEN
    # The HTML file itself is shared with the targets (link sharing is closed).
    assert shared == [("file_1", "file", targets)]


def test_push_result_weekly_shares_the_interactive_html_as_a_native_file(
    app: Any,
    monkeypatch: pytest.MonkeyPatch,
    captured_last_push: list[dict[str, Any]],
) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    # The MUI dev server is a loopback URL: a card must not carry a dead link.
    app.config["BRIEFING_FRONTEND_BASE_URL"] = "http://localhost:9000"
    _no_deployment_folder(app, monkeypatch)
    uploads, im_uploads = _stub_weekly_push(monkeypatch)
    from superset.project.briefing.html_export import VCHART_CDN

    targets = [
        {"receive_id_type": "chat_id", "receive_id": "oc_1"},
        {"receive_id_type": "open_id", "receive_id": "ou_2"},
    ]
    outcome = briefing_feishu.push_result(
        16,
        WEEKLY_RESULT,
        kind="test",
        name="222",
        dry_run=False,
        settings={"doc_folder": FOLDER_LINK, "targets": targets},
    )
    assert outcome["ok"] is True
    # The interactive HTML file is archived in Drive; doc_url mirrors it for the
    # frontend's "last pushed document" link.
    assert outcome["doc_url"] == HTML_URL
    assert outcome["html_url"] == HTML_URL
    assert outcome["message_style"] == "file"
    # One Drive archive upload, into the weekly folder, with the report title.
    assert len(uploads) == 1
    assert uploads[0]["folder_token"] == FOLDER_TOKEN
    assert uploads[0]["targets"] == targets
    assert uploads[0]["title"] == "222周报 · 2026-08-23 ~ 2026-08-29"
    html = uploads[0]["html"]
    # Interactive evidence: page scripts, VChart runtime and the weekly chapters.
    assert "<script" in html
    assert VCHART_CDN in html
    assert "__SPECS.push" in html
    assert "<h2>2. 分周对比</h2>" in html
    assert html.count("<table>") >= 4
    # The rendered HTML is reused for the IM upload (no second render), as a
    # .html file named after the report.
    assert len(im_uploads) == 1
    assert im_uploads[0]["html"] == html
    expected_file_name = "222周报 · 2026-08-23 ~ 2026-08-29.html"
    assert im_uploads[0]["file_name"] == expected_file_name
    # One single notification per target carrying the native file share.
    assert len(StubNotification.calls) == 2
    for call in StubNotification.calls:
        content = call["content"]
        assert content.briefing_detail_url is None
        assert content.briefing_html_url is None
        assert content.briefing_doc_card is None
        assert content.briefing_share_file == {
            "file_key": "file_v3_key_1",
            "file_name": expected_file_name,
        }
    assert captured_last_push[0]["doc_url"] == HTML_URL
    assert captured_last_push[0]["ok"] is True
    # The docx import path was removed entirely.
    assert not hasattr(briefing_feishu, "publish_briefing_docx")
    assert not hasattr(briefing_feishu, "_wait_docx_import")


def test_push_result_weekly_falls_back_to_the_card_when_im_upload_fails(
    app: Any,
    monkeypatch: pytest.MonkeyPatch,
    captured_last_push: list[dict[str, Any]],
) -> None:
    """A refused IM upload still delivers a card that links the Drive HTML."""
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    app.config["BRIEFING_FRONTEND_BASE_URL"] = "http://localhost:9000"
    _no_deployment_folder(app, monkeypatch)
    uploads, im_uploads = _stub_weekly_push(monkeypatch, im_file_key=None)
    targets = [
        {"receive_id_type": "chat_id", "receive_id": "oc_1"},
        {"receive_id_type": "open_id", "receive_id": "ou_2"},
    ]
    outcome = briefing_feishu.push_result(
        16,
        WEEKLY_RESULT,
        kind="manual",
        name="222",
        dry_run=False,
        settings={"doc_folder": FOLDER_LINK, "targets": targets},
    )
    assert outcome["ok"] is True
    assert outcome["message_style"] == "card-fallback"
    assert outcome["doc_url"] == HTML_URL
    assert len(uploads) == 1  # Drive archive still happened
    assert len(im_uploads) == 1  # the failed IM attempt is visible for debugging
    assert len(StubNotification.calls) == 2
    for call in StubNotification.calls:
        content = call["content"]
        assert getattr(content, "briefing_share_file", None) is None
        card = content.briefing_doc_card
        assert card["schema"] == "2.0"
        button = _card_button(card)
        assert button["text"]["content"] == "查看交互式周报"
        assert button["behaviors"][0]["default_url"] == HTML_URL
    assert captured_last_push[0]["ok"] is True


def test_upload_weekly_html_to_im_posts_a_stream_file(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The IM upload uses ``file_type=stream`` and returns ``data.file_key``."""
    monkeypatch.setattr(
        briefing_feishu, "credentials", lambda: ("cli_a", "secret", "https://open", 5)
    )
    monkeypatch.setattr(briefing_feishu, "tenant_access_token", lambda *a, **k: "t-1")
    calls: list[dict[str, Any]] = []

    def fake_post(url: str, **kwargs: Any) -> Any:
        calls.append({"url": url, **kwargs})
        return type(
            "Response",
            (),
            {"json": staticmethod(lambda: {"code": 0, "data": {"file_key": "fk_1"}})},
        )()

    monkeypatch.setattr("requests.post", fake_post)
    file_name = "222周报 · 2026-08-23 ~ 2026-08-29.html"
    file_key = briefing_feishu._upload_weekly_html_to_im(
        "<html><script></script></html>", file_name=file_name
    )
    assert file_key == "fk_1"
    assert calls[0]["url"].endswith("/open-apis/im/v1/files")
    assert calls[0]["headers"]["Authorization"] == "Bearer t-1"
    assert calls[0]["data"] == {"file_type": "stream", "file_name": file_name}
    uploaded = calls[0]["files"]["file"]
    assert uploaded[0] == file_name
    assert uploaded[1] == "<html><script></script></html>".encode()
    assert uploaded[2] == "text/html"


def test_upload_weekly_html_to_im_never_raises(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(briefing_feishu, "credentials", lambda: None)
    assert (
        briefing_feishu._upload_weekly_html_to_im("<html></html>", file_name="x.html")
        is None
    )

    monkeypatch.setattr(
        briefing_feishu, "credentials", lambda: ("cli_a", "secret", "https://open", 5)
    )
    monkeypatch.setattr(briefing_feishu, "tenant_access_token", lambda *a, **k: "t-1")
    monkeypatch.setattr(
        "requests.post",
        lambda *a, **k: (_ for _ in ()).throw(ConnectionError("im down")),
    )
    assert (
        briefing_feishu._upload_weekly_html_to_im("<html></html>", file_name="x.html")
        is None
    )


def test_push_result_weekly_without_folder_records_a_clear_error(
    app: Any,
    monkeypatch: pytest.MonkeyPatch,
    captured_last_push: list[dict[str, Any]],
) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    _no_deployment_folder(app, monkeypatch)
    uploads, _im_uploads = _stub_weekly_push(monkeypatch)
    outcome = briefing_feishu.push_result(
        16,
        WEEKLY_RESULT,
        kind="schedule",
        settings={"targets": [{"receive_id_type": "chat_id", "receive_id": "oc_1"}]},
        dry_run=False,
    )
    assert outcome["ok"] is False
    assert outcome["error_kind"] == "param"
    assert "未配置周报文档文件夹" in outcome["error"]
    assert outcome["sent"] == []
    assert uploads == []
    assert StubNotification.calls == []
    assert captured_last_push[0]["ok"] is False
    assert captured_last_push[0]["doc_url"] == ""


def test_push_result_weekly_upload_failure_sends_nothing(
    app: Any,
    monkeypatch: pytest.MonkeyPatch,
    captured_last_push: list[dict[str, Any]],
) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    _no_deployment_folder(app, monkeypatch)
    monkeypatch.setattr(briefing_feishu, "publish_briefing_doc", lambda *a, **k: None)
    outcome = briefing_feishu.push_result(
        16,
        WEEKLY_RESULT,
        kind="manual",
        settings={
            "doc_folder": FOLDER_LINK,
            "targets": [{"receive_id_type": "chat_id", "receive_id": "oc_1"}],
        },
        dry_run=False,
    )
    assert outcome["ok"] is False
    assert outcome["error_kind"] == "transient"
    assert "周报 HTML 生成失败" in outcome["error"]
    assert StubNotification.calls == []
    assert captured_last_push[0]["ok"] is False


def test_push_result_weekly_dry_run_skips_the_upload(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    uploads, _im_uploads = _stub_weekly_push(monkeypatch)
    outcome = briefing_feishu.push_result(
        16,
        WEEKLY_RESULT,
        kind="schedule",
        settings={
            "doc_folder": FOLDER_LINK,
            "targets": [{"receive_id_type": "chat_id", "receive_id": "oc_1"}],
        },
        dry_run=True,
    )
    assert outcome["dry_run"] is True
    assert outcome["ok"] is True
    assert outcome["doc_url"] is None
    assert uploads == []
    assert StubNotification.calls == []
    assert outcome["sent"][0]["message"] == "试运行：未实际发送"


def test_push_result_daily_keeps_the_card_pipeline(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    app.config["BRIEFING_FEISHU_DRY_RUN"] = False
    uploads: list[dict[str, Any]] = []

    def fake_publish(
        html_text: str,
        *,
        title: str,
        targets: Any = None,
        folder_token: str | None = None,
    ) -> dict[str, str]:
        uploads.append(
            {
                "html": html_text,
                "title": title,
                "targets": targets,
                "folder_token": folder_token,
            }
        )
        return {"doc_url": "", "html_url": "", "doc_token": "StubFile"}

    monkeypatch.setattr(briefing_feishu, "publish_briefing_doc", fake_publish)
    outcome = briefing_feishu.push_result(
        3,
        RESULT,
        kind="manual",
        name="111",
        settings={"targets": [{"receive_id": "oc_1"}]},
        dry_run=False,
    )
    assert outcome["ok"] is True
    # A daily export keeps the historical export folder (no folder_token).
    assert len(uploads) == 1
    assert uploads[0]["folder_token"] is None
    assert uploads[0]["title"] == "111明细 · 2026-09-27"
    content = StubNotification.calls[0]["content"]
    assert content.briefing_doc_card is None
    assert getattr(content, "briefing_share_file", None) is None
    assert content.briefing_result is RESULT
    assert "message_style" not in outcome


def test_api_feishu_payload_exposes_the_weekly_document_fields(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The dialog's GET carries the weekly-document settings (DESIGN §6.2)."""
    from superset.project.briefing import (
        api as briefing_api,
        feishu as briefing_feishu_module,
    )

    monkeypatch.setattr(
        "superset.project.briefing.store.get_config",
        lambda config_id: {"report_type": "weekly"},
    )
    monkeypatch.setattr(
        "superset.project.briefing.store.get_feishu_settings",
        lambda config_id: {"doc_folder": FOLDER_LINK, "targets": []},
    )
    monkeypatch.setattr(
        briefing_feishu_module, "latest_result_meta", lambda config_id: None
    )
    _no_deployment_folder(app, monkeypatch)

    payload = briefing_api._feishu_payload(16)
    assert payload["report_type"] == "weekly"
    assert payload["weekly_doc_enabled"] is True
    assert payload["doc_folder"] == FOLDER_TOKEN
    assert payload["doc_folder_configured"] is True
    # The last push record (which carries the uploaded file URL) is exposed.
    assert payload["last_push"] is None


def test_api_feishu_payload_marks_the_deployment_default_configured(
    app: Any, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An empty per-config folder is fine when the deployment sets one."""
    from superset.project.briefing import (
        api as briefing_api,
        feishu as briefing_feishu_module,
    )

    monkeypatch.setattr(
        "superset.project.briefing.store.get_config",
        lambda config_id: {"report_type": "daily"},
    )
    monkeypatch.setattr(
        "superset.project.briefing.store.get_feishu_settings",
        lambda config_id: {},
    )
    monkeypatch.setattr(
        briefing_feishu_module, "latest_result_meta", lambda config_id: None
    )
    monkeypatch.delenv("FEISHU_WEEKLY_DOC_FOLDER_TOKEN", raising=False)
    app.config["FEISHU_WEEKLY_DOC_FOLDER_TOKEN"] = "fldDeployment1"  # noqa: S105

    payload = briefing_api._feishu_payload(16)
    assert payload["report_type"] == "daily"
    assert payload["weekly_doc_enabled"] is False
    # The per-config value stays empty so the input can say "留空沿用默认".
    assert payload["doc_folder"] == ""
    assert payload["doc_folder_configured"] is True
