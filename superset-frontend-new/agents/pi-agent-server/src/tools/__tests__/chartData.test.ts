import { test, expect, vi, afterEach } from "vitest";
import { buildChartInsightPrompt } from "../chartData.js";

process.env.FLASK_INTERNAL_URL = "http://test:8088";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("buildChartInsightPrompt fetches chart metadata and data", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: {
          id: 42,
          slice_name: "消耗趋势",
          viz_type: "echarts_timeseries_line",
          datasource_id: 26,
          datasource_type: "table",
          form_data: {
            datasource_id: 26,
            datasource_type: "table",
            metrics: ["SUM(消耗)"],
            groupby: ["日期"],
          },
        },
      }),
    })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        result: [
          {
            data: [{ 日期: 1710000000000, "SUM(消耗)": 1000 }],
            colnames: ["日期", "SUM(消耗)"],
            rowcount: 1,
          },
        ],
      }),
    });
  vi.stubGlobal("fetch", fetchMock);

  const prompt = await buildChartInsightPrompt(
    42,
    {},
    "alice",
    "test-token",
  );

  expect(prompt).toContain("分析图表 #42 的数据");
  expect(prompt).toContain("图表: 消耗趋势");
  expect(prompt).toContain("消耗"); // short header from SUM(消耗)
  expect(prompt).toContain("1000");
  expect(fetchMock.mock.calls[0][0]).toBe(
    "http://test:8088/api/v1/chart/42",
  );
  expect(fetchMock.mock.calls[1][0]).toBe(
    "http://test:8088/api/v1/chart/data",
  );
});

test("buildChartInsightPrompt throws when chart metadata fails", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok: false,
    status: 404,
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    buildChartInsightPrompt(1, {}, "alice", "test-token"),
  ).rejects.toThrow("获取图表信息失败");
});
