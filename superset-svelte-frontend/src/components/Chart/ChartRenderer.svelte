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
import { snakeCase, isEqual, cloneDeep } from 'lodash';
import { createRef, onMount, onDestroy, tick } from 'svelte';
import {
  SuperChart,
  logging,
  Behavior,
  t,
  getChartMetadataRegistry,
  VizType,
  isFeatureEnabled,
  FeatureFlag,
} from '@superset-ui/core';
import { Logger, LOG_ACTIONS_RENDER_CHART } from 'src/logger/LogUtils';
import { EmptyState } from '@superset-ui/core/components';
import { ChartSource } from 'src/types/ChartSource';
import ChartContextMenu from './ChartContextMenu/ChartContextMenu.svelte';

export let annotationData: object;
export let actions: object;
export let chartId: number;
export let datasource: object;
export let initialValues: object = {};
export let formData: object;
export let latestQueryFormData: object;
export let labelsColor: object;
export let labelsColorMap: object;
export let height: number;
export let width: number;
export let setControlValue: (name: string, value: any) => void = () => {};
export let vizType: string;
export let triggerRender: boolean = false;
// state
export let chartAlert: string;
export let chartStatus: string;
export let queriesResponse: object[];
export let triggerQuery: boolean;
export let chartIsStale: boolean;
// dashboard callbacks
export let addFilter: (col: string, vals: any[], merge?: boolean, refresh?: boolean) => void = () => {};
export let setDataMask: (dataMask: object) => void;
export let onFilterMenuOpen: () => void = () => {};
export let onFilterMenuClose: () => void = () => {};
export let ownState: object;
export let postTransformProps: (props: object) => object;
export let source: ChartSource;
export let emitCrossFilters: boolean;

const BLANK = {};

const BIG_NO_RESULT_MIN_WIDTH = 300;
const BIG_NO_RESULT_MIN_HEIGHT = 220;

const behaviors = [Behavior.InteractiveChart];

let showContextMenu: boolean;
let inContextMenu: boolean = false;
let legendState: any;
let legendIndex: number = 0;
let hasQueryResponseChange: boolean = false;

let contextMenuRef;

let mutableQueriesResponse;

$: {
  const suppressContextMenu = getChartMetadataRegistry().get(
    formData.viz_type ?? vizType,
  )?.suppressContextMenu;
  showContextMenu =
    source === ChartSource.Dashboard &&
    !suppressContextMenu &&
    isFeatureEnabled(FeatureFlag.DrillToDetail);
}

$: mutableQueriesResponse = cloneDeep(queriesResponse);

function handleAddFilter(col, vals, merge = true, refresh = true) {
  addFilter(col, vals, merge, refresh);
}

let renderStartTime;

function handleRenderSuccess() {
  if (['loading', 'rendered'].indexOf(chartStatus) < 0) {
    actions.chartRenderingSucceeded(chartId);
  }

  if (hasQueryResponseChange) {
    actions.logEvent(LOG_ACTIONS_RENDER_CHART, {
      slice_id: chartId,
      viz_type: vizType,
      start_offset: renderStartTime,
      ts: new Date().getTime(),
      duration: Logger.getTimestamp() - renderStartTime,
    });
  }
}

function handleRenderFailure(error, info) {
  logging.warn(error);
  actions.chartRenderingFailed(
    error.toString(),
    chartId,
    info ? info.componentStack : null,
  );

  if (hasQueryResponseChange) {
    actions.logEvent(LOG_ACTIONS_RENDER_CHART, {
      slice_id: chartId,
      has_err: true,
      error_details: error.toString(),
      start_offset: renderStartTime,
      ts: new Date().getTime(),
      duration: Logger.getTimestamp() - renderStartTime,
    });
  }
}

function handleSetControlValue(...args) {
  if (setControlValue) {
    setControlValue(...args);
  }
}

function handleOnContextMenu(offsetX, offsetY, filters) {
  contextMenuRef.open(offsetX, offsetY, filters);
  inContextMenu = true;
}

function handleContextMenuSelected() {
  inContextMenu = false;
}

function handleContextMenuClosed() {
  inContextMenu = false;
}

function handleLegendStateChanged(newLegendState) {
  legendState = newLegendState;
}

function onContextMenuFallback(event) {
  if (!inContextMenu) {
    event.preventDefault();
    handleOnContextMenu(event.clientX, event.clientY);
  }
}

function handleLegendScroll(newLegendIndex) {
  legendIndex = newLegendIndex;
}

const hooks = {
  onAddFilter: handleAddFilter,
  onContextMenu: showContextMenu ? handleOnContextMenu : undefined,
  onError: handleRenderFailure,
  setControlValue: handleSetControlValue,
  onFilterMenuOpen: onFilterMenuOpen,
  onFilterMenuClose: onFilterMenuClose,
  onLegendStateChanged: handleLegendStateChanged,
  setDataMask: dataMask => {
    actions?.updateDataMask(chartId, dataMask);
  },
  onLegendScroll: handleLegendScroll,
};

$: hasQueryResponseChange = queriesResponse !== queriesResponse;

$: currentFormData = chartIsStale && latestQueryFormData ? latestQueryFormData : formData;
$: currentVizType = currentFormData.viz_type || vizType;
$: snakeCaseVizType = snakeCase(currentVizType);
$: chartClassName =
  currentVizType === VizType.Table
    ? `superset-chart-${snakeCaseVizType}`
    : snakeCaseVizType;

$: webpackHash =
  process.env.WEBPACK_MODE === 'development'
    ? `-${
      typeof __webpack_require__ !== 'undefined' &&
      typeof __webpack_require__.h === 'function' &&
      __webpack_require__.h()
    }`
    : '';

$: noResultTitle = t('No results were returned for this query');
$: noResultDescription =
  source === ChartSource.Explore
    ? t(
        'Make sure that the controls are configured properly and the datasource contains data for the selected time range',
      )
    : undefined;
$: noResultImage = 'chart.svg';

$: drillToDetailProps = getChartMetadataRegistry()
  .get(formData.viz_type)
  ?.behaviors.find(behavior => behavior === Behavior.DrillToDetail)
  ? { inContextMenu: inContextMenu }
  : {};

$: bypassNoResult = !(
  formData?.server_pagination && (ownState?.searchText?.length || 0) > 0
);

onMount(() => {
  renderStartTime = Logger.getTimestamp();
});
</script>

{#if chartStatus !== 'loading' && !chartAlert && chartStatus !== null}
  <div on:contextmenu={showContextMenu ? onContextMenuFallback : undefined}>
    {#if showContextMenu}
      <ChartContextMenu
        bind:this={contextMenuRef}
        id={chartId}
        formData={currentFormData}
        on:selection={handleContextMenuSelected}
        on:close={handleContextMenuClosed}
      />
    {/if}
    <SuperChart
      disableErrorBoundary
      key={`${chartId}${webpackHash}`}
      id={`chart-id-${chartId}`}
      className={chartClassName}
      chartType={currentVizType}
      {width}
      {height}
      {annotationData}
      {datasource}
      {initialValues}
      formData={currentFormData}
      {ownState}
      {filterState}
      {hooks}
      {behaviors}
      queriesData={mutableQueriesResponse}
      onRenderSuccess={handleRenderSuccess}
      onRenderFailure={handleRenderFailure}
      noResults={
        width > BIG_NO_RESULT_MIN_WIDTH && height > BIG_NO_RESULT_MIN_HEIGHT
          ? EmptyState({
              size: 'large',
              title: noResultTitle,
              description: noResultDescription,
              image: noResultImage,
            })
          : EmptyState({
              title: noResultTitle,
              image: noResultImage,
              size: 'small',
            })
      }
      {postTransformProps}
      {emitCrossFilters}
      {legendState}
      enableNoResults={bypassNoResult}
      {legendIndex}
      {...drillToDetailProps}
    />
  </div>
{/if}