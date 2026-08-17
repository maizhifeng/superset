import { space, gapScale } from "@/theme/tokens";

/** MUI spacing units (1 unit = 8px). Values flow from design tokens. */
export const spacing = space;

/** Gap scale alias. */
export const gap = gapScale;

export type SpacingToken = keyof typeof spacing;
