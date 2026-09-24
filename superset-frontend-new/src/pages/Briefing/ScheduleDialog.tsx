import { useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { useNotificationStore } from "@/store/notificationStore";
import api from "@/api";

export interface BriefingSchedule {
  id: number;
  name: string;
  description?: string | null;
  crontab: string;
  crontab_humanized: string;
  timezone: string;
  active: boolean;
  email_subject?: string | null;
  working_timeout?: number | null;
  last_state?: string | null;
  last_eval_dttm?: string | null;
  next_run_at?: string | null;
  recipients: { type: string; recipient_config_json: { target?: string } }[];
}

const CRON_PRESETS: { value: string; label: string }[] = [
  { value: "*/10 * * * *", label: "每10分钟（测试）" },
  { value: "0 8 * * *", label: "每天 08:00" },
  { value: "0 9 * * *", label: "每天 09:00" },
  { value: "0 18 * * *", label: "每天 18:00" },
  { value: "0 9 * * 1", label: "每周一 09:00" },
  { value: "__custom__", label: "自定义" },
];

const TIMEZONES = [
  "Asia/Shanghai",
  "UTC",
  "Asia/Hong_Kong",
  "America/Los_Angeles",
];

const STATE_COLOR: Record<string, "success" | "error" | "warning" | "default"> =
  {
    Success: "success",
    Error: "error",
    Working: "warning",
  };

function emailsFromRecipients(
  recipients: BriefingSchedule["recipients"] | undefined,
): string {
  if (!Array.isArray(recipients)) return "";
  return recipients
    .filter((r) => r.type === "Email")
    .map((r) => r.recipient_config_json?.target || "")
    .filter(Boolean)
    .join(", ");
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function fmtMd(d: Date): string {
  return `${d.getMonth() + 1}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Human-readable preview of which period a scheduled run will report on.
 * Mirrors the backend semantics: daily runs report the previous calendar day
 * in the schedule's timezone; weekly runs report the last complete
 * Sunday–Saturday week. Schedules are intentionally not allowed to pin an
 * explicit date — that is what a manual run with override_date is for.
 */
function reportDatePreview(
  reportType: "daily" | "weekly",
  now: Date = new Date(),
): string {
  if (reportType === "weekly") {
    // Sunday-based week start, matching the backend's _week_start().
    const weekStart = addDays(now, -now.getDay());
    const prevStart = addDays(weekStart, -7);
    const prevEnd = addDays(weekStart, -1);
    return (
      `将生成「上一完整自然周（周日~周六）」报告 — 例：报告 ` +
      `${fmtMd(prevStart)} ~ ${fmtMd(prevEnd)}（按任务时区）`
    );
  }
  const yesterday = addDays(now, -1);
  return (
    `将生成（昨日）报告 — 例：今天 ${fmtMd(now)} 09:00执行 → 报告 ` +
    `${fmtMd(yesterday)}（按任务时区）。`
  );
}

export default function ScheduleDialog({
  open,
  configId,
  configName,
  reportType = "daily",
  schedule,
  onClose,
  onChanged,
}: {
  open: boolean;
  configId: number;
  configName: string;
  reportType?: "daily" | "weekly";
  schedule: BriefingSchedule | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const notify = useNotificationStore((s) => s.notify);
  const [active, setActive] = useState(true);
  const [cronPreset, setCronPreset] = useState<string>("0 8 * * *");
  const [crontab, setCrontab] = useState("0 8 * * *");
  const [timezone, setTimezone] = useState("Asia/Shanghai");
  const [emails, setEmails] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setActive(schedule?.active ?? true);
    const cron = schedule?.crontab || "0 8 * * *";
    setCrontab(cron);
    setCronPreset(
      CRON_PRESETS.some((p) => p.value === cron) ? cron : "__custom__",
    );
    setTimezone(schedule?.timezone || "Asia/Shanghai");
    setEmails(emailsFromRecipients(schedule?.recipients));
  }, [open, schedule]);

  const isCustom = cronPreset === "__custom__";
  const effectiveCron = isCustom ? crontab : cronPreset;

  const stateChip = useMemo(() => {
    if (!schedule) return null;
    return (
      <Chip
        size="small"
        variant="outlined"
        color={STATE_COLOR[schedule.last_state || ""] || "default"}
        label={
          schedule.last_state ? `上次：${schedule.last_state}` : "尚未执行"
        }
      />
    );
  }, [schedule]);

  const handleSave = async () => {
    if (!effectiveCron.trim()) {
      notify({ severity: "warning", message: "请填写 Cron 表达式" });
      return;
    }
    const recipients = emails
      .split(/[,;\s]+/)
      .map((e) => e.trim())
      .filter(Boolean)
      .map((target) => ({
        type: "Email",
        recipient_config_json: { target },
      }));
    setSaving(true);
    try {
      await api.put(`/briefing/configs/${configId}/schedule`, {
        crontab: effectiveCron.trim(),
        timezone,
        active,
        name: schedule?.name || `简报-${configName}`.slice(0, 150),
        recipients,
      });
      notify({
        severity: "success",
        message: active ? "定时任务已保存" : "定时任务已保存（未启用）",
      });
      onChanged();
      onClose();
    } catch (err: unknown) {
      const data = (err as { response?: { data?: { error?: unknown } } })
        ?.response?.data?.error;
      notify({
        severity: "error",
        message:
          typeof data === "string"
            ? data
            : data
              ? `保存失败：${JSON.stringify(data)}`
              : "保存定时任务失败",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/briefing/configs/${configId}/schedule`);
      notify({ severity: "success", message: "定时任务已删除" });
      onChanged();
      onClose();
    } catch {
      notify({ severity: "error", message: "删除定时任务失败" });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        定时任务：{configName}
        {stateChip && (
          <Box component="span" sx={{ ml: 1.5, verticalAlign: "middle" }}>
            {stateChip}
          </Box>
        )}
      </DialogTitle>
      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 1.5, alignItems: "flex-start" }}>
          {reportDatePreview(reportType)}
        </Alert>
        <FormControlLabel
          control={
            <Switch
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          }
          label={active ? "已启用" : "已停用（不会自动执行）"}
          sx={{ mb: 1 }}
        />

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          执行时间
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={cronPreset}
          onChange={(_, v: string | null) => {
            if (v !== null) setCronPreset(v);
          }}
          sx={{ mb: 1, flexWrap: "wrap", gap: 0.5 }}
        >
          {CRON_PRESETS.map((p) => (
            <ToggleButton
              key={p.value}
              value={p.value}
              sx={{ textTransform: "none", px: 1.5 }}
            >
              {p.label}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        {isCustom && (
          <TextField
            size="small"
            fullWidth
            label="Cron 表达式"
            placeholder="0 8 * * *（分 时 日 月 周）"
            value={crontab}
            onChange={(e) => setCrontab(e.target.value)}
            sx={{ mb: 2 }}
            helperText="标准 5 段 Cron，例如每天 08:30 为「30 8 * * *」"
          />
        )}

        <TextField
          select
          size="small"
          fullWidth
          label="时区"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          sx={{ mb: 2 }}
        >
          {TIMEZONES.map((tz) => (
            <MenuItem key={tz} value={tz}>
              {tz}
            </MenuItem>
          ))}
        </TextField>

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          通知邮箱（可选）
        </Typography>
        <TextField
          size="small"
          fullWidth
          placeholder="a@example.com, b@example.com"
          value={emails}
          onChange={(e) => setEmails(e.target.value)}
          sx={{ mb: 1 }}
          helperText="留空则只生成并保存简报结果，不发送通知"
        />
        {schedule && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block" }}
          >
            上次执行：
            {schedule.last_eval_dttm
              ? new Date(schedule.last_eval_dttm).toLocaleString()
              : "—"}
            {schedule.crontab_humanized
              ? ` · ${schedule.crontab_humanized}`
              : ""}
          </Typography>
        )}
        {schedule?.next_run_at && schedule.active && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block" }}
          >
            下次执行：{new Date(schedule.next_run_at).toLocaleString()}
            {"（剩 "}
            <Box
              component="span"
              sx={{
                fontVariantNumeric: "tabular-nums",
                color: "primary.main",
              }}
            >
              <NextRunCountdown nextRunAt={schedule.next_run_at} />
            </Box>
            {"）"}
          </Typography>
        )}
      </DialogContent>
      <DialogActions>
        {schedule && (
          <Button
            color="error"
            onClick={() => void handleDelete()}
            disabled={deleting || saving}
            sx={{ mr: "auto" }}
          >
            {deleting ? <CircularProgress size={16} /> : "删除定时任务"}
          </Button>
        )}
        <Button onClick={onClose} disabled={saving || deleting}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={saving || deleting}
        >
          {saving ? "保存中…" : "保存"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatCountdown(diffMs: number): string {
  const totalSec = Math.ceil(diffMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600) % 24;
  const d = Math.floor(totalSec / 86400);
  if (d > 0) return `${d}天${h}小时`;
  if (h > 0) return `${h}:${pad2(m)}:${pad2(s)}`;
  return `${pad2(m)}:${pad2(s)}`;
}

/**
 * Live countdown to an absolute next-run timestamp (ISO with offset).
 * Ticks every second; calls `onExpire` once when the moment passes so the
 * parent can refresh `next_run_at` (beat has not necessarily fired yet when
 * the browser clock reaches it).
 */
export function NextRunCountdown({
  nextRunAt,
  onExpire,
}: {
  nextRunAt: string;
  onExpire?: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  const firedRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const target = new Date(nextRunAt).getTime();
  const diff = target - now;

  useEffect(() => {
    firedRef.current = false;
  }, [nextRunAt]);

  useEffect(() => {
    if (Number.isFinite(target) && diff <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [diff, target, onExpire]);

  if (!Number.isFinite(target)) return null;
  if (diff <= 0) return <span>即将执行</span>;
  return <span>{formatCountdown(diff)}</span>;
}
