import { writable } from 'svelte/store';

interface AuthState {
  isAuthenticated: boolean;
  user: { username: string } | null;
}

const initialState: AuthState = {
  isAuthenticated: false,
  user: null,
};

export const authStore = writable<AuthState>(initialState);

export function login(username: string) {
  authStore.set({
    isAuthenticated: true,
    user: { username },
  });
}

export function logout() {
  authStore.set(initialState);
}