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

  import { createEventDispatcher, onMount, setContext } from 'svelte';
  import {
    css,
    t,
    useTheme,
  } from '@superset-ui/core';
  import type { BinaryQueryObjectFilterClause, QueryFormData } from '@superset-ui/core';
  import Dialog, { Title, Content, Actions } from '@smui/dialog';
  import Button from '@smui/button';
  import { isEmbedded } from 'src/dashboard/util/isEmbedded';
  import type { Slice } from 'src/types/Chart';
  // import { findPermission } from 'src/utils/findPermission';
  import type { Dataset } from '../types';
  // import DrillDetailPane from './DrillDetailPane.svelte';

  export let chartId: number;
  export let formData: QueryFormData;
  export let initialFilters: BinaryQueryObjectFilterClause[];
  export let showModal: boolean;
  export let onHideModal: () => void;
  export let dataset: Dataset | undefined;

  // This is a placeholder for the redux state
  const chartName: string = '';
  const canExplore: boolean = false;
  const dashboardPageId: string | null = null;

  const theme = useTheme();
  const dispatch = createEventDispatcher();

  const exploreUrl = `/explore/?dashboard_page_id=${dashboardPageId}&slice_id=${chartId}`;

  const exploreChart = () => {
    // In Svelte, you would use a navigation library like svelte-routing
    // to navigate to the exploreUrl.
    // For now, we'll just log it to the console.
    console.log('Navigating to:', exploreUrl);
  };

  function closeModal() {
    if (onHideModal) {
      onHideModal();
    }
  }
</script>

<Dialog
  open={showModal}
  on:SMUIDialog:closed={closeModal}
  aria-labelledby="drill-to-detail-title"
  aria-describedby="drill-to-detail-content"
>
  <Title id="drill-to-detail-title">{t('Drill to detail: %s', chartName)}</Title>
  <Content id="drill-to-detail-content">
    <!-- <DrillDetailPane {formData} {initialFilters} {dataset} /> -->
  </Content>
  <Actions>
    {#if !isEmbedded()}
      <Button
        color="secondary"
        onClick={exploreChart}
        disabled={!canExplore}
      >
        {#if !canExplore}
          <span title={t('You do not have sufficient permissions to edit the chart')}>
            {t('Edit chart')}
          </span>
        {:else}
          {t('Edit chart')}
        {/if}
      </Button>
    {/if}
    <Button
      on:click={closeModal}
      data-test="close-drilltodetail-modal"
      style={`margin-left: ${theme.gridUnit * 2}px;`}
    >
      {t('Close')}
    </Button>
  </Actions>
</Dialog>