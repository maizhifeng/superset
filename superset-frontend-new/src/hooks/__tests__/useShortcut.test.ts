import { test, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useShortcut } from '@/hooks/useShortcut';

const { boundCallbacks, mockBind, mockUnbind } = vi.hoisted(() => {
  const cbs: Record<string, Function> = {};
  return {
    boundCallbacks: cbs,
    mockBind: vi.fn((keys: string | string[], handler: Function) => {
      (Array.isArray(keys) ? keys : [keys]).forEach(k => {
        cbs[k] = handler;
      });
    }),
    mockUnbind: vi.fn((keys: string | string[]) => {
      (Array.isArray(keys) ? keys : [keys]).forEach(k => {
        delete cbs[k];
      });
    }),
  };
});

vi.mock('mousetrap', () => {
  const mockFn = vi.fn() as unknown as (() => void) & {
    bind: typeof mockBind;
    unbind: typeof mockUnbind;
    init: () => void;
    prototype: { stopCallback: () => boolean };
  };
  mockFn.prototype = { stopCallback: () => false };
  mockFn.bind = mockBind;
  mockFn.unbind = mockUnbind;
  mockFn.init = vi.fn();
  return { default: mockFn };
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(boundCallbacks).forEach(k => delete boundCallbacks[k]);
});

function createKeyboardEvent(overrides?: Partial<KeyboardEvent>): KeyboardEvent {
  return {
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: document.body,
    ...overrides,
  } as unknown as KeyboardEvent;
}

test('registers shortcut with Mousetrap', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('ctrl+s', handler));

  expect(mockBind).toHaveBeenCalledWith(
    ['ctrl+s'],
    expect.any(Function),
  );
});

test('registers array of shortcuts', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut(['ctrl+enter', 'ctrl+r'], handler));

  expect(mockBind).toHaveBeenCalledWith(
    ['ctrl+enter', 'ctrl+r'],
    expect.any(Function),
  );
});

test('calls handler when shortcut is triggered', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('ctrl+s', handler));

  const event = createKeyboardEvent({ target: document.body });
  act(() => {
    boundCallbacks['ctrl+s']?.(event);
  });

  expect(handler).toHaveBeenCalledWith(event);
});

test('passes preventDefault from the event', () => {
  const handler = vi.fn((e: KeyboardEvent) => e.preventDefault());
  renderHook(() => useShortcut('ctrl+s', handler));

  const event = createKeyboardEvent();
  act(() => {
    boundCallbacks['ctrl+s']?.(event);
  });

  expect(event.preventDefault).toHaveBeenCalled();
});

test('does not call handler when enabled is false', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('ctrl+s', handler, { enabled: false }));

  const event = createKeyboardEvent();
  act(() => {
    boundCallbacks['ctrl+s']?.(event);
  });

  expect(handler).not.toHaveBeenCalled();
});

test('blocks handler for input elements by default', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('ctrl+s', handler));

  const input = document.createElement('input');
  const event = createKeyboardEvent({ target: input });
  act(() => {
    boundCallbacks['ctrl+s']?.(event);
  });

  expect(handler).not.toHaveBeenCalled();
});

test('blocks handler for textarea elements by default', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('ctrl+s', handler));

  const textarea = document.createElement('textarea');
  const event = createKeyboardEvent({ target: textarea });
  act(() => {
    boundCallbacks['ctrl+s']?.(event);
  });

  expect(handler).not.toHaveBeenCalled();
});

test('allows handler for input when allowInInput is true', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('ctrl+enter', handler, { allowInInput: true }));

  const input = document.createElement('input');
  const event = createKeyboardEvent({ target: input });
  act(() => {
    boundCallbacks['ctrl+enter']?.(event);
  });

  expect(handler).toHaveBeenCalled();
});

test('unbinds shortcut on unmount', () => {
  const handler = vi.fn();
  const { unmount } = renderHook(() => useShortcut('ctrl+z', handler));

  unmount();

  expect(mockUnbind).toHaveBeenCalledWith(['ctrl+z']);
});

test('updates handler reference without rebinding', () => {
  const handler1 = vi.fn();
  const { rerender } = renderHook(
    ({ cb }) => useShortcut('ctrl+s', cb),
    { initialProps: { cb: handler1 } },
  );

  const handler2 = vi.fn();
  rerender({ cb: handler2 });

  expect(mockBind).toHaveBeenCalledTimes(1);

  const event = createKeyboardEvent();
  act(() => {
    boundCallbacks['ctrl+s']?.(event);
  });

  expect(handler2).toHaveBeenCalled();
  expect(handler1).not.toHaveBeenCalled();
});

test('passes keys through without case change on non-Mac', () => {
  const handler = vi.fn();
  renderHook(() => useShortcut('Ctrl+S', handler));

  expect(mockBind).toHaveBeenCalledWith(['Ctrl+S'], expect.any(Function));
});
