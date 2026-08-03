import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";

interface AccentCardProps {
  onClick: () => void;
  icon?: ReactNode;
  title: string;
  description: string;
  children?: ReactNode;
}

export default function AccentCard({
  onClick,
  icon,
  title,
  description,
  children,
}: AccentCardProps) {
  return (
    <Card onClick={onClick} sx={{ p: 3, cursor: "pointer" }}>
      {icon && (
        <Box
          sx={{
            width: 44,
            height: 44,
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            mb: 1.5,
            bgcolor: "action.hover",
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.25 }}>
        {title}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {description}
      </Typography>
      {children}
    </Card>
  );
}
