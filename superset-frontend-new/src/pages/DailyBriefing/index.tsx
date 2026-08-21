import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Paper from "@mui/material/Paper";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import CircularProgress from "@mui/material/CircularProgress";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PageHeader from "@/components/PageHeader";
import { useNotificationStore } from "@/store/notificationStore";
import api from "@/api";
import ConfigForm from "./ConfigForm";
import {
  EMPTY_PARAMS,
  paramsFromConfig,
  paramsToConfig,
  type ReportParamValues,
} from "./params";

interface ReportConfigRow {
  id: number;
  name: string;
  description?: string;
  datasource_id?: number | null;
  table_name?: string | null;
  top_projects_count?: number | null;
  days_of_history?: number | null;
  last_job_id?: string | null;
  last_report_date?: string | null;
  last_finished_at?: string | null;
  [key: string]: unknown;
}

function summarize(cfg: ReportConfigRow): string[] {
  const parts: string[] = [];
  // Show the chosen dataset by its bare table name — strip any `database.` or
  // `schema.` prefix so only the table name is displayed.
  if (cfg.datasource_id) {
    const raw = cfg.table_name ? String(cfg.table_name) : "";
    const table = raw.split(".").pop() || raw;
    parts.push(table || `数据集 #${cfg.datasource_id}`);
  }
  if (cfg.top_projects_count) parts.push(`Top ${cfg.top_projects_count}`);
  if (cfg.days_of_history) parts.push(`近 ${cfg.days_of_history} 天`);
  return parts;
}

export default function DailyReportList() {
  const navigate = useNavigate();
  const notify = useNotificationStore((s) => s.notify);
  const [rows, setRows] = useState<ReportConfigRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReportConfigRow | null>(null);
  const [form, setForm] = useState<ReportParamValues>(EMPTY_PARAMS);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ReportConfigRow | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ result: ReportConfigRow[] }>(
        "/daily-report/configs",
      );
      setRows(res.data.result ?? []);
    } catch {
      notify({ severity: "error", message: "加载简报列表失败" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_PARAMS);
    setDialogOpen(true);
  };

  const openEdit = (cfg: ReportConfigRow) => {
    setEditing(cfg);
    setForm(paramsFromConfig(cfg));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    const payload = paramsToConfig(form);
    if (!payload.name) {
      notify({ severity: "warning", message: "请填写简报名称" });
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/daily-report/configs/${editing.id}`, payload);
        notify({ severity: "success", message: "简报参数已更新" });
      } else {
        await api.post("/daily-report/configs", payload);
        notify({ severity: "success", message: "简报已创建" });
      }
      setDialogOpen(false);
      void load();
    } catch {
      notify({ severity: "error", message: "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleRun = (cfg: ReportConfigRow) => {
    navigate(`/briefing/daily/${cfg.id}`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/daily-report/configs/${deleteTarget.id}`);
      notify({ severity: "success", message: "简报已删除" });
      setDeleteTarget(null);
      void load();
    } catch {
      notify({ severity: "error", message: "删除失败" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Box sx={{ p: 3, pt: 2 }}>
      <PageHeader
        title="每日简报"
        subtitle="管理每日简报：可配置参数，点击进入简报详情"
        actions={
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={openCreate}
          >
            新建简报
          </Button>
        }
      />

      <Paper variant="outlined" sx={{ overflow: "hidden" }}>
        <Box sx={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "13px",
              textAlign: "left",
            }}
          >
            <thead>
              <tr>
                {["简报名称", "参数", "操作"].map((c) => (
                  <th
                    key={c}
                    style={{
                      padding: "10px 12px",
                      borderBottom: "1px solid rgba(128,128,128,0.25)",
                      fontWeight: 600,
                      color: "text.secondary",
                    }}
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={3} style={{ padding: 24, textAlign: "center" }}>
                    <CircularProgress size={24} />
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={3}
                    style={{
                      padding: 24,
                      textAlign: "center",
                      color: "text.secondary",
                    }}
                  >
                    暂无简报，点击「新建简报」创建第一个。
                  </td>
                </tr>
              ) : (
                rows.map((cfg) => (
                  <tr
                    key={cfg.id}
                    style={{ borderBottom: "1px solid rgba(128,128,128,0.1)" }}
                  >
                     <td
                       style={{ padding: "10px 12px", cursor: "pointer" }}
                       onClick={() => handleRun(cfg)}
                     >
                       <Typography
                         variant="body2"
                         sx={{
                           fontWeight: 600,
                           color: "text.primary",
                           "&:hover": {
                             color: "primary.main",
                             textDecoration: "underline",
                           },
                         }}
                       >
                         {cfg.name}
                       </Typography>
                       {cfg.description && (
                         <Typography variant="caption" color="text.secondary">
                           {cfg.description}
                         </Typography>
                       )}
                       {(cfg.last_job_id || cfg.last_report_date) && (
                         <Typography
                           variant="caption"
                           color="text.secondary"
                           sx={{ display: "block", fontFamily: "monospace" }}
                         >
                           {cfg.last_job_id
                             ? `任务 ${cfg.last_job_id}`
                             : "尚未生成"}
                           {cfg.last_report_date
                             ? ` · ${cfg.last_report_date}`
                             : ""}
                         </Typography>
                       )}
                     </td>
                    <td style={{ padding: "10px 12px" }}>
                      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                        {(() => {
                          const chips = summarize(cfg);
                          if (chips.length === 0) {
                            return <Chip size="small" label="后端自动取数" />;
                          }
                          return chips.map((p) => (
                            <Chip key={p} size="small" label={p} />
                          ));
                        })()}
                      </Box>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <Tooltip title="编辑参数">
                        <IconButton size="small" onClick={() => openEdit(cfg)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="删除">
                        <IconButton
                          size="small"
                          color="error"
                          onClick={() => setDeleteTarget(cfg)}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </Box>
      </Paper>

      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        fullWidth
        maxWidth="md"
      >
        <DialogTitle>
          {editing ? `编辑简报参数：${editing.name}` : "新建简报"}
        </DialogTitle>
        <DialogContent dividers>
          <ConfigForm value={form} onChange={setForm} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>取消</Button>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle>删除简报</DialogTitle>
        <DialogContent>
          确定删除简报「{deleteTarget?.name}」吗？此操作不可撤销。
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>取消</Button>
          <Button
            color="error"
            onClick={() => void handleDelete()}
            disabled={deleting}
          >
            {deleting ? "删除中…" : "删除"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
