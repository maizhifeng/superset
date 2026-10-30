import type { ReactNode } from "react";
import Box from "@mui/material/Box";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

interface StatusChipProps {
  /** Semantic tone; colours come from the palette so both themes adapt. */
  tone?: StatusTone;
  label: ReactNode;
  /** Render the leading dot; disable for value chips that are not statuses. */
  dot?: boolean;
}

const TONE_BACKGROUND: Record<StatusTone, string> = {
  success: "status.successBg",
  warning: "status.warningBg",
  danger: "status.errorBg",
  info: "status.infoBg",
  neutral: "bg.muted",
};

const TONE_COLOR: Record<StatusTone, string> = {
  success: "success.dark",
  warning: "warning.dark",
  danger: "error.dark",
  info: "info.dark",
  neutral: "text.secondary",
};

/**
 * Compact status/value pill shared by tables and detail pages.
 *
 * Renders one soft background + dot instead of the previous mix of filled and
 * outlined MUI chips, so "已启用 / 已禁用 / 允许 / 是 / 否" read consistently.
 */
export default function StatusChip({
  tone = "neutral",
  label,
  dot = true,
}: StatusChipProps) {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: 0.5,
        height: 22,
        px: 1,
        borderRadius: "999px",
        bgcolor: TONE_BACKGROUND[tone],
        color: TONE_COLOR[tone],
        fontSize: "0.6875rem",
        fontWeight: 600,
        lineHeight: 1,
        letterSpacing: "0.01em",
        whiteSpace: "nowrap",
        maxWidth: "100%",
      }}
    >
      {dot && (
        <Box
          component="span"
          sx={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            bgcolor: "currentColor",
            opacity: 0.85,
            flexShrink: 0,
          }}
        />
      )}
      {label}
    </Box>
  );
}
