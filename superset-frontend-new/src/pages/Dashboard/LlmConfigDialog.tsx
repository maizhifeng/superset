import { useState, useEffect } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import { getLlmConfig, setLlmConfig, type LlmConfig } from "@/config/llm";
import { useNotificationStore } from "@/store/notificationStore";

interface LlmConfigDialogProps {
  open: boolean;
  onClose: () => void;
}

export default function LlmConfigDialog({ open, onClose }: LlmConfigDialogProps) {
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const notify = useNotificationStore((s) => s.notify);

  useEffect(() => {
    if (open) {
      const cfg = getLlmConfig();
      setBaseUrl(cfg.baseUrl);
      setModel(cfg.model);
    }
  }, [open]);

  const handleSave = () => {
    if (!baseUrl.trim() || !model.trim()) {
      notify({ severity: "warning", message: "请填写完整的配置" });
      return;
    }
    const config: LlmConfig = {
      baseUrl: baseUrl.trim().replace(/\/+$/, ""),
      model: model.trim(),
    };
    setLlmConfig(config);
    notify({ severity: "success", message: "LLM 配置已保存" });
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>LLM 配置</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <TextField
          label="API 地址"
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="/llm/v1"
          size="small"
          fullWidth
          helperText="例如 /llm/v1（通过 Vite 代理）或 http://host:port/v1（直连）"
        />
        <TextField
          label="模型 ID"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="qwopus3.5-4b-v3"
          size="small"
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} size="small">取消</Button>
        <Button onClick={handleSave} variant="contained" size="small">保存</Button>
      </DialogActions>
    </Dialog>
  );
}
