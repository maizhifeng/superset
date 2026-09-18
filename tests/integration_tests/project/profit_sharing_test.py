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
"""Profit sharing only pairs games with channels of the same region."""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from superset import db
from superset.models.channel_metadata import ChannelMetadata
from superset.models.papp_metadata import (
    PappMetadata,
    REGION_DOMESTIC,
    REGION_OVERSEA,
)
from superset.models.profit_sharing import ProfitSharing

PAPP_ID = 990001
DOMESTIC_CHANNEL_KEY = "990001"
OVERSEA_CHANNEL_KEY = "test-ios"
KEYS = [DOMESTIC_CHANNEL_KEY, OVERSEA_CHANNEL_KEY]


@pytest.fixture
def clean_records(app_context: None) -> Iterator[None]:
    def cleanup() -> None:
        db.session.query(ProfitSharing).filter(ProfitSharing.papp_id == PAPP_ID).delete(
            synchronize_session=False
        )
        db.session.query(PappMetadata).filter(PappMetadata.papp_id == PAPP_ID).delete(
            synchronize_session=False
        )
        db.session.query(ChannelMetadata).filter(
            ChannelMetadata.channel_key.in_(KEYS)
        ).delete(synchronize_session=False)
        db.session.commit()

    cleanup()
    yield
    cleanup()


def _whitelist(region: str, papp_name: str, channel_key: str) -> None:
    PappMetadata.upsert(
        PAPP_ID,
        papp_name=papp_name,
        updated_at="2020-01-01",
        白名单控制参数="Y",
        region=region,
    )
    ChannelMetadata.upsert(
        channel_key,
        channel_name=channel_key,
        updated_at="2020-01-01",
        白名单控制参数="Y",
        默认分成="30",
        region=region,
        channel_id=int(channel_key) if channel_key.isdigit() else None,
    )


def test_sync_only_pairs_games_with_channels_of_the_same_region(
    clean_records: None,
) -> None:
    _whitelist(REGION_DOMESTIC, "怒火皇城", DOMESTIC_CHANNEL_KEY)
    _whitelist(REGION_OVERSEA, "妖怪正傳", OVERSEA_CHANNEL_KEY)

    ProfitSharing.sync()

    combos = (
        db.session.query(ProfitSharing).filter(ProfitSharing.papp_id == PAPP_ID).all()
    )
    assert {(combo.region, combo.channel_key) for combo in combos} == {
        (REGION_DOMESTIC, DOMESTIC_CHANNEL_KEY),
        (REGION_OVERSEA, OVERSEA_CHANNEL_KEY),
    }


def test_sync_does_not_cross_regions_when_only_one_side_is_whitelisted(
    clean_records: None,
) -> None:
    # 国内游戏 + 海外渠道：不应生成任何组合
    PappMetadata.upsert(
        PAPP_ID,
        papp_name="怒火皇城",
        updated_at="2020-01-01",
        白名单控制参数="Y",
        region=REGION_DOMESTIC,
    )
    ChannelMetadata.upsert(
        OVERSEA_CHANNEL_KEY,
        channel_name="ios",
        updated_at="2020-01-01",
        白名单控制参数="Y",
        region=REGION_OVERSEA,
    )

    ProfitSharing.sync()

    combos = (
        db.session.query(ProfitSharing).filter(ProfitSharing.papp_id == PAPP_ID).all()
    )
    assert combos == []


def test_sync_can_be_limited_to_one_region(clean_records: None) -> None:
    _whitelist(REGION_DOMESTIC, "怒火皇城", DOMESTIC_CHANNEL_KEY)
    _whitelist(REGION_OVERSEA, "妖怪正傳", OVERSEA_CHANNEL_KEY)

    ProfitSharing.sync(REGION_DOMESTIC)

    combos = (
        db.session.query(ProfitSharing).filter(ProfitSharing.papp_id == PAPP_ID).all()
    )
    assert {(combo.region, combo.channel_key) for combo in combos} == {
        (REGION_DOMESTIC, DOMESTIC_CHANNEL_KEY)
    }
