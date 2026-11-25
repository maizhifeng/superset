/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { test, expect, vi, afterEach } from "vitest";
import { buildChartInsightPrompt } from "../chartData.js";

process.env.FLASK_INTERNAL_URL = "http://test:8088";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
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
    {
      userId: "alice",
      token: "test-token",
    },
  );

  expect(prompt).toContain("分析图表 #42 的数据");
  expect(prompt).toContain("图表: 消耗趋势");
  expect(prompt).toContain("消耗"); // short header from SUM(消耗)
  expect(prompt).toContain("1000");
  expect(fetchMock.mock.calls[0][0]).toBe("http://test:8088/api/v1/chart/42");
  expect(fetchMock.mock.calls[1][0]).toBe("http://test:8088/api/v1/chart/data");
});

test("buildChartInsightPrompt throws when chart metadata fails", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    ok: false,
    status: 404,
  });
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    buildChartInsightPrompt(1, {}, { userId: "alice", token: "test-token" }),
  ).rejects.toThrow("获取图表信息失败");
});

test("buildChartInsightPrompt fails closed without a user token", async () => {
  vi.stubEnv("SUPERSET_USERNAME", "service-account");
  vi.stubEnv("SUPERSET_PASSWORD", "service-password");
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);

  await expect(
    buildChartInsightPrompt(1, {}, { userId: "alice", token: "" }),
  ).rejects.toThrow("未认证");
  expect(fetchMock).not.toHaveBeenCalled();
});
