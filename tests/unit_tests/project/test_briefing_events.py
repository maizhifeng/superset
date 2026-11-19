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
"""Project event calendar: date parsing, bucket mapping and verdict override."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from superset.project.briefing.config import DailyReportConfig
from superset.project.briefing.events import (
    _parse_event_date,
    describe_events,
    events_by_bucket,
    ProjectEvent,
)
from superset.project.briefing.service import (
    _attach_fluctuation_baseline,
    _fluctuation_baselines,
    PeriodBucket,
)


def _bucket(day: str) -> PeriodBucket:
    start = date.fromisoformat(day)
    return PeriodBucket(day, start, start)


def _config() -> DailyReportConfig:
    return DailyReportConfig(
        date_column="report_date",
        project_column="主游戏",
        channel_column="渠道商",
        ad_channel_column="媒体",
        platform_column="平台",
        spend_column="返点后消耗",
        new_users_column="新增进入",
        cpa_column="返点后消耗",
        recharge_column="充值流水",
        ltv_columns=("1日充值",),
        roi_columns=("1日充值",),
    )


def test_parse_event_date_accepts_slash_and_iso_formats() -> None:
    assert _parse_event_date("2026/11/11") == date(2026, 11, 11)
    assert _parse_event_date("2026-09-22") == date(2026, 9, 22)
    assert _parse_event_date("") is None
    assert _parse_event_date(None) is None


def test_events_map_onto_the_bucket_that_contains_them() -> None:
    events = [
        ProjectEvent("策定九州韩国", date(2026, 11, 11), "上线"),
        ProjectEvent("策定九州韩国", date(2026, 9, 22), "首测"),
    ]

    def week(day: str) -> PeriodBucket:
        start = date.fromisoformat(day)
        return PeriodBucket(day, start, start + timedelta(days=6))

    buckets = [week("2026-11-09"), week("2026-11-02"), _bucket("2026-09-22")]

    mapped = events_by_bucket(events, buckets)

    assert [event.kind for event in mapped["2026-11-09"]] == ["上线"]
    assert [event.kind for event in mapped["2026-09-22"]] == ["首测"]
    assert "2026-11-02" not in mapped


def test_describe_events_is_deduplicated() -> None:
    events = [
        ProjectEvent("A", date(2026, 11, 11), "上线"),
        ProjectEvent("A", date(2026, 11, 11), "上线"),
        ProjectEvent("B", date(2026, 11, 12), "首测"),
    ]

    text = describe_events(events)

    assert text.count("A 上线 2026-11-11") == 1
    assert "B 首测 2026-11-12" in text


def test_event_week_overrides_the_statistical_verdict() -> None:
    entry: dict[str, Any] = {"key": "spend", "delta_pct": 2.5, "new": False}
    baseline = {
        "samples": 6,
        "method": "robust",
        "median": 0.0,
        "mad": 0.01,
        "p10": -0.01,
        "p90": 0.01,
        "low": -0.04,
        "high": 0.04,
    }

    _attach_fluctuation_baseline(
        entry,
        baseline,
        period_events=[ProjectEvent("策定九州韩国", date(2026, 11, 11), "上线")],
    )

    assert entry["severity"] == "event"
    assert entry["event_reason"] == "策定九州韩国 上线 2026-11-11"
    assert entry["events"] == [
        {
            "project": "策定九州韩国",
            "date": "2026-11-11",
            "kind": "上线",
            "channel": "",
        }
    ]
    assert entry["reason"] == "事件：策定九州韩国 上线 2026-11-11"


def test_event_buckets_are_excluded_from_the_baseline() -> None:
    # Eight daily buckets; one of the older deltas touches an event bucket.
    days = [f"2026-11-{day:02d}" for day in range(9, 17)]
    daily = [
        {"date": day, "spend": float(value)}
        for day, value in zip(
            reversed(days), (100, 101, 103, 102, 104, 105, 130, 140), strict=True
        )
    ]
    config = _config()

    without = _fluctuation_baselines(daily, config)["spend"]
    with_event = _fluctuation_baselines(daily, config, frozenset({"2026-11-14"}))[
        "spend"
    ]

    assert without["samples"] == 6
    assert without["includes_events"] is False
    # Two deltas touch 11-14; dropping them would leave fewer than six samples,
    # so the band falls back to the full history but records the event count.
    assert with_event["samples"] == 6
    assert with_event["includes_events"] is True
    assert with_event["event_samples"] == 2


def test_project_factor_inherits_the_event_verdict() -> None:
    from superset.project.briefing.service import _annotate_factors

    factors: list[dict[str, Any]] = [
        {"name": "策定九州韩国", "contribution": 1_767_511.1}
    ]
    _annotate_factors(
        factors,
        None,
        "recharge",
        "project",
        period_events=[ProjectEvent("策定九州韩国", date(2026, 11, 11), "上线")],
    )

    assert factors[0]["severity"] == "event"
    assert factors[0]["reason"] == "事件：策定九州韩国 上线 2026-11-11"
    assert factors[0]["events"] == [
        {
            "project": "策定九州韩国",
            "date": "2026-11-11",
            "kind": "上线",
            "channel": "",
        }
    ]


def test_describe_events_merges_channels_on_the_same_date() -> None:
    text = describe_events(
        [
            ProjectEvent("策定九州韩国", date(2026, 11, 11), "上线", "android"),
            ProjectEvent("策定九州韩国", date(2026, 11, 11), "上线", "ios"),
            ProjectEvent("策定九州韩国", date(2026, 11, 25), "上线", "ios"),
        ]
    )

    assert text.count("策定九州韩国（android/ios） 上线 2026-11-11") == 1
    assert "策定九州韩国（ios） 上线 2026-11-25" in text
