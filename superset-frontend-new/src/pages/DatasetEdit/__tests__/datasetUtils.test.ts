/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { expect, test } from "vitest";
import {
  buildDatasetSaveRequest,
  formFromDataset,
  getDatasetSql,
  parseExtraConfig,
} from "../datasetUtils";
import { createDataset } from "./fixtures";

test("parses editable extra settings and tolerates invalid JSON", () => {
  const dataset = createDataset();

  expect(parseExtraConfig(dataset.extra)).toEqual({
    profit_sharing: {
      papp_name_column: "game",
      channel_name_column: "channel",
    },
    computed_columns: undefined,
  });
  expect(parseExtraConfig("not-json")).toEqual({});
  expect(parseExtraConfig(null)).toEqual({
    profit_sharing: undefined,
    computed_columns: undefined,
  });
  expect(parseExtraConfig("null")).toEqual({});
  expect(parseExtraConfig("[]")).toEqual({
    profit_sharing: undefined,
    computed_columns: undefined,
  });
});

test("overrides columns without ids only when SQL changes", () => {
  const dataset = createDataset({
    extra: JSON.stringify({ federated: { source: "remote" } }),
  });
  const request = buildDatasetSaveRequest(
    "7",
    dataset,
    { ...formFromDataset(dataset), sql: "select id from sales.orders" },
    {},
    { 1: { is_dttm: true } },
  );

  expect(request.endpoint).toBe("/dataset/7?override_columns=true");
  expect(request.payload.columns).toEqual([
    {
      column_name: "order_date",
      type: "DATE",
      is_dttm: true,
      extra: null,
    },
    {
      column_name: "amount",
      type: "NUMERIC",
      is_dttm: false,
      extra: JSON.stringify({ dashboard_filter: false }),
    },
  ]);
  expect(JSON.parse(request.payload.extra ?? "{}")).toEqual({
    federated: { source: "remote" },
  });
});

test("keeps column ids and metric API shapes when SQL is unchanged", () => {
  const dataset = createDataset({
    metrics: [
      {
        id: 0,
        metric_name: "new_metric",
        expression: "COUNT(*)",
        verbose_name: "",
        description: "",
        d3format: "",
        currency: null,
      },
    ],
  });
  const request = buildDatasetSaveRequest(
    "7",
    dataset,
    { table_name: "orders", description: "", sql: dataset.sql ?? "" },
    {},
    { 1: { is_dttm: true, extra: '{"dashboard_filter":true}' } },
  );

  expect(request.endpoint).toBe("/dataset/7");
  expect(request.payload).toMatchObject({
    table_name: "orders",
    description: null,
    sql: dataset.sql,
    extra: null,
    columns: [
      { id: 2, column_name: "order_date", extra: null },
      {
        id: 1,
        column_name: "amount",
        is_dttm: true,
        extra: '{"dashboard_filter":true}',
      },
    ],
    metrics: [
      {
        metric_name: "new_metric",
        expression: "COUNT(*)",
        verbose_name: "",
        description: "",
        d3format: "",
      },
    ],
  });
  expect(request.payload.metrics?.[0]).not.toHaveProperty("id");
});

test("copies virtual SQL and physical table queries", () => {
  const virtual = createDataset();
  const physical = createDataset({ kind: "physical", sql: null });

  expect(getDatasetSql(virtual)).toBe(virtual.sql);
  expect(getDatasetSql(physical)).toBe("SELECT * FROM sales.orders;");
});
