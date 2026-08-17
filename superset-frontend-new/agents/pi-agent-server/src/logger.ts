export type LogLevel = "info" | "warn" | "error" | "debug";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const currentLevel: LogLevel =
  (process.env.AGENT_LOG_LEVEL as LogLevel) ?? "info";

function log(level: LogLevel, tag: string, msg: string, meta?: unknown): void {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return;
  const time = new Date().toISOString().slice(11, 23);
  const metaStr = meta !== undefined ? ` ${JSON.stringify(meta)}` : "";
  console.log(`${time} [${level.toUpperCase()}] [${tag}] ${msg}${metaStr}`);
}

export const logger = {
  info: (tag: string, msg: string, meta?: unknown) =>
    log("info", tag, msg, meta),
  warn: (tag: string, msg: string, meta?: unknown) =>
    log("warn", tag, msg, meta),
  error: (tag: string, msg: string, meta?: unknown) =>
    log("error", tag, msg, meta),
  debug: (tag: string, msg: string, meta?: unknown) =>
    log("debug", tag, msg, meta),
};
