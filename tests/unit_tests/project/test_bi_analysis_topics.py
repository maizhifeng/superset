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

from typing import Any

import pytest

from superset.project.bi.analysis_topics import (
    ANALYSIS_TOPICS,
    AnalysisCompileError,
    apply_launch_dates,
    apply_window_markers,
    compile_query,
    COST_MAINLAND_WIDE_SQL,
    get_topic,
    historical_topic,
    parse_time_range,
    PROJECT_COMPARE_MAINLAND_WIDE_SQL,
)

PROJECT_COMPARE_DIMENSIONS: tuple[str, ...] = (
    "日期",
    "平台",
    "地区",
    "媒体",
    "渠道商",
    "主游戏",
)

PROJECT_COMPARE_FIELDS: tuple[str, ...] = (
    *PROJECT_COMPARE_DIMENSIONS,
    "消耗",
    "返点后消耗",
    "新增进入",
    "2日留存数",
    "3日留存数",
    "7日留存数",
    "2日充值",
    "3日充值",
    "4日充值",
    "5日充值",
    "6日充值",
    "7日充值",
    "充值流水",
    "商户充值",
    "1日充值",
    "1日付费数",
    "累计充值",
    "累计付费数",
)

PROJECT_COMPARE_RATIO_METRICS: tuple[str, ...] = (
    "cpa",
    "cpp",
    "自然新增%",
    "ltv_1",
    "roi_1",
    "ltv_cum",
    "累计roi",
    "流水ROI",
    "1日付费率",
    "2日留存率",
    "3日留存率",
    "7日留存率",
    "roi_2",
    "roi_3",
    "roi_4",
    "roi_5",
    "roi_6",
    "roi_7",
    "ltv_2",
    "ltv_3",
    "ltv_4",
    "ltv_5",
    "ltv_6",
    "ltv_7",
)


def _raw_metric(column: str) -> dict[str, Any]:
    return {
        "expressionType": "SIMPLE",
        "column": {"column_name": column},
        "aggregate": "SUM",
        "label": column,
    }


def _project_compare_query(**overrides: Any) -> dict[str, Any]:
    query: dict[str, Any] = {
        "result_type": "full",
        "metrics": [],
        "groupby": [],
        "columns": [],
        "filters": [],
        "granularity": "日期",
        "time_range": "2026-10-11 : 2026-11-09",
        "row_limit": 100,
    }
    query.update(overrides)
    return query


def _all_project_compare_metrics() -> list[Any]:
    return [
        _raw_metric(column)
        for column in (
            "消耗",
            "返点后消耗",
            "新增进入",
            "1日充值",
            "1日付费数",
            "累计充值",
            "累计付费数",
        )
    ] + list(PROJECT_COMPARE_RATIO_METRICS)


def _kpi_query(**overrides: Any) -> dict[str, Any]:
    query: dict[str, Any] = {
        "result_type": "full",
        "metrics": [
            {
                "expressionType": "SIMPLE",
                "column": {"column_name": "消耗"},
                "aggregate": "SUM",
                "label": "消耗",
            },
            "cpa",
        ],
        "groupby": [],
        "columns": [],
        "filters": [],
        "granularity": "日期",
        "time_range": "2026-10-11 : 2026-11-09",
        "row_limit": 1,
    }
    query.update(overrides)
    return query


def test_parse_time_range_accepts_superset_syntax() -> None:
    assert parse_time_range("2026-10-11 : 2026-11-09") == (
        "2026-10-11",
        "2026-11-09",
    )
    assert parse_time_range("2026-10-11 : 2026-11-09 ") == (
        "2026-10-11",
        "2026-11-09",
    )
    assert parse_time_range("No filter") is None
    assert parse_time_range(None) is None


def test_apply_window_markers_injects_window_and_prunes_branches() -> None:
    sql = (
        "select 1 from recent where report_date >= 20260601 "
        "/*BI_WINDOW:report_date:20260601:99999999*/ union all "
        "select 2 from archive where settle_date < 20260601 "
        "/*BI_WINDOW:settle_date:19700101:20260531*/"
    )
    result = apply_window_markers(sql, ("2026-10-11", "2026-11-09"))
    assert "report_date >= 20261011 and report_date < 20261109" in result
    assert "and 1 = 0" in result
    assert "BI_WINDOW" not in result


def test_apply_window_markers_without_window_removes_markers() -> None:
    sql = "select 1 /*BI_WINDOW:report_date:20250101:99999999*/ from t"
    assert apply_window_markers(sql, None) == "select 1  from t"


def test_cost_topic_is_registered_with_both_sources() -> None:
    topic = get_topic("cost")
    assert topic is not None
    assert topic.mainland.database == "aliyun"
    assert topic.oversea.database == "aliyun-oversea"
    assert "BI_WINDOW" in topic.mainland.sql
    assert "BI_WINDOW" in topic.oversea.sql
    assert set(ANALYSIS_TOPICS) == {"cost", "project-compare"}
    assert get_topic("missing") is None


def test_compile_kpi_query_splits_ratio_metrics() -> None:
    topic = get_topic("cost")
    assert topic is not None
    compiled = compile_query(topic, _kpi_query())
    assert compiled.labels == ["消耗", "cpa__num", "cpa__den"]
    assert compiled.dimensions == []
    assert compiled.metric_labels == ["消耗", "cpa"]
    assert compiled.ratio_components == {"cpa": ("cpa__num", "cpa__den")}
    assert 'SUM("消耗") AS "消耗"' in compiled.mainland_sql
    assert 'SUM("返点后消耗") AS "cpa__num"' in compiled.mainland_sql
    assert "report_date >= 20261011 and report_date < 20261109" in (
        compiled.mainland_sql
    )
    # The executed SQL reads the two branches the historical wide view unions
    # internally, so it stays fast without expanding the 405-column view.
    assert "sj_report_data.ad_deplete_view" in compiled.mainland_sql
    assert "sj_report_data.wxh5_ad_deplete_view" in compiled.mainland_sql
    assert "sj_report_data.ad_data_sum_report" in compiled.mainland_sql
    assert "sj_report_data.wxh5_data_sum_report" in compiled.mainland_sql
    assert "report_sygame_ad_data_view" not in compiled.mainland_sql
    assert "report_ad_hour_cost" not in compiled.mainland_sql
    assert "DATE '2026-10-11'" in compiled.mainland_sql
    assert "DATE '2026-11-09'" in compiled.mainland_sql
    assert "LIMIT 5" in compiled.mainland_sql
    assert "overseas_report_data.ad_operate_data_report" in compiled.oversea_sql


def test_compile_breakdown_query_applies_order_filter_and_limit() -> None:
    topic = get_topic("cost")
    assert topic is not None
    compiled = compile_query(
        topic,
        _kpi_query(
            groupby=["主游戏"],
            filters=[{"col": "媒体", "op": "IN", "val": ["自然量", "A'B"]}],
            orderby=[["返点后消耗", False]],
            row_limit=500,
        ),
    )
    sql = compiled.mainland_sql
    assert 'GROUP BY "主游戏"' in sql
    assert 'ORDER BY "返点后消耗" DESC' in sql
    assert "LIMIT 2500" in sql
    assert "\"媒体\" IN ('自然量', 'A''B')" in sql


def test_compile_rejects_unknown_dimensions_and_metrics() -> None:
    topic = get_topic("cost")
    assert topic is not None
    with pytest.raises(AnalysisCompileError):
        compile_query(topic, _kpi_query(groupby=["不存在"]))
    with pytest.raises(AnalysisCompileError):
        compile_query(topic, _kpi_query(metrics=["missing"]))


def test_compile_supports_not_in_filters() -> None:
    topic = get_topic("cost")
    assert topic is not None
    compiled = compile_query(
        topic,
        _kpi_query(
            filters=[{"col": "媒体", "op": "NOT IN", "val": ["自然量"]}],
            time_range=None,
        ),
    )
    assert "\"媒体\" NOT IN ('自然量')" in compiled.mainland_sql
    # no time range: markers are dropped instead of pruned
    assert "BI_WINDOW" not in compiled.mainland_sql


def test_ratio_metric_ordering_uses_sum_ratio() -> None:
    topic = get_topic("cost")
    assert topic is not None
    compiled = compile_query(
        topic,
        _kpi_query(groupby=["日期"], metrics=["cpa"], orderby=[["cpa", False]]),
    )
    assert 'ORDER BY (SUM("返点后消耗")) / NULLIF(SUM("新增进入"), 0) DESC' in (
        compiled.mainland_sql
    )


def test_historical_topic_uses_the_wide_views_for_reconciliation() -> None:
    topic = get_topic("cost")
    assert topic is not None
    wide = historical_topic(topic)
    assert "sj_report_data.report_sygame_ad_data_view" in wide.mainland.sql
    assert "sj_report_data.report_minigame_ad_data_view" in wide.mainland.sql
    assert "report_ad_hour_cost" not in wide.mainland.sql
    # the oversea side is identical in both variants
    assert wide.oversea.sql == topic.oversea.sql
    # non-cost topics are returned unchanged
    assert historical_topic(wide) is not wide


def test_compile_query_deduplicates_repeated_groupby_columns() -> None:
    topic = get_topic("cost")
    assert topic is not None
    compiled = compile_query(
        topic,
        _kpi_query(metrics=["cpa"], groupby=["日期", "日期"]),
    )
    assert compiled.labels == ["日期", "cpa__num", "cpa__den"]
    assert compiled.mainland_sql.count('GROUP BY "日期"') == 1


# ---------------------------------------------------------------------------
# project-compare topic
# ---------------------------------------------------------------------------


def test_project_compare_topic_is_registered_with_both_sources() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    assert topic.id == "project-compare"
    assert topic.title == "项目对比分析"
    assert topic.dimensions == PROJECT_COMPARE_DIMENSIONS
    assert topic.date_column == "日期"
    assert set(topic.metrics) == set(PROJECT_COMPARE_RATIO_METRICS)
    assert topic.mainland.database == "aliyun"
    assert topic.mainland.catalog == "sdk_data"
    assert topic.mainland.schema is None
    assert topic.oversea.database == "aliyun-oversea"
    assert topic.oversea.catalog == "overseas_sdk_data"
    assert topic.oversea.schema == "overseas_report_data"
    assert "BI_WINDOW" in topic.mainland.sql
    assert "BI_WINDOW" in topic.oversea.sql


def test_project_compare_narrow_sql_exposes_the_fifteen_fields() -> None:
    topic = get_topic("project-compare")
    cost = get_topic("cost")
    assert topic is not None
    assert cost is not None
    # Each topic owns its own SQL constants (the project page needs the
    # cumulative payment columns the cost topic never selects).
    assert topic.mainland.sql != cost.mainland.sql
    assert topic.oversea.sql != cost.oversea.sql

    mainland = topic.mainland.sql
    # 4 ad branches + 2 operate-table branches carry the window marker.
    assert mainland.count("BI_WINDOW") == 6
    for field in PROJECT_COMPARE_FIELDS:
        assert f'as "{field}"' in mainland
    # The executed SQL reads the payment columns the wide view unions in.
    assert "sj_report_data.ad_deplete_view" in mainland
    assert "sj_report_data.wxh5_ad_deplete_view" in mainland
    assert "sj_report_data.ad_data_sum_report" in mainland
    assert "sj_report_data.wxh5_data_sum_report" in mainland
    assert "total_paid_money" in mainland
    assert "total_paid_unum" in mainland
    assert "day2_dau" in mainland
    assert "day3_dau" in mainland
    assert "day7_dau" in mainland
    assert "rt_paid_money_7" in mainland
    assert 'as "2日留存数"' in mainland
    assert 'as "7日留存数"' in mainland
    assert 'as "7日充值"' in mainland
    # 充值流水 / 商户充值 come from the operate tables, spread like dataset 26.
    assert "sj_report_data.opreate_data_report" in mainland
    assert "xh_report_data.wxh5_opreate_data_report" in mainland
    assert "sum(p_money)" in mainland
    assert "sum(switch_pay_amount)" in mainland
    assert "sum(pos_p_money)" in mainland
    assert "rows_per_key" in mainland
    assert "report_sygame_ad_data_view" not in mainland
    assert "report_minigame_ad_data_view" not in mainland

    # The wide-view counterpart must also carry the operate columns so the
    # narrow/wide consistency check keeps working.
    wide = PROJECT_COMPARE_MAINLAND_WIDE_SQL
    assert "sj_report_data.opreate_data_report" in wide
    assert "xh_report_data.wxh5_opreate_data_report" in wide
    assert 'as "充值流水"' in wide
    assert 'as "商户充值"' in wide

    oversea = topic.oversea.sql
    assert oversea.count("BI_WINDOW") == 1
    assert oversea.count("BI_EPOCH_WINDOW") == 1
    assert "overseas_report_data.ad_operate_data_report" in oversea
    assert "report_date >= 20240101" in oversea
    assert "ad_cch_id not in (59, 64)" in oversea
    assert "SUM(paid_money_total) * 7 / 10000.0" in oversea
    assert "SUM(paid_num_total)" in oversea
    assert "'未知'" in oversea
    assert "Rastar自然量" in oversea
    assert 'joined.system as "渠道商"' in oversea
    # 充值流水 / 商户充值 come from the pay log (same filter as dataset 38).
    assert "overseas_sdk_log.all_app_pay_log" in oversea
    assert "paid_status = 1" in oversea
    assert "payment_id in (19, 20)" in oversea
    assert "SUM(paid_usd) * 7 / 10000.0" in oversea
    assert "paid_tax_usd" in oversea
    assert "rt_device_num_2" in oversea
    assert "rt_device_num_3" in oversea
    assert "rt_device_num_7" in oversea
    assert "paid_money_7" in oversea
    for field in PROJECT_COMPARE_FIELDS:
        assert f'as "{field}"' in oversea


def test_project_compare_metrics_are_all_named_ratios() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    for name in PROJECT_COMPARE_RATIO_METRICS:
        compiled = compile_query(topic, _project_compare_query(metrics=[name]))
        assert compiled.metric_labels == [name]
        assert compiled.ratio_components == {name: (f"{name}__num", f"{name}__den")}


def test_project_compare_compiles_cumulative_ratio_metrics() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    compiled = compile_query(
        topic,
        _project_compare_query(groupby=["主游戏"], metrics=["ltv_cum", "累计roi"]),
    )
    assert compiled.labels == [
        "主游戏",
        "ltv_cum__num",
        "ltv_cum__den",
        "累计roi__num",
        "累计roi__den",
    ]
    assert compiled.metric_labels == ["ltv_cum", "累计roi"]
    assert compiled.ratio_components == {
        "ltv_cum": ("ltv_cum__num", "ltv_cum__den"),
        "累计roi": ("累计roi__num", "累计roi__den"),
    }
    for sql in (compiled.mainland_sql, compiled.oversea_sql):
        assert 'SUM("累计充值") AS "ltv_cum__num"' in sql
        assert 'SUM("新增进入") AS "ltv_cum__den"' in sql
        assert 'SUM("累计充值") AS "累计roi__num"' in sql
        assert 'SUM("返点后消耗") AS "累计roi__den"' in sql
        assert 'GROUP BY "主游戏"' in sql


def test_project_compare_compiles_every_field_for_both_sides() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    compiled = compile_query(
        topic,
        _project_compare_query(
            groupby=["主游戏"], metrics=_all_project_compare_metrics()
        ),
    )
    assert compiled.metric_labels == [
        "消耗",
        "返点后消耗",
        "新增进入",
        "1日充值",
        "1日付费数",
        "累计充值",
        "累计付费数",
        *PROJECT_COMPARE_RATIO_METRICS,
    ]
    for sql in (compiled.mainland_sql, compiled.oversea_sql):
        for field in (
            "消耗",
            "返点后消耗",
            "新增进入",
            "1日充值",
            "1日付费数",
            "累计充值",
            "累计付费数",
        ):
            assert f'SUM("{field}") AS "{field}"' in sql


def test_project_compare_supports_every_dimension_filter_and_groupby() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    filters = [
        {"col": dimension, "op": "IN", "val": ["值"]}
        for dimension in PROJECT_COMPARE_DIMENSIONS
    ]
    compiled = compile_query(
        topic,
        _project_compare_query(
            groupby=list(PROJECT_COMPARE_DIMENSIONS),
            metrics=["cpa"],
            filters=filters,
        ),
    )
    for sql in (compiled.mainland_sql, compiled.oversea_sql):
        for dimension in PROJECT_COMPARE_DIMENSIONS:
            assert f'"{dimension}" IN (' in sql
        assert 'GROUP BY "日期", "平台", "地区", "媒体", "渠道商", "主游戏"' in sql


def test_project_compare_orders_by_every_raw_field_and_ratio() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    raw_fields = (
        "消耗",
        "返点后消耗",
        "新增进入",
        "1日充值",
        "1日付费数",
        "累计充值",
        "累计付费数",
    )
    for field in raw_fields:
        compiled = compile_query(
            topic,
            _project_compare_query(
                groupby=["主游戏"],
                metrics=[_raw_metric(field)],
                orderby=[[field, False]],
            ),
        )
        expected = f'ORDER BY "{field}" DESC'
        assert expected in compiled.mainland_sql
        assert expected in compiled.oversea_sql

    expected_ratios = {
        "cpa": 'ORDER BY (SUM("返点后消耗")) / NULLIF(SUM("新增进入"), 0) DESC',
        "cpp": 'ORDER BY (SUM("返点后消耗")) / NULLIF(SUM("1日付费数"), 0) DESC',
        "自然新增%": (
            'ORDER BY (SUM(CASE WHEN "媒体" = \'自然量\' THEN "新增进入" ELSE 0 END))'
            ' / NULLIF(SUM("新增进入"), 0) DESC'
        ),
        "ltv_1": 'ORDER BY (SUM("1日充值")) / NULLIF(SUM("新增进入"), 0) DESC',
        "roi_1": 'ORDER BY (SUM("1日充值")) / NULLIF(SUM("返点后消耗"), 0) DESC',
        "ltv_cum": 'ORDER BY (SUM("累计充值")) / NULLIF(SUM("新增进入"), 0) DESC',
        "累计roi": 'ORDER BY (SUM("累计充值")) / NULLIF(SUM("返点后消耗"), 0) DESC',
    }
    for ratio, order_clause in expected_ratios.items():
        compiled = compile_query(
            topic,
            _project_compare_query(
                groupby=["主游戏"], metrics=[ratio], orderby=[[ratio, False]]
            ),
        )
        assert order_clause in compiled.mainland_sql
        assert order_clause in compiled.oversea_sql


def test_project_compare_rejects_unknown_metrics() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    with pytest.raises(AnalysisCompileError):
        compile_query(topic, _project_compare_query(metrics=["累计充值率"]))


def test_historical_topic_uses_wide_views_for_project_compare() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    wide = historical_topic(topic)
    assert wide.mainland.sql == PROJECT_COMPARE_MAINLAND_WIDE_SQL
    assert "sj_report_data.report_sygame_ad_data_view" in wide.mainland.sql
    assert "sj_report_data.report_minigame_ad_data_view" in wide.mainland.sql
    assert "SUM(total_paid_money) as total_paid_money" in wide.mainland.sql
    assert "SUM(total_paid_unum) as total_paid_unum" in wide.mainland.sql
    assert 'as "累计充值"' in wide.mainland.sql
    assert 'as "累计付费数"' in wide.mainland.sql
    assert "ad_deplete_view" not in wide.mainland.sql
    # the oversea side is identical in both variants
    assert wide.oversea.sql == topic.oversea.sql

    # cost keeps its own wide SQL; the two wide constants are independent
    cost = get_topic("cost")
    assert cost is not None
    cost_wide = historical_topic(cost)
    assert cost_wide.mainland.sql == COST_MAINLAND_WIDE_SQL
    assert cost_wide.mainland.sql != wide.mainland.sql


def test_analysis_consistency_specs_are_topic_specific() -> None:
    from superset.project.bi import analysis_consistency

    cost_specs = analysis_consistency.default_specs("cost")
    compare_specs = analysis_consistency.default_specs("project-compare")
    assert analysis_consistency.default_specs() == cost_specs
    assert [name for name, _ in cost_specs] == [name for name, _ in compare_specs]
    assert compare_specs[0][1]["metrics"] == list(
        analysis_consistency.PROJECT_COMPARE_METRICS
    )

    def _labels(specs: list[tuple[str, dict[str, Any]]]) -> list[str]:
        metrics = specs[0][1]["metrics"]
        return [
            entry if isinstance(entry, str) else entry["label"] for entry in metrics
        ]

    assert _labels(cost_specs) == [
        "消耗",
        "返点后消耗",
        "新增进入",
        "自然新增%",
        "cpa",
        "cpp",
        "ltv_1",
        "roi_1",
    ]
    assert _labels(compare_specs) == [
        "消耗",
        "返点后消耗",
        "新增进入",
        "2日留存数",
        "3日留存数",
        "7日留存数",
        "2日充值",
        "3日充值",
        "4日充值",
        "5日充值",
        "6日充值",
        "7日充值",
        "充值流水",
        "商户充值",
        "1日充值",
        "1日付费数",
        "累计充值",
        "累计付费数",
        *PROJECT_COMPARE_RATIO_METRICS,
    ]


# ---------------------------------------------------------------------------
# Oversea reservation spend (ad_type = 2) is booked on the launch day
# ---------------------------------------------------------------------------


def test_apply_launch_dates_renders_values_and_empty_fallback() -> None:
    sql = "with launch as (\n  /*BI_LAUNCH_DATES*/\n) select * from launch"
    rendered = apply_launch_dates(sql, {1837: 20260916, 1441: 20261111})
    assert "BI_LAUNCH_DATES" not in rendered
    assert "values (1441, 20261111), (1837, 20260916)" in rendered

    empty = apply_launch_dates(sql, None)
    assert "BI_LAUNCH_DATES" not in empty
    assert "where 1 = 0" in empty
    assert "null::bigint as papp_id" in empty

    # SQL without the marker is returned untouched.
    assert apply_launch_dates("select 1", {1: 20260101}) == "select 1"


def test_compile_injects_launch_dates_only_on_the_oversea_side() -> None:
    topic = get_topic("project-compare")
    assert topic is not None
    compiled = compile_query(
        topic,
        _kpi_query(),
        launch_dates={1837: 20260916},
    )
    assert "values (1837, 20260916)" in compiled.oversea_sql
    assert "BI_LAUNCH_DATES" not in compiled.oversea_sql
    # Reservation rows bypass the window pushdown and are re-dated to launch.
    assert "ad_type = 2" in compiled.oversea_sql
    assert "then launch.launch_day" in compiled.oversea_sql
    # The mainland source has no reservation dimension: it stays unchanged.
    assert "BI_LAUNCH_DATES" not in compiled.mainland_sql
    assert "launch_day" not in compiled.mainland_sql


def test_compile_without_launch_dates_keeps_valid_oversea_sql() -> None:
    topic = get_topic("cost")
    assert topic is not None
    compiled = compile_query(topic, _kpi_query())
    assert "BI_LAUNCH_DATES" not in compiled.oversea_sql
    assert "where 1 = 0" in compiled.oversea_sql
    assert "ad_type = 2" in compiled.oversea_sql


def test_apply_epoch_window_markers_pushes_bounds_and_partition_year() -> None:
    from superset.project.bi.analysis_topics import apply_epoch_window_markers

    sql = (
        "select 1 from pay where paid_date_s >= 1704038400 "
        "/*BI_EPOCH_WINDOW:paid_date_s*/"
    )
    rendered = apply_epoch_window_markers(sql, ("2026-11-01", "2026-11-20"))
    assert "BI_EPOCH_WINDOW" not in rendered
    assert "extract(epoch from timestamptz '2026-11-01 00:00:00+08')" in rendered
    assert "extract(epoch from timestamptz '2026-11-20 00:00:00+08')" in rendered
    assert "corder_year between 2025 and 2027" in rendered

    # Without a window the marker disappears and only the base bound remains.
    assert apply_epoch_window_markers(sql, None) == (
        "select 1 from pay where paid_date_s >= 1704038400 "
    )
