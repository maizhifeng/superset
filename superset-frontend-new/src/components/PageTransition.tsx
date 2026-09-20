import { type ReactNode } from "react";
import Box from "@mui/material/Box";
import { duration, ease } from "@/theme/tokens";

/**
 * Route-level entrance.  The offset is a ``transform`` (compositor-only) rather
 * than ``top``, and the timing comes from the motion tokens so a page change
 * matches the rest of the UI.  The theme's global
 * ``prefers-reduced-motion: reduce`` rule collapses the animation to instant.
 */
export default function PageTransition({ children }: { children: ReactNode }) {
  return (
    <Box
      sx={{
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        position: "relative",
        animation: `pageEnter ${duration.standard}ms ${ease.paper} both`,
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
