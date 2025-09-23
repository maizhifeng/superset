<script lang="ts">
  import Button from '@smui/button';

  export let text: string;
  export let shouldShowText = true;
  export let copyNode: HTMLElement | null = null;

  let showTooltip = false;

  function copyToClipboard() {
    const toCopy = copyNode ? copyNode.innerText : text;
    navigator.clipboard.writeText(toCopy).then(() => {
      showTooltip = true;
      setTimeout(() => {
        showTooltip = false;
      }, 2000);
    });
  }
</script>

<div class="copy-to-clipboard">
  {#if shouldShowText}
    <span class="copy-text">{text}</span>
  {/if}
  <Button on:click={copyToClipboard}>
    <span class="material-icons">content_copy</span>
  </Button>
  {#if showTooltip}
    <div class="tooltip">Copied!</div>
  {/if}
</div>

<style>
  .copy-to-clipboard {
    display: inline-flex;
    align-items: center;
  }

  .copy-text {
    margin-right: 8px;
  }

  .tooltip {
    position: absolute;
    background-color: #333;
    color: white;
    padding: 4px 8px;
    border-radius: 4px;
    margin-left: 8px;
  }
</style>