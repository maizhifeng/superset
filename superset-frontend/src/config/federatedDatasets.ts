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

/**
 * Federated dataset configuration.
 *
 * Dataset IDs that are bound for cross-database queries.
 * Charts built on these datasets automatically route data requests
 * through the federated API.
 *
 * IMPORTANT: This Set must be kept in sync with the equivalent config in
 * superset-frontend-new/src/config/federatedDatasets.ts.
 *
 * To add a new federated dataset, add its dataset ID to this Set in BOTH files.
 */
export const FEDERATED_DATASETS: Set<number> = new Set([
  26, // ad_combined_report <-> ad_operate_data_report
]);

export function isFederatedDataset(datasetId: number | undefined): boolean {
  if (datasetId === undefined) return false;
  return FEDERATED_DATASETS.has(datasetId);
}

export function getFederatedDataset(
  datasetId: number | undefined,
): [string, string] | null {
  if (datasetId === undefined) return null;
  return FEDERATED_DATASETS.has(datasetId) ? ['', ''] : null;
}

export function extractDatasetId(
  datasource: string | undefined,
): number | undefined {
  if (!datasource) return undefined;
  const parts = datasource.split('__');
  const id = parseInt(parts[0], 10);
  return Number.isNaN(id) ? undefined : id;
}
