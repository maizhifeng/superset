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
  import {
    css,
    t,
    useTheme,
    ensureIsArray,
    isDefined,
  } from '@superset-ui/core';
  import type {
    BaseFormData,
    BinaryQueryObjectFilterClause,
    Column,
    ContextMenuFilters,
    QueryData,
    AdhocFilter,
  } from '@superset-ui/core';
  import Dialog, { Title, Content, Actions } from '@smui/dialog';
  import Button from '@smui/button';
  import CircularProgress from '@smui/circular-progress';
  import { postFormData } from 'src/explore/exploreUtils/formData';
  import { simpleFilterToAdhoc } from 'src/utils/simpleFilterToAdhoc';
  import { getQuerySettings } from 'src/explore/exploreUtils';
  import { isEmbedded } from 'src/dashboard/util/isEmbedded';
  import { DrillByType } from '../types';
  import type { Dataset } from '../types';
  import DrillByChart from './DrillByChart.svelte';
  import { getChartDataRequest, handleChartDataResponse } from '../chartAction';

  // Props
  export let column: Column | undefined;
  export let dataset: Dataset;
  export let drillByConfig: Required<ContextMenuFilters>['drillBy'];
  export let formData: BaseFormData & { [key: string]: any };
  export let onHideModal: () => void;
  export let canDownload: boolean;

  const dispatch = createEventDispatcher();
  const theme = useTheme();

  let isChartDataLoading = true;
  let chartDataResult: QueryData[] | undefined;
  let chartName: string | undefined;
  let drillByDisplayMode = DrillByType.Chart;

  // State derived from props
  let drillByConfigs: (ContextMenuFilters['drillBy'] & { column?: Column })[] = [
    { ...drillByConfig, column },
  ];
  let currentFormData = formData;

  // Reactive state
  let currentConfig = drillByConfigs[drillByConfigs.length - 1] || {};
  let currentColumn: Column | undefined = currentConfig.column;
  let groupbyFieldName = currentConfig.groupbyFieldName || drillByConfig.groupbyFieldName;

  const DEFAULT_ADHOC_FILTER_FIELD_NAME = 'adhoc_filters';

  const getNewGroupby = (groupbyCol: Column, fieldName: string) =>
    Array.isArray(formData[fieldName])
      ? [groupbyCol.column_name]
      : groupbyCol.column_name;

  const getFiltersFromConfigsByFieldName = () =>
    drillByConfigs.reduce<Record<string, AdhocFilter[]>>((acc, config) => {
      const adhocFilterFieldName =
        config.adhocFilterFieldName || DEFAULT_ADHOC_FILTER_FIELD_NAME;
      if (config.filters) {
        acc[adhocFilterFieldName] = [
          ...(acc[adhocFilterFieldName] || []),
          ...config.filters.map(filter => simpleFilterToAdhoc(filter)),
        ];
      }
      return acc;
    }, {});

  let drilledFormData: (BaseFormData & { [key: string]: any }) | undefined;

  $: {
    let updatedFormData = { ...currentFormData };
    if (currentColumn && groupbyFieldName) {
      updatedFormData[groupbyFieldName] = getNewGroupby(
        currentColumn,
        groupbyFieldName,
      );
    }

    const adhocFilters = getFiltersFromConfigsByFieldName();
    Object.keys(adhocFilters).forEach(adhocFilterFieldName => {
      updatedFormData = {
        ...updatedFormData,
        [adhocFilterFieldName]: [
          ...ensureIsArray(formData[adhocFilterFieldName]),
          ...adhocFilters[adhocFilterFieldName],
        ],
      };
    });

    updatedFormData.slice_id = 0;
    delete updatedFormData.slice_name;
    delete updatedFormData.dashboards;
    drilledFormData = updatedFormData;

    if (drilledFormData) {
      const [useLegacyApi, parseMethod] = getQuerySettings(drilledFormData);
      isChartDataLoading = true;
      chartDataResult = undefined;
      getChartDataRequest({ formData: drilledFormData })
        .then(({ response, json }: { response: any; json: any }) =>
          handleChartDataResponse(response, json, useLegacyApi),
        )
        .then((queriesResponse: any) => {
          chartDataResult = queriesResponse;
        })
        .catch(() => {
          // TODO: addDangerToast
        })
        .finally(() => {
          isChartDataLoading = false;
        });
    }
  }

  onMount(() => {
    // TODO: dispatch logEvent
  });

  let inContextMenu = false;
  const onContextMenu = (
    offsetX: number,
    offsetY: number,
    filters: ContextMenuFilters,
  ) => {
    // TODO: implement context menu
  };

  // TODO: Implement contextMenu, displayModeToggle, resultsTable, metadataBar
</script>

<Dialog
  open
  on:SMUIDialog:closed={onHideModal}
  aria-labelledby="drill-by-title"
  aria-describedby="drill-by-content"
>
  <Title id="drill-by-title">{t('Drill by: %s', chartName)}</Title>
  <Content id="drill-by-content" style="height: 80vh; width: auto; min-width: 50vw;">
    <!-- metadataBar -->
    <!-- <Breadcrumb items={breadcrumbsData} /> -->
    <!-- displayModeToggle -->
    {#if isChartDataLoading}
      <CircularProgress style="width: 48px; height: 48px;" indeterminate />
    {/if}
    {#if !isChartDataLoading && !chartDataResult}
      <div>{t('There was an error loading the chart data')}</div>
    {/if}
    {#if drillByDisplayMode === DrillByType.Chart && chartDataResult && drilledFormData}
      <DrillByChart
        {dataset}
        formData={drilledFormData}
        result={chartDataResult}
        {onContextMenu}
        {inContextMenu}
      />
    {/if}
    <!-- resultsTable -->
    <!-- contextMenu -->
  </Content>
  <Actions>
    {#if !isEmbedded()}
      <Button disabled>
        <span>{t('Edit chart')}</span>
      </Button>
    {/if}
    <Button on:click={onHideModal} data-test="close-drill-by-modal">
      {t('Close')}
    </Button>
  </Actions>
</Dialog>