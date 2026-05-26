import { useState, useEffect, useMemo } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Paper from "@mui/material/Paper";
import CloseIcon from "@mui/icons-material/Close";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ExploreIcon from "@mui/icons-material/Explore";
import { shortcutRegistry } from "@/hooks/useShortcut";
import { formatShortcut } from "@/hooks/useShortcut";
import { resetAllOnboarding } from "@/hooks/useDismissible";
import type { ShortcutEntry, ShortcutCategory } from "@/hooks/useShortcut";

const CATEGORY_LABELS: Record<ShortcutCategory, string> = {
  global: "全局",
  navigation: "导航",
  sql_lab: "SQL 实验室",
  explore: "探索",
  dashboard: "仪表板",
  list_view: "列表视图",
};

const CATEGORY_COLORS: Record<ShortcutCategory, string> = {
  global: "#1a73e8",
  navigation: "#1a73e8",
  sql_lab: "#34a853",
  explore: "#ea8600",
  dashboard: "#9c27b0",
  list_view: "#607d8b",
};

interface KeyboardShortcutHelpModalProps {
  open: boolean;
  onClose: () => void;
}

export default function KeyboardShortcutHelpModal({
  open,
  onClose,
}: KeyboardShortcutHelpModalProps) {
  const [entries, setEntries] = useState<ShortcutEntry[]>([]);

  useEffect(() => {
    setEntries(shortcutRegistry.getAll());
    const unsub = shortcutRegistry.subscribe((all) => setEntries([...all]));
    return unsub;
  }, []);

  const grouped = useMemo(() => {
    const map: Record<string, ShortcutEntry[]> = {};
    for (const e of entries) {
      const cat = e.category;
      if (!map[cat]) map[cat] = [];
      map[cat].push(e);
    }
    return map;
  }, [entries]);

  const categoryOrder: ShortcutCategory[] = [
    "global",
    "navigation",
    "sql_lab",
    "explore",
    "dashboard",
    "list_view",
  ];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      scroll="paper"
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography variant="h6">快捷键</Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        {categoryOrder.map((cat) => {
          const items = grouped[cat];
          if (!items || items.length === 0) return null;
          return (
            <Box key={cat} sx={{ mb: 3 }}>
              <Box
                sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}
              >
                <Chip
                  label={CATEGORY_LABELS[cat]}
                  size="small"
                  sx={{
                    bgcolor: CATEGORY_COLORS[cat],
                    color: "#fff",
                    fontWeight: 600,
                  }}
                />
              </Box>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>快捷键</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>操作</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {items.map((item, idx) => (
                      <TableRow key={`${item.key}-${idx}`}>
                        <TableCell>
                          <Chip
                            label={formatShortcut(item.key)}
                            size="small"
                            variant="outlined"
                            sx={{ fontFamily: "monospace", fontWeight: 600 }}
                          />
                        </TableCell>
                        <TableCell>{item.label}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>
          );
        })}
        {entries.length === 0 && (
          <Typography
            color="text.secondary"
            sx={{ py: 4, textAlign: "center" }}
          >
            暂无已注册的快捷键。
          </Typography>
        )}
        <Box sx={{ display: "flex", justifyContent: "center", pt: 1, pb: 1 }}>
          <Button
            size="small"
            startIcon={<ExploreIcon />}
            onClick={() => {
              resetAllOnboarding();
              onClose();
            }}
            sx={{ color: "text.secondary", fontSize: "0.75rem" }}
          >
            显示引导教程
          </Button>
        </Box>
      </DialogContent>
    </Dialog>
  );
}
