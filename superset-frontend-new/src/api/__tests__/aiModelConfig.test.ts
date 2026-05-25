import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { getModelConfig, setModelConfig } from "@/api/aiModelConfig";

const STORAGE_KEY = "superset_ai_model_config";

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("getModelConfig returns defaults when localStorage is empty", () => {
  const cfg = getModelConfig();
  expect(cfg).toEqual({ provider: "lmstudio", model: "gemma-4-e4b-it" });
});

test("getModelConfig returns parsed value from localStorage", () => {
  const saved = { provider: "custom", model: "my-model" };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  expect(getModelConfig()).toEqual(saved);
});

test("getModelConfig returns defaults when localStorage has corrupt JSON", () => {
  localStorage.setItem(STORAGE_KEY, "not-json");
  const cfg = getModelConfig();
  expect(cfg).toEqual({ provider: "lmstudio", model: "gemma-4-e4b-it" });
});

test("setModelConfig writes to localStorage", () => {
  const cfg = { provider: "openai", model: "gpt-4" };
  setModelConfig(cfg);
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")).toEqual(cfg);
});

test("setModelConfig overwrites previous value", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ provider: "old", model: "old-model" }));
  setModelConfig({ provider: "new", model: "new-model" });
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")).toEqual({ provider: "new", model: "new-model" });
});


