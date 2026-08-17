import { test, expect, vi, beforeEach } from "vitest";
import {
  toWideFilters,
  parseChartDataResponse,
  buildWideRequest,
  fetchChartData,
  type FilterSpec,
} from "@/utils/query/buildChartDataRequest";

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    defaults: { headers: { common: {} } },
  },
  getDataset: vi.fn(() => Promise.resolve({ columns: [], metrics: [] })),
}));

vi.mock("@/config/federatedDatasets", () => ({
  isFederatedDataset: (id: number | undefined) => id === 7,
  FEDERATED_DATASETS: new Set<number>([7]),
  refreshFederatedDatasets: () => Promise.resolve(),
}));

vi.mock("@/api/wideData", () => ({
  fetchWideData: vi.fn(() => Promise.resolve({ data: [{ col: "wide" }] })),
  MAX_PIVOT_FETCH_ROWS: 10_000,
  MAX_WIDE_FETCH_ROWS: 100_000,
}));

import api from "@/api";
import { fetchWideData } from "@/api/wideData";

beforeEach(() => {
  vi.clearAllMocks();
});

const buildChart = (id: number, dsId: number) => ({
  id,
  slice_name: `chart-${id}`,
  viz_type: "table",
  datasource_id: dsId,
  datasource_type: "table",
  form_data: JSON.stringify({ metrics: ["sum__x"], groupby: ["dim"] }),
});

test("toWideFilters normalizes both filter shapes", () => {
  const specs: FilterSpec[] = [
    { subject: "a", operator: "==", comparator: 1 },
    { col: "b", op: ">", val: 2 },
    { col: "", op: "", val: 3 }, // dropped for missing col
  ];
  expect(toWideFilters(specs)).toEqual([
    { col: "a", op: "==", val: 1 },
    { col: "b", op: ">", val: 2 },
  ]);
});

test("parseChartDataResponse returns detail, total, totals and subtotals", () => {
  const results = [
    { data: [{ dim: "a", x: 1 }] },
    { data: [{ x: 3 }] },
    { data: [{ x: 1 }] },
  ] as never[];
  const parsed = parseChartDataResponse(results, true, undefined);
  expect(parsed.data.data).toEqual([{ dim: "a", x: 1 }]);
  expect(parsed.totalRow).toEqual({ x: 3 });
  expect(parsed.pivotTotalRows).toEqual([{ x: 3 }]);
  expect(parsed.pivotSubtotalRows).toEqual([[{ x: 1 }]]);
  expect(parsed.hasMore).toBe(false);
});

test("parseChartDataResponse detects hasMore via pageSize+1 probe", () => {
  const rows = Array.from({ length: 51 }, (_, i) => ({ i }));
  const results = [{ data: rows }, { data: [] }] as never[];
  const parsed = parseChartDataResponse(results, false, 0);
  expect(parsed.hasMore).toBe(true);
  expect(parsed.data.data).toHaveLength(50);
});

test("buildWideRequest includes federated columns and row_limit", () => {
  const body = buildWideRequest(
    7,
    "table",
    { groupbyRows: ["row"], groupbyColumns: ["col"] },
    ["sum__x"],
    [],
    true,
  );
  expect(body.columns).toEqual(["row", "col"]);
  expect(body.metrics).toEqual(["sum__x"]);
  expect(body.row_limit).toBe(100_000);
  expect(body.force).toBe(true);
});

test("fetchChartData uses wide path for federated pivot datasets", async () => {
  (fetchWideData as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: [{ row: "x", col: "y" }],
  });
  const chart = {
    id: 7,
    slice_name: "p",
    viz_type: "pivot_table_v2",
    datasource_id: 7,
    datasource_type: "table",
    params: JSON.stringify({
      metrics: ["sum__x"],
      groupbyRows: ["row"],
      groupbyColumns: ["col"],
    }),
  };
  const result = await fetchChartData(
    chart,
    {},
    () => [],
    {},
  );
  expect(result.data.data).toEqual([{ row: "x", col: "y" }]);
  expect(result.totalRow).toBeNull();
  expect(fetchWideData).toHaveBeenCalledTimes(1);
});

test("fetchChartData posts classic multi-query and computes 分成后流水 total", async () => {
  (api.post as ReturnType<typeof vi.fn>).mockResolvedValue({
    data: {
      result: [
        { data: [{ dim: "a", 分成后流水: 5 }, { dim: "b", 分成后流水: 7 }] },
        { data: [{ 分成后流水: 0 }] },
      ],
    },
  });
  const chart = buildChart(8, 8);
  const result = await fetchChartData(chart, {}, () => [], {});
  expect(result.totalRow?.["分成后流水"]).toBe(12);
  // datasource host is the classic (non-federated) URL
  const posted = (api.post as ReturnType<typeof vi.fn>).mock.calls[0];
  expect(posted[0]).toContain("/chart/data");
});
