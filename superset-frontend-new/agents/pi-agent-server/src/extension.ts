import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt } from "./system-prompt.js";
import { loadConfig } from "./config.js";
import { logger } from "./logger.js";

const config = loadConfig();

let pendingSchema: string | null = null;

export function setSchemaForNextSession(schema: string): void {
  pendingSchema = schema;
}

export default function (pi: ExtensionAPI) {
  pi.registerProvider("flask-llm", {
    name: "Flask LLM Proxy",
    baseUrl: config.llmBaseUrl,
    apiKey: "internal",
    api: "openai-completions",
    models: [
      {
        id: config.llmModel,
        name: config.llmModel,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });

  pi.on("before_agent_start", () => {
    if (pendingSchema) {
      logger.info("prompt", "injecting schema into system prompt");
      const prompt = `${buildSystemPrompt()}\n\n## 当前数据集 Schema\n\n${pendingSchema}`;
      pendingSchema = null;
      return { systemPrompt: prompt };
    }
    logger.warn("prompt", "no pending schema to inject");
    return { systemPrompt: buildSystemPrompt() };
  });

  pi.on("before_provider_request", (_event) => {
    const payload = _event.payload as Record<string, unknown>;
    if (payload && typeof payload === "object") {
      payload.temperature = 0;
      payload.seed = 42;
      payload.top_p = 0.1;
    }
    return payload;
  });
}
