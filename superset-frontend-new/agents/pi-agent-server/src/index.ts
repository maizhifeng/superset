import { WebSocket, WebSocketServer } from "ws";
import type { Model } from "@earendil-works/pi-ai";
import type { ToolDefinition, AgentSession } from "@earendil-works/pi-coding-agent";
import {
  AuthStorage,
  SessionManager,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { handleConnection } from "./ws-handler.js";
import type { ModelInfo } from "./types.js";
import { getWsPreferredModel, getWsAuthToken } from "./session-store.js";
import extensionFactory, { setSchemaForNextSession } from "./extension.js";
import { getSchema } from "./tools/querySuperset.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadConfig();
const LLM_MODEL = config.llmModel;
const LLM_BASE_URL = config.llmBaseUrl;

interface ModelEntry {
  id: string;
  name?: string;
}

async function fetchModelList(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/models`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: ModelEntry[] };
    const data = json.data ?? (Array.isArray(json) ? json : undefined);
    if (data) {
      return data.map((m) => ({ id: m.id ?? m.name ?? "", name: m.name ?? m.id }));
    }
    return [];
  } catch {
    return [];
  }
}

const modelList: ModelInfo[] = await fetchModelList();

const authStorage = AuthStorage.create();
authStorage.setRuntimeApiKey("flask-llm", "internal");

const resourceLoader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  extensionFactories: [extensionFactory],
});

await resourceLoader.reload();

async function createSession(userId: string, tools: ToolDefinition[], ws?: WebSocket): Promise<AgentSession | null> {
  const modelId = ws ? getWsPreferredModel(ws) ?? LLM_MODEL : LLM_MODEL;
  const model: Model<string> = {
    provider: "flask-llm",
    id: modelId,
    name: modelId,
    api: "openai-completions",
    baseUrl: LLM_BASE_URL,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
  };

  if (ws) {
    const token = getWsAuthToken(ws);
    logger.info("session", `ws token available: ${!!token}`);
    const schema = await getSchema(userId, token);
    logger.info("session", `schema fetched for session: ${!!schema} (${schema?.slice(0, 60).replace(/\n/g, " ")})`);
    if (schema) {
      setSchemaForNextSession(schema);
      logger.info("session", "schema queued for next agent session");
    }
  }

  const { session } = await createAgentSession({
    model,
    authStorage,
    resourceLoader,
    customTools: tools,
    noTools: "builtin",
    sessionManager: SessionManager.inMemory(),
  });

  return session;
}

const wss = new WebSocketServer({
  port: config.wsPort,
  pingInterval: 30_000,
  pingTimeout: 10_000,
});

wss.on("connection", (ws, req) => {
  const searchParams = new URL(req.url ?? "", "http://localhost").searchParams;
  const accessToken = searchParams.get("token") ?? undefined;
  handleConnection(ws, createSession, modelList, accessToken);
});

logger.info("server", `started on port ${config.wsPort}`);
