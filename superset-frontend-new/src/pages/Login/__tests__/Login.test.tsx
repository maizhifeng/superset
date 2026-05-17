import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '@/pages/Login';
import { useAuthStore } from '@/store/authStore';
import { test, expect, vi, beforeEach } from 'vitest';

vi.mock('@/store/authStore', () => ({
  useAuthStore: vi.fn(),
}));

const mockLogin = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuthStore).mockImplementation((selector?: any) => {
    const state = { login: mockLogin };
    return selector ? selector(state) : state;
  });
  window.location.href = '';
});

function renderLogin() {
  return render(
    <MemoryRouter>
      <Login />
    </MemoryRouter>,
  );
}

test('renders login form', () => {
  renderLogin();
  expect(screen.getByText('starfly')).toBeInTheDocument();
  expect(screen.getByText('Sign in to continue')).toBeInTheDocument();
  expect(screen.getByLabelText('Username')).toBeInTheDocument();
  expect(screen.getByLabelText('Password')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sign In' })).toBeInTheDocument();
});

test('shows error on failed login', async () => {
  mockLogin.mockRejectedValue(new Error('Invalid credentials'));
  renderLogin();

  await userEvent.type(screen.getByLabelText('Username'), 'admin');
  await userEvent.type(screen.getByLabelText('Password'), 'wrong');
  await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  expect(await screen.findByText('Invalid credentials')).toBeInTheDocument();
});

test('navigates to home on successful login', async () => {
  mockLogin.mockResolvedValue(undefined);
  renderLogin();

  await userEvent.type(screen.getByLabelText('Username'), 'admin');
  await userEvent.type(screen.getByLabelText('Password'), 'pass');
  await userEvent.click(screen.getByRole('button', { name: 'Sign In' }));

  await screen.findByText('Sign In');
  expect(window.location.href).toBe('http://localhost:3000/');
});

test('renders with username autoFocus', () => {
  renderLogin();
  const usernameInput = screen.getByLabelText('Username');
  expect(document.activeElement).toBe(usernameInput);
});
