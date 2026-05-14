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
export const queryKeys = {
  dashboard: {
    all: ['dashboard'] as const,
    list: (config?: Record<string, unknown>) =>
      ['dashboard', 'list', config] as const,
    detail: (id: number | string) => ['dashboard', 'detail', id] as const,
    favorites: (ids: Array<number | string>) =>
      ['dashboard', 'favorites', ids] as const,
  },
  chart: {
    all: ['chart'] as const,
    list: (config?: Record<string, unknown>) =>
      ['chart', 'list', config] as const,
    detail: (id: number | string) => ['chart', 'detail', id] as const,
    favorites: (ids: Array<number | string>) =>
      ['chart', 'favorites', ids] as const,
  },
  dataset: {
    all: ['dataset'] as const,
    list: (config?: Record<string, unknown>) =>
      ['dataset', 'list', config] as const,
    detail: (id: number | string) => ['dataset', 'detail', id] as const,
  },
  database: {
    all: ['database'] as const,
    list: (config?: Record<string, unknown>) =>
      ['database', 'list', config] as const,
    detail: (id: number | string) => ['database', 'detail', id] as const,
  },
  resource: {
    all: (resource: string) => [resource] as const,
    list: (resource: string, config?: Record<string, unknown>) =>
      [resource, 'list', config] as const,
    detail: (resource: string, id: number | string) =>
      [resource, 'detail', id] as const,
    info: (resource: string) => [resource, 'info'] as const,
  },
};
