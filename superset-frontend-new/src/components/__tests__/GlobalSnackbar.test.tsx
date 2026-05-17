import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import GlobalSnackbar from '@/components/GlobalSnackbar';
import { useNotificationStore } from '@/store/notificationStore';
import { test, expect, beforeEach, vi } from 'vitest';

beforeEach(() => {
  useNotificationStore.setState({ notifications: [] });
});

test('renders nothing when no notifications', () => {
  const { container } = render(<GlobalSnackbar />);
  expect(container.firstChild).toBeNull();
});

test('renders notification alert', () => {
  act(() => {
    useNotificationStore.getState().notify({
      severity: 'success',
      message: 'Chart saved',
    });
  });

  render(<GlobalSnackbar />);
  expect(screen.getByText('Chart saved')).toBeInTheDocument();
});

test('dismisses notification on close', async () => {
  act(() => {
    useNotificationStore.getState().notify({
      severity: 'error',
      message: 'Something failed',
    });
  });

  render(<GlobalSnackbar />);
  expect(screen.getByText('Something failed')).toBeInTheDocument();

  const closeButton = screen.getByRole('button');
  await act(async () => {
    await userEvent.click(closeButton);
  });

  expect(useNotificationStore.getState().notifications).toHaveLength(0);
});

test('renders action button when provided', () => {
  const onClick = vi.fn();

  act(() => {
    useNotificationStore.getState().notify({
      severity: 'info',
      message: 'Deleted',
      action: { label: 'Undo', onClick },
    });
  });

  render(<GlobalSnackbar />);
  expect(screen.getByText('Undo')).toBeInTheDocument();
});
