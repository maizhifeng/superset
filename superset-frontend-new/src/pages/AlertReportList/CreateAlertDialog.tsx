import { useState, useEffect } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import CircularProgress from "@mui/material/CircularProgress";
import Alert from "@mui/material/Alert";
import CloudQueueIcon from "@mui/icons-material/CloudQueue";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { AlertReport } from "@/types/api";

interface CreateAlertDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  /** 传入则为编辑模式：预填该警报并 PUT 保存。 */
  editing?: AlertReport | null;
  charts: { id: number; slice_name: string }[];
  databases: { id: number; database_name: string }[];
}

/** 常用 cron 预设，简化定时配置。 */
const CRON_PRESETS: { label: string; value: string }[] = [
  { label: "每小时", value: "0 * * * *" },
  { label: "每天上午 8 点", value: "0 8 * * *" },
  { label: "每周一上午 9 点", value: "0 9 * * 1" },
  { label: "每 5 分钟", value: "*/5 * * * *" },
];

/** 运算符选项（validator_type = operator 时使用）。 */
const OP_OPTIONS = ["<", "<=", ">", ">=", "==", "!="];

export default function CreateAlertDialog({
  open,
  onClose,
  onCreated,
  editing,
  charts,
  databases,
}: CreateAlertDialogProps) {
  const [name, setName] = useState("");
  const [chartId, setChartId] = useState<string>("");
  const [databaseId, setDatabaseId] = useState<string>("");
  const [sql, setSql] = useState("");
  const [validatorType, setValidatorType] = useState<"not null" | "operator">(
    "not null",
  );
  const [op, setOp] = useState(">");
  const [threshold, setThreshold] = useState("");
  const [crontab, setCrontab] = useState(CRON_PRESETS[1].value);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // 编辑模式：打开时按 id 拉取完整详情并预填。
  useEffect(() => {
    if (!open || !editing) return;
    setCreating(true);
    setError(null);
    api
      .get<{
        result: {
          name?: string;
          crontab?: string;
          sql?: string;
          chart?: { id?: number };
          database?: { id?: number };
          validator_type?: string;
          validator_config_json?: string;
        };
      }>(`/report/${editing.id}`)
      .then((res) => {
        const d = res.data.result ?? {};
        setName(d.name ?? "");
        setCrontab(d.crontab ?? "");
        setSql(d.sql ?? "");
        setChartId(d.chart?.id != null ? String(d.chart.id) : "");
        setDatabaseId(
          d.database?.id != null ? String(d.database.id) : "",
        );
        const vt = d.validator_type === "operator" ? "operator" : "not null";
        setValidatorType(vt);
        try {
          const cfg = JSON.parse(d.validator_config_json ?? "{}");
          if (vt === "operator" && cfg.op) setOp(String(cfg.op));
          if (vt === "operator" && cfg.threshold != null)
            setThreshold(String(cfg.threshold));
        } catch {
          /* keep defaults */
        }
      })
      .catch((err: unknown) =>
        setError(parseErrorMessage(err, "加载警报详情失败")),
      )
      .finally(() => setCreating(false));
  }, [open, editing]);

  const reset = () => {
    setName("");
    setChartId("");
    setDatabaseId("");
    setSql("");
    setValidatorType("not null");
    setOp(">");
    setThreshold("");
    setCrontab(CRON_PRESETS[1].value);
    setEmail("");
    setError(null);
  };

  const handleClose = () => {
    if (creating) return;
    reset();
    onClose();
  };

  const handleSubmit = () => {
    if (creating) return;
    setError(null);
    if (!name.trim()) {
      setError("请填写警报名称");
      return;
    }
    if (!chartId) {
      setError("请选择关联的图表");
      return;
    }
    if (!databaseId) {
      setError("请选择数据库");
      return;
    }
    if (!sql.trim()) {
      setError("请填写触发查询 SQL");
      return;
    }
    setCreating(true);

    const config =
      validatorType === "not null"
        ? {}
        : { op, threshold: threshold ? Number(threshold) : 0 };

    const payload: Record<string, unknown> = {
      name: name.trim(),
      type: "Alert",
      crontab,
      active: true,
      chart: Number(chartId),
      database: Number(databaseId),
      sql: sql.trim(),
      validator_type: validatorType,
      validator_config_json: config,
      working_timeout: 3600,
      grace_period: 21600,
    };
    if (email.trim()) {
      payload.recipients = [
        { type: "Email", recipient_config_json: { target: email.trim() } },
      ];
    }

    if (editing?.id) {
      api
        .put(`/report/${editing.id}`, payload)
        .then(() => {
          reset();
          onCreated();
          onClose();
        })
        .catch((err: unknown) => {
          setError(parseErrorMessage(err, "保存警报失败"));
        })
        .finally(() => setCreating(false));
    } else {
      api
        .post("/report/", payload)
        .then(() => {
          reset();
          onCreated();
          onClose();
        })
        .catch((err: unknown) => {
          setError(parseErrorMessage(err, "创建警报失败"));
        })
        .finally(() => setCreating(false));
    }  };

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CloudQueueIcon sx={{ fontSize: 20, color: "warning.main" }} />
        {editing ? "编辑警报" : "新建警报"}
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            label="警报名称"
            value={name}
            onChange={(e) => setName(e.target.value)}
            variant="outlined"
            size="small"
            required
            fullWidth
          />
          <FormControl size="small" fullWidth>
            <InputLabel id="alert-chart-label">关联图表</InputLabel>
            <Select
              labelId="alert-chart-label"
              label="关联图表"
              value={chartId}
              onChange={(e) => setChartId(e.target.value)}
              displayEmpty
            >
              {charts.map((c) => (
                <MenuItem key={c.id} value={String(c.id)}>
                  {c.slice_name}
                </MenuItem>
              ))}
            </Select>
            <FormHelperText>警报监听该图表的数据变化</FormHelperText>
          </FormControl>
          <FormControl size="small" fullWidth>
            <InputLabel id="alert-db-label">数据库</InputLabel>
            <Select
              labelId="alert-db-label"
              label="数据库"
              value={databaseId}
              onChange={(e) => setDatabaseId(e.target.value)}
              displayEmpty
            >
              {databases.map((d) => (
                <MenuItem key={d.id} value={String(d.id)}>
                  {d.database_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField
            label="触发查询 SQL"
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            variant="outlined"
            multiline
            minRows={3}
            size="small"
            fullWidth
            placeholder="SELECT value FROM time_series_table"
            sx={{ fontFamily: "monospace" }}
          />
          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 140 }}>
              <InputLabel id="alert-vt-label">触发条件</InputLabel>
              <Select
                labelId="alert-vt-label"
                label="触发条件"
                value={validatorType}
                onChange={(e) => setValidatorType(e.target.value)}
              >
                <MenuItem value="not null">有数据（非空）</MenuItem>
                <MenuItem value="operator">数值比较</MenuItem>
              </Select>
            </FormControl>
            {validatorType === "operator" && (
              <>
                <FormControl size="small" sx={{ minWidth: 80 }}>
                  <InputLabel id="alert-op-label">运算符</InputLabel>
                  <Select
                    labelId="alert-op-label"
                    label="运算符"
                    value={op}
                    onChange={(e) => setOp(e.target.value)}
                  >
                    {OP_OPTIONS.map((o) => (
                      <MenuItem key={o} value={o}>
                        {o}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <TextField
                  label="阈值"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  variant="outlined"
                  size="small"
                  type="number"
                  sx={{ width: 120 }}
                />
              </>
            )}
          </Box>
          <Box sx={{ display: "flex", gap: 2 }}>
            <FormControl size="small" sx={{ minWidth: 200 }}>
              <InputLabel id="alert-cron-label">定时</InputLabel>
              <Select
                labelId="alert-cron-label"
                label="定时"
                value={crontab}
                onChange={(e) => setCrontab(e.target.value)}
              >
                {CRON_PRESETS.map((p) => (
                  <MenuItem key={p.value} value={p.value}>
                    {p.label}（{p.value}）
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="自定义 Cron"
              value={crontab}
              onChange={(e) => setCrontab(e.target.value)}
              variant="outlined"
              size="small"
              fullWidth
              helperText="五段 cron，如 */5 * * * *"
            />
          </Box>
          <TextField
            label="收件人邮箱（可选）"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            variant="outlined"
            size="small"
            fullWidth
            placeholder="user@example.com"
          />
          {error && (
            <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: 1.5 }}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="inherit">
          取消
        </Button>
        <Button
          variant="contained"
          startIcon={
            creating ? <CircularProgress size={14} color="inherit" /> : undefined
          }
          disabled={creating}
          onClick={handleSubmit}
        >
          {creating
            ? editing
              ? "保存中..."
              : "创建中..."
            : editing
              ? "保存"
              : "创建"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
