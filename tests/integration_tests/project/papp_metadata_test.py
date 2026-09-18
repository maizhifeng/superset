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
"""Region scoping for game configuration.

Domestic and oversea games come from different source tables and may reuse the
same ``papp_id`` with different names, so game rows are keyed by region.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from superset import db
from superset.models.papp_metadata import (
    PappMetadata,
    REGION_DOMESTIC,
    REGION_OVERSEA,
)
from superset.models.profit_sharing import ProfitSharing

# Distinctive ids so the shared test database keeps its other fixtures intact.
COLLIDING_PAPP_ID = 990001
GAME_IDS = [COLLIDING_PAPP_ID, 990002]


@pytest.fixture
def clean_games(app_context: None) -> Iterator[None]:
    def cleanup() -> None:
        db.session.query(ProfitSharing).filter(
            ProfitSharing.papp_id.in_(GAME_IDS)
        ).delete(synchronize_session=False)
        db.session.query(PappMetadata).filter(
            PappMetadata.papp_id.in_(GAME_IDS)
        ).delete(synchronize_session=False)
        db.session.commit()

    cleanup()
    yield
    cleanup()


def test_bulk_upsert_keeps_same_papp_id_apart_per_region(
    clean_games: None,
) -> None:
    PappMetadata.bulk_upsert(
        REGION_DOMESTIC,
        [
            {
                "papp_id": COLLIDING_PAPP_ID,
                "papp_name": "怒火皇城",
                "updated_at": "2020-03-25",
            }
        ],
    )
    PappMetadata.bulk_upsert(
        REGION_OVERSEA,
        [
            {
                "papp_id": COLLIDING_PAPP_ID,
                "papp_name": "妖怪正傳",
                "updated_at": "2020-10-10",
            }
        ],
    )

    domestic = PappMetadata.get_by_papp_id(COLLIDING_PAPP_ID, REGION_DOMESTIC)
    oversea = PappMetadata.get_by_papp_id(COLLIDING_PAPP_ID, REGION_OVERSEA)
    assert domestic is not None
    assert domestic.papp_name == "怒火皇城"
    assert oversea is not None
    assert oversea.papp_name == "妖怪正傳"


def test_bulk_upsert_preserves_whitelist_and_skips_invalid_rows(
    clean_games: None,
) -> None:
    PappMetadata.upsert(
        COLLIDING_PAPP_ID,
        papp_name="旧名字",
        updated_at="2020-01-01",
        白名单控制参数="Y",
        region=REGION_OVERSEA,
    )

    count = PappMetadata.bulk_upsert(
        REGION_OVERSEA,
        [
            {
                "papp_id": COLLIDING_PAPP_ID,
                "papp_name": "新名字",
                "updated_at": "2021-01-01",
            },
            {"papp_id": None, "papp_name": "缺少 id"},
            {"papp_name": "缺少 id"},
        ],
    )

    assert count == 1
    record = PappMetadata.get_by_papp_id(COLLIDING_PAPP_ID, REGION_OVERSEA)
    assert record is not None
    assert record.papp_name == "新名字"
    assert record.白名单控制参数 == "Y"
