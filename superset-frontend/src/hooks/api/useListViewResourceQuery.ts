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
import { useState, useCallback, useEffect } from 'react';
import { t } from '@apache-superset/core/translation';
import { useApiList, useApiInfo } from './useApiList';
import type { ListViewFetchDataConfig as FetchDataConfig } from 'src/components';

interface ListViewResourceState<D> {
  loading: boolean;
  collection: D[];
  count: number;
  resourceCount: number;
  resourceCollection: D[];
  permissions: string[];
  bulkSelectEnabled: boolean;
  lastFetched?: string;
}

export function useListViewResourceQuery<D extends object = any>(
  resource: string,
  resourceLabel: string,
  handleErrorMsg: (msg: string) => void,
  infoEnable = true,
  defaultCollectionValue: D[] = [],
  baseFilters?: Array<{ id: string; operator: string; value: any }>,
  initialLoadingState = true,
  selectColumns?: string[],
) {
  const [bulkSelectEnabled, setBulkSelectEnabled] = useState(false);

  const [fetchConfig, setFetchConfig] = useState<FetchDataConfig | null>(null);

  const {
    data: infoData,
    isError: infoError,
    error: infoErrorObj,
  } = useApiInfo(resource, resourceLabel, infoEnable);

  useEffect(() => {
    if (infoError && infoEnable && infoErrorObj) {
      handleErrorMsg(
        t('An error occurred while fetching %s info', resourceLabel),
      );
    }
  }, [infoError, infoEnable, infoErrorObj, handleErrorMsg, resourceLabel]);

  const {
    data: listData,
    isLoading,
    isError,
    error: listError,
    refetch,
  } = useApiList<D>({
    resource,
    fetchDataConfig: fetchConfig ?? {
      pageIndex: 0,
      pageSize: 25,
      sortBy: [{ id: 'changed_on_delta_humanized', desc: true }],
      filters: [],
    },
    baseFilters,
    selectColumns,
    enabled: fetchConfig !== null,
  });

  useEffect(() => {
    if (isError && fetchConfig && listError) {
      handleErrorMsg(
        t('An error occurred while fetching %ss', resourceLabel),
      );
    }
  }, [isError, fetchConfig, listError, handleErrorMsg, resourceLabel]);

  const state: ListViewResourceState<D> = {
    loading: !fetchConfig ? initialLoadingState : isLoading,
    collection: listData?.result ?? defaultCollectionValue,
    count: listData?.count ?? 0,
    permissions: infoData?.permissions ?? [],
    bulkSelectEnabled,
    lastFetched: listData ? new Date().toISOString() : undefined,
    resourceCount: listData?.count ?? 0,
    resourceCollection: listData?.result ?? defaultCollectionValue,
  };

  const fetchData = useCallback(
    (config: FetchDataConfig) => {
      setFetchConfig(config);
    },
    [],
  );

  const refreshData = useCallback(
    (provideConfig?: FetchDataConfig) => {
      if (provideConfig) {
        setFetchConfig(provideConfig);
      } else {
        refetch();
      }
    },
    [refetch],
  );

  const toggleBulkSelect = useCallback(() => {
    setBulkSelectEnabled(prev => !prev);
  }, []);

  const hasPerm = useCallback(
    (perm: string) => {
      const permissions: string[] = infoData?.permissions ?? [];
      return permissions.some(p => p === perm);
    },
    [infoData?.permissions],
  );

  const setResourceCollection = useCallback(
    (_update: D[]) => {
      // no-op in react-query mode; mutations invalidate cache
    },
    [],
  );

  return {
    state,
    setResourceCollection,
    hasPerm,
    fetchData,
    toggleBulkSelect,
    refreshData,
  };
}
