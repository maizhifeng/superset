import { test, expect, beforeEach } from "vitest";
import { getLlmConfig, setLlmConfig } from "@/config/llm";

const STORAGE_KEY = "superset_llm_config";

beforeEach(() => {
  localStorage.clear();
});

test("getLlmConfig returns defaults when localStorage is empty", () => {
  const cfg = getLlmConfig();
  expect(cfg).toEqual({ baseUrl: "/llm/api/v1", model: "qwopus3.5-4b-v3" });
});

test("getLlmConfig returns parsed value from localStorage", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ baseUrl: "http://my-host:8080", model: "my-model" }));
  expect(getLlmConfig()).toEqual({ baseUrl: "http://my-host:8080", model: "my-model" });
});

test("getLlmConfig returns defaults on corrupt localStorage", () => {
  localStorage.setItem(STORAGE_KEY, "not-json");
  const cfg = getLlmConfig();
  expect(cfg.baseUrl).toBe("/llm/api/v1");
  expect(cfg.model).toBe("qwopus3.5-4b-v3");
});

test("getLlmConfig fills missing keys from defaults", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ baseUrl: "http://x" }));
  const cfg = getLlmConfig();
  expect(cfg.baseUrl).toBe("http://x");
  expect(cfg.model).toBe("qwopus3.5-4b-v3");
});

test("setLlmConfig writes to localStorage", () => {
  setLlmConfig({ baseUrl: "http://new-host", model: "new-model" });
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(saved).toEqual({ baseUrl: "http://new-host", model: "new-model" });
});

test("setLlmConfig overwrites previous value", () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ baseUrl: "old", model: "old" }));
  setLlmConfig({ baseUrl: "new", model: "newer" });
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).model).toBe("newer");
});
