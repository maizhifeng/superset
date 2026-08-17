import Box from "@mui/material/Box";
import Fab from "@mui/material/Fab";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import { useFabTools } from "@/store/toolbarStore";

export default function FabStack() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const tools = useFabTools();

  if (!isMobile || tools.length === 0) return null;

  return (
    <Box
      sx={{
        position: "fixed",
        right: 12,
        bottom: 16,
        zIndex: (t) => t.zIndex.fab,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        pb: "env(safe-area-inset-bottom)",
      }}
    >
      {tools.map((tool) =>
        tool.fabRender ? (
          <Paper
            key={tool.id}
            sx={{
              width: 44,
              height: 44,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
              bgcolor: "background.paper",
              boxShadow: "var(--mui-palette-shadow-popover)",
            }}
          >
            {tool.fabRender}
          </Paper>
        ) : (
          <Tooltip key={tool.id} title={tool.fabLabel ?? ""} placement="left">
            <Fab
              size="medium"
              color={tool.fabColor ?? (tool.primary ? "primary" : "default")}
              onClick={tool.action}
              sx={{ boxShadow: "var(--mui-palette-shadow-popover)" }}
            >
              {tool.fabIcon}
            </Fab>
          </Tooltip>
        ),
      )}
    </Box>
  );
}
