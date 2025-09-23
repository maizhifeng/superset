<script lang="ts">
  import { onMount } from 'svelte';
  import { Chart as ChartJs, registerables } from 'chart.js';
  import type { ChartState, Datasource, ChartStatus } from 'src/explore/types';
  import { EmptyState, Loading } from '@superset-ui/core/components';
  import ChartRenderer from '../../../../components/Chart/ChartRenderer.svelte';
  import ChartErrorMessage from './ChartErrorMessage.svelte';

  export let annotationData: any = {};
  export let actions: any;
  export let chartId: number;
  export let datasource: Datasource | undefined = undefined;
  export let dashboardId: number | undefined = undefined;
  export let initialValues: any = {};
  export let formData: any;
  export let labelColors: string | undefined = undefined;
  export let sharedLabelColors: string | undefined = undefined;
  export let width: number;
  export let height: number;
  export let setControlValue: Function;
  export let timeout: number | undefined = undefined;
  export let vizType: string;
  export let triggerRender: boolean = false;
  export let force: boolean = false;
  export let isFiltersInitialized: boolean = false;
  export let chartAlert: string | undefined = undefined;
  export let chartStatus: ChartStatus | undefined = undefined;
  export let chartStackTrace: string | undefined = undefined;
  export let queriesResponse: ChartState['queriesResponse'];
  export let latestQueryFormData: ChartState['latestQueryFormData'];
  export let triggerQuery: boolean = false;
  export let chartIsStale: boolean = false;
  export let errorMessage: any | undefined = undefined;
  export let addFilter: (type: string) => void = () => {};
  export let onQuery: () => void = () => {};
  export let onFilterMenuOpen: (chartId: number, column: string) => void = () => {};
  export let onFilterMenuClose: (chartId: number, column: string) => void = () => {};
  export let ownState: any = {};
  export let postTransformProps: Function | undefined = undefined;
  export let datasetsStatus: 'loading' | 'error' | 'complete' | undefined = undefined;
  export let isInView: boolean = true;
  export let emitCrossFilters: boolean = false;

  let renderStartTime: any;

  const runQuery = () => {
    actions.postChartFormData(
      formData,
      force,
      timeout,
      chartId,
      dashboardId,
      ownState,
    );
  };

  onMount(() => {
    if (triggerQuery) {
      runQuery();
    }
  });

  $: if (triggerQuery) {
    runQuery();
  }
</script>

<div class="chart-container" style="height: {height}px; width: {width}px;">
  {#if chartStatus === 'loading'}
    <div class="loading-div">
      <Loading position="inline-centered" size={dashboardId ? 's' : 'm'} muted={!!dashboardId} />
      <span class="message-span">
        {datasource?.database?.name ? `Waiting on ${datasource.database.name}` : 'Waiting on database...'}
      </span>
    </div>
  {:else if chartStatus === 'failed'}
    {#each queriesResponse as item}
      <ChartErrorMessage
        chartId={chartId}
        error={item?.errors?.[0]}
        subtitle={chartAlert || item?.message}
        link={item ? item.link : undefined}
        source={dashboardId ? 'Dashboard' : 'Explore'}
        stackTrace={chartStackTrace}
      />
    {/each}
  {:else if errorMessage && (!queriesResponse || queriesResponse.length === 0)}
    <EmptyState
      size="large"
      title="Add required control values to preview chart"
      description="..."
      image="chart.svg"
    />
  {:else if !chartStatus && !chartAlert && !errorMessage && chartIsStale && (!queriesResponse || queriesResponse.length === 0)}
    <EmptyState
      size="large"
      title="Your chart is ready to go!"
      description="Click on 'Create chart' button in the control panel on the left to preview a visualization or click here."
      image="chart.svg"
    />
  {:else}
    <div class="slice_container" style="height: {height}px;">
      {#if isInView}
        <ChartRenderer
          {...$$props}
          source={dashboardId ? 'dashboard' : 'explore'}
        />
      {:else}
        <Loading size={dashboardId ? 's' : 'm'} muted={!!dashboardId} />
      {/if}
    </div>
  {/if}
</div>

<style>
  .chart-container {
    position: relative;
  }

  .chart-tooltip {
    opacity: 0.75;
    font-size: 12px;
  }

  .slice_container {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .slice_container .pivot_table tbody tr {
    font-feature-settings: 'tnum' 1;
  }

  .slice_container .alert {
    margin: 8px;
  }

  .loading-div {
    position: absolute;
    left: 50%;
    top: 50%;
    width: 80%;
    transform: translate(-50%, -50%);
  }

  .message-span {
    display: block;
    text-align: center;
    margin: 16px auto;
    width: fit-content;
  }
</style>