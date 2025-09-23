<script lang="ts">
  import CopyToClipboard from './lib/components/CopyToClipboard/CopyToClipboard.svelte';
  import AlteredSliceTag from './lib/components/AlteredSliceTag/AlteredSliceTag.svelte';
</script>

<main>
  <h1>Hello world!</h1>
  <CopyToClipboard text="Hello, Svelte!" />
  <AlteredSliceTag />
</main>

<style>
  main {
    text-align: center;
    padding: 1em;
    max-width: 240px;
    margin: 0 auto;
  }

  h1 {
    color: #ff3e00;
    text-transform: uppercase;
    font-size: 4em;
    font-weight: 100;
  }
</style>