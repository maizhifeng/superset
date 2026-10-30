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

import pytest

from superset.project.bi import snapshots


def test_invalid_topic_ids_are_ignored() -> None:
    assert snapshots.get_snapshot("../etc/passwd") is None
    assert snapshots.get_snapshot("__probe__") is None
    assert snapshots.get_snapshot("cost") is None


def test_save_rejects_invalid_topic_ids() -> None:
    with pytest.raises(ValueError, match="invalid topic"):
        snapshots.save_snapshot("__probe__", {}, {})


def test_save_rejects_oversized_payloads(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(snapshots, "MAX_SNAPSHOT_BYTES", 16)
    with pytest.raises(ValueError, match="too large"):
        snapshots.save_snapshot("cost", {}, {"rows": ["x" * 100]})
