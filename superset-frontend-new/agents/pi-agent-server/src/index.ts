import { WebSocket, WebSocketServer } from "ws";
import type { Model } from "@earendil-works/pi-ai";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import {
  AuthStorage,
  SessionManager,
  createAgentSession,
  DefaultResourceLoader,
  getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { handleConnection } from "./ws-handler.js";
import type { ModelInfo } from "./types.js";
import extensionFactory from "./extension.js";

const WS_PORT = parseInt(process.env.WS_PORT || "3001", 10);
const LLM_MODEL = process.env.LLM_MODEL || "gemma-4-e2b-it";
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://host.docker.internal:1234/v1";

async function fetchModelList(): Promise<ModelInfo[]> {
  try {
    const res = await fetch(`${LLM_BASE_URL}/models`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const json = await res.json() as any;
    const data = json.data || json;
    if (Array.isArray(data)) {
      return data.map((m: any) => ({ id: m.id || m.name || m, name: m.name || m.id }));
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

async function createSession(userId: string, queryTool: ToolDefinition, ws?: WebSocket) {
  const modelId = (ws as any)?._userModel || LLM_MODEL;
  const model = {
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
  } satisfies Model<string>;

  const { session } = await createAgentSession({
    model,
    authStorage,
    resourceLoader,
    customTools: [queryTool],
    noTools: "builtin",
    sessionManager: SessionManager.inMemory(),
  });

  return session;
}

const wss = new WebSocketServer({ port: WS_PORT });

wss.on("connection", (ws) => {
  handleConnection(ws, createSession, modelList);
});

console.log(`Pi agent WebSocket server started on port ${WS_PORT}`);
