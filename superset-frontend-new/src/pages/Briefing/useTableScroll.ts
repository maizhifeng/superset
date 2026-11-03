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

/**
 * Keyboard scrolling for the detail table viewport.
 *
 * W/A/S/D scroll the viewport while its keys are held; at the viewport edges
 * the same keys keep scrolling the page so a held key stays useful.  Wheel and
 * trackpad scrolling is deliberately left to the browser's native handling
 * (including native scroll chaining at the edges).
 *
 * Kept apart from the visual hint component so each module keeps a single
 * responsibility (and Fast Refresh stays happy).
 */

import { useEffect, useRef, type RefObject } from "react";

/** Scroll speed in CSS pixels per second while a key is held down. */
const VERTICAL_SPEED = 900;
const HORIZONTAL_SPEED = 1200;

const KEY_VECTORS: Record<string, readonly [number, number]> = {
  w: [0, -1],
  a: [-1, 0],
  s: [0, 1],
  d: [1, 0],
};

/** True when the event target is an editable control we must not hijack. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest("input, textarea, select, [contenteditable='true']") !== null
  );
}

/** Per-axis scroll geometry, so the handoff code stays axis-agnostic. */
const AXIS = {
  x: { size: "scrollWidth", view: "clientWidth", position: "scrollLeft" },
  y: { size: "scrollHeight", view: "clientHeight", position: "scrollTop" },
} as const;

type Axis = keyof typeof AXIS;

/**
 * Nearest ancestor that can still scroll along ``axis`` in the direction of
 * ``delta``.
 *
 * This is the "edge handoff" that keeps a held key useful once the table
 * viewport runs out of its own scroll range: the remaining delta is forwarded
 * to the page instead of dead-stopping at the table edge (the same idea as the
 * browser's native scroll chaining for wheel/touch input).
 */
function scrollableAncestor(
  element: HTMLElement,
  axis: Axis,
  delta: number,
): HTMLElement | null {
  const metrics = AXIS[axis];
  for (let node = element.parentElement; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    const overflow = axis === "x" ? style.overflowX : style.overflowY;
    if (
      overflow !== "auto" &&
      overflow !== "scroll" &&
      overflow !== "overlay"
    ) {
      continue;
    }
    const max = node[metrics.size] - node[metrics.view];
    if (max <= 1) continue;
    const position = node[metrics.position];
    const atEdge = delta < 0 ? position <= 0 : position >= max - 1;
    if (!atEdge) return node;
  }
  return null;
}

/**
 * Scroll ``element`` along one axis and hand the unused delta to the nearest
 * scrollable ancestor, so the motion continues into the page at the table's
 * top/bottom edge.
 */
function scrollAxis(element: HTMLElement, axis: Axis, delta: number): void {
  if (delta === 0) return;
  const metrics = AXIS[axis];
  const max = Math.max(0, element[metrics.size] - element[metrics.view]);
  const start = element[metrics.position];
  const target = Math.min(max, Math.max(0, start + delta));
  element[metrics.position] = target;

  const leftover = delta - (target - start);
  if (Math.abs(leftover) < 0.5) return;
  const ancestor = scrollableAncestor(element, axis, leftover);
  if (!ancestor) return;
  const ancestorMax = Math.max(
    0,
    ancestor[metrics.size] - ancestor[metrics.view],
  );
  ancestor[metrics.position] = Math.min(
    ancestorMax,
    Math.max(0, ancestor[metrics.position] + leftover),
  );
}

/** Distance one arrow-key press scrolls when it chains into the page. */
const LINE_STEP_PX = 40;

type ScrollKey = { axis: Axis; direction: 1 | -1; page: boolean };

/**
 * Browser scroll keys that should chain into the page once the focused table
 * viewport cannot move any further.  The viewport keeps the native behaviour
 * (the browser scrolls it) until it is pinned against an edge.
 */
function scrollKeyOf(event: KeyboardEvent): ScrollKey | null {
  switch (event.key) {
    case "ArrowDown":
      return { axis: "y", direction: 1, page: false };
    case "ArrowUp":
      return { axis: "y", direction: -1, page: false };
    case "ArrowRight":
      return { axis: "x", direction: 1, page: false };
    case "ArrowLeft":
      return { axis: "x", direction: -1, page: false };
    case "PageDown":
      return { axis: "y", direction: 1, page: true };
    case "PageUp":
      return { axis: "y", direction: -1, page: true };
    case " ":
      return { axis: "y", direction: event.shiftKey ? -1 : 1, page: true };
    default:
      return null;
  }
}

/**
 * While ``enabled`` (pointer over the table, or the table focused), W/A/S/D
 * scroll the referenced element.  Once the viewport is pinned against its top
 * or bottom edge the same key keeps the page scrolling.  Modifier shortcuts
 * and typing targets are left alone.
 */
export function useWasdTableScroll(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean,
  onEngagedChange?: (engaged: boolean) => void,
  onPressedChange?: (keys: string[]) => void,
): void {
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!enabled) return undefined;

    const pressed = new Set<string>();
    let announced: string[] = [];
    let frame = 0;
    let last = 0;
    let engaged = false;

    // Mirror the held keys into the owner's state: the hint highlights the
    // keys that are actually down (works even when CSS animations are off).
    const announcePressed = () => {
      const keys = Array.from(pressed).sort();
      if (
        keys.length === announced.length &&
        keys.every((key, index) => key === announced[index])
      ) {
        return;
      }
      announced = keys;
      if (mountedRef.current) onPressedChange?.(keys);
    };

    // Held keys keep the hook active even if the page scrolls the table out
    // from under the pointer; the owner adds this flag to ``enabled`` so the
    // motion continues until the keys are released.
    const notifyEngaged = (next: boolean) => {
      if (engaged === next) return;
      engaged = next;
      if (mountedRef.current) onEngagedChange?.(next);
    };

    const stop = () => {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      pressed.clear();
      announcePressed();
      notifyEngaged(false);
    };

    const tick = (now: number) => {
      const element = ref.current;
      if (!element) {
        stop();
        return;
      }
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      let left = 0;
      let top = 0;
      pressed.forEach((key) => {
        const vector = KEY_VECTORS[key];
        if (!vector) return;
        left += vector[0] * HORIZONTAL_SPEED * delta;
        top += vector[1] * VERTICAL_SPEED * delta;
      });
      if (left !== 0) scrollAxis(element, "x", left);
      if (top !== 0) scrollAxis(element, "y", top);
      frame = requestAnimationFrame(tick);
    };

    /**
     * Keyboard counterpart of the wheel's native scroll chaining: when the
     * table viewport itself has focus and page-level scroll keys hit its edge,
     * forward them to the page instead of letting the motion stop there.
     */
    const handOffScrollKey = (event: KeyboardEvent) => {
      const element = ref.current;
      if (!element || document.activeElement !== element) return;
      if (isTypingTarget(event.target)) return;
      const key = scrollKeyOf(event);
      if (!key) return;
      const metrics = AXIS[key.axis];
      const max = Math.max(0, element[metrics.size] - element[metrics.view]);
      const atEdge =
        key.direction < 0
          ? element[metrics.position] <= 0
          : element[metrics.position] >= max - 1;
      if (!atEdge) return;
      const distance = key.page
        ? (key.axis === "y" ? element.clientHeight : element.clientWidth) *
          0.875
        : LINE_STEP_PX;
      const delta = distance * key.direction;
      const ancestor = scrollableAncestor(element, key.axis, delta);
      if (!ancestor) return;
      event.preventDefault();
      const ancestorMax = Math.max(
        0,
        ancestor[metrics.size] - ancestor[metrics.view],
      );
      ancestor[metrics.position] = Math.min(
        ancestorMax,
        Math.max(0, ancestor[metrics.position] + delta),
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key in KEY_VECTORS && !isTypingTarget(event.target)) {
        event.preventDefault();
        pressed.add(key);
        announcePressed();
        notifyEngaged(true);
        if (!frame) {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }
        return;
      }
      handOffScrollKey(event);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (!pressed.delete(key)) return;
      announcePressed();
      if (pressed.size === 0) stop();
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stop);
      stop();
    };
  }, [enabled, onEngagedChange, onPressedChange, ref]);
}
