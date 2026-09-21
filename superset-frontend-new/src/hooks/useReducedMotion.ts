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
import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function matches(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

// One shared MediaQueryList for the one-shot read below: the briefing tables
// ask on every value change, and allocating a fresh list per cell per switch
// is pure garbage.
let cachedQuery: MediaQueryList | null = null;

/**
 * One-shot read of the same preference, for callers that must stay off the
 * React render path.
 *
 * The per-cell animation drivers in the briefing tables run ~200 times per
 * value change; subscribing each of them with ``useReducedMotion`` would add
 * a state hook and a ``change`` listener per cell.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  cachedQuery ??= window.matchMedia(QUERY);
  return cachedQuery.matches;
}

/**
 * Whether the user asked the OS to reduce motion.
 *
 * CSS-driven animation is already handled by the global
 * ``prefers-reduced-motion`` rule in the theme; this hook covers the motion
 * that JavaScript owns: ECharts animations, smooth scrolling and timers that
 * replay keyframes.
 */
export default function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(matches);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const query = window.matchMedia(QUERY);
    const onChange = () => setReduced(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}
