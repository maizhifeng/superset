import { useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import AgentStatusBar from "@/components/AgentApp/AgentStatusBar";
import AgentSessionSidebar from "@/components/AgentApp/AgentSessionSidebar";

export default function AgentApp({ children }: { children: ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <Box sx={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <AgentStatusBar
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
      />
      <Box sx={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {sidebarOpen && <AgentSessionSidebar />}
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
