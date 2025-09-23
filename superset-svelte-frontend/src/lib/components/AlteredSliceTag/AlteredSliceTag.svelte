<script lang="ts">
  import Tooltip from '@smui/tooltip';

  export let className: string = '';
</script>

<div class="altered-slice-tag {className}">
  <Tooltip>
    <div slot="tooltip-content">
      The slice has been altered.
    </div>
    <span class="altered-slice-tag-icon">ℹ️</span>
  </Tooltip>
</div>

<style>
  .altered-slice-tag {
    display: inline-block;
  }

  .altered-slice-tag-icon {
    cursor: pointer;
  }
</style>