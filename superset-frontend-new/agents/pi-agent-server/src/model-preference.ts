import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { logger } from "./logger.js";

/**
 * Persistent per-user model preference.
 *
 * The per-WebSocket preference (session-store) is lost on connection drop
 * and server restart; persisting the choice by user id lets new sessions be
 * created with the model the user selected even when the frontend has not
 * replayed it yet (e.g. right after a container restart).
 */
const STORE_PATH = join(process.cwd(), "data", "preferred-models.json");

const preferences = new Map<string, string>();
let loaded = false;

function load(): void {
  if (loaded) return;
  loaded = true;
  try {
    if (!existsSync(STORE_PATH)) return;
    const raw = JSON.parse(readFileSync(STORE_PATH, "utf8")) as Record<
      string,
      unknown
    >;
    for (const [userId, model] of Object.entries(raw)) {
      if (typeof model === "string" && model) {
        preferences.set(userId, model);
      }
    }
    logger.info(
      "model",
      `loaded ${preferences.size} persistent model preference(s)`,
    );
  } catch (e) {
    logger.warn(
      "model",
      `failed to load preferred models: ${(e as Error).message}`,
    );
  }
}

export function getPreferredModel(userId: string): string | undefined {
  load();
  return preferences.get(userId);
}

export function setPreferredModel(userId: string, model: string): void {
  load();
  preferences.set(userId, model);
  try {
    mkdirSync(dirname(STORE_PATH), { recursive: true });
    writeFileSync(
      STORE_PATH,
      JSON.stringify(Object.fromEntries(preferences), null, 2),
    );
  } catch (e) {
    logger.warn(
      "model",
      `failed to persist preferred model: ${(e as Error).message}`,
    );
  }
}
