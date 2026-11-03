/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { useRef } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import WasdHint from "../WasdHint";
import { useWasdTableScroll } from "../useTableScroll";

const originalMatchMedia = window.matchMedia;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: originalMatchMedia,
  });
});

test("renders four keycaps with their direction arrows", () => {
  render(<WasdHint />);

  for (const keycap of ["W", "A", "S", "D"]) {
    expect(screen.getByText(keycap)).toBeInTheDocument();
  }

  const arrows = [...document.querySelectorAll("[data-direction]")].map(
    (arrow) => arrow.getAttribute("data-direction"),
  );
  expect(arrows).toEqual(["up", "left", "down", "right"]);
});

/** A table viewport nested inside a scrollable page, like the report page. */
function ScrollHarness({
  enabled,
  onEngagedChange,
  onPressedChange,
}: {
  enabled: boolean;
  onEngagedChange?: (engaged: boolean) => void;
  onPressedChange?: (keys: string[]) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useWasdTableScroll(ref, enabled, onEngagedChange, onPressedChange);
  return (
    <div data-testid="page" style={{ overflowY: "auto" }}>
      <div data-testid="scroller" ref={ref} tabIndex={0} />
    </div>
  );
}

function mockFrames() {
  const callbacks: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callbacks.push(callback);
    return callbacks.length;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  return callbacks;
}

type Metrics = {
  scrollHeight?: number;
  clientHeight?: number;
  scrollWidth?: number;
  clientWidth?: number;
};

/** jsdom has no layout, so scroll geometry is stubbed on the elements. */
function setMetrics(element: HTMLElement, metrics: Required<Metrics>) {
  for (const [key, value] of Object.entries(metrics)) {
    Object.defineProperty(element, key, { configurable: true, value });
  }
}

function setup(
  options: { viewport?: Metrics; page?: Metrics } = {},
  enabled = true,
  onEngagedChange?: (engaged: boolean) => void,
  onPressedChange?: (keys: string[]) => void,
) {
  render(
    <ScrollHarness
      enabled={enabled}
      onEngagedChange={onEngagedChange}
      onPressedChange={onPressedChange}
    />,
  );
  const scroller = screen.getByTestId("scroller");
  const page = screen.getByTestId("page");
  setMetrics(scroller, {
    scrollHeight: 400,
    clientHeight: 200,
    scrollWidth: 400,
    clientWidth: 200,
    ...options.viewport,
  });
  setMetrics(page, {
    scrollHeight: 1200,
    clientHeight: 300,
    scrollWidth: 300,
    clientWidth: 300,
    ...options.page,
  });
  return { scroller, page };
}

/** Run the newest scheduled animation frame. */
function step(callbacks: FrameRequestCallback[], advanceMs = 16) {
  callbacks[callbacks.length - 1](performance.now() + advanceMs);
}

test("D scrolls right and A scrolls left", () => {
  const callbacks = mockFrames();
  const { scroller } = setup();

  fireEvent.keyDown(window, { key: "d" });
  step(callbacks);
  expect(scroller.scrollLeft).toBeGreaterThan(0);
  expect(scroller.scrollTop).toBe(0);
  fireEvent.keyUp(window, { key: "d" });

  scroller.scrollLeft = 100;
  fireEvent.keyDown(window, { key: "a" });
  step(callbacks);
  expect(scroller.scrollLeft).toBeLessThan(100);
  fireEvent.keyUp(window, { key: "a" });
});

test("W scrolls up and S scrolls down", () => {
  const callbacks = mockFrames();
  const { scroller } = setup();

  fireEvent.keyDown(window, { key: "s" });
  step(callbacks);
  expect(scroller.scrollTop).toBeGreaterThan(0);
  fireEvent.keyUp(window, { key: "s" });

  scroller.scrollTop = 100;
  fireEvent.keyDown(window, { key: "w" });
  step(callbacks);
  expect(scroller.scrollTop).toBeLessThan(100);
  fireEvent.keyUp(window, { key: "w" });
});

test("keeps the page still until the table viewport hits its edge", () => {
  const callbacks = mockFrames();
  const { scroller, page } = setup();
  scroller.scrollTop = 0;
  page.scrollTop = 0;

  fireEvent.keyDown(window, { key: "s" });
  step(callbacks);
  expect(scroller.scrollTop).toBeGreaterThan(0);
  expect(page.scrollTop).toBe(0);
  fireEvent.keyUp(window, { key: "s" });
});

test("hands the overflow to the page at the bottom edge", () => {
  const callbacks = mockFrames();
  const { scroller, page } = setup();
  // 200px scroll range, already at the bottom.
  scroller.scrollTop = 200;
  page.scrollTop = 0;

  fireEvent.keyDown(window, { key: "s" });
  step(callbacks);
  expect(scroller.scrollTop).toBe(200);
  expect(page.scrollTop).toBeGreaterThan(0);
  fireEvent.keyUp(window, { key: "s" });
});

test("hands the overflow to the page at the top edge", () => {
  const callbacks = mockFrames();
  const { scroller, page } = setup();
  scroller.scrollTop = 0;
  page.scrollTop = 200;

  fireEvent.keyDown(window, { key: "w" });
  step(callbacks);
  expect(scroller.scrollTop).toBe(0);
  expect(page.scrollTop).toBeLessThan(200);
  fireEvent.keyUp(window, { key: "w" });
});

test("keeps the control engaged while keys are held", () => {
  mockFrames();
  const onEngagedChange = vi.fn();
  setup({}, true, onEngagedChange);

  fireEvent.keyDown(window, { key: "w" });
  expect(onEngagedChange).toHaveBeenLastCalledWith(true);

  fireEvent.keyUp(window, { key: "w" });
  expect(onEngagedChange).toHaveBeenLastCalledWith(false);
});

test("highlights only the keys that are held", () => {
  render(<WasdHint pressed={["w"]} />);

  const held = document.querySelector<SVGRectElement>('[data-keycap="w"]');
  const idle = document.querySelector<SVGRectElement>('[data-keycap="s"]');

  expect(held?.getAttribute("data-pressed")).toBe("true");
  expect(held?.style.opacity).toBe("1");
  expect(idle?.getAttribute("data-pressed")).toBe("false");
  expect(idle?.style.opacity).toBe("0");
});

test("leaves every key unhighlighted while idle (no looping demo)", () => {
  vi.useFakeTimers();
  render(<WasdHint />);

  const highlighted = () =>
    [...document.querySelectorAll<SVGRectElement>("[data-keycap]")].filter(
      (keycap) => keycap.getAttribute("data-pressed") === "true",
    );

  expect(highlighted()).toHaveLength(0);
  act(() => {
    vi.advanceTimersByTime(3000);
  });
  expect(highlighted()).toHaveLength(0);
});

test("highlights held keys under prefers-reduced-motion", () => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  render(<WasdHint pressed={["d"]} />);

  const held = document.querySelector<SVGRectElement>('[data-keycap="d"]');
  expect(held?.getAttribute("data-pressed")).toBe("true");
  expect(held?.style.opacity).toBe("1");
  // Inline state, not CSS animation: nothing for the OS animation setting to
  // collapse.
  expect(held?.getAttribute("style") ?? "").not.toContain("animation");
});

test("reports the held keys to the owner", () => {
  mockFrames();
  const onPressedChange = vi.fn();
  setup({}, true, undefined, onPressedChange);

  fireEvent.keyDown(window, { key: "w" });
  expect(onPressedChange).toHaveBeenLastCalledWith(["w"]);

  fireEvent.keyDown(window, { key: "d" });
  expect(onPressedChange).toHaveBeenLastCalledWith(["d", "w"]);

  fireEvent.keyUp(window, { key: "d" });
  expect(onPressedChange).toHaveBeenLastCalledWith(["w"]);

  fireEvent.keyUp(window, { key: "w" });
  expect(onPressedChange).toHaveBeenLastCalledWith([]);
});

test("hands focused PageDown to the page at the bottom edge", () => {
  const { scroller, page } = setup();
  scroller.scrollTop = 200;
  page.scrollTop = 0;
  scroller.focus();

  const notPrevented = fireEvent.keyDown(scroller, { key: "PageDown" });

  expect(notPrevented).toBe(false);
  expect(scroller.scrollTop).toBe(200);
  expect(page.scrollTop).toBeGreaterThan(0);
});

test("keeps the native scroll for PageDown before the edge", () => {
  const { scroller, page } = setup();
  scroller.scrollTop = 0;
  page.scrollTop = 100;
  scroller.focus();

  const notPrevented = fireEvent.keyDown(scroller, { key: "PageDown" });

  expect(notPrevented).toBe(true);
  expect(page.scrollTop).toBe(100);
});

test("does not chain scroll keys while the viewport is unfocused", () => {
  const { scroller, page } = setup();
  scroller.scrollTop = 200;
  page.scrollTop = 0;

  const notPrevented = fireEvent.keyDown(scroller, { key: "PageDown" });

  expect(notPrevented).toBe(true);
  expect(page.scrollTop).toBe(0);
});

test("ignores WASD typed into an editable control", () => {
  const callbacks = mockFrames();
  setup();

  const input = document.createElement("input");
  document.body.appendChild(input);
  fireEvent.keyDown(input, { key: "d" });

  expect(callbacks).toHaveLength(0);
  input.remove();
});

test("does nothing while disabled", () => {
  const callbacks = mockFrames();
  setup({}, false);

  fireEvent.keyDown(window, { key: "d" });

  expect(callbacks).toHaveLength(0);
});
