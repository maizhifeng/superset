import { test, expect } from "vitest";
import {
  resolveDisplayName,
  displayLabel,
} from "@/pages/Dashboard/compareColumns";

test("resolveDisplayName maps time grains to labels", () => {
  expect(resolveDisplayName("日期", "日期", "P1W")).toBe("周");
  expect(resolveDisplayName("日期", "日期", "P1M")).toBe("月");
  expect(resolveDisplayName("日期", "日期", "P1D")).toBe("日期");
  expect(resolveDisplayName("日期", "日期", undefined)).toBe("日期");
});

test("resolveDisplayName strips aggregation prefixes", () => {
  expect(resolveDisplayName("SUM(clicks)")).toBe("clicks");
  expect(resolveDisplayName("AVG(revenue)")).toBe("revenue");
  expect(resolveDisplayName("COUNT(用户)")).toBe("用户");
  expect(resolveDisplayName("MIN(x)", "日期", undefined)).toBe("x");
});

test("resolveDisplayName passes through plain names", () => {
  expect(resolveDisplayName("papp_name")).toBe("papp_name");
  expect(resolveDisplayName("ad_real_cost")).toBe("ad_real_cost");
  // time column label wins over aggregation prefix
  expect(resolveDisplayName("SUM(clicks)", "SUM(clicks)", "P1M")).toBe("月");
});

test("displayLabel falls back to the raw name", () => {
  expect(displayLabel("papp_name", "主游戏")).toBe("主游戏");
  expect(displayLabel("papp_name")).toBe("papp_name");
  expect(displayLabel("ad_real_cost", undefined)).toBe("ad_real_cost");
});
