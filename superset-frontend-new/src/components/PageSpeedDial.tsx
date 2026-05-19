import { useState, type ReactNode } from "react";
import SpeedDial from "@mui/material/SpeedDial";
import SpeedDialAction from "@mui/material/SpeedDialAction";
import SpeedDialIcon from "@mui/material/SpeedDialIcon";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import SearchIcon from "@mui/icons-material/Search";
import Box from "@mui/material/Box";
import ChatInput from "@/components/ChatInput";
import SearchExamples from "@/components/SearchExamples";
import { useToolbarStore } from "@/contexts/ToolbarContext";
import type { ToolEntry } from "@/contexts/ToolbarContext";

interface PickedTool {
  id: string;
  fabIcon: ReactNode;
  fabLabel: string;
  action?: () => void;
  fabColor?: string;
}
function pickPageTools(
  registry: Record<string, ToolEntry[]>,
  pageKeys: string[],
) {
  const seen = new Set<string>();
  const result: PickedTool[] = [];
  for (const key of pageKeys) {
    const tools = registry[key] || [];
    for (const t of tools) {
      if (!t.fabIcon || seen.has(t.id)) continue;
      seen.add(t.id);
      if (t.action || t.primary) {
        result.push({
          id: t.id,
          fabIcon: t.fabIcon,
          fabLabel: t.fabLabel || t.id,
          action: t.action || (() => {}),
          fabColor: t.fabColor,
        });
      }
    }
  }
  return result;
}

interface PageSpeedDialProps {
  pageKeys: string | string[];
  searchTool?: { render: ReactNode };
}

export default function PageSpeedDial({
  pageKeys,
  searchTool,
}: PageSpeedDialProps) {
  const registry = useToolbarStore((s) => s.registry);
  const keys = Array.isArray(pageKeys) ? pageKeys : [pageKeys];
  const tools = pickPageTools(registry, keys);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  if (tools.length === 0 && !searchTool) return null;

  return (
    <>
      <SpeedDial
        ariaLabel="Tools"
        icon={<SpeedDialIcon />}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
        direction="up"
        sx={(theme) => ({
          position: "fixed",
          bottom: { xs: 16, sm: 24 },
          right: { xs: 16, sm: 24 },
          display: { xs: "flex", sm: "flex" },
          zIndex: theme.zIndex.drawer + 1,
          "& .MuiSpeedDial-fab": { width: 56, height: 56 },
          "& .MuiSpeedDialAction-fab": { width: 56, height: 56 },
        })}
      >
        {searchTool && (
          <SpeedDialAction
            icon={<SearchIcon />}
            title="Ask..."
            onClick={() => {
              setOpen(false);
              setDialogOpen(true);
            }}
          />
        )}
        {tools.map((tool) => (
          <SpeedDialAction
            key={tool.id}
            icon={tool.fabIcon}
            title={tool.fabLabel}
            slotProps={
              tool.fabColor
                ? {
                    fab: {
                      sx: {
                        bgcolor: `${tool.fabColor}.main`,
                        "&:hover": { bgcolor: `${tool.fabColor}.dark` },
                      },
                    },
                  }
                : undefined
            }
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              tool.action?.();
              setOpen(false);
            }}
          />
        ))}
      </SpeedDial>
      {searchTool && (
        <Dialog
          open={dialogOpen}
          onClose={() => {
            setDialogOpen(false);
            setSearchQuery("");
          }}
          fullWidth
          maxWidth="sm"
          slotProps={{
            paper: {
              sx: {
                position: "fixed",
                top: "20vh",
                m: 0,
                borderRadius: 2,
                width: "90%",
                maxWidth: 520,
              },
            },
            backdrop: { sx: { bgcolor: "rgba(0,0,0,0.3)" } },
          }}
        >
          <DialogContent
            sx={{ p: 2, pt: 2.5 }}
            onClick={() => setDialogOpen(false)}
          >
            <Box onClick={(e) => e.stopPropagation()}>
              <ChatInput
                autoFocus
                placeholder="Ask anything about your data..."
                disableMaxWidth
                value={searchQuery}
                onChange={setSearchQuery}
              />
              <SearchExamples onSelect={(q) => setSearchQuery(q)} />
            </Box>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
