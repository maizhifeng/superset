import { test, expect, vi, beforeEach } from "vitest";

vi.mock("@/api/chartData", () => ({
  postChartData: vi.fn(),
}));

import { executeQuery } from "@/api/querySuperset";
import { postChartData } from "@/api/chartData";

beforeEach(() => {
  vi.clearAllMocks();
});

function mockResult(rows: Record<string, unknown>[], colnames: string[]) {
  vi.mocked(postChartData).mockResolvedValue({
    data: { result: [{ data: rows, colnames }] },
  } as never);
}

test("executeQuery accepts Last 2 days time range", async () => {
  mockResult(
    [{ 日期: 1750000000000, "SUM(消耗)": 100 }],
    ["日期", "SUM(消耗)"],
  );
  const md = await executeQuery({
    columns: ["日期", "主游戏"],
    metrics: ["SUM(消耗)", "SUM(新增进入)", "cpa", "roi_1", "ltv_1"],
    time_range: "Last 2 days",
    row_limit: 100,
  });
  expect(md).toContain("SUM(消耗)");
  const payload = vi.mocked(postChartData).mock.calls[0][0] as {
    queries: { time_range: string; row_limit: number }[];
  };
  expect(payload.queries[0].time_range).toBe("Last 2 days");
  expect(payload.queries[0].row_limit).toBe(100);
});

test("executeQuery formats 日期 timestamps as M/D", async () => {
  const ts = new Date("2026-08-09T00:00:00Z").getTime();
  mockResult([{ 日期: ts, "SUM(消耗)": 12.5 }], ["日期", "SUM(消耗)"]);
  const md = await executeQuery({
    columns: ["日期"],
    metrics: ["SUM(消耗)"],
    time_range: "Last 7 days",
  });
  expect(md).toContain("8/9");
  expect(md).not.toContain(String(ts));
});

test("executeQuery rejects disallowed time ranges", async () => {
  await expect(
    executeQuery({
      columns: ["日期"],
      metrics: ["SUM(消耗)"],
      time_range: "Last 1 day" as never,
    }),
  ).rejects.toThrow("不允许的时间范围");
});
