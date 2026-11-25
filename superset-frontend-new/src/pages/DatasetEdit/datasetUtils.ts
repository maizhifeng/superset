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

import type { DatasetColumn, DatasetDetail } from "@/types/api";
import type {
  DatasetEditForm,
  DatasetSaveRequest,
  ExtraConfig,
  ModifiedColumns,
} from "./types";

export const ROWS_PER_PAGE = 50;

export function formFromDataset(dataset: DatasetDetail): DatasetEditForm {
  return {
    table_name: dataset.table_name,
    description: dataset.description ?? "",
    sql: dataset.sql ?? "",
  };
}

export function parseExtraConfig(extra: string | null): ExtraConfig {
  try {
    const parsed: unknown = JSON.parse(extra ?? "{}");
    if (parsed === null) {
      return {};
    }
    const value = parsed as Record<string, unknown>;
    return {
      profit_sharing: value.profit_sharing as ExtraConfig["profit_sharing"],
      computed_columns:
        value.computed_columns as ExtraConfig["computed_columns"],
    };
  } catch {
    return {};
  }
}

function getFederatedExtra(dataset: DatasetDetail | null): unknown {
  try {
    const parsed: unknown = JSON.parse(dataset?.extra ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return (parsed as Record<string, unknown>).federated;
    }
  } catch {
    return undefined;
  }
  return undefined;
}

export function buildDatasetSaveRequest(
  id: string,
  dataset: DatasetDetail | null,
  form: DatasetEditForm,
  extraConfig: ExtraConfig,
  modifiedColumns: ModifiedColumns,
): DatasetSaveRequest {
  const sqlChanged = dataset !== null && form.sql !== dataset.sql;
  const extraObj: Record<string, unknown> = { ...extraConfig };
  const federated = getFederatedExtra(dataset);
  if (federated) {
    extraObj.federated = federated;
  }

  const payload: DatasetSaveRequest["payload"] = {
    table_name: form.table_name,
    description: form.description || null,
    sql: form.sql || null,
    extra: Object.keys(extraObj).length > 0 ? JSON.stringify(extraObj) : null,
  };

  if (sqlChanged && dataset) {
    payload.columns = dataset.columns.map((column) => ({
      column_name: column.column_name,
      type: column.type,
      is_dttm: column.is_dttm,
      extra: column.extra,
    }));
  } else if (Object.keys(modifiedColumns).length > 0 && dataset) {
    payload.columns = dataset.columns.map((column) => ({
      ...(modifiedColumns[column.id] ?? {}),
      id: column.id,
      column_name: column.column_name,
      extra: modifiedColumns[column.id]?.extra ?? column.extra,
    }));
  }

  if (dataset) {
    payload.metrics = dataset.metrics.map((metric) => ({
      ...(metric.id ? { id: metric.id } : {}),
      metric_name: metric.metric_name,
      expression: metric.expression,
      verbose_name: metric.verbose_name ?? null,
      description: metric.description ?? null,
      d3format: metric.d3format ?? null,
    }));
  }

  return {
    endpoint: sqlChanged
      ? `/dataset/${id}?override_columns=true`
      : `/dataset/${id}`,
    payload,
  };
}

export function getDatasetSql(dataset: DatasetDetail): string {
  if (dataset.kind === "virtual" && dataset.sql) {
    return dataset.sql;
  }
  const table = dataset.schema
    ? `${dataset.schema}.${dataset.table_name}`
    : dataset.table_name;
  return `SELECT * FROM ${table};`;
}

export function getColumnPage(
  columns: DatasetColumn[],
  search: string,
  page: number,
): DatasetColumn[] {
  return columns
    .filter((column) =>
      (column.column_name || "")
        .toLowerCase()
        .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => (a.column_name || "").localeCompare(b.column_name || ""))
    .slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);
}
