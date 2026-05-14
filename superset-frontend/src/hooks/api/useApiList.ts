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
import rison from 'rison';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { SupersetClient } from '@superset-ui/core';
import { queryKeys } from './queryKeys';
import type { ListViewFetchDataConfig as FetchDataConfig } from 'src/components';
import type { ListViewFilterValue as FilterValue } from 'src/components/ListView/types';

interface ApiListResponse<D> {
  count: number;
  result: D[];
}

interface UseApiListOptions {
  resource: string;
  fetchDataConfig: FetchDataConfig;
  baseFilters?: FilterValue[];
  selectColumns?: string[];
  enabled?: boolean;
}

export function useApiList<D extends object = any>({
  resource,
  fetchDataConfig,
  baseFilters,
  selectColumns,
  enabled = true,
}: UseApiListOptions) {
  const queryClient = useQueryClient();
  const { pageIndex, pageSize, sortBy, filters: filterValues } =
    fetchDataConfig;

  const filterExps = (baseFilters || [])
    .concat(filterValues || [])
    .filter(
      ({ value }) => value !== '' && value !== null && value !== undefined,
    )
    .map(({ id, operator: opr, value }) => ({
      col: id,
      opr,
      value:
        value && typeof value === 'object' && 'value' in value
          ? value.value
          : value,
    }));

  const queryParams = rison.encode_uri({
    order_column: sortBy[0].id,
    order_direction: sortBy[0].desc ? 'desc' : 'asc',
    page: pageIndex,
    page_size: pageSize,
    ...(filterExps.length ? { filters: filterExps } : {}),
    ...(selectColumns?.length ? { select_columns: selectColumns } : {}),
  });

  const queryKey = queryKeys.resource.list(resource, {
    queryParams,
  });

  return {
    ...useQuery<ApiListResponse<D>>({
      queryKey,
      queryFn: async ({ signal }: { signal: AbortSignal }) => {
        const { json } = await SupersetClient.get({
          endpoint: `/api/v1/${resource}/?q=${queryParams}`,
          signal,
        });
        return { result: json.result, count: json.count };
      },
      enabled,
      placeholderData: (previousData: ApiListResponse<D> | undefined) => previousData,
    }),
    queryKey,
    invalidate: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.resource.all(resource) }),
  };
}

export function useApiInfo(
  resource: string,
  resourceLabel: string,
  enabled = true,
) {
  return useQuery<{ permissions: string[] }>({
    queryKey: queryKeys.resource.info(resource),
    queryFn: async () => {
      const { json } = await SupersetClient.get({
        endpoint: `/api/v1/${resource}/_info?q=${rison.encode({
          keys: ['permissions'],
        })}`,
      });
      return { permissions: json.permissions || [] };
    },
    enabled,
    staleTime: Infinity,
    gcTime: Infinity,
    meta: { resourceLabel },
  });
}
