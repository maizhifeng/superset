import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config.js";

const config = loadConfig();

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
        maxTokens: config.llmMaxTokens,
      },
    ],
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
