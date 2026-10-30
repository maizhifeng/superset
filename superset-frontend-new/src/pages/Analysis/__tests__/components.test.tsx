import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { test, expect, vi, beforeEach } from "vitest";
import AnalysisBreakdownTable from "@/pages/Analysis/components/AnalysisBreakdownTable";
import AnalysisFilterBar from "@/pages/Analysis/components/AnalysisFilterBar";
import AnalysisKpiCards from "@/pages/Analysis/components/AnalysisKpiCards";
import RetentionMatrix from "@/pages/Analysis/components/RetentionMatrix";
import { defaultFilters } from "@/pages/Analysis/filters";
import {
  clearFilterValuesCache,
  fetchFilterValues,
} from "@/pages/Analysis/filterValues";
import { getAnalysisTopic, topicMetric } from "@/pages/Analysis/topics";

const { mockGet } = vi.hoisted(() => ({ mockGet: vi.fn() }));

vi.mock("@/api", () => ({
  default: { get: mockGet },
}));

// The breakdown table renders its own DataGrid; the component tests only care
// about the surrounding chrome, so keep the grid a plain element.
vi.mock("@/components/DataGridTable", () => ({
  default: (props: { rows?: unknown[] }) => (
    <div data-testid="datagrid">{Array.isArray(props.rows) ? props.rows.length : 0}</div>
  ),
}));

const cost = getAnalysisTopic("cost")!;
const retention = getAnalysisTopic("retention")!;

beforeEach(() => {
  mockGet.mockReset();
  clearFilterValuesCache();
});

test("formats KPI values with the metric's formatter", () => {
  render(
    <AnalysisKpiCards
      metrics={cost.kpis.map((key) => topicMetric(cost, key))}
      row={{
        消耗: 1234,
        返点后消耗: 1000,
        新增进入: 100,
        cpa: 10,
        cpp: 20,
      }}
      loading={false}
    />,
  );

  expect(screen.getByText("1.23K")).toBeInTheDocument();
  expect(screen.getByText("10")).toBeInTheDocument();
  expect(screen.getByText("20")).toBeInTheDocument();
});

test("renders missing KPI values as a dash", () => {
  render(
    <AnalysisKpiCards
      metrics={[topicMetric(cost, "cpa")]}
      row={{}}
      loading={false}
    />,
  );
  // Value and delta row both fall back to a dash when nothing is available.
  expect(screen.getAllByText("–")).toHaveLength(2);
});

test("renders the period-over-period KPI delta", () => {
  render(
    <AnalysisKpiCards
      metrics={[topicMetric(cost, "cpa")]}
      row={{ cpa: 10 }}
      previousRow={{ cpa: 8 }}
      loading={false}
    />,
  );
  expect(screen.getByText("+25.0%")).toBeInTheDocument();
  expect(screen.getByText("较上期")).toBeInTheDocument();
});

test("names the comparison window in the KPI delta tooltip", async () => {
  render(
    <AnalysisKpiCards
      metrics={[topicMetric(cost, "cpa")]}
      row={{ cpa: 10 }}
      previousRow={{ cpa: 8 }}
      comparisonRange="2026-08-28 ~ 2026-09-26"
      loading={false}
    />,
  );

  fireEvent.mouseOver(screen.getByText("+25.0%"));
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "2026-08-28 ~ 2026-09-26",
  );
});

test("renders rate deltas in percentage points", () => {
  render(
    <AnalysisKpiCards
      metrics={[topicMetric(cost, "revenueRoi")]}
      row={{ 流水ROI: 0.135 }}
      previousRow={{ 流水ROI: 0.12 }}
      loading={false}
    />,
  );
  expect(screen.getByText("+1.5pp")).toBeInTheDocument();
  expect(screen.getByText("较上期")).toBeInTheDocument();
});

test("renders the paid-retention matrix", () => {
  render(
    <RetentionMatrix
      topic={retention}
      dimension="主游戏"
      loading={false}
      rows={[
        {
          主游戏: "游戏 A",
          新增进入: 1000,
          "2日付费留存率": 0.5,
          "7日付费留存率": 0.25,
        },
      ]}
    />,
  );

  expect(screen.getByText("游戏 A")).toBeInTheDocument();
  expect(screen.getByText("2日")).toBeInTheDocument();
  expect(screen.getByText("50.0%")).toBeInTheDocument();
  expect(screen.getByText("25.0%")).toBeInTheDocument();
  // Heat-scale legend labels the gradient ends.
  expect(screen.getByText("最高 50.0%")).toBeInTheDocument();
});

test("caches filter values and dedupes concurrent requests", async () => {
  mockGet.mockResolvedValue({
    data: { result: [" 游戏 B ", "游戏 A", null, "游戏 A", 7] },
  });

  const [first, second] = await Promise.all([
    fetchFilterValues("主游戏"),
    fetchFilterValues("主游戏"),
  ]);

  // One request serves both concurrent callers, values are trimmed, deduped
  // and sorted.
  expect(mockGet).toHaveBeenCalledTimes(1);
  expect(mockGet.mock.calls[0]?.[0]).toBe(
    `/bi/filter-values/26/${encodeURIComponent("主游戏")}/`,
  );
  expect(first).toEqual(["7", "游戏 A", "游戏 B"]);
  expect(second).toEqual(first);

  // A later call inside the TTL is served from the module cache.
  expect(await fetchFilterValues("主游戏")).toEqual(first);
  expect(mockGet).toHaveBeenCalledTimes(1);
});

test("refetches filter values after the five minute TTL", async () => {
  vi.useFakeTimers();
  try {
    mockGet.mockResolvedValue({ data: { result: ["国内"] } });
    await fetchFilterValues("地区");
    expect(mockGet).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    await fetchFilterValues("地区");
    expect(mockGet).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("filter bar marks empty selects with 全部 and disables reset on defaults", async () => {
  mockGet.mockResolvedValue({ data: { result: [] } });

  const { rerender } = render(
    <AnalysisFilterBar
      topic={cost}
      filters={defaultFilters(cost)}
      onChange={() => {}}
    />,
  );

  await waitFor(() => expect(mockGet).toHaveBeenCalledTimes(5));
  expect(screen.getAllByPlaceholderText("全部")).toHaveLength(5);
  expect(screen.getByRole("button", { name: /重置/ })).toBeDisabled();

  rerender(
    <AnalysisFilterBar
      topic={cost}
      filters={{ ...defaultFilters(cost), games: ["游戏 A"] }}
      onChange={() => {}}
    />,
  );
  expect(screen.getByRole("button", { name: /重置/ })).toBeEnabled();
});

test("breakdown table shows the row count, active sort and drill hint", () => {
  render(
    <AnalysisBreakdownTable
      topic={cost}
      dimension="主游戏"
      onDimensionChange={() => {}}
      onDrill={() => {}}
      drillHint="点击行下钻至 渠道商"
      loading={false}
      rows={[{ 主游戏: "游戏 A", 返点后消耗: 100 }]}
    />,
  );

  // Title and subtitle share a single line, so match the combined caption.
  expect(
    screen.getByText(
      (content) =>
        content.includes("共 1 个主游戏 · 当前按 返点后消耗 降序排列") &&
        content.includes("点击行下钻至 渠道商"),
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /导出 CSV/ })).toBeInTheDocument();
});

test("masks rows from the previous dimension while a drill switches levels", () => {
  render(
    <AnalysisBreakdownTable
      topic={cost}
      dimension="渠道商"
      onDimensionChange={() => {}}
      loading
      rows={[{ 主游戏: "游戏 A", 返点后消耗: 100 }]}
    />,
  );

  // The stale game rows must not render as channels with a blank name.
  expect(
    screen.getByText((content) => content.includes("正在加载明细数据…")),
  ).toBeInTheDocument();
  expect(screen.queryByText(/共 1 个渠道商/)).toBeNull();
});

test("breakdown table hides combinations without new users", () => {
  render(
    <AnalysisBreakdownTable
      topic={cost}
      dimension="主游戏"
      onDimensionChange={() => {}}
      loading={false}
      rows={[
        { 主游戏: "游戏 A", 返点后消耗: 100, 新增进入: 0 },
        { 主游戏: "游戏 B", 返点后消耗: 50, 新增进入: 10 },
      ]}
    />,
  );

  expect(screen.getByText(/共 1 个主游戏/)).toBeInTheDocument();
  expect(screen.getByText(/仅显示新增进入 > 0 的组合/)).toBeInTheDocument();
});

test("marks overseas paid retention as unavailable instead of 0%", () => {
  render(
    <RetentionMatrix
      topic={retention}
      dimension="主游戏"
      platforms={["oversea"]}
      loading={false}
      rows={[
        {
          主游戏: "游戏 A",
          新增进入: 1000,
          "2日付费留存率": 0,
          "7日付费留存率": 0,
        },
      ]}
    />,
  );

  expect(
    screen.getByText(/海外平台付费留存明细暂未接入/),
  ).toBeInTheDocument();
  expect(screen.getAllByText("–").length).toBeGreaterThan(0);
});

test("marks only the oversea row when the platform dimension is shown", () => {
  render(
    <RetentionMatrix
      topic={retention}
      dimension="平台"
      loading={false}
      rows={[
        {
          平台: "mobile",
          新增进入: 1000,
          "2日付费留存率": 0.5,
          "7日付费留存率": 0.25,
        },
        {
          平台: "oversea",
          新增进入: 500,
          "2日付费留存率": 0,
          "7日付费留存率": 0,
        },
      ]}
    />,
  );

  expect(
    screen.getByText(/海外平台付费留存明细暂未接入/),
  ).toBeInTheDocument();
  // Domestic rows keep their real values.
  expect(screen.getAllByText("50.0%").length).toBeGreaterThan(0);
});

test("marks unavailable metrics as a dash in KPI cards", () => {
  const metric = topicMetric(retention, "paidRetention7");
  render(
    <AnalysisKpiCards
      metrics={[metric]}
      row={{ [metric.key]: 0 }}
      previousRow={{ [metric.key]: 0 }}
      unavailableMetricKeys={[metric.key]}
      loading={false}
    />,
  );

  expect(screen.getAllByText("–").length).toBeGreaterThan(0);
  expect(screen.queryByText("0.0%")).toBeNull();
});

test("breakdown table notes unavailable overseas paid-retention columns", () => {
  render(
    <AnalysisBreakdownTable
      topic={retention}
      dimension="主游戏"
      onDimensionChange={() => {}}
      unavailableMetricKeys={[topicMetric(retention, "paidRetention7").key]}
      loading={false}
      rows={[{ 主游戏: "游戏 A", 新增进入: 10, "7日付费留存率": 0 }]}
    />,
  );

  expect(
    screen.getByText(/海外数据源暂未提供付费留存明细/),
  ).toBeInTheDocument();
});
