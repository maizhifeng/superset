/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { Pool } from "pg";
import type {
  AssistantMessage,
  Message,
  UserMessage,
} from "@earendil-works/pi-ai";
import { logger } from "./logger.js";

/**
 * Persistence layer for the Pi agent server.
 *
 * Conversation transcripts and per-user model preferences are stored in
 * Postgres (same database as Superset, `agent_*` tables) so sessions survive
 * server restarts and the service stays stateless. When DATABASE_URL is not
 * configured or the database is unreachable the store degrades to in-memory
 * maps so local development without a database keeps working.
 */

export interface StoredMessage {
  role: "user" | "assistant";
  content: string;
}

/**
 * Map persisted plain-text messages back to agent-session messages so a
 * session recreated after a server restart continues with its history.
 */
export function toAgentMessages(messages: StoredMessage[]): Message[] {
  const now = Date.now();
  return messages.map((m, i) => {
    if (m.role === "user") {
      return {
        role: "user",
        content: m.content,
        timestamp: now + i,
      } satisfies UserMessage;
    }
    return {
      role: "assistant",
      content: [{ type: "text", text: m.content }],
      api: "openai-completions",
      provider: "flask-llm",
      model: "",
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: "stop",
      timestamp: now + i,
    } satisfies AssistantMessage;
  });
}

let pool: Pool | null = null;
let poolDisabled = false;

interface MemorySession {
  userId: string;
  messages: StoredMessage[];
}

// In-memory fallback maps
const memorySessions = new Map<string, MemorySession>();
const memoryModelPrefs = new Map<string, string>();

function getPool(): Pool | null {
  if (poolDisabled) return null;
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) {
    poolDisabled = true;
    return null;
  }
  try {
    pool = new Pool({ connectionString: url, max: 5 });
  } catch {
    poolDisabled = true;
    return null;
  }
  return pool;
}

export async function initStore(): Promise<void> {
  const db = getPool();
  if (!db) {
    logger.warn(
      "store",
      "DATABASE_URL not set, using in-memory store (sessions lost on restart)",
    );
    return;
  }
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        messages JSONB NOT NULL DEFAULT '[]',
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    await db.query(`
      CREATE TABLE IF NOT EXISTS agent_model_prefs (
        user_id TEXT PRIMARY KEY,
        model TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
    logger.info("store", "connected to database");
  } catch (e) {
    poolDisabled = true;
    logger.warn(
      "store",
      `database init failed, using in-memory store: ${(e as Error).message}`,
    );
  }
}

export async function saveSessionMessages(
  sessionId: string,
  userId: string,
  messages: StoredMessage[],
): Promise<void> {
  const db = getPool();
  if (!db) {
    const existing = memorySessions.get(sessionId);
    if (existing && existing.userId !== userId) return;
    memorySessions.set(sessionId, { userId, messages });
    return;
  }
  try {
    const res = await db.query(
      `INSERT INTO agent_sessions (id, user_id, messages, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id) DO UPDATE
       SET messages = EXCLUDED.messages, updated_at = now()
       WHERE agent_sessions.user_id = EXCLUDED.user_id`,
      [sessionId, userId, JSON.stringify(messages)],
    );
    if (res.rowCount === 0) {
      logger.warn("store", `session ${sessionId} belongs to another user`);
      return;
    }
  } catch (e) {
    const existing = memorySessions.get(sessionId);
    if (!existing || existing.userId === userId) {
      memorySessions.set(sessionId, { userId, messages });
    } else {
      logger.warn("store", `session ${sessionId} belongs to another user`);
      return;
    }
    logger.warn(
      "store",
      `failed to save session ${sessionId}: ${(e as Error).message}`,
    );
  }
}

export async function loadSessionMessages(
  sessionId: string,
  userId: string,
): Promise<StoredMessage[] | null> {
  const db = getPool();
  if (!db) {
    const session = memorySessions.get(sessionId);
    return session?.userId === userId ? session.messages : null;
  }
  try {
    const res = await db.query(
      `SELECT messages FROM agent_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
    if (res.rowCount === 0) return null;
    const parsed = res.rows[0].messages as StoredMessage[];
    if (Array.isArray(parsed)) return parsed;
    return null;
  } catch (e) {
    logger.warn(
      "store",
      `failed to load session ${sessionId}: ${(e as Error).message}`,
    );
    const session = memorySessions.get(sessionId);
    return session?.userId === userId ? session.messages : null;
  }
}

export async function getSessionOwner(
  sessionId: string,
): Promise<string | null> {
  const db = getPool();
  if (!db) return memorySessions.get(sessionId)?.userId ?? null;
  try {
    const res = await db.query(
      `SELECT user_id FROM agent_sessions WHERE id = $1`,
      [sessionId],
    );
    return (res.rows[0]?.user_id as string | undefined) ?? null;
  } catch (e) {
    logger.warn(
      "store",
      `failed to get session owner for ${sessionId}: ${(e as Error).message}`,
    );
    return memorySessions.get(sessionId)?.userId ?? null;
  }
}

export async function deleteSession(
  sessionId: string,
  userId: string,
): Promise<void> {
  const db = getPool();
  const session = memorySessions.get(sessionId);
  if (session?.userId === userId) memorySessions.delete(sessionId);
  if (!db) return;
  try {
    await db.query(
      `DELETE FROM agent_sessions WHERE id = $1 AND user_id = $2`,
      [sessionId, userId],
    );
  } catch (e) {
    logger.warn(
      "store",
      `failed to delete session ${sessionId}: ${(e as Error).message}`,
    );
  }
}

export async function getPreferredModel(
  userId: string,
): Promise<string | null> {
  const db = getPool();
  if (!db) return memoryModelPrefs.get(userId) ?? null;
  try {
    const res = await db.query(
      `SELECT model FROM agent_model_prefs WHERE user_id = $1`,
      [userId],
    );
    return (res.rows[0]?.model as string | undefined) ?? null;
  } catch (e) {
    logger.warn(
      "store",
      `failed to load model preference for ${userId}: ${(e as Error).message}`,
    );
    return memoryModelPrefs.get(userId) ?? null;
  }
}

export async function setPreferredModel(
  userId: string,
  model: string,
): Promise<void> {
  const db = getPool();
  memoryModelPrefs.set(userId, model);
  if (!db) return;
  try {
    await db.query(
      `INSERT INTO agent_model_prefs (user_id, model, updated_at)
       VALUES ($1, $2, now())
       ON CONFLICT (user_id) DO UPDATE
       SET model = $2, updated_at = now()`,
      [userId, model],
    );
  } catch (e) {
    logger.warn(
      "store",
      `failed to save model preference for ${userId}: ${(e as Error).message}`,
    );
  }
}
