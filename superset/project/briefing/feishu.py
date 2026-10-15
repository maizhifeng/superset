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
"""Feishu push orchestration for briefings.

Owns everything between "a briefing result exists" and "the Feishu channel
sent it": settings normalization/validation, the frontend deep link used by the
card button, the dry-run switch, per-target delivery reporting and the
``last_push`` record.  The transport and card rendering live in
``superset.reports.notifications.feishu`` — this module never talks HTTP to
Feishu directly except to list the groups the bot belongs to.

Settings are stored per briefing configuration (key_value
``daily_report_feishu``) rather than inside the report configuration payload, so
saving the parameter editor cannot drop them:

.. code-block:: json

    {"enabled": true, "msg_type": "interactive", "include_tables": false,
     "targets": [{"receive_id_type": "chat_id", "receive_id": "oc_xxx"}]}
"""

from __future__ import annotations

import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from flask import current_app

from superset.project.briefing.config import normalize_report_type
from superset.project.briefing.html_export import build_briefing_html
from superset.reports.models import ReportRecipients, ReportRecipientType
from superset.reports.notifications.base import NotificationContent
from superset.reports.notifications.exceptions import (
    NotificationParamException,
    NotificationUnprocessableException,
)
from superset.reports.notifications.feishu import (
    DEFAULT_MAX_TRIES,
    DEFAULT_MESSAGE_TYPE,
    DEFAULT_RECEIVE_ID_TYPE,
    feishu_request,
    FeishuNotification,
    INTERACTIVE_MAX_TRIES,
    MESSAGE_TYPES,
    RECEIVE_ID_TYPES,
    tenant_access_token,
)
from superset.utils import json
from superset.utils.core import HeaderDataType

logger = logging.getLogger(__name__)

# Upper bound of push targets per briefing configuration.
MAX_TARGETS = 5
# Publish the complete HTML report as a Feishu document on every push, so the
# card's 「查看明细」 button has somewhere to go.
DEFAULT_INCLUDE_DOC = True
# Send one card per chapter (① 核心指标 ② 分天对比 ③ 主游戏 ④ 媒体).
DEFAULT_SPLIT_CHAPTERS = True

# Human labels for the target types, surfaced by validation messages.
TARGET_LABELS = {
    "chat_id": "群聊",
    "open_id": "用户 open_id",
    "user_id": "用户 user_id",
    "union_id": "用户 union_id",
    "email": "邮箱",
}

CHATS_PATH = "/open-apis/im/v1/chats"
# Cap the group picker: the bot usually belongs to a handful of groups.
MAX_CHAT_PAGES = 3


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ("1", "true", "yes", "on")


# Feishu id prefixes we accept; anything else (an email, a bare user id) is
# passed through untouched.
_FEISHU_ID = re.compile(r"(?:oc|ou|on|un|oi|od)_[A-Za-z0-9_]{2,}")


def clean_receive_id(value: Any) -> str:
    """Reduce a stored target to its bare Feishu id.

    The dialog's group picker shows ``群名（oc_xxx）``; an older build wrote that
    whole label into the setting, and Feishu answers ``code=230001
    invalid receive_id`` for it.  Extracting the id heals such stored values
    without asking the user to edit the setting again.
    """
    raw = str(value or "").strip()
    if not raw:
        return ""
    if re.fullmatch(r"(?:oc|ou|on|un|oi|od)_[A-Za-z0-9_]+", raw):
        return raw
    matches = _FEISHU_ID.findall(raw)
    return matches[-1] if matches else raw


def normalize_settings(raw: dict[str, Any] | None) -> dict[str, Any]:
    """Fold stored/requested settings into the canonical shape.

    Unknown keys are dropped and scalars are coerced, so a malformed stored
    payload can never crash a scheduled push.
    """
    raw = raw if isinstance(raw, dict) else {}
    targets: list[dict[str, str]] = []
    for item in raw.get("targets") or []:
        if not isinstance(item, dict):
            continue
        receive_id_type = str(
            item.get("receive_id_type") or item.get("type") or DEFAULT_RECEIVE_ID_TYPE
        ).strip()
        receive_id = clean_receive_id(item.get("receive_id") or item.get("id"))
        if not receive_id:
            continue
        targets.append({"receive_id_type": receive_id_type, "receive_id": receive_id})
    msg_type = str(raw.get("msg_type") or DEFAULT_MESSAGE_TYPE)
    return {
        "enabled": _as_bool(raw.get("enabled")),
        "msg_type": msg_type if msg_type in MESSAGE_TYPES else DEFAULT_MESSAGE_TYPE,
        "include_tables": _as_bool(raw.get("include_tables")),
        # Export the complete HTML report to a Feishu document on every push,
        # so the card's 「查看明细」 button has somewhere to go.
        "include_doc": _as_bool(raw.get("include_doc"), DEFAULT_INCLUDE_DOC),
        # One message per chapter by default: each card then has the full 30 KB.
        "split_chapters": _as_bool(raw.get("split_chapters"), DEFAULT_SPLIT_CHAPTERS),
        "targets": targets[:MAX_TARGETS],
    }


def validate_settings(raw: dict[str, Any] | None) -> list[str]:
    """Return human-readable validation errors (empty when the input is valid).

    ``enabled`` without any target is rejected: a scheduled push that has
    nowhere to go is a configuration mistake, not a no-op.
    """
    raw = raw if isinstance(raw, dict) else {}
    errors: list[str] = []
    msg_type = raw.get("msg_type")
    if msg_type is not None and str(msg_type) not in MESSAGE_TYPES:
        errors.append(f"消息类型仅支持 {'/'.join(MESSAGE_TYPES)}")
    raw_targets = raw.get("targets")
    if raw_targets is not None and not isinstance(raw_targets, list):
        errors.append("targets 必须是数组")
        raw_targets = []
    targets = raw_targets or []
    if len(targets) > MAX_TARGETS:
        errors.append(f"最多配置 {MAX_TARGETS} 个推送目标")
    for index, item in enumerate(targets, start=1):
        if not isinstance(item, dict):
            errors.append(f"第 {index} 个目标格式不正确")
            continue
        receive_id_type = str(
            item.get("receive_id_type") or item.get("type") or DEFAULT_RECEIVE_ID_TYPE
        ).strip()
        receive_id = clean_receive_id(item.get("receive_id") or item.get("id"))
        if receive_id_type not in RECEIVE_ID_TYPES:
            errors.append(
                f"第 {index} 个目标类型不支持：{receive_id_type}"
                f"（可选 {'/'.join(RECEIVE_ID_TYPES)}）"
            )
        if not receive_id:
            errors.append(f"第 {index} 个目标不能为空")
    if _as_bool(raw.get("enabled")) and not targets:
        errors.append("启用定时推送前请先配置至少一个目标")
    return errors


def is_enabled(settings: dict[str, Any] | None) -> bool:
    """True when settings ask for scheduled pushes and have a destination."""
    normalized = normalize_settings(settings)
    return bool(normalized["enabled"] and normalized["targets"])


# --------------------------------------------------------------------------- #
# Deployment status
# --------------------------------------------------------------------------- #


def credentials() -> tuple[str, str, str, int] | None:
    """Return ``(app_id, app_secret, api_base, timeout)`` or None."""
    config = current_app.config
    app_id = str(config.get("FEISHU_APP_ID") or "").strip()
    app_secret = str(config.get("FEISHU_APP_SECRET") or "").strip()
    if not app_id or not app_secret:
        return None
    api_base = str(config.get("FEISHU_API_BASE") or "https://open.feishu.cn").rstrip(
        "/"
    )
    timeout = int(config.get("FEISHU_REQUEST_TIMEOUT") or 30)
    return app_id, app_secret, api_base, timeout


def app_status() -> dict[str, Any]:
    """Non-secret view of the deployed app configuration for the UI."""
    resolved = credentials()
    if resolved is None:
        return {"app_configured": False, "app_id_masked": "", "api_base": ""}
    app_id, _secret, api_base, _timeout = resolved
    masked = f"{app_id[:6]}****" if len(app_id) > 6 else "****"
    return {"app_configured": True, "app_id_masked": masked, "api_base": api_base}


def scheduled_dry_run() -> bool:
    """Whether *scheduled* pushes are dry runs.

    ``BRIEFING_FEISHU_DRY_RUN`` overrides the global
    ``ALERT_REPORTS_NOTIFICATION_DRY_RUN`` when set, so Feishu pushes can be
    live while email notifications stay in dry run.
    """
    if (override := current_app.config.get("BRIEFING_FEISHU_DRY_RUN")) is not None:
        return _as_bool(override)
    return _as_bool(current_app.config.get("ALERT_REPORTS_NOTIFICATION_DRY_RUN"))


def frontend_url(config_id: int) -> str:
    """Deep link to a briefing's detail page, used by the card button."""
    base = str(current_app.config.get("BRIEFING_FRONTEND_BASE_URL") or "").strip()
    if not base:
        base = str(
            current_app.config.get("WEBDRIVER_BASEURL_USER_FRIENDLY") or ""
        ).strip()
    if not base:
        return ""
    return f"{base.rstrip('/')}/briefing/{config_id}"


# --------------------------------------------------------------------------- #
# Pushing
# --------------------------------------------------------------------------- #


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _header_data(config_id: int) -> HeaderDataType:
    """Minimal execution header for a manually triggered push."""
    return {
        "notification_format": "TEXT",
        "editors": [],
        "notification_type": "Report",
        "notification_source": "briefing",
        "chart_id": None,
        "dashboard_id": None,
        "slack_channels": None,
        "execution_id": f"briefing-push-{config_id}-{uuid4().hex[:8]}",
    }


# Feishu rejects an import result document whose title is longer than this.
MAX_DOC_TITLE = 60
# How long we wait for the HTML → docx import task (seconds).
IMPORT_TIMEOUT = 60
IMPORT_POLL_SECONDS = 2


def _drive_root_token(api_base: str, headers: dict[str, str], timeout: int) -> str:
    """The Drive folder exports land in: a shared folder, else the app's root."""
    # Config first, then the process environment, so the folder can be set from
    # docker compose without rebuilding the image.
    configured = current_app.config.get("FEISHU_DOC_FOLDER_TOKEN") or os.environ.get(
        "FEISHU_DOC_FOLDER_TOKEN"
    )
    if configured:
        return str(configured)
    meta = feishu_request(
        "GET",
        f"{api_base}/open-apis/drive/explorer/v2/root_folder/meta",
        timeout=timeout,
        headers=headers,
    )
    return str(((meta or {}).get("data") or {}).get("token") or "")


def _file_browser_url(
    api_base: str, headers: dict[str, str], timeout: int, file_token: str
) -> str:
    """The Drive file's browser URL (tenant host), or the configured base."""
    try:
        meta = feishu_request(
            "POST",
            f"{api_base}/open-apis/drive/v1/metas/batch_query",
            timeout=timeout,
            json_body={"request_docs": [{"doc_token": file_token, "doc_type": "file"}]},
            headers=headers,
        )
        metas = ((meta or {}).get("data") or {}).get("metas") or []
        for item in metas:
            url = str(item.get("url") or item.get("url_token") or "")
            if url.startswith("http"):
                return url
    except Exception as ex:  # noqa: BLE001 - fall back to the configured host
        logger.warning("简报文件链接获取失败：%s", ex)
    return _web_file_url("", file_token)


def _web_file_url(doc_url: str, file_token: str) -> str:
    """The Drive file's browser URL, on the tenant's own web host."""
    if not file_token:
        return ""
    if configured := str(current_app.config.get("FEISHU_WEB_BASE") or "").rstrip("/"):
        return f"{configured}/file/{file_token}"
    if doc_url.startswith("http"):
        origin = "/".join(doc_url.split("/")[:3])
        return f"{origin}/file/{file_token}"
    return ""


# Report recipient types → Drive permission member types.
PERMISSION_MEMBER_TYPES = {
    "chat_id": "openchat",
    "open_id": "openid",
    "user_id": "userid",
    "union_id": "unionid",
    "email": "email",
}


def _chat_member_ids(
    api_base: str,
    headers: dict[str, str],
    timeout: int,
    chat_id: str,
) -> list[str]:
    """Every member of a group, as open ids (paged)."""
    ids: list[str] = []
    page_token: str | None = None
    for _ in range(10):  # 1000 members is far beyond a report target
        params: dict[str, Any] = {"member_id_type": "open_id", "page_size": 100}
        if page_token:
            params["page_token"] = page_token
        res = feishu_request(
            "GET",
            f"{api_base}/open-apis/im/v1/chats/{chat_id}/members",
            timeout=timeout,
            params=params,
            headers=headers,
        )
        data = (res or {}).get("data") or {}
        for item in data.get("items") or []:
            member_id = str(item.get("member_id") or "")
            if member_id:
                ids.append(member_id)
        page_token = data.get("page_token")
        if not data.get("has_more") or not page_token:
            break
    return ids


def _permission_members(
    api_base: str,
    headers: dict[str, str],
    timeout: int,
    targets: list[dict[str, str]],
) -> list[tuple[str, str]]:
    """The ``(member_type, member_id)`` pairs to grant ``view`` on an export.

    A group cannot be added as a document member (Feishu answers ``1063002
    Permission denied``), so a ``chat_id`` target is expanded to the group's
    members instead — which also keeps link sharing switched off.
    """
    members: list[tuple[str, str]] = []
    for target in targets:
        receive_type = str(target.get("receive_id_type") or "")
        receive_id = clean_receive_id(target.get("receive_id"))
        if not receive_id:
            continue
        if receive_type == "chat_id":
            try:
                members.extend(
                    ("openid", member)
                    for member in _chat_member_ids(
                        api_base, headers, timeout, receive_id
                    )
                )
            except Exception as ex:  # noqa: BLE001 - best effort
                logger.warning(
                    "简报文档授权失败（无法读取群成员 %s）：%s", receive_id, ex
                )
            continue
        member_type = PERMISSION_MEMBER_TYPES.get(receive_type)
        if member_type:
            members.append((member_type, receive_id))
    # De-duplicate while keeping the order stable.
    seen: set[tuple[str, str]] = set()
    unique: list[tuple[str, str]] = []
    for pair in members:
        if pair not in seen:
            seen.add(pair)
            unique.append(pair)
    return unique


def _share_document(
    api_base: str,
    headers: dict[str, str],
    timeout: int,
    doc_token: str,
    targets: list[dict[str, str]],
    *,
    file_type: str = "docx",
) -> None:
    """Share the exported object with the push targets, and only them.

    Link sharing is explicitly switched off — the object is visible to the
    configured targets, not to the whole tenant.
    """
    try:
        feishu_request(
            "PATCH",
            f"{api_base}/open-apis/drive/v1/permissions/{doc_token}/public",
            timeout=timeout,
            params={"type": file_type},
            json_body={"link_share_entity": "closed"},
            headers=headers,
        )
    except Exception as ex:  # noqa: BLE001 - best effort
        logger.warning("简报文档关闭链接分享失败：%s", ex)
    for member_type, member_id in _permission_members(
        api_base, headers, timeout, targets
    ):
        try:
            feishu_request(
                "POST",
                f"{api_base}/open-apis/drive/v1/permissions/{doc_token}/members",
                timeout=timeout,
                params={"type": file_type, "need_notification": "false"},
                json_body={
                    "member_type": member_type,
                    "member_id": member_id,
                    "perm": "view",
                },
                headers=headers,
            )
        except Exception as ex:  # noqa: BLE001 - one target must not stop the rest
            logger.warning("简报文档授权失败（%s）：%s", member_id, ex)


def publish_briefing_doc(
    html_text: str,
    *,
    title: str,
    targets: list[dict[str, str]] | None = None,
) -> dict[str, str] | None:
    """Upload an exported briefing HTML and import it as a Feishu document.

    Returns ``{"doc_url", "html_url", "doc_token"}`` or ``None`` when the
    deployment has no Feishu credentials or the tenant refuses the import — the
    card then simply ships without the 「查看明细」 button.  The uploaded HTML is
    left in Drive next to the document so the interactive version stays
    reachable.
    """
    creds = credentials()
    if not creds:
        return None
    app_id, app_secret, api_base, timeout = creds
    try:
        token = tenant_access_token(app_id, app_secret, api_base, timeout)
    except Exception as ex:  # noqa: BLE001 - the push must not fail for this
        logger.warning("简报文档导出失败（获取 token）：%s", ex)
        return None
    headers = {"Authorization": f"Bearer {token}"}
    file_name = f"{title[:MAX_DOC_TITLE]}.html"
    raw = html_text.encode("utf-8")
    try:
        folder = _drive_root_token(api_base, headers, timeout)
        import requests  # noqa: PLC0415 - only needed for the multipart upload

        uploaded = requests.post(
            f"{api_base}/open-apis/drive/v1/files/upload_all",
            headers=headers,
            data={
                "file_name": file_name,
                "parent_type": "explorer",
                "parent_node": folder,
                "size": str(len(raw)),
            },
            files={"file": (file_name, raw, "text/html")},
            timeout=timeout,
        ).json()
        file_token = ((uploaded or {}).get("data") or {}).get("file_token")
        if not file_token:
            logger.warning("简报文档导出失败（上传）：%s", uploaded)
            return None
        # The HTML file is the 查看明细 target: it opens in the browser with the
        # interactive charts, so there is no docx import to wait for.  Its
        # browser URL comes from the Drive metadata (tenant host).
        html_url = _file_browser_url(api_base, headers, timeout, file_token)
        _share_document(
            api_base,
            headers,
            timeout,
            file_token,
            targets or [],
            file_type="file",
        )
        return {
            "doc_url": "",
            "html_url": html_url,
            "doc_token": file_token,
        }
    except Exception as ex:  # noqa: BLE001 - best effort, the card still ships
        logger.warning("简报明细导出失败：%s", ex)
        return None


def _send_one(
    target: dict[str, str],
    content: NotificationContent,
    *,
    config_id: int,
    kind: str,
    normalized: dict[str, Any],
    label: str,
    tries: int,
) -> tuple[dict[str, Any], str | None]:
    """Send one target's card; returns its entry and any failure kind."""
    recipient = ReportRecipients(
        type=ReportRecipientType.FEISHU,
        recipient_config_json=json.dumps(
            {
                "targets": [target],
                "msg_type": normalized["msg_type"],
                "include_tables": normalized["include_tables"],
            }
        ),
    )
    notification = FeishuNotification(recipient, content, max_tries=tries)
    try:
        notification.send()
    except NotificationParamException as ex:
        logger.warning("Briefing Feishu push rejected: %s - %s", label, ex)
        return {"target": label, "ok": False, "message": str(ex)}, "param"
    except (NotificationUnprocessableException, Exception) as ex:  # noqa: BLE001
        logger.warning("Briefing Feishu push failed: %s - %s", label, ex)
        return {"target": label, "ok": False, "message": str(ex)}, "transient"
    entry: dict[str, Any] = {"target": label, "ok": True, "message": ""}
    if trim_notes := getattr(notification, "trim_notes", None) or []:
        entry["trimmed"] = list(trim_notes)
    logger.info("Briefing %s pushed to Feishu %s (%s)", config_id, label, kind)
    return entry, None


def _push_outcome(
    sent: list[dict[str, Any]],
    *,
    dry: bool,
    error_kind: str | None,
    doc_url: str | None,
    html_url: str | None = None,
) -> dict[str, Any]:
    """Fold the per-target results into the recorded push outcome."""
    ok = all(entry["ok"] for entry in sent)
    error = None
    if not ok:
        error = "；".join(
            f"{entry['target']} → {entry['message']}"
            for entry in sent
            if not entry["ok"]
        )
    return {
        "ok": ok,
        "dry_run": dry,
        "error": error,
        "error_kind": error_kind,
        # The complete HTML report as a Feishu document (None when the export
        # failed or was disabled); the card links its 「查看明细」 button here,
        # plus the raw interactive HTML file kept in Drive.
        "doc_url": doc_url,
        "html_url": html_url,
        "sent": sent,
    }


def _export_detail_doc(
    result: dict[str, Any],
    *,
    label: str,
    targets: list[dict[str, str]] | None = None,
) -> dict[str, str] | None:
    """Export the complete HTML report to a Feishu document (best effort)."""
    try:
        report_type = normalize_report_type(result.get("report_type"))
        html_text = build_briefing_html(result, name=label, report_type=report_type)
        date = result.get("report_date") or ""
        return publish_briefing_doc(
            html_text,
            title=f"{label}明细 · {date}".strip(),
            targets=targets,
        )
    except Exception as ex:  # noqa: BLE001 - a failed export never blocks the card
        logger.warning("简报明细文档生成失败：%s", ex)
        return None


def push_result(
    config_id: int,
    result: dict[str, Any],
    *,
    kind: str,
    name: str | None = None,
    settings: dict[str, Any] | None = None,
    dry_run: bool | None = None,
    max_tries: int | None = None,
) -> dict[str, Any]:
    """Push one briefing result to every configured Feishu target.

    Returns (and records as ``last_push``) a per-target outcome:

    .. code-block:: json

        {"ok": true, "dry_run": false, "error": null, "error_kind": null,
         "doc_url": "https://…/docx/…",
         "sent": [{"target": "chat_id:oc_xxx", "ok": true, "message": ""}]}

    ``error_kind`` is ``"param"`` for configuration/credential problems and
    ``"transient"`` when Feishu was unavailable, so callers can map it onto an
    HTTP status.  Targets are pushed one by one so a failing destination does
    not hide the state of the others.  Raises ``NotificationParamException``
    when there is nothing to push to.
    """
    normalized = normalize_settings(
        settings if settings is not None else _load_settings(config_id)
    )
    targets = normalized["targets"]
    if not targets:
        raise NotificationParamException(
            "未配置飞书推送目标，请先在飞书推送设置里添加目标"
        )

    dry = scheduled_dry_run() if dry_run is None else dry_run
    tries = max_tries if max_tries is not None else DEFAULT_MAX_TRIES
    label = name or f"简报 #{config_id}"
    # The complete HTML report is exported to a Feishu document first, so the
    # card can offer its 「查看明细」 button.  Best effort: a failing export never
    # blocks the card.
    export: dict[str, str] | None = (
        _export_detail_doc(result, label=label, targets=normalized["targets"])
        if not dry and normalized["include_doc"] and result
        else None
    )
    content = NotificationContent(
        name=label,
        header_data=_header_data(config_id),
        briefing_result=result,
        briefing_detail_url=(export or {}).get("doc_url"),
        briefing_html_url=(export or {}).get("html_url"),
        briefing_split_chapters=bool(normalized["split_chapters"]),
        url=frontend_url(config_id),
        description="",
    )

    sent: list[dict[str, Any]] = []
    error_kind: str | None = None
    doc_url = (export or {}).get("doc_url")
    html_url = (export or {}).get("html_url")
    for target in targets:
        target_label = f"{target['receive_id_type']}:{target['receive_id']}"
        if dry:
            sent.append(
                {
                    "target": target_label,
                    "ok": True,
                    "message": "试运行：未实际发送",
                }
            )
            continue
        entry, kind_failed = _send_one(
            target,
            content,
            config_id=config_id,
            kind=kind,
            normalized=normalized,
            label=target_label,
            tries=tries,
        )
        sent.append(entry)
        error_kind = error_kind or kind_failed

    outcome = _push_outcome(
        sent, dry=dry, error_kind=error_kind, doc_url=doc_url, html_url=html_url
    )
    _record(config_id, outcome, kind=kind)
    return outcome


def _load_settings(config_id: int) -> dict[str, Any] | None:
    from superset.project.briefing.store import get_feishu_settings

    return get_feishu_settings(config_id)


def _record(config_id: int, outcome: dict[str, Any], *, kind: str) -> None:
    """Persist the delivery outcome; a storage failure must not fail the push."""
    from superset.project.briefing.store import record_last_push

    try:
        record_last_push(
            config_id,
            {
                "at": _now(),
                "ok": outcome["ok"],
                "kind": kind,
                "dry_run": outcome["dry_run"],
                "message": outcome.get("error") or "",
            },
        )
    except Exception:  # noqa: BLE001
        logger.exception("Failed to record Feishu push outcome for %s", config_id)


def push_scheduled(
    config_id: int, result: dict[str, Any], *, name: str | None = None
) -> dict[str, Any] | None:
    """Push a scheduled briefing run, or return None when not configured.

    Never raises: a broken Feishu target must not turn a successfully generated
    briefing into a failed schedule (the result is already persisted by then).
    """
    try:
        settings = _load_settings(config_id)
    except Exception:  # noqa: BLE001
        logger.exception("Failed to load Feishu settings for briefing %s", config_id)
        return None
    if not is_enabled(settings):
        return None
    try:
        return push_result(
            config_id,
            result,
            kind="schedule",
            name=name,
            settings=settings,
            max_tries=DEFAULT_MAX_TRIES,
        )
    except Exception:  # noqa: BLE001
        logger.exception("Scheduled Feishu push failed for briefing %s", config_id)
        return None


def push_test(
    config_id: int,
    result: dict[str, Any],
    *,
    settings: dict[str, Any] | None = None,
    name: str | None = None,
) -> dict[str, Any]:
    """Push the latest generated briefing to the targets being configured.

    Sends exactly what a scheduled push would send — the real report, never
    fabricated numbers — so the dialog can verify a target without inventing
    content.  Uses the caller's (possibly unsaved) settings, sends for real and
    never retries, so the dialog answers immediately.
    """
    return push_result(
        config_id,
        result,
        kind="test",
        name=name,
        settings=settings
        if settings is not None
        else (_load_settings(config_id) or {}),
        dry_run=False,
        max_tries=INTERACTIVE_MAX_TRIES,
    )


# A scheduled briefing is generated at most once a day, so a stored result
# older than this is reported as stale in the settings dialog.
STALE_AFTER_HOURS = 26


def latest_result_meta(config_id: int) -> dict[str, Any] | None:
    """Describe the briefing result a push would send, for the settings UI.

    ``stale`` is true when the stored result is older than a day (a daily
    briefing is generated at most once a day) or, for a daily report, when its
    ``report_date`` is not the last complete day in the schedule's timezone.
    The dialog warns about it instead of silently pushing old numbers.
    """
    from superset.project.briefing.store import get_latest_result

    result = get_latest_result(config_id)
    if result is None:
        return None

    report_type = normalize_report_type(result.get("report_type"))
    finished_at = _parse_timestamp(result.get("finished_at"))
    now = datetime.now(timezone.utc)
    age_hours = (
        round((now - finished_at).total_seconds() / 3600, 1)
        if finished_at is not None
        else None
    )
    meta: dict[str, Any] = {
        "report_date": result.get("report_date"),
        "report_type": report_type,
        "finished_at": result.get("finished_at"),
        "job_id": result.get("job_id"),
        "source": result.get("source"),
        "points": len(result.get("daily") or []),
        "alerts": len(result.get("alerts") or []),
        "has_media_platforms": bool(result.get("media_platforms")),
        "age_hours": age_hours,
        "stale": bool(age_hours is not None and age_hours > STALE_AFTER_HOURS),
    }
    if report_type != "daily":
        return meta

    expected = _expected_report_date(config_id)
    meta["expected_report_date"] = expected
    if meta["report_date"] and meta["report_date"] != expected:
        meta["stale"] = True
    return meta


def _parse_timestamp(value: Any) -> datetime | None:
    """Parse a stored ISO timestamp, treating naive values as UTC."""
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _expected_report_date(config_id: int) -> str:
    """The day a daily briefing run now would report on, per its schedule."""
    schedule = _briefing_schedule(config_id)
    timezone_name = (schedule.timezone if schedule is not None else None) or "UTC"
    try:
        import pytz

        now = datetime.now(pytz.timezone(timezone_name))
    except Exception:  # noqa: BLE001 - unknown zone falls back to UTC
        now = datetime.now(timezone.utc)
    return (now - timedelta(days=1)).date().isoformat()


def _briefing_schedule(config_id: int) -> Any | None:
    """The native schedule attached to a briefing config, when one exists."""
    try:
        from superset.project.briefing.api import _briefing_schedules_by_config

        return _briefing_schedules_by_config().get(config_id)
    except Exception:  # noqa: BLE001 - the picker is a convenience, never fatal
        logger.exception("Failed to resolve the briefing schedule for %s", config_id)
        return None


# --------------------------------------------------------------------------- #
# Group picker
# --------------------------------------------------------------------------- #


def list_bot_chats() -> dict[str, Any]:
    """List the group chats the app's bot belongs to.

    Returns ``{"available": bool, "reason": str, "chats": [...]}``.  Missing
    credentials or a missing ``im:chat:read`` scope degrade into
    ``available: false`` plus a readable reason — the settings dialog then asks
    for a ``chat_id`` manually instead of failing.
    """
    resolved = credentials()
    if resolved is None:
        return {
            "available": False,
            "reason": "未配置飞书应用凭证（FEISHU_APP_ID / FEISHU_APP_SECRET）",
            "chats": [],
        }
    app_id, app_secret, api_base, timeout = resolved
    try:
        token = tenant_access_token(app_id, app_secret, api_base, timeout)
    except (NotificationParamException, NotificationUnprocessableException) as ex:
        return {"available": False, "reason": ex.message, "chats": []}

    chats: list[dict[str, str]] = []
    page_token: str | None = None
    try:
        for _ in range(MAX_CHAT_PAGES):
            payload = feishu_request(
                "GET",
                f"{api_base}{CHATS_PATH}",
                params={
                    "page_size": 100,
                    **({"page_token": page_token} if page_token else {}),
                },
                headers={"Authorization": f"Bearer {token}"},
                timeout=timeout,
            )
            data = payload.get("data") or {}
            for item in data.get("items") or []:
                if not isinstance(item, dict):
                    continue
                chats.append(
                    {
                        "chat_id": str(item.get("chat_id") or ""),
                        "name": str(item.get("name") or ""),
                    }
                )
            if not data.get("has_more"):
                break
            page_token = data.get("page_token")
            if not page_token:
                break
    except (NotificationParamException, NotificationUnprocessableException) as ex:
        return {"available": False, "reason": ex.message, "chats": chats}

    chats = [chat for chat in chats if chat["chat_id"]]
    return {"available": True, "reason": "", "chats": chats}
