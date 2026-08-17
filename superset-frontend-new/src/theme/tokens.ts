/**
 * Design tokens — single source of truth.
 *
 * Spacing, radius, duration and easing values used across the app.  The CSS
 * variables that used to be declared in ``src/index.css`` were a duplicate of
 * these numbers and were unused by component code (components consume the TS
 * values directly or MUI's own cssVariables).  Knobs here drive both the MUI
 * theme (via src/theme/spacing.ts and src/theme/motion.ts) and anything that
 * needs raw numbers.
 */

/** Spacing scale in MUI spacing units (1 unit = 8px). */
export const space = {
  xs: 0.5,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
  xxl: 6,
} as const;

/** Gap scale alias for layouts. */
export const gapScale = {
  xs: 0.5,
  sm: 1,
  md: 2,
  lg: 3,
  xl: 4,
} as const;

/** Border radii (px). */
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
} as const;

/** Motion durations (ms). */
export const duration = {
  micro: 80,
  quick: 150,
  standard: 200,
  slow: 300,
  slower: 400,
} as const;

/** Motion easing curves. */
export const ease = {
  standard: "cubic-bezier(0.2, 0, 0, 1)",
  decelerate: "cubic-bezier(0, 0, 0.2, 1)",
  accelerate: "cubic-bezier(0.3, 0, 1, 1)",
  emphasized: "cubic-bezier(0.3, 0, 0, 1)",
  snappy: "cubic-bezier(0.3, 0, 0.1, 1)",
  paper: "cubic-bezier(0.25, 0.1, 0.15, 1)",
} as const;
