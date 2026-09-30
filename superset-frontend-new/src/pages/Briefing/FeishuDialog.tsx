import { useCallback, useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import CircularProgress from "@mui/material/CircularProgress";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import { useNotificationStore } from "@/store/notificationStore";
import api from "@/api";
import {
  cleanTargets,
  EMPTY_FEISHU_TARGET,
  emptyFeishuSettings,
  FEISHU_TARGET_OPTIONS,
  MAX_FEISHU_TARGETS,
  normalizeSettings,
  outcomeMessage,
  settingsPayload,
  validateTargets,
  type FeishuChat,
  type FeishuMsgType,
  type FeishuOutcome,
  type FeishuSettings,
  type FeishuTarget,
} from "./feishu";

/** Extracts the API's ``error`` field, which may be a string or a list. */
function apiError(err: unknown): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response
    ?.data?.error;
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return data.join("；");
  return "请求失败，请稍后重试";
}

/**
 * Reduce a chat picker entry to its bare id.
 *
 * The picker may hand back a label such as ``数据支撑组(4人组)（oc_…）``; Feishu
 * rejects that as a receive_id, so the id is extracted before it is stored.
 */
function normalizeChatId(value: string): string {
  const raw = value.trim();
  if (/^(oc|ou|on|un|oi|od)_[A-Za-z0-9_]+$/.test(raw)) return raw;
  const matches = raw.match(/(oc|ou|on|un|oi|od)_[A-Za-z0-9_]{2,}/g);
  return matches && matches.length > 0 ? matches[matches.length - 1] : raw;
}

export default function FeishuDialog({
  open,
  configId,
  configName,
  hasResult = false,
  onClose,
  onChanged,
}: {
  open: boolean;
  configId: number;
  configName: string;
  /** Whether a generated briefing result exists (enables 立即推送). */
  hasResult?: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const notify = useNotificationStore((s) => s.notify);
  const [settings, setSettings] = useState<FeishuSettings>(emptyFeishuSettings);
  const [enabled, setEnabled] = useState(false);
  const [msgType, setMsgType] = useState<FeishuMsgType>("interactive");
  const [includeTables, setIncludeTables] = useState(false);
  const [includeDoc, setIncludeDoc] = useState(true);
  const [splitChapters, setSplitChapters] = useState(true);
  const [targets, setTargets] = useState<FeishuTarget[]>([]);
  const [chats, setChats] = useState<FeishuChat[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [pushing, setPushing] = useState(false);

  /**
   * Load the stored settings.
   *
   * ``resetForm`` mirrors the server values into the editable fields; it is
   * only true when the dialog opens.  Refreshing after a test/manual push keeps
   * the user's unsaved edits (targets, switches) intact and only updates the
   * server-owned status the dialog displays.
   */
  const load = useCallback(
    async ({ resetForm = false }: { resetForm?: boolean } = {}) => {
      setLoading(true);
      try {
        const res = await api.get<{ result: FeishuSettings }>(
          `/briefing/configs/${configId}/feishu`,
        );
        const next = normalizeSettings(res.data.result);
        setSettings(next);
        if (resetForm) {
          setEnabled(next.enabled);
          setMsgType(next.msg_type);
          setIncludeTables(next.include_tables);
          setIncludeDoc(next.include_doc);
          setSplitChapters(next.split_chapters);
          setTargets(next.targets.length > 0 ? next.targets : []);
        }
        if (next.app_configured) {
          try {
            const chatsRes = await api.get<{
              result: { available: boolean; chats: FeishuChat[] };
            }>("/briefing/feishu/chats");
            setChats(chatsRes.data.result?.chats ?? []);
          } catch {
            setChats([]);
          }
        } else {
          setChats([]);
        }
      } catch (err) {
        notify({ severity: "error", message: apiError(err) });
      } finally {
        setLoading(false);
      }
    },
    [configId, notify],
  );

  useEffect(() => {
    if (open) void load({ resetForm: true });
  }, [open, load]);

  const dirty = useMemo(() => {
    const saved = settingsPayload(settings);
    const current = settingsPayload({
      enabled,
      msg_type: msgType,
      include_tables: includeTables,
      include_doc: includeDoc,
      split_chapters: splitChapters,
      targets,
    });
    return JSON.stringify(saved) !== JSON.stringify(current);
  }, [
    settings,
    enabled,
    msgType,
    includeTables,
    includeDoc,
    splitChapters,
    targets,
  ]);

  const updateTarget = (index: number, patch: Partial<FeishuTarget>) => {
    setTargets((prev) =>
      prev.map((target, i) => (i === index ? { ...target, ...patch } : target)),
    );
  };

  const handleTest = async () => {
    const errors = validateTargets(targets);
    if (errors.length > 0) {
      notify({ severity: "warning", message: errors.join("；") });
      return;
    }
    setTesting(true);
    try {
      const res = await api.post<{ result: FeishuOutcome }>(
        `/briefing/configs/${configId}/feishu/test`,
        {
          msg_type: msgType,
          include_tables: includeTables,
          include_doc: includeDoc,
          split_chapters: splitChapters,
          targets: cleanTargets(targets),
        },
      );
      const outcome = res.data.result;
      notify({
        severity: outcome?.ok ? "success" : "error",
        message: `测试推送：${outcomeMessage(outcome)}`,
      });
      await load();
    } catch (err) {
      notify({ severity: "error", message: `测试推送失败：${apiError(err)}` });
    } finally {
      setTesting(false);
    }
  };

  const handlePush = async () => {
    if (dirty) {
      notify({ severity: "warning", message: "设置已修改，请先保存后再推送" });
      return;
    }
    setPushing(true);
    try {
      const res = await api.post<{ result: FeishuOutcome }>(
        `/briefing/configs/${configId}/feishu/push`,
      );
      const outcome = res.data.result;
      notify({
        severity: outcome?.ok ? "success" : "error",
        message: outcomeMessage(outcome),
      });
      await load();
      onChanged?.();
    } catch (err) {
      notify({ severity: "error", message: `推送失败：${apiError(err)}` });
    } finally {
      setPushing(false);
    }
  };

  const handleSave = async () => {
    const errors = validateTargets(targets, enabled);
    if (errors.length > 0) {
      notify({ severity: "warning", message: errors.join("；") });
      return;
    }
    setSaving(true);
    try {
      await api.put(`/briefing/configs/${configId}/feishu`, {
        enabled,
        msg_type: msgType,
        include_tables: includeTables,
        include_doc: includeDoc,
        split_chapters: splitChapters,
        targets: cleanTargets(targets),
      });
      notify({ severity: "success", message: "飞书推送设置已保存" });
      onChanged?.();
      onClose();
    } catch (err) {
      notify({ severity: "error", message: `保存失败：${apiError(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    setSaving(true);
    try {
      await api.put(`/briefing/configs/${configId}/feishu`, {
        enabled: false,
        msg_type: "interactive",
        include_tables: false,
        targets: [],
      });
      notify({ severity: "success", message: "已清空飞书推送设置" });
      await load({ resetForm: true });
      onChanged?.();
    } catch (err) {
      notify({ severity: "error", message: `清空失败：${apiError(err)}` });
    } finally {
      setSaving(false);
    }
  };

  const lastPush = settings.last_push;
  const lastResult = settings.last_result;
  const busy = loading || saving || testing || pushing;
  const resultLabel = lastResult
    ? `${lastResult.report_type === "weekly" ? "周报" : "日报"} ${
        lastResult.report_date ?? "—"
      }`
    : "";

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>飞书推送：{configName}</DialogTitle>
      <DialogContent dividers>
        {!settings.app_configured ? (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            未配置飞书应用凭证：请在 <code>docker/.env-local</code> 填写{" "}
            <code>FEISHU_APP_ID</code> / <code>FEISHU_APP_SECRET</code>
            并重启服务（自建应用需开通 im:message 权限，并将机器人加入目标群）。
          </Alert>
        ) : settings.scheduled_dry_run ? (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            定时推送当前处于试运行（只记录日志、不真实发送）；测试与手动推送仍会真实发送。
          </Alert>
        ) : (
          <Alert severity="info" sx={{ mb: 1.5 }}>
            定时任务执行完成后会自动推送卡片；「启用」只控制定时推送，测试与手动推送始终可用。
          </Alert>
        )}

        {lastResult ? (
          <Alert
            severity={lastResult.stale ? "warning" : "info"}
            sx={{ mb: 1.5 }}
          >
            将推送最新报告：{resultLabel}
            {lastResult.finished_at
              ? `（生成于 ${new Date(lastResult.finished_at).toLocaleString()}）`
              : ""}
            {lastResult.stale
              ? lastResult.expected_report_date
                ? ` — 该结果不是最近一天的数据（应为 ${lastResult.expected_report_date}），建议先在详情页重新运行简报`
                : ` — 该结果已生成 ${
                    lastResult.age_hours ?? "?"
                  } 小时，可能不是最新数据，建议先在详情页重新运行简报`
              : ""}
          </Alert>
        ) : (
          <Alert severity="warning" sx={{ mb: 1.5 }}>
            该简报还没有生成结果，请先在详情页运行简报（或等待定时任务执行），
            之后推送的就是这份最新报告。
          </Alert>
        )}

        <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
          <FormControlLabel
            control={
              <Switch
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
              />
            }
            label="启用定时推送"
          />
          {settings.app_configured && settings.app_id_masked && (
            <Chip
              size="small"
              variant="outlined"
              label={`应用 ${settings.app_id_masked}`}
            />
          )}
        </Box>

        <Typography variant="subtitle2" sx={{ mb: 0.5 }}>
          消息形态
        </Typography>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={msgType}
          onChange={(_, v: FeishuMsgType | null) => {
            if (v !== null) setMsgType(v);
          }}
          sx={{ mb: 2 }}
        >
          <ToggleButton value="interactive" sx={{ textTransform: "none" }}>
            交互卡片
          </ToggleButton>
          <ToggleButton value="text" sx={{ textTransform: "none" }}>
            纯文本摘要
          </ToggleButton>
        </ToggleButtonGroup>

        <FormControlLabel
          control={
            <Switch
              checked={includeTables}
              onChange={(e) => setIncludeTables(e.target.checked)}
            />
          }
          label="推送子表格（明细表）"
          sx={{ display: "flex", mb: 0.5 }}
        />
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block", mb: 1.5 }}
        >
          关闭时只推送各章节的指标与图表；开启后附带平台拆分、分天明细、主游戏与媒体明细表
          （卡片有 30KB 上限，超限时自动裁剪表格行数并在推送结果里说明）。
        </Typography>
        <FormControlLabel
          control={
            <Switch
              checked={includeDoc}
              onChange={(e) => setIncludeDoc(e.target.checked)}
            />
          }
          label="生成「查看明细」飞书文档"
          sx={{ display: "flex", mb: 0.5 }}
        />
        <Typography
          variant="caption"
          sx={{ color: "text.secondary", display: "block", mb: 1.5 }}
        >
          每次推送会把完整 HTML 简报（全部章节、全量明细表、可交互图表）导出成飞书云文档，
          卡片底部出现「查看明细」按钮直达该文档。
        </Typography>

        <Divider sx={{ mb: 1.5 }} />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            mb: 0.5,
          }}
        >
          <Typography variant="subtitle2">
            推送目标（最多 {MAX_FEISHU_TARGETS} 个）
          </Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            disabled={targets.length >= MAX_FEISHU_TARGETS}
            onClick={() =>
              setTargets((prev) => [...prev, { ...EMPTY_FEISHU_TARGET }])
            }
          >
            添加目标
          </Button>
        </Box>

        {targets.length === 0 && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", mb: 1 }}
          >
            还没有目标。群聊可在飞书群里通过「设置 →
            群机器人」查看机器人所在群， 或直接粘贴 chat_id（oc_ 开头）。
          </Typography>
        )}

        {targets.map((target, index) => {
          return (
            <Box
              key={`${target.receive_id_type}-${index}`}
              sx={{
                display: "flex",
                gap: 1,
                alignItems: "flex-start",
                mb: 1,
              }}
            >
              <TextField
                select
                size="small"
                label="类型"
                value={target.receive_id_type}
                onChange={(e) =>
                  updateTarget(index, {
                    receive_id_type: e.target
                      .value as FeishuTarget["receive_id_type"],
                  })
                }
                sx={{ width: 140, flexShrink: 0 }}
              >
                {FEISHU_TARGET_OPTIONS.map((option) => (
                  <MenuItem key={option.value} value={option.value}>
                    {option.label}
                  </MenuItem>
                ))}
              </TextField>
              {target.receive_id_type === "chat_id" ? (
                <Autocomplete
                  freeSolo
                  size="small"
                  fullWidth
                  // The option VALUE is the bare chat_id: the label is only a
                  // display detail, otherwise the picker writes "群名（oc_…）"
                  // into the setting and Feishu rejects it (code=230001).
                  options={chats.map((chat) => chat.chat_id)}
                  getOptionLabel={(option) => option}
                  renderOption={(props, option) => {
                    const chat = chats.find((c) => c.chat_id === option);
                    return (
                      <li {...props} key={option}>
                        {chat ? `${chat.name || option}（${option}）` : option}
                      </li>
                    );
                  }}
                  inputValue={target.receive_id}
                  value={target.receive_id}
                  onInputChange={(_event, value) =>
                    updateTarget(index, { receive_id: normalizeChatId(value) })
                  }
                  onChange={(_event, value) =>
                    updateTarget(index, {
                      receive_id: normalizeChatId(typeof value === "string" ? value : ""),
                    })
                  }
                  noOptionsText="没有匹配的群，可直接输入 chat_id"
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="群 / chat_id"
                      placeholder="oc_xxx"
                      helperText={
                        chats.length > 0
                          ? "可从机器人所在的群中选择，也可直接粘贴 chat_id"
                          : "未取到群列表，直接粘贴 chat_id 即可"
                      }
                    />
                  )}
                />
              ) : (
                <TextField
                  size="small"
                  fullWidth
                  label="目标 ID"
                  placeholder={
                    FEISHU_TARGET_OPTIONS.find(
                      (o) => o.value === target.receive_id_type,
                    )?.placeholder ?? "oc_xxx"
                  }
                  value={target.receive_id}
                  onChange={(e) =>
                    updateTarget(index, { receive_id: e.target.value })
                  }
                />
              )}
              <Tooltip title="移除">
                <IconButton
                  size="small"
                  onClick={() =>
                    setTargets((prev) => prev.filter((_, i) => i !== index))
                  }
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}

        {lastPush && (
          <Typography
            variant="caption"
            sx={{ color: "text.secondary", display: "block", mt: 1.5 }}
          >
            上次推送：
            {lastPush.at ? new Date(lastPush.at).toLocaleString() : "—"}
            {" · "}
            <Box
              component="span"
              sx={{ color: lastPush.ok ? "success.main" : "error.main" }}
            >
              {lastPush.ok ? (lastPush.dry_run ? "试运行" : "成功") : "失败"}
            </Box>
            {lastPush.kind ? ` · ${lastPush.kind}` : ""}
            {lastPush.message ? ` · ${lastPush.message}` : ""}
          </Typography>
        )}
        {lastPush?.doc_url && (
          <Typography variant="caption" sx={{ display: "block", mt: 0.5 }}>
            <Link href={lastPush.doc_url} target="_blank" rel="noopener">
              查看最近一次的完整明细文档
            </Link>
            {lastPush.html_url && (
              <>
                {" · "}
                <Link href={lastPush.html_url} target="_blank" rel="noopener">
                  HTML 原始文件
                </Link>
              </>
            )}
          </Typography>
        )}
        {loading && (
          <Box sx={{ display: "flex", justifyContent: "center", py: 1 }}>
            <CircularProgress size={18} />
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        {(settings.targets.length > 0 || settings.enabled) && (
          <Button
            color="error"
            onClick={() => void handleClear()}
            disabled={busy}
            sx={{ mr: "auto" }}
          >
            清空设置
          </Button>
        )}
        <Button
          onClick={() => void handleTest()}
          disabled={busy || !lastResult}
        >
          {testing ? "测试中…" : "测试推送"}
        </Button>
        {hasResult && (
          <Button
            onClick={() => void handlePush()}
            disabled={busy || dirty || !lastResult}
          >
            {pushing ? "推送中…" : "立即推送"}
          </Button>
        )}
        <Button onClick={onClose} disabled={busy}>
          取消
        </Button>
        <Button
          variant="contained"
          onClick={() => void handleSave()}
          disabled={busy}
        >
          {saving ? "保存中…" : "保存"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
