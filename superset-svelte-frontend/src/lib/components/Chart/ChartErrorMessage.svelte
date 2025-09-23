<script lang="ts">
  import type { SupersetError, ClientErrorObject } from '@superset-ui/core';
  import { onMount } from 'svelte';

  export let chartId: number;
  export let error: SupersetError | undefined = undefined;
  export let subtitle: string;
  export let link: string | undefined = undefined;
  export let source: any; // Replace with actual ChartSource type
  export let stackTrace: string | undefined = undefined;

  let owners: string[] = [];

  // TODO: Implement a Svelte-equivalent of useChartOwnerNames
  onMount(async () => {
    // Mocking the hook's behavior for now
    // In a real scenario, you would fetch this data from an API
    owners = ['Owner 1', 'Owner 2'];
  });

  const DEFAULT_CHART_ERROR = 'Data error';

  // $: ownedError = error && {
  //   ...error,
  //   extra: { ...error.extra, owners },
  // };
</script>

<div>
  <!-- TODO: Implement ErrorMessageWithStackTrace component -->
  <h4>{DEFAULT_CHART_ERROR}</h4>
  <p>{subtitle}</p>
  {#if error}
    <pre>{JSON.stringify(error, null, 2)}</pre>
  {/if}
  {#if stackTrace}
    <pre>{stackTrace}</pre>
  {/if}
  {#if link}
    <a href={link}>More info</a>
  {/if}
</div>