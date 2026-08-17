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
from unittest.mock import patch

import pandas as pd
import pytest

from superset.common.query_object import QueryObject
from superset.project.bi import api as bi_api


def make_query_obj(**kwargs: Any) -> QueryObject:
    return QueryObject(
        columns=kwargs.get("columns", ["country"]),
        metrics=kwargs.get("metrics", ["SUM(revenue)"]),
        orderby=kwargs.get("orderby", []),
        groupby=kwargs.get("groupby", ["country"]),
        row_limit=kwargs.get("row_limit", 100),
    )


def test_side_query_dict_keeps_metric_orderby() -> None:
    """Metric orderbys must survive per-side query construction (Top-N recall)."""
    query_obj = make_query_obj(
        orderby=[[["SUM(revenue)"], False]],
        columns=["country"],
        groupby=["country"],
    )
    qdict = bi_api._side_query_dict(query_obj, side_limit=100)
    assert qdict["orderby"] == [[["SUM(revenue)"], False]]


def test_side_query_dict_keeps_adhoc_dict_orderby() -> None:
    """Adhoc dict orderby entries must not raise (unhashable) and must survive."""
    adhoc_metric: dict[str, Any] = {
        "expressionType": "SIMPLE",
        "column": {"column_name": "revenue"},
        "aggregate": "SUM",
        "label": "SUM(revenue)",
    }
    query_obj = make_query_obj(
        orderby=[[adhoc_metric, False]],
        columns=["country"],
        groupby=["country"],
    )
    qdict = bi_api._side_query_dict(query_obj, side_limit=100)
    assert qdict["orderby"] == [[adhoc_metric, False]]


def test_side_query_dict_folds_columns_when_no_groupby() -> None:
    """Column-level (pivot) dimensions are folded into groupby when groupby is empty."""
    query_obj = make_query_obj(
        orderby=[["channel", True]],
        columns=["country", "channel"],
        groupby=[],
    )
    qdict = bi_api._side_query_dict(query_obj, side_limit=50)
    assert qdict["groupby"] == ["country", "channel"]
    assert "columns" not in qdict
    assert qdict["orderby"] == [["channel", True]]
    assert qdict["row_limit"] == 50
    assert "row_offset" not in qdict


def test_find_date_column_prefers_declaration_order() -> None:
    assert bi_api._find_date_column(["country", "month", "year"]) == "month"
    assert bi_api._find_date_column(["year", "month"]) == "month"
    assert bi_api._find_date_column(["country"]) is None


def test_apply_global_order_and_pagination_metric_sort() -> None:
    df = pd.DataFrame({"country": ["b", "a", "c"], "SUM(revenue)": [3, 1, 2]})
    query_obj = make_query_obj(
        orderby=[[["SUM(revenue)"], False]],
        groupby=["country"],
        row_limit=2,
    )
    result = bi_api._apply_global_order_and_pagination(
        df, query_obj, labels_expected=["country", "SUM(revenue)"]
    )
    assert result["country"].tolist() == ["b", "c"]


def test_apply_global_order_and_pagination_adhoc_dict_orderby() -> None:
    df = pd.DataFrame({"country": ["b", "a", "c"], "SUM(revenue)": [3, 1, 2]})
    adhoc_metric: dict[str, Any] = {
        "expressionType": "SIMPLE",
        "column": {"column_name": "revenue"},
        "aggregate": "SUM",
        "label": "SUM(revenue)",
    }
    query_obj = make_query_obj(
        orderby=[[adhoc_metric, False]],
        groupby=["country"],
        row_limit=2,
    )
    result = bi_api._apply_global_order_and_pagination(
        df, query_obj, labels_expected=["country", "SUM(revenue)"]
    )
    assert result["country"].tolist() == ["b", "c"]


def test_apply_global_order_and_pagination_date_default() -> None:
    df = pd.DataFrame({"year": [2024, 2023], "metric": [1, 2]})
    query_obj = make_query_obj(
        orderby=[],
        groupby=["year"],
        row_limit=10,
    )
    result = bi_api._apply_global_order_and_pagination(
        df, query_obj, labels_expected=["year", "metric"]
    )
    assert result["year"].tolist() == [2023, 2024]


@pytest.mark.parametrize(
    "orderby",
    [
        [["channel", True]],
        [[["SUM(revenue)"], False]],
        [],
    ],
)
def test_side_query_dict_orderby_roundtrip(orderby: Any) -> None:
    query_obj = make_query_obj(orderby=orderby)
    qdict = bi_api._side_query_dict(query_obj, side_limit=100)
    assert qdict["orderby"] == orderby


def test_assign_label_relabels_empty_frame() -> None:
    """Zero-row results must be relabelled so downstream column handling works."""
    df = pd.DataFrame(columns=["raw_col"])
    out = bi_api._assign_label(df, ["x", "y"])
    assert out is not None
    assert out.empty
    assert list(out.columns) == ["x", "y"]


def test_assign_label_keeps_nonempty_behavior() -> None:
    df = pd.DataFrame({"a": [1], "b": [2]})
    out = bi_api._assign_label(df, ["x", "y"])
    assert out is not None
    assert list(out.columns) == ["x", "y"]
    assert out["x"].tolist() == [1]


def test_assign_label_rejects_fewer_columns() -> None:
    df = pd.DataFrame({"a": [1]})
    assert bi_api._assign_label(df, ["x", "y"]) is None


def _make_sides(
    results_by_label: dict[str, tuple[pd.DataFrame | None, bool]],
) -> list[tuple[Any, str, str, str | None, str | None]]:
    return [(None, f"sql_{label}", label, None, None) for label in results_by_label]


def _mock_side_runner(
    results_by_label: dict[str, tuple[pd.DataFrame | None, bool]],
) -> Any:
    def fake_side(
        side: tuple[Any, str, str, str | None, str | None],
        labels_expected: list[str],
        _app: Any,
        _user: Any,
    ) -> tuple[str, pd.DataFrame | None, bool]:
        del labels_expected, _app, _user
        df, ok = results_by_label[side[2]]
        return side[2], df, ok

    return fake_side


def _run_sides(
    results_by_label: dict[str, tuple[pd.DataFrame | None, bool]],
) -> tuple[list[tuple[str, pd.DataFrame]], list[str]]:
    with (
        patch.object(
            bi_api, "_run_federated_side", _mock_side_runner(results_by_label)
        ),
        patch(  # noqa: E501
            "flask.current_app"
        ) as mock_app,
        patch("flask.g") as mock_g,
    ):
        mock_app._get_current_object.return_value = mock_app
        mock_g.get.return_value = None
        return bi_api._execute_federated_sides(_make_sides(results_by_label), ["col"])


def test_execute_federated_sides_keeps_empty_successes() -> None:
    """Sides that execute successfully but return zero rows are successes."""
    empty = pd.DataFrame(columns=["col"])
    results, failed = _run_sides(
        {
            "aliyun": (empty, True),
            "oversea": (empty.copy(), True),
        }
    )
    assert {label for label, _ in results} == {"aliyun", "oversea"}
    assert all(df.empty for _, df in results)
    assert failed == []


def test_execute_federated_sides_partial_failure() -> None:
    """A raising side is isolated; the successful (possibly empty) side is kept."""
    empty = pd.DataFrame(columns=["col"])
    results, failed = _run_sides(
        {
            "aliyun": (empty, True),
            "oversea": (None, False),
        }
    )
    assert [label for label, _ in results] == ["aliyun"]
    assert failed == ["oversea"]


def test_execute_federated_sides_all_failed() -> None:
    """Only when every side raises do we get an empty results list."""
    results, failed = _run_sides(
        {
            "aliyun": (None, False),
            "oversea": (None, False),
        }
    )
    assert results == []
    assert set(failed) == {"aliyun", "oversea"}
