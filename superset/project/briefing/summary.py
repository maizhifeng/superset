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
"""Plain-text rendering of a generated briefing payload.

Shared by every channel that wants the human-readable summary (email, Slack
attachments, the Feishu push's text mode).  Kept dependency-free so it can be
imported from both the report execution command and the briefing API without
creating an import cycle.
"""

from __future__ import annotations

from typing import Any


def _fmt(value: Any) -> str:
    """Render one metric value, tolerating missing/None values."""
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:,.2f}"
    return str(value)


def build_briefing_summary(result: dict[str, Any]) -> list[str]:
    """Render plain-text summary lines of a generated briefing."""
    core = result.get("core") or {}
    previous = result.get("core_previous") or {}

    def delta(key: str, unit: str = "") -> str:
        cur, prev = core.get(key), previous.get(key)
        if not isinstance(cur, (int, float)) or not isinstance(prev, (int, float)):
            return ""
        diff = cur - prev
        sign = "+" if diff >= 0 else ""
        return f"（环比 {sign}{diff:,.2f}{unit}）"

    date_line = f"报告日期: {result.get('report_date') or '-'}"
    if result.get("period_start"):
        date_line += (
            f"（周期 {result.get('period_start')} ~ {result.get('period_end')}）"
        )
    lines = [
        date_line,
        "",
        "核心指标:",
        f"  消耗: {_fmt(core.get('spend'))}{delta('spend')}",
        f"  新增: {_fmt(core.get('new_users'))}",
        f"  CPA: {_fmt(core.get('cpa'))}",
        f"  流水: {_fmt(core.get('recharge'))}",
        f"  ROI1: {_fmt(core.get('ROI1'))}",
        f"  LTV1: {_fmt(core.get('LTV1'))}",
        f"  1日付费率: {_fmt(core.get('pay_rate'))}",
        f"  2日留存率: {_fmt(core.get('retention_rate'))}",
        f"  自然新增%: {_fmt(core.get('natural_rate'))}",
    ]
    if alerts := result.get("alerts"):
        lines.append("")
        lines.append("告警:")
        for alert in alerts:
            lines.append(f"  [{alert.get('level', 'info')}] {alert.get('message', '')}")
    if result.get("empty"):
        lines.append("")
        lines.append("警告: 所选日期范围内没有数据")
    return lines
