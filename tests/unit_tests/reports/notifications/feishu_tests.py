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
"""Feishu (Lark) notification channel tests.

The Feishu OpenAPI is faked at the ``requests.request`` boundary so the tests
pin the wire contract: token endpoint, ``im/v1/messages`` parameters, the
stringified Card 2.0 payload, retry/idempotency behaviour and error
classification.
"""

from __future__ import annotations

from typing import Any

import pytest

from superset.reports.models import ReportRecipients, ReportRecipientType
from superset.reports.notifications.base import NotificationContent
from superset.reports.notifications.exceptions import (
    NotificationParamException,
    NotificationUnprocessableException,
)
from superset.reports.notifications.feishu import (
    _TOKEN_CACHE,
    _wan,
    build_briefing_card,
    build_project_daily_table,
    build_project_table,
    build_text_card,
    CARD_BYTE_BUDGET,
    card_bytes,
    CHAPTER_KEYS,
    escape_card_text,
    FeishuNotification,
    format_amount,
    format_count,
    format_delta,
    format_ratio,
    MAX_BAR_CATEGORIES,
    MAX_CARD_BYTES,
    MAX_TREND_CHART_BUCKETS,
    ROI_SERIES_ID,
    shrink_card,
    TABLE_WAN_DIGITS,
)
from superset.utils import json
from superset.utils.core import HeaderDataType

APP_ID = "cli_test_app"
APP_SECRET = "test-app-secret"  # noqa: S105

BRIEFING_RESULT: dict[str, Any] = {
    "report_type": "daily",
    "report_date": "2026-09-27",
    "core": {
        "spend": 1234.5,
        "new_users": 42,
        "cpa": 29.4,
        "recharge": 900.0,
        "ROI1": 0.15,
        "LTV1": 3.2,
        "pay_rate": 0.031,
        "retention_rate": 0.42,
        "natural_rate": 0.18,
    },
    "core_previous": {
        "spend": 1000.0,
        "new_users": 40,
        "cpa": 25.0,
        "recharge": 950.0,
        "ROI1": 0.18,
        "LTV1": 3.0,
    },
    # Trend buckets are newest-first in the payload, like the real report.
    "daily": [
        {
            "date": f"2026-09-{27 - offset:02d}",
            "label": f"2026-09-{27 - offset:02d}",
            "spend": 1000.0 + offset,
            "new_users": 40 + offset,
            "recharge": 800.0 + offset,
            "roi1": 0.1 + offset / 100,
            "roi_cum": 0.2 + offset / 100,
        }
        for offset in range(5)
    ],
    "thresholds": {
        "default_breakeven_line": 0.1,
        "roi_critical_line": 0.05,
    },
    "project_summary": [
        {"project": "游戏A", "spend": 900.0, "roi1": 0.2},
        {"project": "游戏B", "spend": 300.0, "roi1": 0.02},
    ],
    "projects": [
        {
            "project": "游戏A",
            "channel": "android",
            "spend": 900.0,
            "new_users": 30,
            "roi1": 0.2,
            "roi_cum": 1.1,
        },
        {
            "project": "游戏B",
            "channel": "ios",
            "spend": 300.0,
            "new_users": 12,
            "roi1": 0.05,
            "roi_cum": 0.4,
        },
    ],
    "media": [
        {
            "channel": "巨量引擎",
            "spend": 700.0,
            "new_users": 20,
            "cpa": 35.0,
            "roi1": 0.18,
            "pay_rate": 0.03,
            "retention_rate": 0.4,
        },
        {
            "channel": "腾讯广告",
            "spend": 400.0,
            "new_users": 15,
            "cpa": 26.7,
            "roi1": 0.07,
            "pay_rate": 0.02,
            "retention_rate": 0.35,
        },
    ],
    "media_platforms": [
        {"channel": "巨量引擎", "platform": "mobile", "spend": 700.0},
        {"channel": "腾讯广告", "platform": "mobile", "spend": 400.0},
    ],
    "platforms": [
        {
            "platform": "mobile",
            "spend": 1100.0,
            "new_users": 35,
            "cpa": 31.4,
            "recharge": 850.0,
            "roi1": 0.14,
            "roi_cum": 0.22,
        }
    ],
    "alerts": [],
    "empty": False,
}


@pytest.fixture(autouse=True)
def clear_token_cache() -> None:
    """The tenant token cache is process-global; keep tests independent."""
    _TOKEN_CACHE.clear()


@pytest.fixture
def header_data() -> HeaderDataType:
    return {
        "notification_format": "TEXT",
        "notification_type": "Report",
        "owners": [],
        "notification_source": "briefing",
        "chart_id": None,
        "dashboard_id": None,
        "slack_channels": None,
        "execution_id": "test-execution-id",
    }


class FakeResponse:
    """Minimal ``requests.Response`` stand-in."""

    def __init__(self, payload: Any, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code
        self.text = str(payload)

    def json(self) -> Any:
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def _install_api(
    app: Any, monkeypatch: pytest.MonkeyPatch, responses: list[Any]
) -> list[dict[str, Any]]:
    """Patch ``requests.request`` with a scripted list of responses.

    Returns the list of recorded calls (``url``, ``json``, ``params``,
    ``headers``) so tests can assert the wire contract.
    """
    app.config["FEISHU_APP_ID"] = APP_ID
    app.config["FEISHU_APP_SECRET"] = APP_SECRET
    app.config["FEISHU_API_BASE"] = "https://open.feishu.cn"
    app.config["FEISHU_REQUEST_TIMEOUT"] = 5

    calls: list[dict[str, Any]] = []
    queue = list(responses)

    def fake_request(method: str, url: str, **kwargs: Any) -> FakeResponse:
        calls.append({"method": method, "url": url, **kwargs})
        if not queue:
            raise AssertionError(f"unexpected Feishu call to {url}")
        response = queue.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    monkeypatch.setattr(
        "superset.reports.notifications.feishu.requests.request", fake_request
    )
    return calls


def _token_response(token: str = "t-123") -> FakeResponse:  # noqa: S107
    return FakeResponse(
        {"code": 0, "msg": "ok", "tenant_access_token": token, "expire": 7200}
    )


def _message_response(message_id: str = "om_1") -> FakeResponse:
    return FakeResponse({"code": 0, "msg": "ok", "data": {"message_id": message_id}})


def _notification(
    content: NotificationContent,
    config: dict[str, Any],
    *,
    max_tries: int = 1,
) -> FeishuNotification:
    return FeishuNotification(
        recipient=ReportRecipients(
            type=ReportRecipientType.FEISHU,
            recipient_config_json=json.dumps(config),
        ),
        content=content,
        max_tries=max_tries,
    )


def _briefing_content(
    header_data: HeaderDataType, **overrides: Any
) -> NotificationContent:
    payload: dict[str, Any] = {
        "name": "日报简报",
        "header_data": header_data,
        "briefing_result": BRIEFING_RESULT,
        "url": "http://localhost:9000/briefing/7",
    }
    payload.update(overrides)
    return NotificationContent(**payload)


# --------------------------------------------------------------------------- #
# Target / message type parsing
# --------------------------------------------------------------------------- #


def test_targets_from_multi_target_config(header_data: HeaderDataType) -> None:
    """The briefing shape carries a list of typed targets."""
    notification = _notification(
        _briefing_content(header_data),
        {
            "msg_type": "interactive",
            "targets": [
                {"receive_id_type": "chat_id", "receive_id": "oc_group"},
                {"receive_id_type": "open_id", "receive_id": "ou_user"},
            ],
        },
    )
    assert notification._targets() == [
        ("chat_id", "oc_group"),
        ("open_id", "ou_user"),
    ]


def test_targets_from_bare_target_config(header_data: HeaderDataType) -> None:
    """The standard recipient shape (``target``) is accepted as well."""
    notification = _notification(_briefing_content(header_data), {"target": "oc_group"})
    assert notification._targets() == [("chat_id", "oc_group")]


def test_targets_missing_raises(header_data: HeaderDataType) -> None:
    notification = _notification(_briefing_content(header_data), {})
    with pytest.raises(NotificationParamException, match="未配置接收目标"):
        notification._targets()


def test_target_type_invalid_raises(header_data: HeaderDataType) -> None:
    notification = _notification(
        _briefing_content(header_data),
        {"targets": [{"receive_id_type": "phone", "receive_id": "123"}]},
    )
    with pytest.raises(NotificationParamException, match="目标类型不支持"):
        notification._targets()


def test_target_empty_receive_id_raises(header_data: HeaderDataType) -> None:
    notification = _notification(
        _briefing_content(header_data),
        {"targets": [{"receive_id_type": "chat_id", "receive_id": "  "}]},
    )
    with pytest.raises(NotificationParamException, match="目标不能为空"):
        notification._targets()


def test_msg_type_invalid_raises(header_data: HeaderDataType) -> None:
    notification = _notification(
        _briefing_content(header_data),
        {"msg_type": "post", "targets": [{"receive_id": "oc_1"}]},
    )
    with pytest.raises(NotificationParamException, match="消息类型不支持"):
        notification._msg_type()


def test_missing_credentials_raises(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _install_api(app, monkeypatch, [])
    app.config["FEISHU_APP_ID"] = ""
    notification = _notification(
        _briefing_content(header_data), {"targets": [{"receive_id": "oc_1"}]}
    )
    with pytest.raises(NotificationParamException, match="未配置飞书应用凭证"):
        notification.send()
    assert calls == []


# --------------------------------------------------------------------------- #
# Sending
# --------------------------------------------------------------------------- #


def test_send_posts_card_payload(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A scheduled-style send fetches a token then posts a Card 2.0 payload."""
    calls = _install_api(app, monkeypatch, [_token_response(), _message_response()])
    notification = _notification(
        _briefing_content(header_data),
        {"msg_type": "interactive", "targets": [{"receive_id": "oc_group"}]},
    )
    notification.send()

    assert [call["url"] for call in calls] == [
        "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
        "https://open.feishu.cn/open-apis/im/v1/messages",
    ]
    message = calls[1]
    assert message["params"] == {"receive_id_type": "chat_id"}
    assert message["headers"] == {"Authorization": "Bearer t-123"}
    assert message["json"]["receive_id"] == "oc_group"
    assert message["json"]["msg_type"] == "interactive"
    # ``content`` is the JSON *string* the IM API expects.
    card = json.loads(message["json"]["content"])
    assert card["schema"] == "2.0"
    assert card["header"]["title"]["content"] == "日报简报 · 2026-09-27"
    # Idempotency key present and stable within one send.
    assert message["json"]["uuid"]


def test_send_reuses_cached_token(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _install_api(
        app,
        monkeypatch,
        [_token_response(), _message_response(), _message_response("om_2")],
    )
    config = {"targets": [{"receive_id": "oc_group"}]}
    _notification(_briefing_content(header_data), config).send()
    _notification(_briefing_content(header_data), config).send()

    token_calls = [call for call in calls if "tenant_access_token" in call["url"]]
    assert len(token_calls) == 1
    assert len(calls) == 3


def test_send_refreshes_expired_token(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """An expired-token code triggers one refresh + retry instead of a failure."""
    calls = _install_api(
        app,
        monkeypatch,
        [
            _token_response("t-old"),
            FakeResponse({"code": 99991663, "msg": "token expired"}),
            _token_response("t-new"),
            _message_response(),
        ],
    )
    notification = _notification(
        _briefing_content(header_data), {"targets": [{"receive_id": "oc_group"}]}
    )
    notification.send()

    assert len(calls) == 4
    assert calls[1]["headers"] == {"Authorization": "Bearer t-old"}
    assert calls[3]["headers"] == {"Authorization": "Bearer t-new"}


def test_permission_error_is_param_exception(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_api(
        app,
        monkeypatch,
        [
            _token_response(),
            FakeResponse({"code": 99991672, "msg": "no permission"}),
        ],
    )
    notification = _notification(
        _briefing_content(header_data), {"targets": [{"receive_id": "oc_group"}]}
    )
    with pytest.raises(NotificationParamException, match="im:message"):
        notification.send()


def test_server_error_is_retryable(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    _install_api(
        app,
        monkeypatch,
        [
            _token_response(),
            FakeResponse({"code": 12345, "msg": "boom"}, status_code=503),
        ],
    )
    notification = _notification(
        _briefing_content(header_data), {"targets": [{"receive_id": "oc_group"}]}
    )
    with pytest.raises(NotificationUnprocessableException):
        notification.send()


def test_interactive_send_does_not_retry(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """``max_tries=1`` (settings dialog) sends exactly once."""
    calls = _install_api(
        app,
        monkeypatch,
        [
            _token_response(),
            FakeResponse({"code": 12345, "msg": "boom"}, status_code=500),
        ],
    )
    notification = _notification(
        _briefing_content(header_data),
        {"targets": [{"receive_id": "oc_group"}]},
        max_tries=1,
    )
    with pytest.raises(NotificationUnprocessableException):
        notification.send()
    # token + one message attempt only
    assert len(calls) == 2


def test_network_error_is_retryable(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    import requests

    _install_api(
        app,
        monkeypatch,
        [requests.exceptions.ConnectionError("nope")],
    )
    notification = _notification(
        _briefing_content(header_data), {"targets": [{"receive_id": "oc_group"}]}
    )
    with pytest.raises(NotificationUnprocessableException, match="请求失败"):
        notification.send()


def test_partial_target_failure_lists_every_target(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """A failure on the second target still reports the first one's state."""
    calls = _install_api(
        app,
        monkeypatch,
        [
            _token_response(),
            _message_response(),
            FakeResponse({"code": 230002, "msg": "bot not in chat"}),
        ],
    )
    notification = _notification(
        _briefing_content(header_data),
        {
            "targets": [
                {"receive_id": "oc_ok"},
                {"receive_id": "oc_bad"},
            ]
        },
    )
    with pytest.raises(NotificationParamException) as excinfo:
        notification.send()
    assert "oc_bad" in excinfo.value.message
    assert len([call for call in calls if "im/v1/messages" in call["url"]]) == 2


def test_text_message_type_uses_summary(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = _install_api(app, monkeypatch, [_token_response(), _message_response()])
    notification = _notification(
        _briefing_content(header_data),
        {"msg_type": "text", "targets": [{"receive_id": "oc_group"}]},
    )
    notification.send()
    payload = json.loads(calls[1]["json"]["content"])
    assert "核心指标" in payload["text"]
    assert "消耗: 1,234.50" in payload["text"]


def test_non_briefing_content_renders_fallback_card(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Chart/dashboard notifications still get a usable card."""
    calls = _install_api(app, monkeypatch, [_token_response(), _message_response()])
    notification = _notification(
        NotificationContent(
            name="周报图表",
            header_data=header_data,
            description="第一行<br>第二行",
            url="http://localhost:9000/dashboard/1",
        ),
        {"targets": [{"receive_id": "oc_group"}]},
    )
    notification.send()
    card = json.loads(calls[1]["json"]["content"])
    assert card["header"]["title"]["content"] == "周报图表"
    assert "第一行" in card["body"]["elements"][0]["content"]


# --------------------------------------------------------------------------- #
# Card rendering
# --------------------------------------------------------------------------- #


def test_card_is_schema_2_with_severity_template() -> None:
    critical = {
        **BRIEFING_RESULT,
        "alerts": [{"level": "critical", "message": "ROI1 低于盈亏线"}],
    }
    card = build_briefing_card(critical, name="日报")
    assert card["schema"] == "2.0"
    assert card["header"]["template"] == "red"
    assert card["header"]["text_tag_list"][0]["color"] == "red"
    assert card["config"]["width_mode"] == "fill"

    warning = {
        **BRIEFING_RESULT,
        "alerts": [{"level": "warning", "message": "ROI1 偏低"}],
    }
    assert build_briefing_card(warning, name="日报")["header"]["template"] == "orange"
    assert (
        build_briefing_card(BRIEFING_RESULT, name="日报")["header"]["template"]
        == "blue"
    )


def test_card_structure_gates() -> None:
    """P1/P2/P3 of the card style guide: 2-5 blocks, one focal number."""
    card = build_briefing_card(BRIEFING_RESULT, name="日报")
    elements = card["body"]["elements"]
    # One focal metric rendered larger than the rest.
    focal = elements[1]["columns"][0]["elements"][0]
    assert focal["text_size"] == "title"
    supporting = elements[1]["columns"][1]["elements"][0]
    assert supporting["text_size"] == "body"
    # A structural, non-text block exists.
    assert any(element["tag"] == "column_set" for element in elements)
    # Deltas are rendered without a competing colour.
    assert "▲" in elements[1]["columns"][0]["elements"][1]["content"]


def test_card_uses_only_properties_the_api_accepts() -> None:
    """Guard the card schema: ``font_color`` on markdown is rejected (200621).

    The live Feishu API answers ``code=230099 ... unknown property, property:
    font_color`` for it, so secondary text must be coloured inline instead.
    """
    result = {
        **BRIEFING_RESULT,
        "alerts": [{"level": "warning", "message": "ROI1 偏低"}],
    }
    card = build_briefing_card(result, name="日报")

    def elements(node: Any) -> Any:
        if isinstance(node, dict):
            if "tag" in node:
                yield node
            for value in node.values():
                yield from elements(value)
        elif isinstance(node, list):
            for item in node:
                yield from elements(item)

    for element in elements(card["body"]):
        assert "font_color" not in element, element
    metric_rows = [el for el in card["body"]["elements"] if el["tag"] == "column_set"]
    labels = metric_rows[0]["columns"][0]["elements"][1]
    assert labels["content"].startswith("<font color='grey'>")
    rates = next(
        el["content"]
        for el in card["body"]["elements"]
        if el.get("tag") == "markdown" and "付费率" in el.get("content", "")
    )
    assert rates.startswith("<font color='grey'>付费率")
    # No custom colour token is needed once colours are inline.
    assert "color" not in card["config"]["style"]


def test_chapter_cards_split_the_report() -> None:
    """One card per chapter, so every message keeps its own 30 KB budget."""
    cards = {
        chapter: build_briefing_card(
            BRIEFING_RESULT,
            name="日报",
            include_tables=True,
            detail_url="https://x/docx/1",
            html_url="https://x/file/1",
            chapter=chapter,
        )
        for chapter in CHAPTER_KEYS
    }
    assert set(cards) == {"core", "trend", "projects", "media"}
    # Each chapter card carries exactly its own chart (the core one carries none).
    assert _elements(cards["trend"], "chart")[0]["element_id"] == "chart-trend"
    assert _elements(cards["projects"], "chart")[0]["element_id"] == "chart-project"
    assert _elements(cards["media"], "chart")[0]["element_id"] == "chart-media"
    assert _elements(cards["core"], "chart") == []
    for card in cards.values():
        # The links and the button ride on every chapter card.
        assert any(el["tag"] == "button" for el in card["body"]["elements"])
        assert card_bytes(card) < CARD_BYTE_BUDGET
        assert len(_elements(card, "table")) <= 5


def test_split_push_sends_one_message_per_chapter(
    app: Any, header_data: HeaderDataType, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Each chapter message needs its own idempotency key.

    Sharing one ``uuid`` across the messages makes Feishu treat them as
    duplicates of the first card and deliver only that one.
    """
    calls = _install_api(
        app,
        monkeypatch,
        [_token_response()] + [_message_response() for _ in range(4)],
    )
    notification = _notification(
        _briefing_content(header_data),
        {"msg_type": "interactive", "targets": [{"receive_id": "oc_group"}]},
    )
    # Opt in to the split through the notification content.
    notification._content.briefing_split_chapters = True
    notification._content.briefing_detail_url = "https://x.feishu.cn/docx/Doc1"
    notification.send()

    messages = [call for call in calls if call["url"].endswith("/im/v1/messages")]
    assert len(messages) == 4
    assert len({call["json"]["uuid"] for call in messages}) == 4
    cards = [json.loads(call["json"]["content"]) for call in messages]
    chart_ids = [
        next(
            (
                element["element_id"]
                for element in card["body"]["elements"]
                if element.get("tag") == "chart"
            ),
            None,
        )
        for card in cards
    ]
    assert chart_ids == [None, "chart-trend", "chart-project", "chart-media"]
    titles = [card["header"]["title"]["content"] for card in cards]
    # Each message names its own chapter instead of repeating one title.
    assert titles == [
        "日报简报 · 2026-09-27 · ① 核心指标速览",
        "日报简报 · 2026-09-27 · ② 分天对比",
        "日报简报 · 2026-09-27 · ③ 主游戏维度分析",
        "日报简报 · 2026-09-27 · ④ 媒体表现分析",
    ]
    for card in cards:
        # Every chapter card repeats the detail links and the button.
        assert any(element["tag"] == "button" for element in card["body"]["elements"])


def test_ltv_columns_depend_on_the_table() -> None:
    """分天表 keeps the LTV week; target-date-only tables keep LTV1 alone.

    Only LTV1 is complete for the report's target date (yesterday), so the other
    tables must not show half-filled LTV2/LTV3/… columns.
    """
    card = build_briefing_card(BRIEFING_RESULT, name="日报", include_tables=True)
    for table in _elements(card, "table"):
        names = [col["display_name"] for col in table["columns"]]
        ltv = [n for n in names if n.startswith("LTV")]
        if names[0] == "周期":
            assert ltv == [f"LTV{day}" for day in range(1, 8)]
        else:
            assert ltv == ["LTV1"]


def test_daily_table_fills_its_period_deltas() -> None:
    """The daily rows carry no prev block: diff the neighbouring day instead."""
    card = build_briefing_card(
        BRIEFING_RESULT, name="日报", include_tables=True, chapter="trend"
    )
    table = _elements(card, "table")[0]
    rows = table["rows"]
    # The oldest row has nothing to compare against; the rest carry a delta.
    assert rows[0]["sd"] == "—"
    assert any(str(row["sd"]).startswith(("▲", "▼")) for row in rows[1:])


def test_breakdown_tables_share_the_metric_fields() -> None:
    """媒体 × 主游戏 / 客户端 carry the same metrics as the 媒体 table."""
    card = build_briefing_card(
        BRIEFING_RESULT, name="日报", include_tables=True, chapter="media"
    )
    tables = _elements(card, "table")
    media = next(
        t
        for t in tables
        if len(t["columns"]) and t["columns"][0]["display_name"] == "媒体"
    )
    media_metrics = [c["display_name"] for c in media["columns"][1:]]
    for other in tables:
        names = [c["display_name"] for c in other["columns"]]
        # The extra dimension column is expected; the metrics must line up.
        metrics = [n for n in names if n in media_metrics]
        assert metrics == media_metrics


def test_project_tables_follow_the_page_order() -> None:
    """③ chapter: the card lists 主游戏 in the page's order — whole-game spend
    descending — with a game's channels together and spend-descending inside."""
    result = {
        **BRIEFING_RESULT,
        "project_summary": [
            {"project": "游戏B", "spend": 900.0, "roi1": 0.1},
            {"project": "游戏A", "spend": 300.0, "roi1": 0.1},
        ],
        "projects": [
            {"project": "游戏B", "channel": "ios", "spend": 600.0, "roi1": 0.1},
            {"project": "游戏B", "channel": "android", "spend": 300.0, "roi1": 0.1},
            {"project": "游戏A", "channel": "android", "spend": 300.0, "roi1": 0.1},
        ],
    }
    table = build_project_table(result)
    assert table is not None
    # Name order would put 游戏A first; the payload's spend order must win.
    assert [(row["project"], row["channel"]) for row in table["rows"]] == [
        ("游戏B", "ios"),
        ("游戏B", "android"),
        ("游戏B", "小计"),
        ("游戏A", "android"),
        ("游戏A", "小计"),
    ]


def test_project_table_adds_a_whole_game_subtotal_per_game() -> None:
    """③ chapter: each game's channels are followed by its whole-game 小计."""
    result = {
        **BRIEFING_RESULT,
        "project_summary": [
            {"project": "游戏A", "spend": 900.0, "roi1": 0.2},
            {"project": "游戏B", "spend": 300.0, "roi1": 0.02},
        ],
        "projects": [
            {"project": "游戏A", "channel": "android", "spend": 600.0, "roi1": 0.18},
            {"project": "游戏A", "channel": "ios", "spend": 300.0, "roi1": 0.24},
            {"project": "游戏B", "channel": "ios", "spend": 300.0, "roi1": 0.02},
        ],
    }
    table = build_project_table(result)
    assert table is not None
    # The 小计 marker rides the 渠道 cell, so the game name stays in its own
    # column and the reader can still sort/copy the table by game.
    assert [(row["project"], row["channel"]) for row in table["rows"]] == [
        ("游戏A", "android"),
        ("游戏A", "ios"),
        ("游戏A", "小计"),
        ("游戏B", "ios"),
        ("游戏B", "小计"),
    ]
    subtotal = table["rows"][2]
    # 小计 quotes the whole game (project_summary), not the listed channels.
    assert subtotal["spend"] == _wan(900.0, TABLE_WAN_DIGITS)
    assert subtotal["roi1"][0]["text"] == "20.0%"


def test_project_table_pages_through_every_channel() -> None:
    """The whole Top-N travels in the card; Feishu pages through the rows."""
    result = {
        **BRIEFING_RESULT,
        "project_summary": [{"project": "游戏A", "spend": 300.0, "roi1": 0.1}],
        "projects": [
            {
                "project": "游戏A",
                "channel": f"c{i}",
                "spend": float(30 - i),
                "roi1": 0.1,
            }
            for i in range(12)
        ],
    }
    table = build_project_table(result)
    assert table is not None
    # Every channel of the payload survives, plus the game's 小计.
    assert len(table["rows"]) == 13
    assert table["rows"][-1]["channel"] == "小计"
    # Feishu renders ten rows a page and adds a pager for the rest.
    assert table["page_size"] == 10


def test_project_daily_table_fills_its_deltas() -> None:
    """主游戏 × 渠道 × 日期 diffs the same game/channel's previous day."""
    expanded = {
        **BRIEFING_RESULT,
        "projects": [
            {
                **BRIEFING_RESULT["projects"][0],
                "daily": [
                    {"date": "2026-09-26", "spend": 100.0, "roi1": 0.1},
                    {"date": "2026-09-27", "spend": 150.0, "roi1": 0.2},
                ],
            }
        ],
    }
    table = build_project_daily_table(expanded)
    assert table is not None
    rows = table["rows"]
    assert rows[0]["sd"] == "—"
    assert rows[1]["sd"].startswith("▲")
    assert rows[1]["rd"].startswith("▲")


def test_card_is_self_contained() -> None:
    """The chapters travel inside the card; no link unless a detail doc exists."""
    card = build_briefing_card(BRIEFING_RESULT, name="日报")
    elements = card["body"]["elements"]
    assert all(element["tag"] != "button" for element in elements)
    assert "open_url" not in json.dumps(card)
    assert "http://localhost:9000" not in json.dumps(card)


def test_card_detail_button_opens_the_full_export() -> None:
    """One full-width button, only when the HTML export has a document."""
    url = "https://example.feishu.cn/docx/AbCdEf"
    card = build_briefing_card(
        BRIEFING_RESULT, name="日报", include_tables=True, detail_url=url
    )
    buttons = [
        element for element in card["body"]["elements"] if element["tag"] == "button"
    ]
    assert len(buttons) == 1
    button = buttons[0]
    assert button["text"]["content"] == "查看明细"
    # The style guide's single primary action: filled and full width.
    assert button["type"] == "primary_filled"
    assert button["width"] == "fill"
    # The links under the button: the document plus the raw HTML file.
    links = next(
        element
        for element in card["body"]["elements"]
        if element.get("tag") == "markdown" and "完整明细文档" in element["content"]
    )
    assert f"[完整明细文档]({url})" in links["content"]
    assert "HTML 原始文件" not in links["content"]
    card_with_html = build_briefing_card(
        BRIEFING_RESULT, name="日报", detail_url=url, html_url="https://x/file/1"
    )
    html_links = next(
        element
        for element in card_with_html["body"]["elements"]
        if element.get("tag") == "markdown" and "HTML 原始文件" in element["content"]
    )
    assert "[HTML 原始文件](https://x/file/1)" in html_links["content"]
    assert button["behaviors"] == [
        {
            "type": "open_url",
            "default_url": url,
            "pc_url": url,
            "ios_url": url,
            "android_url": url,
        }
    ]


def test_card_truncates_alerts() -> None:
    result = {
        **BRIEFING_RESULT,
        "alerts": [
            {"level": "warning", "message": f"告警 {index}"} for index in range(8)
        ],
    }
    card = build_briefing_card(result, name="日报")
    alert_block = next(
        element
        for element in card["body"]["elements"]
        if "告警" in element.get("content", "")
    )
    assert alert_block["content"].count("[预警]") == 5
    assert "还有 3 条告警" in alert_block["content"]


def test_card_renders_empty_briefing_note() -> None:
    card = build_briefing_card(
        {"report_type": "daily", "report_date": "2026-09-27", "empty": True},
        name="日报",
    )
    contents = [element.get("content", "") for element in card["body"]["elements"]]
    assert any("没有数据" in content for content in contents)


def test_card_escapes_markup_in_alert_messages() -> None:
    """Card markdown parses markup, so alert text uses numeric entities."""
    result = {
        **BRIEFING_RESULT,
        "alerts": [
            {
                "level": "critical",
                "message": "整体 ROI1 严重低于盈亏线（0.090 < 0.05）*注意*",
            }
        ],
    }
    card = build_briefing_card(result, name="日报")
    alert_block = next(
        element
        for element in card["body"]["elements"]
        if "告警" in element.get("content", "")
    )
    assert "&#60; 0.05" in alert_block["content"]
    assert "< 0.05" not in alert_block["content"]
    assert "&lt;" not in alert_block["content"]
    assert escape_card_text('<a> & "b"') == "&#60;a&#62; &#38; &#34;b&#34;"


def test_card_title_stays_single_line() -> None:
    card = build_briefing_card(BRIEFING_RESULT, name="多行\n名称")
    assert "\n" not in card["header"]["subtitle"]["content"]


def test_text_card_converts_html_breaks() -> None:
    card = build_text_card(name="标题", description="甲<br>乙\n丙")
    assert card["body"]["elements"][0]["content"].startswith("甲\n乙")


# Card 2.0 properties documented for the components the briefing card uses
# (see the Feishu card component reference).  Anything outside these sets is
# rejected by the API with `code=200621 ... unknown property`, so the test below
# turns such a typo into a failing build instead of a failed push.
CARD_PROPERTIES: dict[str, set[str]] = {
    "markdown": {
        "tag",
        "content",
        "text_size",
        "text_align",
        "icon",
        "margin",
        "element_id",
    },
    "column_set": {
        "tag",
        "columns",
        "flex_mode",
        "horizontal_spacing",
        "horizontal_align",
        "background_style",
        "action",
        "margin",
        "element_id",
    },
    "column": {
        "tag",
        "elements",
        "width",
        "weight",
        "vertical_align",
        "direction",
        "horizontal_spacing",
        "vertical_spacing",
        "padding",
        "margin",
        "background_style",
        "action",
        "element_id",
    },
    "button": {
        "tag",
        "text",
        "type",
        "size",
        "width",
        "behaviors",
        "icon",
        "hover_tips",
        "disabled",
        "disabled_tips",
        "confirm",
        "margin",
        "element_id",
    },
    # Inline text/icon payloads (header title, text tags, icons).
    "plain_text": {"tag", "content"},
    "lark_md": {"tag", "content"},
    "text_tag": {"tag", "text", "color"},
    "standard_icon": {"tag", "token", "color"},
    "chart": {
        "tag",
        "chart_spec",
        "aspect_ratio",
        "color_theme",
        "height",
        "preview",
        "margin",
        "element_id",
    },
    "table": {
        "tag",
        "columns",
        "rows",
        "page_size",
        "row_height",
        "row_max_height",
        "freeze_first_column",
        "header_style",
        "margin",
    },
}


def _walk_elements(node: Any) -> Any:
    if isinstance(node, dict):
        if "tag" in node:
            yield node
        for value in node.values():
            yield from _walk_elements(value)
    elif isinstance(node, list):
        for item in node:
            yield from _walk_elements(item)


def test_every_element_property_is_documented() -> None:
    """Both severity variants only use properties the card schema defines."""
    for alerts in (
        [],
        [{"level": "warning", "message": "ROI1 偏低"}],
        [{"level": "critical", "message": "ROI1 低于盈亏线 < 0.05"}],
        [{"level": "warning", "message": f"告警 {index}"} for index in range(8)],
    ):
        card = build_briefing_card({**BRIEFING_RESULT, "alerts": alerts}, name="日报")
        assert set(card) <= {"schema", "config", "header", "body"}
        assert set(card["header"]) <= {
            "title",
            "subtitle",
            "template",
            "text_tag_list",
            "icon",
            "padding",
        }
        assert set(card["body"]) <= {
            "direction",
            "padding",
            "vertical_spacing",
            "horizontal_spacing",
            "horizontal_align",
            "vertical_align",
            "elements",
        }
        for element in _walk_elements(card["body"]):
            tag = element["tag"]
            assert tag in CARD_PROPERTIES, tag
            unknown = set(element) - CARD_PROPERTIES[tag]
            assert not unknown, f"{tag} has undocumented properties: {unknown}"


# --------------------------------------------------------------------------- #
# Chapters: charts, sub-tables and the 30 KB budget
# --------------------------------------------------------------------------- #


def _elements(card: Any, tag: str) -> list[dict[str, Any]]:
    return [el for el in card["body"]["elements"] if el.get("tag") == tag]


def test_card_carries_every_chapter_chart() -> None:
    """The chapters' charts travel in the card, so the report reads inline."""
    card = build_briefing_card(BRIEFING_RESULT, name="日报")
    charts = _elements(card, "chart")
    assert [chart["element_id"] for chart in charts] == [
        "chart-trend",
        "chart-project",
        "chart-media",
    ]
    # Chapter headings mirror the briefing page.
    headings = [
        el["content"]
        for el in _elements(card, "markdown")
        if el["content"].startswith("**")
    ]
    assert any("1. 核心指标速览" in h for h in headings)
    assert any("2. 分天对比" in h for h in headings)
    assert any("3. 主游戏维度分析" in h for h in headings)
    assert any("4. 媒体表现分析" in h for h in headings)
    # Feishu renders at most 5 charts per card.
    assert len(charts) <= 5


def test_trend_chart_groups_both_money_series_with_labels() -> None:
    """消耗 and 流水 as paired bars, value labels on, ROI1 on its own axis.

    VChart only splits a dimension's bars when ``xField`` is an array whose extra
    entry names the grouping field; a single ``xField`` paints both series into
    one slot and hides the second one.
    """
    card = build_briefing_card(BRIEFING_RESULT, name="日报")
    trend = next(
        c for c in _elements(card, "chart") if c["element_id"] == "chart-trend"
    )
    spec = trend["chart_spec"]
    assert spec["type"] == "common"
    assert "direction" not in spec
    datasets = {ds["id"]: ds["values"] for ds in spec["data"]}
    # One 消耗 + one 流水 value per bucket, plus one ROI point per bucket.
    buckets = len(BRIEFING_RESULT["daily"])
    assert len(datasets["amount"]) == 2 * buckets
    assert len(datasets[ROI_SERIES_ID]) == buckets
    # Chart rows run newest-first (the chart reads top-down).
    newest = BRIEFING_RESULT["daily"][0]
    label = newest["date"][-5:]
    assert datasets["amount"][:2] == [
        {
            "周期": label,
            "指标": "消耗（万元）",
            "金额": round(newest["spend"] / 10000, 1),
        },
        {
            "周期": label,
            "指标": "流水（万元）",
            "金额": round(newest["recharge"] / 10000, 1),
        },
    ]
    assert datasets[ROI_SERIES_ID][0]["ROI1"] == round(newest["roi1"] * 100, 1)
    # A constant metric field names the ROI series in the tooltip; without it
    # VChart labels the row with the dimension value.
    assert datasets[ROI_SERIES_ID][0]["指标"] == "ROI1（%）"
    series = {x["id"]: x for x in spec["series"]}
    assert series[ROI_SERIES_ID]["seriesField"] == "指标"
    bars = series["amount"]
    assert bars["type"] == "bar"
    assert bars["xField"] == ["周期", "指标"]  # array = grouped bars
    assert bars["seriesField"] == "指标"
    assert bars["stack"] is False
    # Value labels so the numbers read without hovering.
    assert bars["label"] == {
        "visible": True,
        "position": "top",
        "style": {"fontSize": 11},
    }
    assert series[ROI_SERIES_ID]["type"] == "line"
    assert series[ROI_SERIES_ID]["label"]["visible"] is True
    axes = {axis["orient"]: axis for axis in spec["axes"]}
    assert axes["bottom"]["type"] == "band"
    assert axes["left"]["seriesId"] == ["amount"]
    assert axes["right"]["seriesId"] == [ROI_SERIES_ID]
    assert axes["right"]["grid"]["visible"] is False
    assert "万元" in axes["left"]["title"]["text"]
    assert "ROI1" in axes["right"]["title"]["text"]
    assert spec["tooltip"]["activeType"] == "dimension"
    assert spec["tooltip"]["dimension"]["visible"] is True
    assert "function" not in json.dumps(card)


def test_bar_charts_use_one_series_per_metric() -> None:
    """主游戏 / 媒体 show 消耗 as bars and ROI1 as a line, named by metric.

    Splitting the bars by ROI tier would colour them per datum but rename the
    tooltip rows to 达标/中/低, so the tier read lives in the detail table only.
    """
    card = build_briefing_card(BRIEFING_RESULT, name="日报")
    for element_id, field in (("chart-project", "主游戏"), ("chart-media", "媒体")):
        chart = next(
            c for c in _elements(card, "chart") if c["element_id"] == element_id
        )
        spec = chart["chart_spec"]
        datasets = {ds["id"]: ds["values"] for ds in spec["data"]}
        bars = next(series for series in spec["series"] if series["id"] == "amount")
        assert bars["xField"] == field
        assert bars["yField"] == "消耗"
        assert bars["seriesField"] == "指标"
        # One row per metric: the series name carries the unit.
        assert all(value["指标"] == "消耗（万元）" for value in datasets["amount"])
        assert all(field in value for value in datasets["amount"])
        assert "质量" not in datasets["amount"][0]
        # Bars are one colour; the palette's second entry belongs to the ROI line.
        assert spec["color"] == ["#2b6cb0", "#1f2329"]
    project = next(
        c for c in _elements(card, "chart") if c["element_id"] == "chart-project"
    )
    by_name = {
        v["主游戏"]: v["消耗"]
        for v in next(
            ds["values"] for ds in project["chart_spec"]["data"] if ds["id"] == "amount"
        )
    }
    assert set(by_name) == {"游戏A", "游戏B"}


def test_bar_charts_list_spend_and_roi_in_one_tooltip() -> None:
    """ROI rides as a real line series, so the dimension tooltip shows both."""
    card = build_briefing_card(BRIEFING_RESULT, name="日报")
    for element_id, field in (("chart-project", "主游戏"), ("chart-media", "媒体")):
        chart = next(
            c for c in _elements(card, "chart") if c["element_id"] == element_id
        )
        spec = chart["chart_spec"]
        assert spec["type"] == "common"
        assert spec["tooltip"]["activeType"] == "dimension"
        assert spec["tooltip"]["dimension"]["visible"] is True
        series = {s["id"]: s for s in spec["series"]}
        assert series[ROI_SERIES_ID]["type"] == "line"
        assert series[ROI_SERIES_ID]["seriesField"] == "指标"
        # ROI labels ride on the points, as percentages (unit in the row key).
        assert series[ROI_SERIES_ID]["label"] == {
            "visible": True,
            "position": "top",
            "style": {"fontSize": 11},
        }
        assert series[ROI_SERIES_ID]["xField"] == field
        assert series[ROI_SERIES_ID]["yField"] == "ROI1"
        # Same bar + line combo as the trend chapter.
        assert series[ROI_SERIES_ID]["point"]["visible"] is True
        assert series[ROI_SERIES_ID]["line"]["style"]["stroke"] == "#1f2329"
        # The line sits on its own value axis so the two scales stay apart.
        axes = {axis["orient"]: axis for axis in spec["axes"]}
        assert axes["bottom"]["type"] == "band"
        assert axes["left"]["seriesId"] == ["amount"]
        # The ROI row is named by its metric field as well.
        assert series[ROI_SERIES_ID]["seriesField"] == "指标"
        assert all(
            value["指标"] == "ROI1（%）"
            for value in next(
                d["values"] for d in spec["data"] if d["id"] == ROI_SERIES_ID
            )
        )
        assert axes["right"]["seriesId"] == [ROI_SERIES_ID]
        assert axes["right"]["grid"]["visible"] is False
        roi_values = next(ds["values"] for ds in spec["data"] if ds["id"] == "roi")
        assert roi_values, element_id
        assert all(field in value and "ROI1" in value for value in roi_values)


def test_bars_use_ordinal_tier_colours_and_a_legible_category_count() -> None:
    """Guards issues found by rendering the card charts locally.

    A colour *array* is consumed in data order, which handed 低 the 中 colour
    (the ordinal scale keyed on the quality field pins each tier), and a band
    chart drops every other label once the categories get tight, hence the cap.
    """
    card = build_briefing_card(BRIEFING_RESULT, name="日报")
    for element_id, field in (("chart-project", "主游戏"), ("chart-media", "媒体")):
        chart = next(
            c for c in _elements(card, "chart") if c["element_id"] == element_id
        )
        spec = chart["chart_spec"]
        assert "direction" not in spec
        bars = next(x for x in spec["series"] if x["id"] == "amount")
        assert bars["xField"] == field
        assert bars["yField"] == "消耗"
        assert bars["label"] == {
            "visible": True,
            "position": "top",
            "style": {"fontSize": 11},
        }
        # Bars are one colour: per-datum colours need a tier split, which would
        # rename the tooltip rows to 达标/中/低.
        assert spec["color"] == ["#2b6cb0", "#1f2329"]
        # Bars per chart, and the small axis font that fits a few more labels.
        bars_count = len(next(d["values"] for d in spec["data"] if d["id"] == "amount"))
        assert bars_count <= MAX_BAR_CATEGORIES
        assert spec["axes"][0]["label"]["style"]["fontSize"] == 11
        assert spec["axes"][0]["type"] == "band"


def test_headline_metrics_use_semantic_delta_colours() -> None:
    """Cheaper spend is green, a rising CPA is red, and ROI reads as a %."""
    result = {
        **BRIEFING_RESULT,
        "core": {**BRIEFING_RESULT["core"], "spend": 100.0, "cpa": 30.0},
        "core_previous": {
            **BRIEFING_RESULT["core_previous"],
            "spend": 200.0,
            "cpa": 20.0,
        },
    }
    card = build_briefing_card(result, name="日报")
    rows = [el for el in card["body"]["elements"] if el["tag"] == "column_set"]
    captions = [
        column["elements"][1]["content"] for row in rows for column in row["columns"]
    ]
    spend_caption = next(c for c in captions if "消耗" in c)
    cpa_caption = next(c for c in captions if "CPA" in c)
    # 消耗 fell → good (green); CPA rose → bad (red).
    assert "green" in spend_caption
    assert "red" in cpa_caption
    assert "▼ 50.0%" in spend_caption
    assert "▲ 50.0%" in cpa_caption
    # ROI1 is a ratio: rendered as a percentage rather than a raw 0.15.
    values = [
        column["elements"][0]["content"] for row in rows for column in row["columns"]
    ]
    assert "**15.0%**" in values


def test_tables_are_opt_in() -> None:
    """Sub-tables only travel when the user turns them on."""
    without = build_briefing_card(BRIEFING_RESULT, name="日报")
    assert _elements(without, "table") == []

    with_tables = build_briefing_card(BRIEFING_RESULT, name="日报", include_tables=True)
    tables = _elements(with_tables, "table")
    # 平台 / 分天 / 主游戏 × 渠道 / 媒体 (+媒体组合维度 when present).
    assert 4 <= len(tables) <= 5  # Feishu renders at most 5 tables per card
    for table in tables:
        assert table["rows"], table
        assert 1 <= table["page_size"] <= 10
        assert all(
            set(row) == {col["name"] for col in table["columns"]}
            for row in table["rows"]
        )
    # The platform table carries the headline split, money in 万元 and ROI as a
    # coloured quality tag.
    platform_table = tables[0]
    assert [col["display_name"] for col in platform_table["columns"]][:2] == [
        "平台",
        "消耗(万元)",
    ]
    assert platform_table["rows"][0]["platform"] == "mobile"
    assert platform_table["rows"][0]["spend"] == round(1100 / 10000, 1)
    roi_column = next(
        col for col in platform_table["columns"] if col["display_name"] == "ROI1"
    )
    assert roi_column["data_type"] == "options"
    assert platform_table["rows"][0]["roi1"] == [{"text": "14.0%", "color": "green"}]
    assert platform_table["rows"][0]["spend"] == round(1100 / 10000, 1)
    # 累计ROI travels with every detail table.
    assert any(
        col["display_name"] == "累计ROI" for table in tables for col in table["columns"]
    )
    assert all(table["freeze_first_column"] is True for table in tables)
    # Cells are centred like the report page, and money keeps its unit.
    for table in tables:
        assert all(
            column.get("horizontal_align") == "center" for column in table["columns"]
        )
        # The header row is centred too, and rates read as percentages.
        assert table["header_style"]["text_align"] == "center"
        for column in table["columns"]:
            if column["name"] in ("nr", "pr", "rr"):
                assert column["data_type"] == "text"
        assert all(
            str(cell).endswith("%")
            for row in table["rows"]
            for cell in (row.get("pr"), row.get("nr"), row.get("rr"))
            if cell is not None
        )
        assert any(
            column["display_name"].endswith("(万元)") for column in table["columns"]
        )
        # The LTV series is contiguous from LTV1 and never longer than a week;
        # a single-day window must not grow empty LTV2/LTV3/… columns.
        names = [column["display_name"] for column in table["columns"]]
        ltv = [n for n in names if n.startswith("LTV")]
        assert ltv == [f"LTV{day}" for day in range(1, len(ltv) + 1)]
        assert 1 <= len(ltv) <= 7
    # The media table adds the funnel rates (percentages, not raw ratios).
    media_table = next(t for t in tables if t["columns"][0]["display_name"] == "媒体")
    names = [col["display_name"] for col in media_table["columns"]]
    assert {"1日付费率", "2日留存率", "自然新增%"} <= set(names)
    assert media_table["rows"][0]["pr"] == "3.0%"
    # A media combination dimension rides along when the payload has one; the
    # card leaves the 主游戏 × 渠道 × 日期 expansion to the detail document.
    combo = [t for t in tables if t["columns"][1]["display_name"] == "媒体"]
    assert len(combo) <= 1
    # 媒体 is the secondary dimension; the primary one comes first.
    assert all(t["columns"][0]["display_name"] in ("主游戏", "客户端") for t in combo)
    # Numbers are rounded for display: no 39.803979744936235 in the payload.
    assert all(
        len(str(cell)) <= 12
        for table in tables
        for row in table["rows"]
        for cell in row.values()
        if isinstance(cell, (int, float))
    )


def test_trend_table_is_chronological() -> None:
    card = build_briefing_card(BRIEFING_RESULT, name="日报", include_tables=True)
    daily_table = _elements(card, "table")[1]
    labels = [row["label"] for row in daily_table["rows"]]
    assert labels == sorted(labels)


def test_weekly_card_uses_weekly_wording() -> None:
    result = {
        **BRIEFING_RESULT,
        "report_type": "weekly",
        "period_start": "2026-09-14",
        "period_end": "2026-09-20",
    }
    card = build_briefing_card(result, name="周报", report_type="weekly")
    assert card["header"]["title"]["content"] == "周报简报 · 2026-09-14 ~ 2026-09-20"
    assert any(
        "2. 分周对比" in el.get("content", "") for el in card["body"]["elements"]
    )


def test_card_fits_feishu_byte_budget() -> None:
    """A full card (tables on, 30 trend points) stays under 30 KB."""
    big = {
        **BRIEFING_RESULT,
        "daily": [
            {
                "date": f"2026-08-{day:02d}",
                "label": f"2026-08-{day:02d}",
                "spend": 100000.0 + day,
                "new_users": 4000 + day,
                "recharge": 90000.0 + day,
                "roi1": 0.1234,
            }
            for day in range(1, 31)
        ],
        "projects": [
            {
                "project": f"主游戏{i}",
                "channel": "android",
                "spend": 10000.0 - i,
                "new_users": 100,
                "roi1": 0.2,
                "roi_cum": 1.0,
            }
            for i in range(20)
        ],
        "media": [
            {
                "channel": f"媒体渠道{i}",
                "spend": 5000.0 - i,
                "new_users": 50,
                "cpa": 100.0,
                "roi1": 0.1,
            }
            for i in range(20)
        ],
        "media_platforms": [
            {"channel": f"媒体渠道{i}", "platform": "mobile", "spend": 5000.0 - i}
            for i in range(20)
        ],
    }
    card = build_briefing_card(big, name="日报", include_tables=True)
    fitted, notes = shrink_card(card)
    assert card_bytes(fitted) <= CARD_BYTE_BUDGET
    assert card_bytes(fitted) < MAX_CARD_BYTES
    # Trend points are capped up front, so a normal report never needs trimming.
    trend = next(
        c for c in _elements(fitted, "chart") if c["element_id"] == "chart-trend"
    )
    amounts = next(
        ds["values"] for ds in trend["chart_spec"]["data"] if ds["id"] == "amount"
    )
    assert len(amounts) <= 2 * MAX_TREND_CHART_BUCKETS
    assert isinstance(notes, list)


def test_shrink_card_drops_tables_before_charts() -> None:
    """When the budget is tight the optional tables go first."""
    card = build_briefing_card(BRIEFING_RESULT, name="日报", include_tables=True)
    full_charts = len(_elements(card, "chart"))

    # A mild squeeze only touches the tables; every chart survives.
    mild_budget = card_bytes(card) - 1500
    fitted, notes = shrink_card(card, budget=mild_budget)
    assert card_bytes(fitted) <= mild_budget
    assert notes
    assert any("子表格" in note for note in notes)
    assert len(_elements(fitted, "chart")) == full_charts
    assert len(_elements(fitted, "table")) <= len(_elements(card, "table"))

    # A harder squeeze drops the tables entirely before any chart goes.
    fitted, notes = shrink_card(card, budget=7000)
    assert card_bytes(fitted) <= 7000
    assert _elements(fitted, "table") == []
    table_note = next(i for i, note in enumerate(notes) if "子表格" in note)
    chart_notes = [i for i, note in enumerate(notes) if "图表" in note]
    assert all(table_note < index for index in chart_notes)
    # The headline chapters survive: the metric rows and the main chart stay.
    assert _elements(fitted, "column_set")
    assert _elements(fitted, "chart")


def test_shrink_card_leaves_a_fitting_card_alone() -> None:
    card = build_briefing_card(BRIEFING_RESULT, name="日报", include_tables=True)
    fitted, notes = shrink_card(card)
    assert notes == []
    assert fitted == card


# --------------------------------------------------------------------------- #
# Formatting helpers (mirror the briefing UI)
# --------------------------------------------------------------------------- #


def test_formatters_mirror_frontend() -> None:
    assert format_amount(1234.5) == "1,234.50"
    assert format_amount(None) == "-"
    assert format_count(42.4) == "42"
    assert format_ratio(0.0312) == "3.1%"
    assert format_ratio(None) == "-"
    assert format_delta(120, 100) == "▲ 20.0%"
    assert format_delta(80, 100) == "▼ 20.0%"
    assert format_delta(10, None) == ""
    assert format_delta(10, 0) == ""
