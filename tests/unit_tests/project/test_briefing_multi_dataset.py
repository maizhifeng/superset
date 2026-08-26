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

"""Multi-dataset briefing support: id selection and frame canonicalization."""

from __future__ import annotations

import pandas as pd

from superset.project.briefing.config import DailyReportConfig
from superset.project.briefing.service import (
    _canonicalize_frame,
    _metric_index,
    _select_by_indices,
    effective_datasource_ids,
    MAX_DATASETS_PER_BRIEFING,
)


def _config(**overrides) -> DailyReportConfig:
    return DailyReportConfig(**overrides)


def test_effective_datasource_ids_dedupes_and_preserves_order() -> None:
    cfg = _config(datasource_id=26, datasource_ids=[7, 3, 7, "5", 0, -1, 7])
    assert effective_datasource_ids(cfg) == [7, 3, 5]


def test_effective_datasource_ids_falls_back_to_legacy_single() -> None:
    assert effective_datasource_ids(_config(datasource_id=26)) == [26]
    assert effective_datasource_ids(_config(datasource_id=0)) == []


def test_effective_datasource_ids_capped() -> None:
    cfg = _config(
        datasource_id=0,
        datasource_ids=list(range(1, MAX_DATASETS_PER_BRIEFING + 10)),
    )
    ids = effective_datasource_ids(cfg)
    assert len(ids) == MAX_DATASETS_PER_BRIEFING
    assert ids[0] == 1


def test_metric_index_extraction_boundaries() -> None:
    assert _metric_index("rt_paid_money_14") == 14
    assert _metric_index("rt_paid_money_1") == 1
    assert _metric_index("14日充值") == 14
    assert _metric_index("1日充值") == 1
    # ``_12`` must not match index 2 / ``21日`` must not match index 1.
    assert _metric_index("rt_paid_money_12") == 12
    assert _metric_index("21日充值") == 21
    assert _metric_index("返点后消耗") is None


def test_select_by_indices_matches_exact_suffix_only() -> None:
    candidates = ["rt_paid_money_12", "rt_paid_money_2", "rt_paid_money_20"]
    assert _select_by_indices(candidates, [2]) == ["rt_paid_money_2"]


CANONICAL_MAP = {
    "date_column": "report_date",
    "project_column": "主游戏",
    "channel_column": "渠道商",
    "ad_channel_column": "媒体",
    "region_column": "",
    "spend_column": "返点后消耗",
    "new_users_column": "新增进入",
    "cpa_column": "返点后消耗",
    "ltv_columns": ("1日充值", "30日充值"),
    "roi_columns": ("1日充值", "30日充值"),
}

OWN_MAP_ENGLISH = {
    "date_column": "dt",
    "project_column": "game",
    "channel_column": "",
    "ad_channel_column": "media",
    "region_column": "",
    "spend_column": "cost",
    "new_users_column": "users",
    "cpa_column": "cost",
    # This dataset carries a day-14 numerator the canonical set lacks.
    "ltv_columns": ("rt_paid_money_1", "rt_paid_money_14"),
    "roi_columns": ("rt_paid_money_1",),
}


def test_canonicalize_frame_renames_and_fills() -> None:
    df = pd.DataFrame(
        {
            "dt": ["2026-08-17", "2026-08-18"],
            "game": ["GameA", "GameB"],
            "cost": [100.0, 200.0],
            "users": [10, 20],
            "media": ["M1", "M2"],
            "extra_noise": [1, 2],
            "rt_paid_money_1": [8.0, 16.0],
            "rt_paid_money_14": [40.0, 80.0],
        }
    )

    out = _canonicalize_frame(df, OWN_MAP_ENGLISH, CANONICAL_MAP)

    # Dimensions renamed onto canonical names; optional missing ones appear.
    assert out["report_date"].tolist() == ["2026-08-17", "2026-08-18"]
    assert out["主游戏"].tolist() == ["GameA", "GameB"]
    assert out["返点后消耗"].tolist() == [100.0, 200.0]
    assert out["新增进入"].tolist() == [10, 20]
    assert out["媒体"].tolist() == ["M1", "M2"]
    assert out["渠道商"].tolist() == ["", ""]
    # Metric numerators align by day-index: 1 -> canonical ``1日充值``.
    assert out["1日充值"].tolist() == [8.0, 16.0]
    # Day-30 has no source in this dataset and is zero-filled.
    assert out["30日充值"].tolist() == [0.0, 0.0]
    # The day-14 numerator has no canonical counterpart and is dropped.
    assert "rt_paid_money_14" not in out.columns


def test_canonicalize_frame_keeps_identity_mapping_intact() -> None:
    """When own mapping equals the canonical one, values pass through."""
    df = pd.DataFrame(
        {
            "report_date": ["2026-08-17"],
            "主游戏": ["GameA"],
            "返点后消耗": [50.0],
            "新增进入": [5],
            "1日充值": [4.0],
            "30日充值": [12.0],
        }
    )

    out = _canonicalize_frame(df, dict(CANONICAL_MAP), CANONICAL_MAP)
    assert out["主游戏"].tolist() == ["GameA"]
    assert out["30日充值"].tolist() == [12.0]
