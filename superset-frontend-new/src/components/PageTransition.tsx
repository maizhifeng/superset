import { type ReactNode } from "react";
import Box from "@mui/material/Box";

export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        animation: "pageEnter 350ms cubic-bezier(0.25, 0.1, 0.15, 1) both",
        "@keyframes pageEnter": {
          from: { opacity: 0, transform: "translateY(8px)" },
          to: { opacity: 1, transform: "translateY(0)" },
        },
      }}
    >
      {children}
    </Box>
  );
}
