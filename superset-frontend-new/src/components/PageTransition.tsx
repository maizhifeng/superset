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
        animation: "pageEnter 200ms ease-out both",
        "@keyframes pageEnter": {
          from: { opacity: 0 },
          to: { opacity: 1 },
        },
      }}
    >
      {children}
    </Box>
  );
}
