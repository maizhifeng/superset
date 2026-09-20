import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { spacing, gap } from "@/theme/spacing";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  /** Per-page title tweaks (a document page reads larger than a list page). */
  titleSx?: SxProps<Theme>;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  titleSx,
}: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: gap.sm,
        flexWrap: "wrap",
        mb: spacing.md,
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Typography
          variant="h5"
          sx={[
            {
              fontWeight: 700,
              letterSpacing: "-0.25px",
              color: "text.primary",
              lineHeight: 1.27,
            },
            ...(Array.isArray(titleSx) ? titleSx : [titleSx]),
          ]}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="body2"
            sx={{ color: "text.secondary", mt: spacing.xs, display: "block" }}
          >
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: gap.sm,
            flexShrink: 0,
            flexWrap: "wrap",
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
