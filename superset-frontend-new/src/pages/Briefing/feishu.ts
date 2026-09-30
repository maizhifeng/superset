/**
 * Feishu (Lark) push settings for a briefing.
 *
 * The transport lives entirely on the backend: a custom app's bot posts a
 * Card 2.0 card to the configured targets.  These helpers own the client-side
 * shape, the target vocabulary and the validation mirrored by the API, so the
 * dialog and the tests share one definition.
 */

export type FeishuReceiveIdType =
  "chat_id" | "open_id" | "user_id" | "union_id" | "email";

export type FeishuMsgType = "interactive" | "text";

export interface FeishuTarget {
  receive_id_type: FeishuReceiveIdType;
  receive_id: string;
}

export interface FeishuLastPush {
  at?: string | null;
  ok?: boolean;
  kind?: string;
  dry_run?: boolean;
  message?: string | null;
  /** The complete HTML report exported as a Feishu document. */
  doc_url?: string | null;
  /** The raw interactive HTML file kept in Feishu Drive. */
  html_url?: string | null;
}

/** The stored briefing result a push would send. */
export interface FeishuLastResult {
  report_date?: string | null;
  report_type?: "daily" | "weekly";
  finished_at?: string | null;
  job_id?: string | null;
  source?: string | null;
  points?: number;
  alerts?: number;
  has_media_platforms?: boolean;
  /** The stored result is older than a day, or not the last complete day. */
  stale?: boolean;
  expected_report_date?: string | null;
  age_hours?: number | null;
}

export interface FeishuSettings {
  enabled: boolean;
  msg_type: FeishuMsgType;
  /** Whether the card also carries each chapter's detail tables. */
  include_tables: boolean;
  /** Whether each push also exports the full HTML report as a Feishu doc. */
  include_doc: boolean;
  /** Send one card per chapter (each message gets its own 30 KB budget). */
  split_chapters: boolean;
  targets: FeishuTarget[];
  /** Deployment status: whether FEISHU_APP_ID / FEISHU_APP_SECRET are set. */
  app_configured: boolean;
  app_id_masked: string;
  api_base: string;
  /** Whether *scheduled* pushes are dry runs (email dry run is separate). */
  scheduled_dry_run: boolean;
  frontend_url: string;
  last_push: FeishuLastPush | null;
  /** null until a briefing has been generated for this configuration. */
  last_result: FeishuLastResult | null;
}

export interface FeishuChat {
  chat_id: string;
  name: string;
}

export interface FeishuOutcome {
  ok: boolean;
  dry_run: boolean;
  error?: string | null;
  error_kind?: string | null;
  /** URL of the complete HTML report exported as a Feishu document. */
  doc_url?: string | null;
  /** URL of the raw interactive HTML file in Feishu Drive. */
  html_url?: string | null;
  sent: {
    target: string;
    ok: boolean;
    message: string;
    /** What had to be dropped to fit Feishu's 30 KB card limit. */
    trimmed?: string[];
  }[];
}

export interface FeishuTargetOption {
  value: FeishuReceiveIdType;
  label: string;
  placeholder: string;
}

export const FEISHU_TARGET_OPTIONS: FeishuTargetOption[] = [
  { value: "chat_id", label: "群聊", placeholder: "oc_xxx" },
  { value: "open_id", label: "用户 open_id", placeholder: "ou_xxx" },
  { value: "email", label: "邮箱", placeholder: "name@example.com" },
];

/** The API accepts more id kinds than the dialog offers by default. */
export const FEISHU_RECEIVE_ID_TYPES: FeishuReceiveIdType[] = [
  "chat_id",
  "open_id",
  "user_id",
  "union_id",
  "email",
];

export const MAX_FEISHU_TARGETS = 5;

export const EMPTY_FEISHU_TARGET: FeishuTarget = {
  receive_id_type: "chat_id",
  receive_id: "",
};

export function emptyFeishuSettings(): FeishuSettings {
  return {
    enabled: false,
    msg_type: "interactive",
    include_tables: false,
    include_doc: true,
    split_chapters: true,
    targets: [],
    app_configured: false,
    app_id_masked: "",
    api_base: "",
    scheduled_dry_run: false,
    frontend_url: "",
    last_push: null,
    last_result: null,
  };
}

/**
 * Fold an API payload into a fully populated settings object.
 *
 * Unknown target types fall back to ``chat_id`` so a payload written by a newer
 * backend can never break the dialog.
 */
export function normalizeSettings(
  raw: Partial<FeishuSettings> | null | undefined,
): FeishuSettings {
  const base = emptyFeishuSettings();
  if (!raw) return base;
  const targets = Array.isArray(raw.targets)
    ? raw.targets
        .filter((t): t is FeishuTarget => !!t && typeof t === "object")
        .map((t) => ({
          receive_id_type: FEISHU_RECEIVE_ID_TYPES.includes(t.receive_id_type)
            ? t.receive_id_type
            : "chat_id",
          receive_id: String(t.receive_id ?? ""),
        }))
    : [];
  return {
    ...base,
    ...raw,
    enabled: !!raw.enabled,
    msg_type: raw.msg_type === "text" ? "text" : "interactive",
    include_tables: !!raw.include_tables,
    include_doc: raw.include_doc === undefined ? true : !!raw.include_doc,
    split_chapters:
      raw.split_chapters === undefined ? true : !!raw.split_chapters,
    targets,
    last_push: raw.last_push ?? null,
    last_result: raw.last_result ?? null,
  };
}

/** Trimmed, blank-free targets ready to be sent to the API. */
export function cleanTargets(targets: FeishuTarget[]): FeishuTarget[] {
  return targets
    .map((t) => ({
      receive_id_type: t.receive_id_type,
      receive_id: String(t.receive_id ?? "").trim(),
    }))
    .filter((t) => t.receive_id);
}

/**
 * Mirror of the backend's validation so the dialog can fail fast.
 * Returns human-readable messages (empty when the input is valid).
 */
export function validateTargets(
  targets: FeishuTarget[],
  enabled = false,
): string[] {
  const errors: string[] = [];
  const filled = cleanTargets(targets);
  if (targets.length > MAX_FEISHU_TARGETS) {
    errors.push(`最多配置 ${MAX_FEISHU_TARGETS} 个推送目标`);
  }
  if (targets.some((t) => !String(t.receive_id ?? "").trim())) {
    errors.push("推送目标不能为空");
  }
  if (enabled && filled.length === 0) {
    errors.push("启用定时推送前请先配置至少一个目标");
  }
  return errors;
}

export function targetLabel(target: FeishuTarget): string {
  const option = FEISHU_TARGET_OPTIONS.find(
    (o) => o.value === target.receive_id_type,
  );
  return option ? option.label : target.receive_id_type;
}

/** Body accepted by ``PUT /briefing/configs/<id>/feishu``. */
export function settingsPayload(settings: {
  enabled: boolean;
  msg_type: FeishuMsgType;
  include_tables: boolean;
  include_doc: boolean;
  split_chapters: boolean;
  targets: FeishuTarget[];
}): Record<string, unknown> {
  return {
    enabled: settings.enabled,
    msg_type: settings.msg_type,
    include_tables: settings.include_tables,
    include_doc: settings.include_doc,
    split_chapters: settings.split_chapters,
    targets: cleanTargets(settings.targets),
  };
}

/** Summarise a push outcome for a toast. */
export function outcomeMessage(outcome: FeishuOutcome | undefined): string {
  if (!outcome) return "推送结果未知";
  if (outcome.ok) {
    if (outcome.dry_run) return "试运行：未实际发送";
    const trimmed = outcome.sent.flatMap((s) => s.trimmed ?? []);
    const suffix = trimmed.length > 0 ? `（${trimmed[0]}）` : "";
    return `已推送到 ${outcome.sent.length} 个目标${suffix}`;
  }
  const failed = outcome.sent.filter((s) => !s.ok);
  return failed.length > 0
    ? `推送失败：${failed.map((s) => `${s.target} ${s.message}`).join("；")}`
    : `推送失败：${outcome.error ?? "未知错误"}`;
}
