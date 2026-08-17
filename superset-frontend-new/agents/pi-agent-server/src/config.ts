export interface AppConfig {
  wsPort: number;
  llmModel: string;
  llmBaseUrl: string;
  llmMaxTokens: number;
  reasoningLevel: string;
  flaskInternalUrl: string;
  supersetUsername: string | null;
  supersetPassword: string | null;
  datasetId: number;
}

export function loadConfig(): AppConfig {
  return {
    wsPort: parseInt(process.env.WS_PORT || "3001", 10),
    llmModel: process.env.LLM_MODEL || "gemma-4-e2b-it",
    llmBaseUrl:
      process.env.LLM_BASE_URL || "http://host.docker.internal:1234/v1",
    llmMaxTokens: parseInt(process.env.LLM_MAX_TOKENS || "8192", 10),
    reasoningLevel: process.env.AGENT_REASONING_LEVEL || "low",
    flaskInternalUrl:
      process.env.FLASK_INTERNAL_URL || "http://superset-light:8088",
    supersetUsername: process.env.SUPERSET_USERNAME ?? null,
    supersetPassword: process.env.SUPERSET_PASSWORD ?? null,
    datasetId: parseInt(process.env.SUPERSET_DATASET_ID || "26", 10),
  };
}
