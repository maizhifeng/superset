import { WebSocket, WebSocketServer } from "ws";
import type { Model } from "@earendil-works/pi-ai";
import type { AgentSession } from "@earendil-works/pi-coding-agent";
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
import { getPreferredModel, initStore } from "./store.js";
import extensionFactory from "./extension.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadConfig();
const LLM_MODEL = config.llmModel;
const LLM_BASE_URL = config.llmBaseUrl;

await initStore();

interface ModelEntry {
  id: string;
  name?: string;
}

async function fetchModelList(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: ModelEntry[] };
    const data = json.data ?? (Array.isArray(json) ? json : undefined);
    if (data) {
      return data.map((m) => ({
        id: m.id ?? m.name ?? "",
        name: m.name ?? m.id,
      }));
    }
    return [];
  } catch {
    return [];
  }
}

const modelList: ModelInfo[] = await fetchModelList();

// Retry when the LLM provider was not ready at boot (e.g. right after a
// container restart the provider may still be starting). A stale empty
// model list would otherwise make the effective default fall back to
// LLM_MODEL and block frontend re-application of saved preferences.
if (modelList.length === 0) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await new Promise((r) => setTimeout(r, 5000));
    const retried = await fetchModelList();
    if (retried.length > 0) {
      modelList.push(...retried);
      break;
    }
    logger.warn("model", `model list empty, retry ${attempt}/5`);
  }
}

// Effective default model: prefer the configured LLM_MODEL when it exists in
// the provider's model list, otherwise fall back to the first available
// model so sessions are created with a model the provider actually serves.
const effectiveDefaultModel =
  modelList.find((m) => m.id === LLM_MODEL)?.id ??
  modelList[0]?.id ??
  LLM_MODEL;

const authStorage = AuthStorage.create();
authStorage.setRuntimeApiKey("flask-llm", "internal");

const resourceLoader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  extensionFactories: [extensionFactory],
});

await resourceLoader.reload();

async function createSession(
  userId: string,
  ws?: WebSocket,
): Promise<AgentSession | null> {
  const wsPreferred = ws ? getWsPreferredModel(ws) : undefined;
  const persistedPref = ws ? await getPreferredModel(userId) : null;
  const modelId = wsPreferred ?? persistedPref ?? effectiveDefaultModel;
  logger.info(
    "session",
    `creating session for user=${userId} model=${modelId} (wsPreferred=${!!wsPreferred} persistent=${persistedPref ?? "-"})`,
  );
  const model: Model<string> = {
    provider: "flask-llm",
    id: modelId,
    name: modelId,
    api: "openai-completions",
    baseUrl: LLM_BASE_URL,
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: config.llmMaxTokens,
  };

  const { session } = await createAgentSession({
    model,
    authStorage,
    resourceLoader,
    // Built-in agent only: no custom tools and no built-in coding tools.
    // Data for report requests is fetched by the orchestrator instead.
    noTools: "all",
    sessionManager: SessionManager.inMemory(),
    // Reasoning starts off; processPrompt enables it per-intent for
    // report/comparison requests (see isReasoningIntent in agent-orchestrator).
    thinkingLevel: "off",
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
  handleConnection(
    ws,
    createSession,
    modelList,
    accessToken,
    effectiveDefaultModel,
  );
});

logger.info("server", `started on port ${config.wsPort}`);
