import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import { spacing, gap } from "@/theme/spacing";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
}: PageHeaderProps) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        mb: spacing.md,
        position: "relative",
      }}
    >
      <Box sx={{ flex: 1, minWidth: 0 }}>
        <Box
          sx={{
            width: 32,
            height: 3,
            borderRadius: 1.5,
            bgcolor: "primary.main",
            mb: 1,
          }}
        />
        <Typography
          variant="h5"
          sx={{
            fontWeight: 650,
            letterSpacing: "-0.01em",
            color: "text.primary",
          }}
        >
          {title}
        </Typography>
        {subtitle && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mt: spacing.xs, display: "block" }}
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
            mt: 3,
          }}
        >
          {actions}
        </Box>
      )}
    </Box>
  );
}
