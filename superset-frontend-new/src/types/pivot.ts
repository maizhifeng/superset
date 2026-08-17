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
import type { ChartDataRow } from "@/types/api";

/**
 * Shared schemas for the BI pivot protocol:
 *
 * - ``/bi/pivot/wide-data``: fetches day-granularity wide rows (dimension
 *   columns + per-day metric columns) so the pivot grid can re-aggregate
 *   client-side for any row/column layout.
 * - ``metric_components`` (returned on the chart payload): describes how each
 *   metric is stored in the wide rows.  Ratio metrics are split into
 *   ``label__num`` / ``label__den`` component columns and re-aggregate as
 *   ``SUM(num) / SUM(den)``; plain metrics are direct numeric columns.
 */
export interface WideMetricComponent {
  agg: "sum" | "min" | "max" | "count" | "ratio";
  num?: string;
  den?: string;
}

export interface WideData {
  rows: ChartDataRow[];
  components: Record<string, WideMetricComponent>;
}

export interface WideFilter {
  col: string;
  op: string;
  val: unknown;
}

/** Request body of ``POST /bi/pivot/wide-data``. */
export interface WideDataRequest {
  datasource: { id: number; type: string };
  columns: string[];
  metrics: unknown[];
  filters: WideFilter[];
  row_limit: number;
  force?: boolean;
}
