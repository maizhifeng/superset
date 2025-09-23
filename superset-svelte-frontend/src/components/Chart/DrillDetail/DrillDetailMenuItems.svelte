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
  import isEmpty from 'lodash/isEmpty';
  import {
    Behavior,
    css,
    extractQueryFields,
    getChartMetadataRegistry,
    removeHTMLTags,
    t,
  } from '@superset-ui/core';
  import type {
    BinaryQueryObjectFilterClause,
    QueryFormData,
  } from '@superset-ui/core';
  import Menu from '@smui/menu';
  import List, { Item } from '@smui/list';
  import { getSubmenuYOffset } from '../utils';
  import MenuItemTooltip from '../DisabledMenuItemTooltip/MenuItemTooltip.svelte';
  import MenuItemWithTruncation from '../MenuItemWithTruncation.svelte';
  import type { Dataset } from '../types';

  const DRILL_TO_DETAIL = t('Drill to detail');
  const DRILL_TO_DETAIL_BY = t('Drill to detail by');
  const DISABLED_REASONS = {
    DATABASE: t(
      'Drill to detail is disabled for this database. Change the database settings to enable it.',
    ),
    NO_AGGREGATIONS: t(
      'Drill to detail is disabled because this chart does not group data by dimension value.',
    ),
    NO_FILTERS: t(
      'Right-click on a dimension value to drill to detail by that value.',
    ),
    NOT_SUPPORTED: t(
      'Drill to detail by value is not yet supported for this chart type.',
    ),
  };

  export let formData: QueryFormData;
  export let filters: BinaryQueryObjectFilterClause[] = [];
  export let isContextMenu: boolean = false;
  export let contextMenuY: number = 0;
  export let onSelection: () => void = () => {};
  export let submenuIndex: number = 0;
  export let setShowModal: (show: boolean) => void;
  export let dataset: Dataset | undefined;
  export let isLoadingDataset: boolean | undefined;

  const dispatch = createEventDispatcher();

  let drillToDetailDisabled: boolean | undefined = false;

  // This is a placeholder for the redux state
  //$: drillToDetailDisabled = datasources[formData.datasource]?.database?.disable_drill_to_detail;

  const openModal = (
    selectedFilters: BinaryQueryObjectFilterClause[],
    event: MouseEvent,
  ) => {
    dispatch('click', event);
    onSelection();
    filters = selectedFilters;
    setShowModal(true);
  };

  const handlesDimensionContextMenu = getChartMetadataRegistry()
    .get(formData.viz_type)
    ?.behaviors.find(behavior => behavior === Behavior.DrillToDetail);

  const noAggregations = (() => {
    const { metrics } = extractQueryFields(formData);
    return isEmpty(metrics);
  })();

  const submenuYOffset = getSubmenuYOffset(
    contextMenuY,
    filters.length > 1 ? filters.length + 1 : filters.length,
    submenuIndex,
  );

  let drillDisabled: string | undefined;
  let drillByDisabled: string | undefined;
  let showSubMenu = false;

  if (drillToDetailDisabled) {
    drillDisabled = DISABLED_REASONS.DATABASE;
    drillByDisabled = DISABLED_REASONS.DATABASE;
  } else if (handlesDimensionContextMenu) {
    if (noAggregations) {
      drillDisabled = DISABLED_REASONS.NO_AGGREGATIONS;
      drillByDisabled = DISABLED_REASONS.NO_AGGREGATIONS;
    } else if (!filters?.length) {
      drillByDisabled = DISABLED_REASONS.NO_FILTERS;
    }
  } else {
    drillByDisabled = DISABLED_REASONS.NOT_SUPPORTED;
  }
</script>

<style>
  .filter-val {
    font-weight: var(--superset-font-weight-strong);
    color: var(--superset-color-primary);
  }
</style>

{#if drillDisabled}
  <Item disabled style="position: relative;">
    {DRILL_TO_DETAIL}
    <MenuItemTooltip title={drillDisabled ?? ''} />
  </Item>
{:else}
  <Item on:click={(e: MouseEvent) => openModal([], e)}>{DRILL_TO_DETAIL}</Item>
{/if}

{#if isContextMenu}
  {#if drillByDisabled}
    <Item disabled style="position: relative;">
      {DRILL_TO_DETAIL_BY}
      <MenuItemTooltip title={drillByDisabled ?? ''} />
    </Item>
  {:else}
    <div
      style="position: relative;"
      on:mouseenter={() => (showSubMenu = true)}
      on:mouseleave={() => (showSubMenu = false)}
    >
      <Item>
        {DRILL_TO_DETAIL_BY}
        <span style="flex-grow: 1;" />
        <span>▶</span>
      </Item>
      <Menu
        open={showSubMenu}
        style="position: absolute; left: 100%; top: {submenuYOffset}px; z-index: 1000;"
        anchor={false}
      >
        <List>
          <div data-test="drill-to-detail-by-submenu">
            {#each filters as filter, i}
              <MenuItemWithTruncation
                tooltipText={`${DRILL_TO_DETAIL_BY} ${filter.formattedVal ?? ''}`}
                on:click={(e: MouseEvent) => openModal([filter], e)}
              >
                {`${DRILL_TO_DETAIL_BY} `}
                <span class="filter-val"
                  >{removeHTMLTags(filter.formattedVal ?? '')}</span
                >
              </MenuItemWithTruncation>
            {/each}
            {#if filters.length > 1}
              <Item on:click={(e: MouseEvent) => openModal(filters, e)}>
                <div>
                  {`${DRILL_TO_DETAIL_BY} `}
                  <span class="filter-val">{t('all')}</span>
                </div>
              </Item>
            {/if}
          </div>
        </List>
      </Menu>
    </div>
  {/if}
{/if}