import type { ReactElement } from "react";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";

/**
 * Direction glyph shared by KPI cards and anomaly chips.
 *
 * Icon fonts render text arrows (↑/↓) inconsistently across platforms and at
 * small sizes; an icon keeps the arrow crisp and visually identical to the KPI
 * delta arrows.
 */
export default function DeltaArrow({
  direction,
  color = "inherit",
  fontSize = 13,
}: {
  direction: "up" | "down" | "flat";
  color?: string;
  fontSize?: number;
}): ReactElement | null {
  if (direction === "flat") return null;
  const Icon = direction === "up" ? ArrowUpwardIcon : ArrowDownwardIcon;
  return <Icon sx={{ fontSize, color }} aria-hidden />;
}
