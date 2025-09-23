<script>
  import { Router, Route } from 'svelte-routing';
  import Login from './components/Login.svelte';
  import { authStore, logout } from './stores/auth';

  let isAuthenticated;
  let username;

  authStore.subscribe(state => {
    isAuthenticated = state.isAuthenticated;
    username = state.user ? state.user.username : '';
  });

  function handleLogout() {
    logout();
  }
</script>

<main>
  {#if isAuthenticated}
    <nav>
      Welcome, {username}!
      <button on:click={handleLogout}>Logout</button>
    </nav>
    <h1>Welcome to the Svelte Superset Frontend!</h1>
    <p>This is the main application content.</p>
  {:else}
    <Router>
      <Route path="/login" component={Login} />
      <Route path="/">
        <h1>Please log in to continue.</h1>
      </Route>
    </Router>
  {/if}
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

  @media (min-width: 640px) {
    main {
      max-width: none;
    }
  }
</style>