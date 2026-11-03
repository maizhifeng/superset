/**
 * Convert an API / runtime error into a user-facing message.
 *
 * Rule: never surface vague text. Rich backend payloads (Superset's
 * ``errors[]`` or validation messages) are shown as-is because they explain
 * *what* is wrong, while generic transport failures are mapped to explicit,
 * actionable Chinese messages instead of showing ``Forbidden``,
 * ``Request failed with status code 500`` or a bare caller fallback.
 */

interface ErrorPayload {
  message?: unknown;
  msg?: unknown;
  error?: unknown;
  errors?: unknown;
}

interface ApiErrorLike {
  response?: {
    status?: number;
    data?: ErrorPayload;
  };
  code?: string;
  message?: string;
}

interface SupersetErrorItem {
  message?: unknown;
}

/** Backend messages that carry no useful information for end users. */
const VAGUE_SERVER_MESSAGES = new Set([
  "forbidden",
  "unauthorized",
  "bad request",
  "not found",
  "internal server error",
  "request failed",
  "error",
  "failed",
  "unknown error",
  "invalid request",
]);

/** Explicit messages for HTTP statuses, keyed by status code. */
const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: "请求参数有误，请检查后重试",
  401: "登录状态已过期，请重新登录",
  403: "当前账号没有执行该操作的权限，请联系管理员确认账号角色",
  404: "请求的资源不存在，可能已被删除",
  405: "当前操作不被允许，请刷新页面后重试",
  409: "数据冲突或正在被修改，请刷新后重试",
  413: "提交的内容过大，请减少数据量后重试",
  422: "提交的数据未通过校验，请检查后重试",
  429: "请求过于频繁，请稍等片刻后重试",
};

/** Return the payload text when it is informative, otherwise null. */
function informativeServerMessage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (VAGUE_SERVER_MESSAGES.has(trimmed.toLowerCase())) return null;
  // Axios / fetch boilerplate carries no actionable information.
  if (/^Request failed with status code \d+$/i.test(trimmed)) return null;
  if (/^(Network Error|Failed to fetch|Load failed)$/i.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/** Pull ``errors[].message`` from Superset's rich error payload. */
function messagesFromErrorsPayload(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const messages: string[] = [];
  for (const item of value) {
    const message = informativeServerMessage(
      (item as SupersetErrorItem | null)?.message,
    );
    if (message && !messages.includes(message)) messages.push(message);
  }
  return messages;
}

/** Collect every useful message from a backend error body. */
function serverMessages(data: ErrorPayload | undefined): string[] {
  if (!data || typeof data !== "object") return [];
  const rich = messagesFromErrorsPayload(data.errors);
  if (rich.length > 0) return rich;
  for (const candidate of [data.message, data.msg, data.error]) {
    const message = informativeServerMessage(candidate);
    if (message) return [message];
  }
  return [];
}

/** Status code from the response, or parsed from axios boilerplate text. */
function responseStatus(err: ApiErrorLike): number | undefined {
  const status = err.response?.status;
  if (typeof status === "number") return status;
  const match =
    typeof err.message === "string"
      ? err.message.match(/^Request failed with status code (\d+)$/)
      : null;
  return match ? Number(match[1]) : undefined;
}

/** Explicit message for an HTTP status, including 5xx ranges. */
function statusMessage(status: number | undefined): string | null {
  if (status === undefined) return null;
  if (status >= 500) {
    return `服务端错误（HTTP ${status}），请稍后重试；若持续出现请联系管理员`;
  }
  return HTTP_STATUS_MESSAGES[status] ?? null;
}

export function parseErrorMessage(
  err: unknown,
  fallback = "操作失败，请稍后重试",
): string {
  const apiErr = (err ?? {}) as ApiErrorLike;

  // 1) Rich backend payloads win: they usually say *what* is wrong.
  const server = serverMessages(apiErr.response?.data);
  if (server.length > 0) return server.slice(0, 3).join("；");

  // 2) Known HTTP statuses always get an explicit, actionable message.
  const mapped = statusMessage(responseStatus(apiErr));
  if (mapped) return mapped;

  // 3) Timeouts / network failures get explicit wording too.
  if (apiErr.code === "ECONNABORTED" || /timeout/i.test(apiErr.message ?? "")) {
    return "请求超时，请检查网络或稍后重试";
  }
  if (
    !apiErr.response &&
    /network error|failed to fetch|load failed/i.test(apiErr.message ?? "")
  ) {
    return "网络异常，请检查网络连接后重试";
  }

  // 4) Client-side / business-logic Error messages are trusted as-is.
  if (err instanceof Error && apiErr.message?.trim()) return apiErr.message;

  // 5) Last resort: the caller-provided context.
  return fallback;
}
