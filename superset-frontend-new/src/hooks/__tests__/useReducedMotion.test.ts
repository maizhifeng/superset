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
import { afterEach, expect, test, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const QUERY = "(prefers-reduced-motion: reduce)";

/** Install a stub ``matchMedia`` reporting the given preference. */
function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  const list = {
    matches,
    media: QUERY,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  };
  const spy = vi.fn(() => list);
  vi.stubGlobal("matchMedia", spy);
  return { list, listeners, spy };
}

/**
 * Load the module fresh so its one-shot MediaQueryList cache starts empty.
 * The cache is module-level (that is the point of it), so without this the
 * first test would decide every later one.
 */
async function loadModule() {
  vi.resetModules();
  return import("../useReducedMotion");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("prefersReducedMotion reports the media query result", async () => {
  stubMatchMedia(true);
  const { prefersReducedMotion } = await loadModule();
  expect(prefersReducedMotion()).toBe(true);

  stubMatchMedia(false);
  const { prefersReducedMotion: readAgain } = await loadModule();
  expect(readAgain()).toBe(false);
});

test("prefersReducedMotion reuses a single MediaQueryList", async () => {
  // The briefing tables ask once per metric cell per value change (~200 calls
  // per switch), so this must not allocate a list each time.
  const { spy } = stubMatchMedia(false);
  const { prefersReducedMotion } = await loadModule();

  prefersReducedMotion();
  prefersReducedMotion();
  prefersReducedMotion();

  expect(spy).toHaveBeenCalledTimes(1);
});

test("prefersReducedMotion is false when matchMedia is unavailable", async () => {
  vi.stubGlobal("matchMedia", undefined);
  const { prefersReducedMotion } = await loadModule();

  expect(prefersReducedMotion()).toBe(false);
});

test("the hook reports the preference and unsubscribes on unmount", async () => {
  const { listeners } = stubMatchMedia(false);
  const { default: useReducedMotion } = await loadModule();

  const { result, unmount } = renderHook(() => useReducedMotion());
  expect(result.current).toBe(false);
  expect(listeners.size).toBe(1);

  act(() => {
    listeners.forEach((fn) => fn());
  });
  expect(result.current).toBe(false);

  unmount();
  expect(listeners.size).toBe(0);
});

test("the hook picks up a preference change from the media query", async () => {
  const { list, listeners } = stubMatchMedia(false);
  const { default: useReducedMotion } = await loadModule();

  const { result } = renderHook(() => useReducedMotion());
  expect(result.current).toBe(false);

  // The OS setting flips: the same MediaQueryList now reports true and fires
  // its change listeners.
  list.matches = true;
  act(() => {
    listeners.forEach((fn) => fn());
  });

  expect(result.current).toBe(true);
});
