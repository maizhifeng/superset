const STORAGE_KEY = "superset_ai_model_config";

export interface ModelConfig {
  provider: string;
  model: string;
}

export interface ProviderOption {
  id: string;
  name: string;
  models: { id: string; name: string }[];
}

const DEFAULT: ModelConfig = {
  provider: "lmstudio",
  model: "gemma-4-e4b-it",
};

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

export async function fetchProviders(): Promise<ProviderOption[]> {
  try {
    const res = await fetch("/opencode/provider", { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return [];
    const body = await res.json();
    const all: { id: string; name: string; models: Record<string, { id: string; name: string }> }[] = body.all ?? [];
    return all.map((p) => ({
      id: p.id,
      name: p.name,
      models: Object.values(p.models ?? {}).map((m) => ({ id: m.id, name: m.name })),
    }));
  } catch {
    return [];
  }
}
