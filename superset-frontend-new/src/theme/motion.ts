import { duration as durationTokens, ease as easeTokens } from "@/theme/tokens";

const motion = {
  duration: durationTokens,
  easing: easeTokens,
};

export const timing = {
  quick: `${durationTokens.quick}ms ${easeTokens.standard}`,
  standard: `${durationTokens.standard}ms ${easeTokens.decelerate}`,
  slow: `${durationTokens.slow}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  paper: "250ms cubic-bezier(0.25, 0.1, 0.15, 1)",
} as const;

export const transitions = {
  ...timing,
  backgroundColor: `background-color ${timing.quick}`,
  boxShadow: `box-shadow ${timing.standard}`,
  transform: `transform ${durationTokens.standard}ms cubic-bezier(0.2, 0, 0, 1)`,
  borderColor: "border-color 200ms ease",
  color: `color ${timing.quick}`,
  opacity: "opacity 200ms ease",
  background: `background ${timing.quick}`,
} as const;

/**
 * Semantic motion roles.  Page-level animation picks a role instead of a raw
 * millisecond value, so every transition on a screen shares one rhythm.
 */
export const motionRoles = {
  /** Something appears or replaces something else. */
  enter: durationTokens.standard,
  /** An existing element changes value or position. */
  update: durationTokens.quick,
  /** Something leaves; exits read as faster than entrances. */
  exit: durationTokens.exit,
  /** Deliberate emphasis (chart growth, a highlighted change). */
  emphasis: durationTokens.slow,
} as const;

/**
 * Shared ECharts animation config.  Chart motion uses the same durations as
 * the surrounding UI instead of ECharts' 1000ms default, which is what made
 * charts feel disconnected from the page.
 *
 * ECharts takes its own easing names rather than CSS curves; ``cubicOut`` and
 * ``cubicInOut`` are the closest matches to the token curves used elsewhere
 * (``ease.decelerate`` and ``ease.standard``).
 */
export const chartMotion = {
  animationDuration: motionRoles.emphasis,
  animationDurationUpdate: motionRoles.enter,
  animationEasing: "cubicOut",
  animationEasingUpdate: "cubicInOut",
} as const;

export default motion;
