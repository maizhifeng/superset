import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

/**
 * WebSocket-layer authentication for the Pi agent server.
 *
 * The frontend holds a Superset JWT (access token). Every WebSocket
 * connection that wants to create sessions or run prompts must present a
 * valid token (via the `auth` message or the `token` query parameter). The
 * token is validated against the Superset `/api/v1/me/` endpoint, which
 * resolves it to the acting user; the agent server never trusts
 * client-supplied usernames for identity.
 */

export interface VerifiedToken {
  token: string;
  username: string;
  expiresAt: number;
}

const VERIFY_TTL_MS = 60 * 1000;
const VERIFY_TIMEOUT_MS = 5000;

// Verification results are cached briefly to avoid hammering Superset on
// reconnects; tokens are short-lived so the window is bounded.
const verifiedTokens = new Map<string, VerifiedToken>();

function getCacheKey(token: string): string {
  // Only the signature/claims matter for caching, but hashing the full token
  // is simpler and avoids keeping the payload around twice.
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 31 + token.charCodeAt(i)) | 0;
  }
  return `${token.length}:${hash}`;
}

function pruneCache(): void {
  const now = Date.now();
  for (const [key, entry] of verifiedTokens) {
    if (entry.expiresAt <= now) {
      verifiedTokens.delete(key);
    }
  }
}

/**
 * Verify a Superset access token by calling the protected `/api/v1/me/`
 * endpoint. Returns the verified username, or null when the token is
 * invalid, expired, or the Superset instance is unreachable.
 */
export async function verifyToken(token: string): Promise<string | null> {
  if (!token) return null;
  pruneCache();
  const cacheKey = getCacheKey(token);
  const cached = verifiedTokens.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.username;
  }

  const config = loadConfig();
  try {
    const res = await fetch(`${config.flaskInternalUrl}/api/v1/me/`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });
    if (!res.ok) {
      logger.warn("auth", `token verification failed: HTTP ${res.status}`);
      return null;
    }
    const json = (await res.json()) as { result?: { username?: string } };
    const username = json?.result?.username;
    if (!username) {
      logger.warn("auth", "token verification returned no username");
      return null;
    }
    verifiedTokens.set(cacheKey, {
      token,
      username,
      expiresAt: Date.now() + VERIFY_TTL_MS,
    });
    logger.info("auth", `token verified for user=${username}`);
    return username;
  } catch (err) {
    logger.warn(
      "auth",
      `token verification failed: ${(err as Error).message ?? String(err)}`,
    );
    return null;
  }
}

/** Clear the verification cache (used by tests). */
export function resetTokenCache(): void {
  verifiedTokens.clear();
}
