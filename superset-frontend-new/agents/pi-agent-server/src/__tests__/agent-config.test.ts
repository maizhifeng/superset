import { test, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_AGENT_CONFIG,
  loadAgentConfig,
  resetAgentConfigCache,
  type AgentConfig,
} from "../agent-config.js";

const savedEnv = process.env.AGENT_CONFIG_PATH;

afterEach(() => {
  resetAgentConfigCache();
  if (savedEnv === undefined) {
    delete process.env.AGENT_CONFIG_PATH;
  } else {
    process.env.AGENT_CONFIG_PATH = savedEnv;
  }
});

function writeTempConfig(partial: Partial<AgentConfig>): string {
  const dir = mkdtempSync(join(tmpdir(), "pi-agent-config-"));
  const file = join(dir, "agent-config.json");
  writeFileSync(file, JSON.stringify(partial), "utf-8");
  return file;
}

test("loads config from JSON file over defaults", () => {
  const file = writeTempConfig({
    report: {
      defaultTimeRange: "Last 30 days",
      perspectives: [
        {
          name: "自定义维度",
          description: "自定义描述",
          columns: ["日期", "自定义列"],
          metrics: ["SUM(自定义指标)"],
          orderby: "日期↑",
        },
      ],
    },
  });
  process.env.AGENT_CONFIG_PATH = file;

  const config = loadAgentConfig();
  expect(config.report.defaultTimeRange).toBe("Last 30 days");
  expect(config.report.perspectives).toHaveLength(1);
  expect(config.report.perspectives[0].name).toBe("自定义维度");

  rmSync(file, { force: true });
});

test("falls back to defaults when the config file is missing", () => {
  process.env.AGENT_CONFIG_PATH = "/nonexistent/agent-config.json";
  const config = loadAgentConfig();
  expect(config).toBe(DEFAULT_AGENT_CONFIG);
});

test("default config has the four report perspectives", () => {
  const config = loadAgentConfig();
  expect(config.report.perspectives.map((p) => p.name)).toEqual([
    "平台维度",
    "主游戏维度",
    "重点主游戏 × 渠道商维度",
    "平台 × 媒体维度",
  ]);
  expect(config.report.defaultTimeRange).toBe("Last 7 days");
});
