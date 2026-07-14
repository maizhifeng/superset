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
  expect(prompt).toContain("分析要点");
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
