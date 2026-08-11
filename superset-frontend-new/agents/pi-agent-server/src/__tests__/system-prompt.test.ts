import { test, expect } from "vitest";
import { buildSystemPrompt } from "../system-prompt.js";

test("returns a string", () => {
  const prompt = buildSystemPrompt();
  expect(typeof prompt).toBe("string");
});

test("contains tool references", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("query_superset");
  expect(prompt).toContain("query_superset");
});

test("contains decision rules", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("time_range");
  expect(prompt).toContain("orderby");
  expect(prompt).toContain("row_limit");
  expect(prompt).toContain("show_all");
});

test("contains output formatting rules", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("Markdown");
  expect(prompt).toContain("不要套用固定模板");
  expect(prompt).toContain("markdown");
});

test("contains analysis scenario rules", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("对比分析");
  expect(prompt).toContain("LTV");
  expect(prompt).toContain("钻取分析");
  expect(prompt).toContain("报表生成");
});

test("contains business logic analysis rules", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("获客效率");
  expect(prompt).toContain("留存");
});

test("outputs in Chinese", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("数据分析师");
});

test("requires exact schema metric names", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("逐字使用 Schema 中给出的确切名称");
  expect(prompt).toContain("新增进入");
  // the legacy variant only appears inside the "禁止改写" example, never as
  // an actual usage in the business-meaning rules
  expect(prompt).not.toContain("消耗 ↑ + 新增用户");
  expect(prompt).not.toContain("ROI1 ↓");
});

test("daily report has four analysis perspectives", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("平台维度");
  expect(prompt).toContain("主游戏维度");
  expect(prompt).toContain("重点主游戏 × 渠道商维度");
  expect(prompt).toContain("平台 × 媒体维度");
  expect(prompt).toContain("近 7 天变化趋势");
});

test("daily report perspectives include query parameter presets", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('columns=["日期","平台"]');
  expect(prompt).toContain('columns=["日期","主游戏"]');
  expect(prompt).toContain('columns=["日期","主游戏","渠道商"]');
  expect(prompt).toContain('columns=["日期","平台","媒体"]');
  expect(prompt).toContain("SUM(新增进入)");
  expect(prompt).toContain("SUM(充值流水)");
  expect(prompt).toContain("ltv_7");
  expect(prompt).toContain('time_range="Last 7 days"');
  expect(prompt).toContain("row_limit 一律省略");
});

test("perspective 1 orders by platform then date", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain('orderby=[["平台", true], ["日期", true]]');
});

test("report scenarios require one query per analysis perspective", () => {
  const prompt = buildSystemPrompt();
  expect(prompt).toContain("每个分析视角至少查询一次");
  expect(prompt).toContain("跳过视角");
  expect(prompt).toContain("每个视角必须查询一次");
});
