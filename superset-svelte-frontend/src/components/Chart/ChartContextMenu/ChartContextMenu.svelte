<script lang="ts">
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
  import { onMount, createEventDispatcher } from 'svelte';
  import { writable } from 'svelte/store';
  import { useDispatch, useSelector } from 'react-redux';
  import {
    Behavior,
    BinaryQueryObjectFilterClause,
    Column,
    ContextMenuFilters,
    ensureIsArray,
    FeatureFlag,
    getChartMetadataRegistry,
    getExtensionsRegistry,
    isFeatureEnabled,
    QueryFormData,
    t,
    useTheme,
  } from '@superset-ui/core';
  import { Menu } from '@superset-ui/core/components/Menu';
  import { usePermissions } from 'src/hooks/usePermissions';
  import { Dropdown } from '@superset-ui/core/components';
  import { updateDataMask } from 'src/dataMask/actions';
  import DrillByModal from 'src/components/Chart/DrillBy/DrillByModal.svelte';
  import { useDatasetDrillInfo } from 'src/hooks/apiResources/datasets';
  import { ResourceStatus } from 'src/hooks/apiResources/apiResources';
  import { DrillDetailMenuItems } from '../DrillDetail';
  import { getMenuAdjustedY } from '../utils';
  import { MenuItemTooltip } from '../DisabledMenuItemTooltip';
  import { DrillByMenuItems } from '../DrillBy/DrillByMenuItems';
  import DrillDetailModal from '../DrillDetail/DrillDetailModal.svelte';

  export let id: number;
  export let formData: QueryFormData;
  export let onSelection: (args?: any) => void;
  export let onClose: () => void;
  export let additionalConfig: {
    crossFilter?: Record<string, any>;
    drillToDetail?: Record<string, any>;
    drillBy?: Record<string, any>;
  } = {};
  export let displayedItems: ContextMenuItem[] | ContextMenuItem = ContextMenuItem.All;

  const dispatch = createEventDispatcher();
  const theme = useTheme();
  const { canDrillToDetail, canDrillBy, canDownload } = usePermissions();

  const crossFiltersEnabled = useSelector<RootState, boolean>(
    ({ dashboardInfo }) => dashboardInfo.crossFiltersEnabled,
  );
  const dashboardId = useSelector<RootState, number>(
    ({ dashboardInfo }) => dashboardInfo.id,
  );

  let openKeys = writable<string[]>([]);
  let modalFilters = writable<BinaryQueryObjectFilterClause[]>([]);
  let visible = writable(false);

  const isDisplayed = (item: ContextMenuItem) =>
    displayedItems === ContextMenuItem.All ||
    ensureIsArray(displayedItems).includes(item);

  let state = writable<{ clientX: number; clientY: number; filters?: ContextMenuFilters }>({ clientX: 0, clientY: 0 });

  let enhancedFilters;
  $: {
    if ($state.filters) {
      const matrixifyContext = ($state.filters as any)?.matrixifyContext;
      if (matrixifyContext) {
        const enhancedDrillBy = $state.filters.drillBy
          ? {
              ...$state.filters.drillBy,
              filters: [
                ...($state.filters.drillBy.filters || []),
                ...(matrixifyContext.cellFilters || []),
              ],
            }
          : undefined;
        enhancedFilters = {
          ...$state.filters,
          drillBy: enhancedDrillBy,
        };
      } else {
        enhancedFilters = $state.filters;
      }
    } else {
      enhancedFilters = undefined;
    }
  }

  let drillFormData;
  $: {
    const matrixifyContext = ($state.filters as any)?.matrixifyContext;
    drillFormData = matrixifyContext?.cellFormData || formData;
  }

  let drillModalIsOpen = writable(false);
  let drillByColumn = writable<Column | undefined>(undefined);
  let showDrillByModal = writable(false);

  const closeContextMenu = () => {
    visible.set(false);
    openKeys.set([]);
    onClose();
  };

  const handleDrillBy = (column: Column) => {
    drillByColumn.set(column);
    showDrillByModal.set(true);
  };

  const loadDrillByOptionsExtension = getExtensionsRegistry().get('load.drillby.options');

  const handleCloseDrillByModal = () => {
    showDrillByModal.set(false);
  };

  let menuItems: any[] = [];

  const showDrillToDetail =
    isFeatureEnabled(FeatureFlag.DrillToDetail) &&
    canDrillToDetail &&
    isDisplayed(ContextMenuItem.DrillToDetail);

  const showDrillBy =
    isFeatureEnabled(FeatureFlag.DrillBy) &&
    canDrillBy &&
    isDisplayed(ContextMenuItem.DrillBy) &&
    !(
      formData.matrixify_enable_vertical_layout === true ||
      formData.matrixify_enable_horizontal_layout === true
    );

  const datasetResource = useDatasetDrillInfo(
    formData.datasource,
    dashboardId,
    formData,
    !canDrillToDetail && !canDrillBy,
  );

  const isLoadingDataset = datasetResource.status === ResourceStatus.Loading;

  let filteredDataset;
  $: {
    if (datasetResource.status === ResourceStatus.Complete) {
      if (!showDrillBy) {
        filteredDataset = datasetResource.result;
      } else {
        const dataset = datasetResource.result;
        const filteredColumns = ensureIsArray(dataset.columns).filter(
          column =>
            (!loadDrillByOptionsExtension || column.groupby) &&
            !ensureIsArray(
              formData[enhancedFilters?.drillBy?.groupbyFieldName ?? ''],
            ).includes(column.column_name) &&
            column.column_name !== formData.x_axis &&
            ensureIsArray(additionalConfig?.drillBy?.excludedColumns)?.every(
              excludedCol => excludedCol.column_name !== column.column_name,
            ),
        );
        filteredDataset = {
          ...dataset,
          drillable_columns: filteredColumns,
        };
      }
    } else {
      filteredDataset = undefined;
    }
  }

  const showCrossFilters = isDisplayed(ContextMenuItem.CrossFilter);

  const isCrossFilteringSupportedByChart = getChartMetadataRegistry()
    .get(formData.viz_type)
    ?.behaviors?.includes(Behavior.InteractiveChart);

  let itemsCount = 0;
  if (showCrossFilters) itemsCount += 1;
  if (showDrillToDetail) itemsCount += 2;
  if (showDrillBy) itemsCount += 1;
  if (itemsCount === 0) itemsCount = 1;

  export const open = (clientX: number, clientY: number, filters?: ContextMenuFilters) => {
    const adjustedY = getMenuAdjustedY(clientY, itemsCount);
    state.set({ clientX, clientY: adjustedY, filters });
    const hiddenSpan = document.getElementById(`hidden-span-${id}`);
    if (hiddenSpan) {
      hiddenSpan.click();
    }
  };

  onMount(() => {
    // The open function is exposed to the parent component through a custom event.
    // This is not the standard Svelte way, but it's a workaround for the imperative API.
    dispatch('instance', { open });
  });
</script>

<Dropdown
  popupRender={() => (
    <Menu
      className="chart-context-menu"
      data-test="chart-context-menu"
      onOpenChange={(keys) => openKeys.set(keys)}
      onClick={() => {
        visible.set(false);
        openKeys.set([]);
        onClose();
      }}
    >
      {#if menuItems.length}
        {menuItems}
      {:else}
        <Menu.Item disabled>{t('No actions')}</Menu.Item>
      {/if}
    </Menu>
  )}
  trigger={['click']}
  onOpenChange={(value) => {
    visible.set(value);
    if (!value) {
      openKeys.set([]);
    }
  }}
  open={$visible}
>
  <span
    id={`hidden-span-${id}`}
    style="visibility: hidden; position: fixed; top: {$state.clientY}px; left: {$state.clientX}px; width: 1px; height: 1px;"
  />
</Dropdown>

{#if showDrillToDetail}
  <DrillDetailModal
    initialFilters={$modalFilters}
    chartId={id}
    formData={drillFormData}
    showModal={$drillModalIsOpen}
    onHideModal={() => drillModalIsOpen.set(false)}
    dataset={filteredDataset}
  />
{/if}

{#if showDrillByModal && $drillByColumn && filteredDataset && enhancedFilters?.drillBy}
  <DrillByModal
    column={$drillByColumn}
    drillByConfig={enhancedFilters?.drillBy}
    formData={formData}
    onHideModal={handleCloseDrillByModal}
    dataset={filteredDataset}
    canDownload={canDownload}
  />
{/if}