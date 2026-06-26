import type { ReactNode } from "react";
import Box from "@mui/material/Box";
import AgentStatusBar from "@/components/AgentApp/AgentStatusBar";

export default function AgentApp({ children }: { children: ReactNode }) {
  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <AgentStatusBar />
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        <Box
          sx={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {children}
        </Box>
      </Box>
    </Box>
  );
}
