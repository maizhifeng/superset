import { type ReactNode } from "react";
import Box from "@mui/material/Box";

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        animation: "pageEnter 200ms ease-out both",
        "@keyframes pageEnter": {
          from: { opacity: 0, transform: "translateY(4px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {children}
    </Box>
  );
}
