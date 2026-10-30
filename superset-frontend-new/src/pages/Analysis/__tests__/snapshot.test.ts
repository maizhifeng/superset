import { beforeEach, expect, test, vi } from "vitest";

const { mockGet, mockPut } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPut: vi.fn(),
}));

vi.mock("@/api", () => ({
  default: { get: mockGet, put: mockPut },
}));

import type { ChartDataRow } from "@/types/api";
import { defaultFilters } from "@/pages/Analysis/filters";
import {
  buildBreakdownQuery,
  buildKpiQueryPlan,
  buildTrendQueryPlan,
  clearAnalysisQueryCache,
  peekBreakdownData,
  peekKpiData,
  peekTrendData,
  seedAnalysisData,
} from "@/pages/Analysis/query";
import {
  ANALYSIS_SNAPSHOT_VERSION,
  isDefaultSnapshotScope,
  loadAnalysisSnapshot,
  saveAnalysisSnapshot,
  snapshotQuerySignature,
  snapshotScope,
  type AnalysisSnapshot,
} from "@/pages/Analysis/snapshot";
import { getAnalysisTopic } from "@/pages/Analysis/topics";

const cost = getAnalysisTopic("cost")!;

function section(rows: ChartDataRow[] = [{ cpa: 10 }]) {
  return { rows, error: null };
}

function snapshotData(): AnalysisSnapshot["data"] {
  return {
    totals: section(),
    previous: section(),
    trend: section([{ 日期: "2026-10-01", cpa: 10 }]),
    previousTrend: section([{ 日期: "2026-09-01", cpa: 9 }]),
    breakdown: section([{ 主游戏: "游戏 A", cpa: 10 }]),
  };
}

function snapshot(): AnalysisSnapshot {
  return {
    topic: cost.id,
    version: ANALYSIS_SNAPSHOT_VERSION,
    query_signature: snapshotQuerySignature(cost),
    scope: snapshotScope(defaultFilters(cost)),
    generated_at: new Date().toISOString(),
    data: snapshotData(),
  };
}

beforeEach(() => {
  mockGet.mockReset();
  mockPut.mockReset();
  clearAnalysisQueryCache();
});

test("only the untouched default view is snapshot eligible", () => {
  const defaults = defaultFilters(cost);
  expect(isDefaultSnapshotScope(cost, defaults)).toBe(true);
  expect(isDefaultSnapshotScope(cost, { ...defaults, range: "7d" })).toBe(false);
  expect(
    isDefaultSnapshotScope(cost, { ...defaults, games: ["游戏 A"] }),
  ).toBe(false);
  expect(
    isDefaultSnapshotScope(cost, { ...defaults, drill: { games: ["游戏 A"] } }),
  ).toBe(false);
  expect(
    isDefaultSnapshotScope(cost, { ...defaults, focusDate: "2026-10-09" }),
  ).toBe(false);
  expect(
    isDefaultSnapshotScope(cost, { ...defaults, dimension: "渠道商" }),
  ).toBe(false);
  expect(
    isDefaultSnapshotScope(cost, { ...defaults, includeNatural: false }),
  ).toBe(false);
});

test("seeds the split query caches so the page paints from the snapshot", () => {
  const filters = defaultFilters(cost);
  seedAnalysisData(cost, filters, snapshotData());

  expect(peekKpiData(buildKpiQueryPlan(cost, filters), { allowStale: false }))
    .toBeDefined();
  expect(
    peekTrendData(buildTrendQueryPlan(cost, filters), { allowStale: false }),
  ).toBeDefined();
  expect(
    peekBreakdownData(buildBreakdownQuery(cost, filters), {
      allowStale: false,
    }),
  ).toBeDefined();
});

test("ignores snapshots whose version or date window is outdated", async () => {
  mockGet.mockResolvedValue({
    data: { result: { ...snapshot(), version: 0 } },
  });
  expect(await loadAnalysisSnapshot(cost)).toBeNull();

  mockGet.mockResolvedValue({
    data: {
      result: {
        ...snapshot(),
        scope: {
          ...snapshotScope(defaultFilters(cost)),
          time_range: "2020-01-01 : 2020-01-31",
        },
      },
    },
  });
  expect(await loadAnalysisSnapshot(cost)).toBeNull();
});

test("rejects a snapshot whose rows belong to another dimension", async () => {
  const broken = snapshot();
  broken.data.breakdown = section([
    { 日期: "2026-10-01", cpa: 10 },
  ]);
  mockGet.mockResolvedValue({ data: { result: broken } });
  expect(await loadAnalysisSnapshot(cost)).toBeNull();
});

test("ignores snapshots older than the freshness window", async () => {
  mockGet.mockResolvedValue({
    data: {
      result: { ...snapshot(), generated_at: "2000-01-01T00:00:00.000Z" },
    },
  });
  expect(await loadAnalysisSnapshot(cost)).toBeNull();
});

test("loads a valid snapshot and rejects one for another topic", async () => {
  mockGet.mockResolvedValue({ data: { result: snapshot() } });
  const loaded = await loadAnalysisSnapshot(cost);
  expect(loaded?.topic).toBe(cost.id);
  expect(mockGet).toHaveBeenCalledWith(
    `/bi/analysis-snapshots/${cost.id}`,
    expect.anything(),
  );

  mockGet.mockResolvedValue({
    data: { result: { ...snapshot(), topic: "retention" } },
  });
  expect(await loadAnalysisSnapshot(cost)).toBeNull();
});

test("saves the default snapshot with its scope and generation time", async () => {
  mockPut.mockResolvedValue({ data: { result: {} } });
  await saveAnalysisSnapshot(cost, defaultFilters(cost), snapshotData());

  expect(mockPut).toHaveBeenCalledTimes(1);
  const [url, body] = mockPut.mock.calls[0] as [
    string,
    {
      version: number;
      query_signature: string;
      scope: {
        range: string;
        dimension: string;
        includeNatural: boolean;
        time_range: string;
      };
      generated_at: string;
      data: { breakdown: { rows: unknown[] } };
    },
  ];
  expect(url).toBe(`/bi/analysis-snapshots/${cost.id}`);
  expect(body.scope).toEqual({
    range: "30d",
    dimension: "主游戏",
    includeNatural: true,
    time_range: expect.stringMatching(/\d{4}-\d{2}-\d{2} : /),
  });
  expect(body.version).toBe(ANALYSIS_SNAPSHOT_VERSION);
  expect(body.query_signature).toBe(snapshotQuerySignature(cost));
  expect(Number.isNaN(Date.parse(body.generated_at))).toBe(false);
  expect(body.data.breakdown.rows).toHaveLength(1);
});
