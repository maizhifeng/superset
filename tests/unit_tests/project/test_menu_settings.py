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

from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock, patch

import pytest

from superset.project.menu import store
from superset.project.menu.api import _is_admin


def _payload() -> dict[str, Any]:
    return {
        "items": [
            {
                "id": "dashboards",
                "path": "/dashboard/list",
                "label": "仪表板",
                "builtIn": True,
            },
            {
                "id": "charts",
                "path": "/chart/list",
                "label": "图表",
                "unknown": "dropped",
            },
        ],
        "enabled": {"dashboards": True, "charts": False},
    }


def _session_returning(entry: Any) -> MagicMock:
    session = MagicMock()
    latest = session.query.return_value.filter.return_value.order_by.return_value
    latest.first.return_value = entry
    return session


def test_normalize_menu_settings_strips_unknown_fields() -> None:
    result = store.normalize_menu_settings(_payload())
    assert result["items"][0] == {
        "id": "dashboards",
        "path": "/dashboard/list",
        "label": "仪表板",
        "builtIn": True,
    }
    assert result["items"][1] == {
        "id": "charts",
        "path": "/chart/list",
        "label": "图表",
    }
    assert result["enabled"] == {"dashboards": True, "charts": False}


def test_normalize_menu_settings_keeps_roles() -> None:
    result = store.normalize_menu_settings(
        {
            "items": [
                {
                    "id": "project_config",
                    "path": "/project/settings",
                    "label": "项目配置",
                    "roles": ["Admin"],
                }
            ],
            "enabled": {},
        }
    )
    assert result["items"][0]["roles"] == ["Admin"]


@pytest.mark.parametrize(
    "payload",
    [
        None,
        [],
        "not-an-object",
        {"enabled": {}},
        {"items": []},
        {"items": {}, "enabled": {}},
        {"items": [], "enabled": {"dashboards": "yes"}},
        {"items": [{"id": "", "path": "/a", "label": "x"}], "enabled": {}},
        {"items": [{"id": "a", "path": "no-slash", "label": "x"}], "enabled": {}},
        {"items": [{"id": "a", "path": "/a", "label": ""}], "enabled": {}},
        {"items": [{"id": "a", "path": "/a"}], "enabled": {}},
    ],
)
def test_normalize_menu_settings_rejects_invalid(payload: Any) -> None:
    with pytest.raises(ValueError, match=r"\S"):
        store.normalize_menu_settings(payload)


def test_decode_roundtrip() -> None:
    payload = {"items": [], "enabled": {"dashboards": True}}
    assert store._decode(store._encode(payload)) == payload


def test_decode_returns_empty_for_invalid_payloads() -> None:
    assert store._decode(b"not-json") == {}
    assert store._decode(b"[1, 2]") == {}


def test_get_menu_settings_returns_none_without_row() -> None:
    session = _session_returning(None)
    with patch("superset.project.menu.store.db.session", session):
        assert store.get_menu_settings() is None


def test_get_menu_settings_decodes_latest_row() -> None:
    entry = SimpleNamespace(value=store._encode(_payload()))
    session = _session_returning(entry)
    with patch("superset.project.menu.store.db.session", session):
        result = store.get_menu_settings()
    assert result is not None
    assert result["enabled"] == {"dashboards": True, "charts": False}


def test_save_menu_settings_inserts_when_missing() -> None:
    session = _session_returning(None)
    with patch("superset.project.menu.store.db.session", session):
        result = store.save_menu_settings(_payload(), user_id=7)
    assert result["enabled"]["charts"] is False
    session.add.assert_called_once()
    session.commit.assert_called_once()


def test_save_menu_settings_updates_existing_row() -> None:
    entry = SimpleNamespace(value=b"", changed_on=None, changed_by_fk=None)
    session = _session_returning(entry)
    with patch("superset.project.menu.store.db.session", session):
        store.save_menu_settings(_payload(), user_id=7)
    assert entry.changed_by_fk == 7
    session.add.assert_not_called()
    session.commit.assert_called_once()


def test_is_admin_matches_admin_role() -> None:
    user = SimpleNamespace(roles=[SimpleNamespace(name="Admin")])
    assert _is_admin(user) is True


def test_is_admin_rejects_other_roles() -> None:
    assert _is_admin(SimpleNamespace(roles=[SimpleNamespace(name="Gamma")])) is False
    assert _is_admin(SimpleNamespace(roles=[])) is False
