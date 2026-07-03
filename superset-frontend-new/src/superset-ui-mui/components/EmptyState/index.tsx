import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}

export default function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <Box
      sx={{
        bgcolor: "background.paper",
        borderRadius: 1,
        boxShadow: "var(--mui-palette-shadow-card)",
        p: 4,
        textAlign: "center",
      }}
    >
      {icon && (
        <Box
          sx={{
            mx: "auto",
            width: 48,
            height: 48,
            bgcolor: "action.hover",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 1.5,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography
        variant="body2"
        sx={{ fontWeight: 500, color: "text.primary", mb: 0.5 }}
      >
        {title}
      </Typography>
      {description && (
        <Typography variant="caption" sx={{ color: "text.secondary" }}>
          {description}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}
