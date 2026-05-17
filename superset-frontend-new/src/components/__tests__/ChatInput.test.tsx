import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';
import ChatInput from '@/components/ChatInput';
import { test, expect, vi } from 'vitest';

test('renders with default placeholder', () => {
  render(<ChatInput />);
  expect(
    screen.getByPlaceholderText('Ask about this dashboard...'),
  ).toBeInTheDocument();
});

test('renders with custom placeholder', () => {
  render(<ChatInput placeholder="Ask anything..." />);
  expect(screen.getByPlaceholderText('Ask anything...')).toBeInTheDocument();
});

test('calls onSend when Enter is pressed with text', () => {
  const onSend = vi.fn();
  render(<ChatInput onSend={onSend} />);
  const input = screen.getByRole('textbox');

  fireEvent.change(input, { target: { value: 'Hello' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(onSend).toHaveBeenCalledWith('Hello');
});

test('clears input after sending', () => {
  const onSend = vi.fn();
  render(<ChatInput onSend={onSend} />);
  const input = screen.getByRole('textbox');

  fireEvent.change(input, { target: { value: 'Hello' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(input).toHaveValue('');
});

test('does not call onSend for empty input', () => {
  const onSend = vi.fn();
  render(<ChatInput onSend={onSend} />);
  const input = screen.getByRole('textbox');

  fireEvent.change(input, { target: { value: '   ' } });
  fireEvent.keyDown(input, { key: 'Enter' });

  expect(onSend).not.toHaveBeenCalled();
});
