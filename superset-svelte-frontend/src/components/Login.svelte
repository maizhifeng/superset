<script lang="ts">
  let username = '';
  let password = '';
  let loading = false;
  let errorMessage = '';
  let message = ''; // Add this line

  import { onMount } from 'svelte';
  import { navigate } from 'svelte-routing';
  import { authStore, login as authLogin } from '../stores/auth';

  async function handleSubmit() {
    loading = true;
    errorMessage = '';
    try {
      const response = await fetch('/login/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      if (response.ok) {
        const data = await response.json();
        message = 'Login successful!';
        authLogin(username);
        navigate('/');
      } else {
        const errorData = await response.json();
        errorMessage = errorData.message || 'Login failed. Please check your credentials.';
        console.error('Login failed:', errorData);
      }
    } catch (error) {
      errorMessage = 'An error occurred during login.';
      console.error('Network error:', error);
    } finally {
      loading = false;
    }
  }
</script>

<div class="login-container">
  <h2>Login</h2>
  {#if errorMessage}
    <p class="error-message">{errorMessage}</p>
  {/if}
  <form on:submit|preventDefault={handleSubmit}>
    <div class="form-group">
      <label for="username">Username:</label>
      <input type="text" id="username" bind:value={username} required />
    </div>
    <div class="form-group">
      <label for="password">Password:</label>
      <input type="password" id="password" bind:value={password} required />
    </div>
    <button type="submit" disabled={loading}>
      {#if loading}
        Logging in...
      {:else}
        Login
      {/if}
    </button>
  </form>
</div>

<style>
  .login-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    background-color: #f0f2f5;
    font-family: Arial, sans-serif;
  }

  h2 {
    color: #333;
    margin-bottom: 20px;
  }

  form {
    background-color: #fff;
    padding: 30px;
    border-radius: 8px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
    width: 100%;
    max-width: 350px;
    display: flex;
    flex-direction: column;
  }

  .form-group {
    margin-bottom: 15px;
  }

  label {
    display: block;
    margin-bottom: 5px;
    color: #555;
    font-weight: bold;
  }

  input[type="text"],
  input[type="password"] {
    width: 100%;
    padding: 10px;
    border: 1px solid #ddd;
    border-radius: 4px;
    box-sizing: border-box; /* Ensures padding doesn't increase width */
  }

  button {
    background-color: #007bff;
    color: white;
    padding: 10px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 16px;
    margin-top: 10px;
  }

  button:disabled {
    background-color: #cccccc;
    cursor: not-allowed;
  }

  .error-message {
    color: red;
    margin-bottom: 15px;
    text-align: center;
  }
</style>