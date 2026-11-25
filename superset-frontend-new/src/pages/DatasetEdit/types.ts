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

import type { DatasetColumn } from "@/types/api";

export interface DatasetEditForm {
  table_name: string;
  description: string;
  sql: string;
}

export interface ProfitSharingConfig {
  papp_name_column?: string;
  channel_name_column?: string;
}

export interface ComputedColumnConfig {
  name: string;
  formula: string;
  type: string;
}

export interface ExtraConfig {
  profit_sharing?: ProfitSharingConfig;
  computed_columns?: ComputedColumnConfig[];
}

export type ModifiedColumns = Record<number, Partial<DatasetColumn>>;

export interface MetricDraft {
  metric_name: string;
  expression: string;
  verbose_name: string;
  description: string;
  d3format: string;
}

export type MetricDraftField = keyof MetricDraft;

export const EMPTY_METRIC_DRAFT: MetricDraft = {
  metric_name: "",
  expression: "",
  verbose_name: "",
  description: "",
  d3format: "",
};

export const CALCULATED_METRIC_NAMES = [
  "分成比例",
  "渠道分成",
  "渠道商分成",
  "研发分成",
  "IP分成",
  "分成方式",
  "上线时间",
  "首测起始时间",
  "二测起始时间",
  "三测起始时间",
];

export type DatasetSaveColumn = Omit<
  Partial<DatasetColumn>,
  "id" | "column_name" | "extra"
> & {
  id?: number;
  column_name: string;
  extra: string | null;
};

export interface DatasetSaveMetric {
  id?: number;
  metric_name: string;
  expression: string;
  verbose_name: string | null;
  description: string | null;
  d3format: string | null;
}

export interface DatasetSavePayload {
  table_name: string;
  description: string | null;
  sql: string | null;
  extra: string | null;
  columns?: DatasetSaveColumn[];
  metrics?: DatasetSaveMetric[];
}

export interface DatasetSaveRequest {
  endpoint: string;
  payload: DatasetSavePayload;
}
