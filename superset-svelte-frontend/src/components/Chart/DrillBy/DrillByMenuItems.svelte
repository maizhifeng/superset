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

  import { createEventDispatcher, onMount } from 'svelte';
  import debounce from 'lodash/debounce';
  import {
    Behavior,
    css,
    ensureIsArray,
    getChartMetadataRegistry,
    t,
    useTheme,
  } from '@superset-ui/core';
  import type {
    BaseFormData,
    Column,
    ContextMenuFilters,
  } from '@superset-ui/core';
  import Menu from '@smui/menu';
  import List, { Item } from '@smui/list';
  import Textfield from '@smui/textfield';
  import Icon from '@smui/textfield/icon';
  import MenuItemTooltip from '../DisabledMenuItemTooltip/MenuItemTooltip.svelte';
  import { getSubmenuYOffset } from '../utils';
  import MenuItemWithTruncation from '../MenuItemWithTruncation.svelte';
  import type { Dataset } from '../types';

  const SUBMENU_HEIGHT = 200;
  const SHOW_COLUMNS_SEARCH_THRESHOLD = 10;
  const SEARCH_INPUT_HEIGHT = 48;

  export let drillByConfig: ContextMenuFilters['drillBy'];
  export let formData: BaseFormData & { [key: string]: any };
  export let contextMenuY: number = 0;
  export let submenuIndex: number = 0;
  export let onSelection: (...args: any) => void = () => {};
  export let onClick: (event: MouseEvent) => void = () => {};
  export let onCloseMenu: () => void = () => {};
  export let openNewModal: boolean = true;
  export let excludedColumns: Column[] | undefined = undefined;
  export let open: boolean;
  export let onDrillBy: ((column: Column, dataset: Dataset) => void) | undefined =
    undefined;
  export let dataset: Dataset | undefined;
  export let isLoadingDataset: boolean = false;

  const dispatch = createEventDispatcher();
  const theme = useTheme();

  let searchInput = '';
  let debouncedSearchInput = '';
  let searchInputRef: HTMLInputElement | null = null;
  let showSubMenu = false;

  let columns: Column[] = [];
  $: columns = dataset ? ensureIsArray(dataset.drillable_columns) : [];
  $: showSearch = columns.length > SHOW_COLUMNS_SEARCH_THRESHOLD;

  const handleSelection = (event: Event, column: Column) => {
    onClick(event as MouseEvent);
    onSelection(column, drillByConfig);
    if (openNewModal && onDrillBy && dataset) {
      onDrillBy(column, dataset);
    }
    onCloseMenu();
  };

  $: if (open && searchInputRef) {
    searchInputRef.focus({ preventScroll: true });
  } else {
    searchInput = '';
    debouncedSearchInput = '';
  }

  const hasDrillBy = drillByConfig?.groupbyFieldName;

  const handlesDimensionContextMenu = getChartMetadataRegistry()
    .get(formData.viz_type)
    ?.behaviors.find(behavior => behavior === Behavior.DrillBy);

  const debouncedSetSearchInput = debounce((value: string) => {
    debouncedSearchInput = value;
  }, 250);

  const handleInput = (event: Event) => {
    const target = event.target as HTMLInputElement;
    searchInput = target.value;
    debouncedSetSearchInput(target.value);
  };

  let filteredColumns: Column[] = [];
  $: filteredColumns = columns.filter(column =>
    (column.verbose_name || column.column_name)
      .toLowerCase()
      .includes(debouncedSearchInput.toLowerCase()),
  );

  let submenuYOffset: number;
  $: submenuYOffset = getSubmenuYOffset(
    contextMenuY,
    filteredColumns.length || 1,
    submenuIndex,
    SUBMENU_HEIGHT,
    showSearch ? SEARCH_INPUT_HEIGHT : 0,
  );

  let tooltip: string | undefined;

  if (!handlesDimensionContextMenu) {
    tooltip = t('Drill by is not yet supported for this chart type');
  } else if (!hasDrillBy) {
    tooltip = t('Drill by is not available for this data point');
  }

  // Don't render drill by menu items when matrixify is enabled
  if (
    formData.matrixify_enable_vertical_layout === true ||
    formData.matrixify_enable_horizontal_layout === true
  ) {
    // Render nothing
  } else if (!handlesDimensionContextMenu || !hasDrillBy) {
    // Render disabled menu item
  } else {
    // Render submenu
  }
</script>

{#if formData.matrixify_enable_vertical_layout !== true && formData.matrixify_enable_horizontal_layout !== true}
  {#if !handlesDimensionContextMenu || !hasDrillBy}
    <Item disabled on:click={onClick}>
      {t('Drill by')}
      <MenuItemTooltip title={tooltip ?? ''} />
    </Item>
  {:else}
    <div
      style="position: relative;"
      on:mouseenter={() => (showSubMenu = true)}
      on:mouseleave={() => (showSubMenu = false)}
      on:click={onClick}
    >
      <Item>
        {t('Drill by')}
        <span style="flex-grow: 1;" />
        <span>▶</span>
      </Item>
      <Menu
        open={showSubMenu}
        style="position: absolute; left: 100%; top: {submenuYOffset}px; z-index: 1000;"
        anchor={false}
      >
        <List>
          <div data-test="drill-by-submenu">
            {#if showSearch}
              <Textfield
                bind:this={searchInputRef}
                on:input={handleInput}
                label={t('Search columns')}
                style="width: auto; max-width: 100%; margin: 8px 12px; box-shadow: none;"
                bind:value={searchInput}
              >
                <Icon class="material-icons" slot="leadingIcon">search</Icon>
              </Textfield>
            {/if}
            {#if isLoadingDataset}
              <div style="padding: 12px 0;">{t('Loading...')}</div>
            {:else if filteredColumns.length}
              <div style="height: {SUBMENU_HEIGHT}px; width: 100%; overflow-y: auto;">
                {#each filteredColumns as column (column.column_name)}
                  <MenuItemWithTruncation
                    tooltipText={column.verbose_name || column.column_name || ''}
                    on:click={e => handleSelection(e, column)}
                  >
                    {column.verbose_name || column.column_name}
                  </MenuItemWithTruncation>
                {/each}
              </div>
            {:else}
              <Item disabled key="no-drill-by-columns-found">
                {t('No columns found')}
              </Item>
            {/if}
          </div>
        </List>
      </Menu>
    </div>
  {/if}
{/if}