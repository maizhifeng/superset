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
import type { ChartDataPayload } from "@/types/api";
import type { ChartDataResponseResult } from "@/utils/query/types";
import api from "@/api";
import type { WideDataRequest } from "@/types/pivot";

/** Cap for the day-granularity wide rows fetched from ``/bi/pivot/wide-data``. */
export const MAX_WIDE_FETCH_ROWS = 100000;

/** Cap for pre-aggregated rows fetched via the standard chart-data API. */
export const MAX_PIVOT_FETCH_ROWS = 10000;

/** Fetch day-granularity wide rows for client-side pivot re-aggregation. */
export async function fetchWideData(
  body: WideDataRequest,
  signal?: AbortSignal,
): Promise<ChartDataPayload> {
  const postRes = await api.post("/bi/pivot/wide-data", body, { signal });
  const results = (
    Array.isArray(postRes.data?.result) ? postRes.data.result : []
  ) as ChartDataResponseResult[];
  return (results[0] || {}) as ChartDataPayload;
}
