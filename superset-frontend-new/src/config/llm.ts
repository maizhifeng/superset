export interface LlmConfig {
  baseUrl: string;
  model: string;
}

const STORAGE_KEY = "superset_llm_config";

const DEFAULTS: LlmConfig = {
  baseUrl: "/llm/api/v1",
  model: "qwopus3.5-4b-v3",
};

export function getLlmConfig(): LlmConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        baseUrl: parsed.baseUrl || DEFAULTS.baseUrl,
        model: parsed.model || DEFAULTS.model,
      };
    }
  } catch {
    /* ignore corrupt config */
  }
  return { ...DEFAULTS };
}

export function setLlmConfig(config: LlmConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}
