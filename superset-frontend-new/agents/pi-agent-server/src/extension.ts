import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { buildSystemPrompt } from "./system-prompt.js";

export default function (pi: ExtensionAPI) {
  const llmUrl =
    process.env.LLM_BASE_URL || "http://host.docker.internal:1234/v1";
  const modelId = process.env.LLM_MODEL || "gemma-4-e2b-it";

  pi.registerProvider("flask-llm", {
    name: "Flask LLM Proxy",
    baseUrl: llmUrl,
    apiKey: "internal",
    api: "openai-completions",
    models: [
      {
        id: modelId,
        name: modelId,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ],
  });

  pi.on("before_agent_start", () => {
    return { systemPrompt: buildSystemPrompt() };
  });
}
