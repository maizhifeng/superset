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

export default motion;
