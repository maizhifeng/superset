import { test, expect, vi, beforeEach } from "vitest";

vi.mock("@/api", () => ({
  default: {
    post: vi.fn(() => Promise.resolve({ data: {} })),
  },
}));

import { getChartDataUrl, postChartData } from "@/api/chartData";
import api from "@/api";

beforeEach(() => {
  vi.clearAllMocks();
});

test("getChartDataUrl routes federated datasets to /bi/chart/data", () => {
  expect(getChartDataUrl(26)).toBe("/bi/chart/data");
});

test("getChartDataUrl routes non-federated datasets to /chart/data", () => {
  expect(getChartDataUrl(99)).toBe("/chart/data");
  expect(getChartDataUrl(undefined)).toBe("/chart/data");
});

test("postChartData posts to /bi/chart/data for federated datasource id", async () => {
  const payload = {
    datasource: { id: 26, type: "table" },
    queries: [],
    result_format: "json",
    result_type: "full",
  };
  await postChartData(payload);
  expect(api.post).toHaveBeenCalledWith("/bi/chart/data", payload, undefined);
});

test("postChartData posts to /chart/data for non-federated datasource id", async () => {
  const payload = { datasource: { id: 7, type: "table" }, queries: [] };
  await postChartData(payload);
  expect(api.post).toHaveBeenCalledWith("/chart/data", payload, undefined);
});

test("postChartData forwards AbortSignal config", async () => {
  const signal = new AbortController().signal;
  await postChartData({ datasource: { id: 26 } }, { signal });
  expect(api.post).toHaveBeenCalledWith(
    "/bi/chart/data",
    { datasource: { id: 26 } },
    { signal },
  );
});
