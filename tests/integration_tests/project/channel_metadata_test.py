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
"""Region scoping for channel configuration.

Domestic channels carry a numeric ``cch_id`` while oversea channels are the
``system`` values of their source table, so both are stored in ``channel_key``
and are only unique within a region.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest

from superset import db
from superset.models.channel_metadata import ChannelMetadata
from superset.models.papp_metadata import REGION_DOMESTIC, REGION_OVERSEA
from superset.models.profit_sharing import ProfitSharing

CHANNEL_IDS = [990001, 990002]
OVERSEA_CHANNEL = "test-ios"


@pytest.fixture
def clean_channels(app_context: None) -> Iterator[None]:
    def cleanup() -> None:
        db.session.query(ProfitSharing).filter(
            ProfitSharing.channel_key.in_(
                [str(channel_id) for channel_id in CHANNEL_IDS] + [OVERSEA_CHANNEL]
            )
        ).delete(synchronize_session=False)
        db.session.query(ChannelMetadata).filter(
            ChannelMetadata.channel_key.in_(
                [str(channel_id) for channel_id in CHANNEL_IDS] + [OVERSEA_CHANNEL]
            )
        ).delete(synchronize_session=False)
        db.session.commit()

    cleanup()
    yield
    cleanup()


def test_bulk_upsert_scopes_channels_by_region(clean_channels: None) -> None:
    count = ChannelMetadata.bulk_upsert(
        REGION_DOMESTIC,
        [
            {
                "channel_key": str(CHANNEL_IDS[0]),
                "channel_id": CHANNEL_IDS[0],
                "channel_name": "官网Appstore",
                "updated_at": "2020-01-01",
            }
        ],
    )
    oversea_count = ChannelMetadata.bulk_upsert(
        REGION_OVERSEA,
        [
            {
                "channel_key": OVERSEA_CHANNEL,
                "channel_id": None,
                "channel_name": OVERSEA_CHANNEL,
                "updated_at": "2021-01-01",
            }
        ],
    )

    assert count == 1
    assert oversea_count == 1
    domestic = ChannelMetadata.get_by_channel_key(str(CHANNEL_IDS[0]), REGION_DOMESTIC)
    oversea = ChannelMetadata.get_by_channel_key(OVERSEA_CHANNEL, REGION_OVERSEA)
    assert domestic is not None
    assert domestic.channel_id == CHANNEL_IDS[0]
    assert oversea is not None
    assert oversea.channel_id is None


def test_bulk_upsert_preserves_defaults_and_skips_blank_keys(
    clean_channels: None,
) -> None:
    ChannelMetadata.upsert(
        OVERSEA_CHANNEL,
        channel_name="ios",
        updated_at="2021-01-01",
        白名单控制参数="Y",
        默认分成="30",
        region=REGION_OVERSEA,
    )

    count = ChannelMetadata.bulk_upsert(
        REGION_OVERSEA,
        [
            {
                "channel_key": OVERSEA_CHANNEL,
                "channel_name": "ios",
                "updated_at": "2022-01-01",
            },
            {"channel_key": "  ", "channel_name": "空白"},
            {"channel_name": "缺少 key"},
        ],
    )

    assert count == 1
    record = ChannelMetadata.get_by_channel_key(OVERSEA_CHANNEL, REGION_OVERSEA)
    assert record is not None
    assert record.updated_at == "2022-01-01"
    assert record.白名单控制参数 == "Y"
    assert record.默认分成 == "30"
