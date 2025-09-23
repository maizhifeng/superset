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
  import { onMount } from 'svelte';
  import { Item } from '@smui/list';
  import Tooltip from '@smui/tooltip';

  export let tooltipText: string = '';
  export let disabled: boolean = false;

  let labelRef: HTMLElement;
  let isTruncated = false;

  onMount(() => {
    if (labelRef) {
      isTruncated = labelRef.scrollWidth > labelRef.clientWidth;
    }
  });

  const labelStyles = `
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 1 1 auto;
  `;
</script>

<Item {...$$restProps} {disabled}>
  <div style="display: flex; width: 100%;">
    {#if isTruncated && tooltipText}
      <Tooltip>
        <span bind:this={labelRef} style={labelStyles}><slot /></span>
        <div slot="tooltip">{tooltipText}</div>
      </Tooltip>
    {:else}
      <span bind:this={labelRef} style={labelStyles}><slot /></span>
    {/if}
  </div>
</Item>