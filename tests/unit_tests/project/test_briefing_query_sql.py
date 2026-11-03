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

"""SQL generation for the briefing fetch query.

Regression coverage for the SQLAlchemy 2.x migration: ``select()`` no longer
accepts a list of entities, so the selected columns must be passed
positionally.  A list argument raises ``ArgumentError`` before any SQL reaches
the database, which used to make every briefing run fail at the fetch stage.

Also covers the date-range predicates, because ``TableColumn.type`` stores the
database type name (e.g. ``"BIGINT"``) rather than a SQLAlchemy type — numeric
date columns must be detected through ``type_generic`` and compared as
integers.
"""

from __future__ import annotations

from contextlib import contextmanager
from datetime import date
from typing import Any, Iterator

import pytest
import sqlalchemy as sa

from superset.project.briefing.service import _query_sql
from superset.utils.core import GenericDataType


class _FakeColumn:
    """Minimal stand-in for a ``TableColumn`` used by the SQL builder."""

    def __init__(
        self,
        name: str,
        db_type: str = "VARCHAR",
        sqla_type: Any | None = None,
        type_generic: Any | None = GenericDataType.STRING,
        is_dttm: bool = False,
    ) -> None:
        self.column_name = name
        # Real ``TableColumn.type`` holds the database type name, not a
        # SQLAlchemy type object.
        self.type = db_type
        self.type_generic = type_generic
        self.is_dttm = is_dttm
        self._sqla_type = sqla_type or sa.String()

    def get_sqla_col(self, template_processor: Any = None) -> Any:
        return sa.column(self.column_name, self._sqla_type)


class _FakeDatabase:
    def __init__(self) -> None:
        self.engine = sa.create_engine("sqlite://")

    @contextmanager
    def get_sqla_engine(self) -> Iterator[Any]:
        yield self.engine

    def mutate_sql_based_on_config(self, sql: str) -> str:
        return sql


class _FakeDataset:
    def __init__(self, columns: list[_FakeColumn]) -> None:
        self.columns = columns
        self.database = _FakeDatabase()

    def get_template_processor(self) -> None:
        return None

    def get_from_clause(self, template_processor: Any = None) -> tuple[Any, None]:
        return sa.table("t"), None

    def _apply_cte(self, sql: str, cte: Any) -> str:
        return sql


def _string_dataset(*names: str) -> _FakeDataset:
    return _FakeDataset([_FakeColumn(name) for name in names])


def test_query_sql_selects_requested_columns() -> None:
    ds = _FakeDataset(
        [
            _FakeColumn(
                "日期",
                db_type="DATE",
                sqla_type=sa.Date(),
                type_generic=GenericDataType.TEMPORAL,
                is_dttm=True,
            ),
            _FakeColumn("充值流水"),
            _FakeColumn("新增进入"),
        ]
    )

    sql = _query_sql(
        ds,
        ["日期", "充值流水"],
        "日期",
        date(2026, 10, 1),
        date(2026, 10, 7),
        {},
    )

    assert sql.startswith("SELECT")
    assert "充值流水" in sql
    assert "新增进入" not in sql
    assert "'2026-10-01'" in sql
    assert "'2026-10-07'" in sql


def test_query_sql_uses_integer_predicates_for_numeric_date_columns() -> None:
    ds = _FakeDataset(
        [
            _FakeColumn(
                "report_date",
                db_type="BIGINT",
                sqla_type=sa.BigInteger(),
                type_generic=GenericDataType.NUMERIC,
            ),
            _FakeColumn("充值流水", db_type="BIGINT", sqla_type=sa.BigInteger()),
        ]
    )

    sql = _query_sql(
        ds,
        ["report_date", "充值流水"],
        "report_date",
        date(2026, 8, 16),
        date(2026, 8, 17),
        {},
    )

    assert "20260816" in sql
    assert "20260817" in sql
    assert "'2026-08-16'" not in sql


def test_query_sql_applies_static_filters() -> None:
    ds = _string_dataset("日期", "渠道商", "充值流水")

    sql = _query_sql(
        ds,
        ["日期", "充值流水"],
        "日期",
        date(2026, 10, 1),
        date(2026, 10, 7),
        {"渠道商": "a"},
    )

    assert "渠道商" in sql
    assert "= 'a'" in sql


def test_query_sql_rejects_empty_column_selection() -> None:
    ds = _string_dataset("日期")

    with pytest.raises(RuntimeError):
        _query_sql(
            ds,
            ["不存在"],
            "日期",
            date(2026, 10, 1),
            date(2026, 10, 7),
            {},
        )
