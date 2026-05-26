import { useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Radio from "@mui/material/Radio";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import { useAiConfigStore, type AiPreset } from "@/config/aiConfig";

interface AiConfigDialogProps {
  open: boolean;
  onClose: () => void;
}

function PresetForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: AiPreset;
  onSave: (preset: Omit<AiPreset, "id">) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "/llm/api/v1");
  const [agentFramework, setAgentFramework] = useState(initial?.agentFramework ?? "Opencode SDK");
  const [llmFramework, setLlmFramework] = useState(initial?.llmFramework ?? "");

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
        p: 2,
        bgcolor: "action.hover",
        borderRadius: 2,
        border: "1px solid",
        borderColor: "divider",
      }}
    >
      <TextField
        size="small"
        label="名称"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="例如 My LLM"
        fullWidth
      />
      <Box sx={{ display: "flex", gap: 1.5 }}>
        <TextField
          size="small"
          label="Provider ID"
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          placeholder="openai"
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          label="Model ID"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="gpt-4"
          sx={{ flex: 1 }}
        />
      </Box>
      <TextField
        size="small"
        label="API 地址"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder="/llm/api/v1"
        fullWidth
        helperText="例如 /llm/api/v1（代理）或 http://host:port（直连）"
      />
      <Box sx={{ display: "flex", gap: 1.5 }}>
        <TextField
          size="small"
          label="Agent 框架"
          value={agentFramework}
          onChange={(e) => setAgentFramework(e.target.value)}
          placeholder="Opencode SDK"
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          label="LLM 框架"
          value={llmFramework}
          onChange={(e) => setLlmFramework(e.target.value)}
          placeholder="LM Studio"
          sx={{ flex: 1 }}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button size="small" onClick={onCancel}>
          取消
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={() => onSave({ label, provider, model, baseUrl, agentFramework, llmFramework })}
          disabled={!label.trim() || !provider.trim() || !model.trim()}
        >
          {initial ? "保存" : "添加"}
        </Button>
      </Box>
    </Box>
  );
}

export default function AiConfigDialog({ open, onClose }: AiConfigDialogProps) {
  const { presets, activePresetId, setActive, add, update, remove } =
    useAiConfigStore();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const handleClose = () => {
    setEditingId(null);
    setAdding(false);
    onClose();
  };

  const handleAdd = (data: Omit<AiPreset, "id">) => {
    const id = `preset_${Date.now()}`;
    add({ id, ...data });
    if (presets.length === 0) setActive(id);
    setAdding(false);
  };

  const handleUpdate = (id: string, data: Omit<AiPreset, "id">) => {
    update(id, data);
    setEditingId(null);
  };

  const handleDelete = (id: string) => {
    remove(id);
    if (editingId === id) setEditingId(null);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          fontSize: "1rem",
          fontWeight: 600,
        }}
      >
        <AutoAwesomeIcon sx={{ fontSize: 20, color: "primary.main" }} />
        AI 模型配置
        <Box sx={{ flex: 1 }} />
        <Button
          size="small"
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={() => setAdding(true)}
          disabled={adding}
        >
          添加
        </Button>
      </DialogTitle>
      <DialogContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 1,
          pt: "8px !important",
        }}
      >
        {/* Current config summary */}
        {presets.length > 0 && !adding && (
          <Box
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: "action.selected",
              border: "1px solid",
              borderColor: "primary.light",
              mb: 0.5,
            }}
          >
            <Typography
              variant="caption"
              color="primary"
              sx={{
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                display: "block",
                mb: 0.75,
              }}
            >
              当前配置
            </Typography>
            {(() => {
              const active = presets.find((p) => p.id === activePresetId);
              if (!active) return null;
              return (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {active.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    Provider: {active.provider}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    Model: {active.model}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    API: {active.baseUrl}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    Agent: {active.agentFramework ?? "-"} / LLM: {active.llmFramework ?? "-"}
                  </Typography>
                </Box>
              );
            })()}
          </Box>
        )}

        {adding && (
          <PresetForm
            onSave={handleAdd}
            onCancel={() => setAdding(false)}
          />
        )}

        {presets.length > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              mt: 0.5,
              px: 0.5,
            }}
          >
            预设方案
          </Typography>
        )}

        {presets.length === 0 && !adding && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ py: 3, textAlign: "center" }}
          >
            暂无配置，点击"添加"创建
          </Typography>
        )}

        {presets.map((preset) => (
          <Box key={preset.id}>
            {editingId === preset.id ? (
              <PresetForm
                initial={preset}
                onSave={(data) => handleUpdate(preset.id, data)}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1,
                  py: 0.75,
                  px: 1,
                  borderRadius: 2,
                  border: "1px solid",
                  borderColor: activePresetId === preset.id ? "primary.light" : "divider",
                  bgcolor: activePresetId === preset.id ? "action.selected" : "transparent",
                  transition: "background 0.15s, border-color 0.15s",
                  "&:hover": {
                    bgcolor: "action.hover",
                  },
                }}
              >
                <Radio
                  size="small"
                  checked={activePresetId === preset.id}
                  onChange={() => setActive(preset.id)}
                  sx={{
                    color: "text.disabled",
                    "&.Mui-checked": { color: "primary.main" },
                  }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontSize: "0.8125rem",
                    }}
                  >
                    {preset.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ fontSize: "0.75rem" }}
                  >
                    {preset.provider} / {preset.model}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.disabled"
                    sx={{ fontSize: "0.6875rem" }}
                  >
                    Agent: {preset.agentFramework ?? "-"} / LLM: {preset.llmFramework ?? "-"}
                  </Typography>
                </Box>
                <IconButton
                  size="small"
                  onClick={() => setEditingId(preset.id)}
                  sx={{ color: "text.secondary" }}
                >
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => handleDelete(preset.id)}
                >
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
            )}
          </Box>
        ))}
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} size="small">
          关闭
        </Button>
      </DialogActions>
    </Dialog>
  );
}
