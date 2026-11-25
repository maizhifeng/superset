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

import type { DatasetColumn, DatasetDetail, DatasetMetric } from "@/types/api";

export function createColumn(
  id: number,
  columnName: string,
  overrides: Partial<DatasetColumn> = {},
): DatasetColumn {
  return {
    id,
    column_name: columnName,
    type: "TEXT",
    verbose_name: null,
    is_dttm: false,
    description: null,
    expression: null,
    filterable: true,
    groupby: true,
    is_active: true,
    type_generic: null,
    extra: null,
    ...overrides,
  };
}

export function createMetric(
  id: number,
  metricName: string,
  overrides: Partial<DatasetMetric> = {},
): DatasetMetric {
  return {
    id,
    metric_name: metricName,
    expression: `SUM(${metricName})`,
    verbose_name: null,
    description: null,
    d3format: null,
    currency: null,
    ...overrides,
  };
}

export function createDataset(
  overrides: Partial<DatasetDetail> = {},
): DatasetDetail {
  return {
    id: 7,
    table_name: "orders",
    schema: "sales",
    description: "订单明细",
    sql: "select * from sales.orders",
    default_endpoint: null,
    fetch_values_predicate: null,
    template_params: null,
    catalog: null,
    kind: "virtual",
    extra: JSON.stringify({
      profit_sharing: {
        papp_name_column: "game",
        channel_name_column: "channel",
      },
    }),
    database: {
      id: 3,
      database_name: "warehouse",
      backend: "postgresql",
    },
    columns: [
      createColumn(2, "order_date", {
        type: "DATE",
        is_dttm: true,
        description: "订单日期",
      }),
      createColumn(1, "amount", {
        type: "NUMERIC",
        verbose_name: "金额",
        extra: JSON.stringify({ dashboard_filter: false }),
      }),
    ],
    metrics: [
      createMetric(1, "total", { expression: "SUM(amount)" }),
      createMetric(2, "分成比例", { expression: "amount / total" }),
    ],
    ...overrides,
  };
}
