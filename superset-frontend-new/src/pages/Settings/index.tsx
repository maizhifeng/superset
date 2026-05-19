import { useState } from "react";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Switch from "@mui/material/Switch";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import DragIndicatorIcon from "@mui/icons-material/DragIndicator";
import Alert from "@mui/material/Alert";
import PageHeader from "@/components/PageHeader";
import { useMenuSettings } from "@/store/menuSettings";

export default function Settings() {
  const items = useMenuSettings((s) => s.items);
  const enabled = useMenuSettings((s) => s.enabled);
  const toggle = useMenuSettings((s) => s.toggle);
  const addItem = useMenuSettings((s) => s.addItem);
  const removeItem = useMenuSettings((s) => s.removeItem);
  const moveItem = useMenuSettings((s) => s.moveItem);

  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newPath.trim()) {
      setAddError("Path is required");
      return;
    }
    if (!newLabel.trim()) {
      setAddError("Label is required");
      return;
    }
    const formattedPath = newPath.startsWith("/")
      ? newPath.trim()
      : `/${newPath.trim()}`;
    addItem(formattedPath, newLabel.trim());
    setNewPath("");
    setNewLabel("");
    setAddError(null);
  };

  return (
    <Box sx={{ p: 3, maxWidth: "md", mx: "auto" }}>
      <PageHeader title="Settings" subtitle="Customize your navigation menu" />

      <Typography
        variant="subtitle2"
        sx={{
          mb: 1.5,
          color: "text.secondary",
          fontWeight: 600,
          fontSize: "0.8125rem",
        }}
      >
        Navigation Items
      </Typography>

      <Paper
        sx={{
          borderRadius: 2,
          boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.06)",
          mb: 3,
        }}
      >
        {items.map((item, i) => (
          <Box
            key={item.id}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 1,
              px: 2,
              py: 1.5,
              borderBottom: i < items.length - 1 ? "1px solid" : undefined,
              borderColor: "divider",
            }}
          >
            <DragIndicatorIcon
              sx={{ fontSize: 18, color: "text.disabled", flexShrink: 0 }}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography
                variant="body2"
                sx={{ fontWeight: 600, fontSize: "0.8125rem" }}
              >
                {item.label}
              </Typography>
              <Typography
                variant="caption"
                color="text.disabled"
                sx={{ fontSize: "0.75rem", wordBreak: "break-all" }}
              >
                {item.path}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
              <Tooltip title="Move up">
                <span>
                  <IconButton
                    size="small"
                    disabled={i === 0}
                    onClick={() => moveItem(item.id, "up")}
                  >
                    <ArrowUpwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
              <Tooltip title="Move down">
                <span>
                  <IconButton
                    size="small"
                    disabled={i === items.length - 1}
                    onClick={() => moveItem(item.id, "down")}
                  >
                    <ArrowDownwardIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </span>
              </Tooltip>
            </Box>
            <Switch
              checked={enabled[item.id] ?? true}
              onChange={() => toggle(item.id)}
              size="small"
            />
            {!item.builtIn && (
              <Tooltip title="Remove">
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => removeItem(item.id)}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        ))}
      </Paper>

      <Typography
        variant="subtitle2"
        sx={{
          mb: 1.5,
          color: "text.secondary",
          fontWeight: 600,
          fontSize: "0.8125rem",
        }}
      >
        Add Custom Route
      </Typography>

      <Paper
        sx={{
          p: 2,
          borderRadius: 2,
          boxShadow: "0 1px 2px rgba(0,0,0,0.03), 0 1px 3px rgba(0,0,0,0.06)",
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: 1.5,
            alignItems: "flex-start",
            flexWrap: "wrap",
          }}
        >
          <TextField
            size="small"
            placeholder="/custom/path"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
            sx={{ minWidth: 200, flex: 1 }}
            slotProps={{
              input: {
                startAdornment: (
                  <Typography
                    variant="caption"
                    sx={{ mr: 0.5, color: "text.disabled" }}
                  >
                    /
                  </Typography>
                ),
              },
            }}
          />
          <TextField
            size="small"
            placeholder="Label"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            sx={{ minWidth: 140, flex: 1 }}
          />
          <Button
            variant="contained"
            size="small"
            startIcon={<AddIcon />}
            onClick={handleAdd}
            sx={{ flexShrink: 0 }}
          >
            Add
          </Button>
        </Box>
        {addError && (
          <Alert severity="error" sx={{ mt: 1, borderRadius: 1 }}>
            {addError}
          </Alert>
        )}
      </Paper>
    </Box>
  );
}
