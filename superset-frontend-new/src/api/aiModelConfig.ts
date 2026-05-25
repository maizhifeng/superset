const STORAGE_KEY = "superset_ai_model_config";

export interface ModelConfig {
  provider: string;
  model: string;
}

export interface ProviderPreset {
  label: string;
  provider: string;
  model: string;
}

export const PRESETS: ProviderPreset[] = [
  { label: "LM Studio (local)", provider: "lmstudio", model: "gemma-4-e4b-it" },
  { label: "Opencode Zen", provider: "opencode", model: "deepseek-v4-flash-free" },
];

const DEFAULT: ModelConfig = { provider: "lmstudio", model: "gemma-4-e4b-it" };

export function getModelConfig(): ModelConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as ModelConfig;
  } catch { /* ignore */ }
  return DEFAULT;
}

export function setModelConfig(cfg: ModelConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
}
