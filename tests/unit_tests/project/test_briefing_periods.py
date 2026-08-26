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

"""Period resolution for briefing generation (daily vs weekly types)."""

from __future__ import annotations

from datetime import date

from superset.project.briefing.config import (
    config_from_dict,
    DailyReportConfig,
    DailyReportContext,
)
from superset.project.briefing.service import _reference_periods


def _weekly_config(weeks: int = 4) -> DailyReportConfig:
    return config_from_dict({"report_type": "weekly", "weeks_of_history": weeks})


def test_daily_report_yesterday_and_history() -> None:
    """Daily briefings report yesterday with a newest-first trailing window."""
    cfg = config_from_dict({"days_of_history": 7})
    current, previous, history = _reference_periods(
        DailyReportContext(override_date="2026-08-19"), cfg
    )

    assert current.label == "2026-08-18"
    assert (current.start, current.end) == (
        date(2026, 8, 18),
        date(2026, 8, 18),
    )
    assert previous.label == "2026-08-17"
    assert [b.label for b in history[:3]] == [
        "2026-08-18",
        "2026-08-17",
        "2026-08-16",
    ]
    assert len(history) == 7


def test_daily_context_days_override_config() -> None:
    """An explicit per-request days_of_history wins over the stored value."""
    cfg = config_from_dict({"days_of_history": 30})
    _, _, history = _reference_periods(
        DailyReportContext(override_date="2026-08-19", days_of_history=3), cfg
    )
    assert len(history) == 3


def _freeze_today(d: date):
    """Patch the service module's ``date`` so ``date.today()`` returns ``d``."""
    from unittest.mock import patch

    import superset.project.briefing.service as service

    fixed_date = type(
        "FixedDate",
        (date,),
        {"today": classmethod(lambda cls, _d=d: _d)},
    )
    return patch.object(service, "date", fixed_date)


def test_weekly_default_is_last_complete_natural_week() -> None:
    """Without an override, weekly reports cover the last completed Sun–Sat."""
    # Wednesday 2026-08-19: the current week (started Sunday 08-16) is
    # incomplete, so the reported week must be 08-09 (Sun) ~ 08-15 (Sat).
    with _freeze_today(date(2026, 8, 19)):
        current, previous, history = _reference_periods(
            DailyReportContext(), _weekly_config()
        )

    assert (current.start, current.end) == (
        date(2026, 8, 9),
        date(2026, 8, 15),
    )
    assert (previous.start, previous.end) == (
        date(2026, 8, 2),
        date(2026, 8, 8),
    )
    assert history[0].label == current.label


def test_weekly_default_lands_on_complete_week_for_every_weekday() -> None:
    """The default window ends on a Saturday regardless of today's weekday."""
    for day in range(17, 24):  # Mon 17th .. Sun 23rd of August 2026
        with _freeze_today(date(2026, 8, day)):
            current, previous, history = _reference_periods(
                DailyReportContext(), _weekly_config()
            )
        assert current.start.weekday() == 6  # Sunday
        assert current.end.weekday() == 5  # Saturday
        # The compared week sits directly before the reported week.
        assert (current.start - previous.end).days == 1
        assert history[0].label == current.label


def test_weekly_override_selects_containing_week() -> None:
    """With an explicit date, the week containing that date is reported."""
    current, previous, history = _reference_periods(
        DailyReportContext(override_date="2026-08-13"), _weekly_config()
    )

    assert (current.start, current.end) == (
        date(2026, 8, 9),
        date(2026, 8, 15),
    )
    assert (previous.start, previous.end) == (
        date(2026, 8, 2),
        date(2026, 8, 8),
    )
    # Buckets are aligned weeks ending at the reported one, newest first.
    assert [b.label for b in history] == [
        "2026-08-09",
        "2026-08-02",
        "2026-07-26",
        "2026-07-19",
    ]


def test_weekly_buckets_cover_year_boundary() -> None:
    """Week buckets spanning New Year keep correct bounds and labels."""
    current, previous, _ = _reference_periods(
        DailyReportContext(override_date="2026-01-01"), _weekly_config(weeks=2)
    )

    assert (current.start, current.end) == (
        date(2025, 12, 28),
        date(2026, 1, 3),
    )
    # A bucket spanning two years renders full ISO dates; a same-year one
    # stays compact.
    assert current.range_label == "2025-12-28 ~ 2026-01-03"
    assert previous.range_label == "12-21 ~ 12-27"


def test_weekly_range_labels_and_compat_keys() -> None:
    """Daily buckets render bare ISO labels; weekly ones render ranges."""
    daily_current, _, _ = _reference_periods(
        DailyReportContext(override_date="2026-08-19"), config_from_dict({})
    )
    weekly_current, weekly_previous, weekly_history = _reference_periods(
        DailyReportContext(override_date="2026-08-19"), _weekly_config()
    )

    assert daily_current.range_label == "2026-08-18"
    assert weekly_current.label == "2026-08-16"
    assert weekly_current.range_label == "08-16 ~ 08-22"
    assert weekly_previous.range_label == "08-09 ~ 08-15"
    assert weekly_history[1].range_label == "08-09 ~ 08-15"
