import { create } from "zustand";

export interface AiPreset {
  id: string;
  label: string;
  provider: string;
  model: string;
  baseUrl: string;
  agentModel?: string;
}

const STORAGE_KEY = "superset_ai_presets";
const ACTIVE_KEY = "superset_ai_active_preset";

const DEFAULT_PRESETS: AiPreset[] = [
  {
    id: "lmstudio",
    label: "LM Studio (local)",
    provider: "lmstudio",
    model: "",
    baseUrl: "http://172.24.64.1:1234/v1",
  },
];

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as T;
      return parsed ?? fallback;
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

function loadPresets(): AiPreset[] {
  const parsed = loadFromStorage<AiPreset[]>(STORAGE_KEY, DEFAULT_PRESETS);
  const presets =
    Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_PRESETS;
  // Migrate: remove old Opencode Zen preset and strip legacy fields
  const cleaned = presets
    .filter((p) => p.id !== "opencode-zen")
    .map((p) => ({
      id: p.id,
      label: p.label,
      provider: p.provider,
      model: p.model,
      baseUrl: p.baseUrl,
      agentModel: (p as unknown as Record<string, unknown>).agentModel as string | undefined,
    }));
  const changed =
    cleaned.length !== presets.length ||
    presets.some((p) => "agentFramework" in p || "llmFramework" in p);
  if (changed) {
    savePresets(cleaned);
  }
  return cleaned;
}

function savePresets(presets: AiPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}

function loadActiveId(): string | null {
  return loadFromStorage<string | null>(ACTIVE_KEY, null);
}

function saveActiveId(id: string | null) {
  if (id) {
    localStorage.setItem(ACTIVE_KEY, id);
  } else {
    localStorage.removeItem(ACTIVE_KEY);
  }
}

function computeState() {
  const presets = loadPresets();
  let activePresetId = loadActiveId();
  if (!activePresetId || !presets.find((p) => p.id === activePresetId)) {
    activePresetId = presets[0]?.id ?? null;
    if (activePresetId) saveActiveId(activePresetId);
  }
  const activePreset =
    presets.find((p) => p.id === activePresetId) ?? DEFAULT_PRESETS[0];
  return { presets, activePresetId, activePreset };
}

// --- Functional API (for non-React code) ---

export function getActivePreset(): AiPreset {
  return computeState().activePreset;
}

export function getAllPresets(): AiPreset[] {
  return loadPresets();
}

export function addPreset(preset: AiPreset) {
  const presets = loadPresets();
  presets.push(preset);
  savePresets(presets);
}

export function updatePreset(id: string, updates: Partial<AiPreset>) {
  const presets = loadPresets();
  const idx = presets.findIndex((p) => p.id === id);
  if (idx !== -1) {
    presets[idx] = { ...presets[idx], ...updates };
    savePresets(presets);
  }
}

export function deletePreset(id: string) {
  const presets = loadPresets();
  const filtered = presets.filter((p) => p.id !== id);
  savePresets(filtered);
  const activeId = loadActiveId();
  if (activeId === id && filtered.length > 0) {
    saveActiveId(filtered[0].id);
  } else if (filtered.length === 0) {
    saveActiveId(null);
  }
}

export function setActivePreset(id: string) {
  saveActiveId(id);
}

export function getAgentModel(): string {
  const preset = getActivePreset();
  if (preset.agentModel) return preset.agentModel;
  return preset.model || "gemma-4-e2b-it";
}

export function setAgentModel(model: string) {
  const preset = getActivePreset();
  updatePreset(preset.id, { agentModel: model });
}

// --- Zustand store for reactive consumption (React components) ---

interface AiConfigState {
  presets: AiPreset[];
  activePresetId: string | null;
  activePreset: AiPreset;
  refresh: () => void;
  add: (preset: AiPreset) => void;
  update: (id: string, updates: Partial<AiPreset>) => void;
  remove: (id: string) => void;
  setActive: (id: string) => void;
}

export const useAiConfigStore = create<AiConfigState>()((set) => ({
  ...computeState(),
  refresh: () => set(computeState()),
  add: (preset) => {
    addPreset(preset);
    set(computeState());
  },
  update: (id, updates) => {
    updatePreset(id, updates);
    set(computeState());
  },
  remove: (id) => {
    deletePreset(id);
    set(computeState());
  },
  setActive: (id) => {
    setActivePreset(id);
    set(computeState());
  },
}));
