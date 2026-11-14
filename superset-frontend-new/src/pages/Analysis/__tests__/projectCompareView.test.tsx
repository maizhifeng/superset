import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import dayjs from "dayjs";
import { beforeEach, expect, test, vi } from "vitest";
import type { EChartsOption } from "echarts";
import type { ChartDataRow } from "@/types/api";
import type { QueryObject } from "@/utils/query/types";
import type { ProfitSharingStartRow } from "@/pages/Dashboard/compareStartDate";

const { mockGet, postAnalysisChartDataMock, captured } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  postAnalysisChartDataMock: vi.fn(),
  captured: {
    option: null as EChartsOption | null,
    ariaLabel: undefined as string | undefined,
    height: undefined as number | undefined,
  },
}));

vi.mock("@/api", () => ({
  default: { get: mockGet },
}));

vi.mock("@/api/chartData", () => ({
  postAnalysisChartData: postAnalysisChartDataMock,
}));

// The view must not depend on a real canvas in jsdom; capture the option and
// the aria label instead of asserting ECharts internals.
vi.mock("@/pages/Briefing/EChart", () => ({
  default: (props: {
    option: EChartsOption;
    ariaLabel?: string;
    height?: number;
  }) => {
    captured.option = props.option;
    captured.ariaLabel = props.ariaLabel;
    captured.height = props.height;
    return (
      <div data-testid="project-compare-chart" aria-label={props.ariaLabel} />
    );
  },
}));

import ProjectCompare from "@/pages/Analysis/components/ProjectCompare";
import { defaultFilters, type AnalysisFilters } from "@/pages/Analysis/filters";
import { clearProjectCompareOptionsCache } from "@/pages/Analysis/hooks/useProjectCompareOptions";
import { projectKey } from "@/pages/Analysis/projectCompare";
import { getAnalysisTopic } from "@/pages/Analysis/topics";

const topic = getAnalysisTopic("project-compare")!;

const PAPP_ROWS = [
  { papp_id: 1, region: "domestic", papp_name: "游戏A" },
  { papp_id: 2, region: "oversea", papp_name: "游戏B" },
  { papp_id: 3, region: "domestic", papp_name: "游戏C" },
];

function sharingRow(
  overrides: Partial<ProfitSharingStartRow>,
): ProfitSharingStartRow {
  return {
    papp_id: 1,
    region: "domestic",
    channel_name: "",
    上线时间: "",
    首测起始时间: "",
    二测起始时间: "",
    三测起始时间: "",
    ...overrides,
  };
}

/** 游戏A: all rounds; 游戏B: 首测 + 上线; 游戏C: no start date at all. */
const PROFIT_ROWS: ProfitSharingStartRow[] = [
  sharingRow({
    papp_id: 1,
    region: "domestic",
    上线时间: "2024/01/01",
    首测起始时间: "2024/01/01",
    二测起始时间: "2024/01/20",
    三测起始时间: "2024/02/01",
  }),
  sharingRow({
    papp_id: 2,
    region: "oversea",
    上线时间: "2024/03/01",
    首测起始时间: "2024/03/05",
  }),
  sharingRow({ papp_id: 3, region: "domestic" }),
];

/** Same projects, but 游戏B has no 首测 date (its 首测 section is skipped). */
const PROFIT_ROWS_WITHOUT_B_FIRST_TEST: ProfitSharingStartRow[] =
  PROFIT_ROWS.map((row) =>
    row.papp_id === 2 ? { ...row, 首测起始时间: "" } : row,
  );

const PROJECT_A = projectKey({ region: "domestic", papp_id: "1" });
const PROJECT_B = projectKey({ region: "oversea", papp_id: "2" });

type PostMockPayload = {
  topic: string;
  queries: QueryObject[];
  result_type: string;
  result_format: string;
};

function queryProjectName(query: QueryObject): string {
  const filter = (query.filters ?? []).find((item) => item.col === "主游戏");
  const value = filter?.val;
  return Array.isArray(value) ? String(value[0] ?? "") : String(value ?? "");
}

/**
 * Daily rows for one comparison query. 游戏A spends 100/day and 游戏B 200/day,
 * and their CPA differs so the best-value highlight is deterministic.
 */
function dailyRowsForQuery(query: QueryObject): ChartDataRow[] {
  const [start, end] = String(query.time_range ?? "").split(" : ");
  const projectName = queryProjectName(query);
  const isProjectA = projectName === "游戏A";
  const rows: ChartDataRow[] = [];
  let day = dayjs(start);
  const endDay = dayjs(end);
  while (day.isBefore(endDay)) {
    rows.push({
      日期: day.format("YYYY-MM-DD"),
      消耗: isProjectA ? 100 : 200,
      返点后消耗: 80,
      新增进入: 100,
      "1日充值": 50,
      累计充值: 90,
      "1日付费数": 5,
      累计付费数: 8,
      cpa: isProjectA ? 10 : 8,
      cpp: 16,
      ltv_1: 2,
      roi_1: 0.5,
      ltv_cum: 3,
      累计roi: 0.6,
      "自然新增%": 0.2,
    });
    day = day.add(1, "day");
  }
  return rows;
}

function sectionResponse(payload: PostMockPayload) {
  return {
    data: {
      result: payload.queries.map((query) => ({
        data: dailyRowsForQuery(query),
      })),
    },
  };
}

function mockProjects(
  games: unknown[] = PAPP_ROWS,
  profit: ProfitSharingStartRow[] | unknown[] = PROFIT_ROWS,
) {
  mockGet.mockImplementation((url: string) => {
    if (url === "/project/papp") {
      return Promise.resolve({ data: { result: games } });
    }
    if (url === "/project/profit-sharing") {
      return Promise.resolve({ data: { result: profit } });
    }
    return Promise.reject(new Error(`unexpected request: ${url}`));
  });
}

/** Filters that already select both a 基准 and the two comparable projects. */
function selectedFilters(
  overrides: Partial<AnalysisFilters> = {},
): AnalysisFilters {
  return {
    ...defaultFilters(topic),
    anchors: ["上线时间"],
    projects: [PROJECT_A, PROJECT_B],
    ...overrides,
  };
}

function renderView(overrides: Partial<AnalysisFilters> = {}) {
  const filters = selectedFilters(overrides);
  const view = (current: AnalysisFilters) => (
    <ProjectCompare topic={topic} filters={current} />
  );
  const result = render(view(filters));
  // Every control lives in the page filter bar now, so tests drive changes
  // through the filters prop, re-rendering the same instance like the page.
  const update = (next: Partial<AnalysisFilters>) =>
    result.rerender(view({ ...filters, ...next }));
  return { filters, update, rerenderWith: update };
}

type CapturedOption = {
  xAxis?: { data?: unknown[] };
  series?: { name?: string; data?: unknown[] }[];
  yAxis?: { name?: string; formatter?: unknown };
};

function capturedOption(): CapturedOption | null {
  return captured.option as CapturedOption | null;
}

function lastPayload(): PostMockPayload {
  const call = postAnalysisChartDataMock.mock.calls.at(-1);
  return call?.[0] as PostMockPayload;
}

beforeEach(() => {
  clearProjectCompareOptionsCache();
  mockGet.mockReset();
  postAnalysisChartDataMock.mockReset();
  mockProjects();
  postAnalysisChartDataMock.mockImplementation((payload: PostMockPayload) =>
    Promise.resolve(sectionResponse(payload)),
  );
});

test("compares nothing until 基准 and 项目 are chosen in the filter bar", async () => {
  // page defaults: no anchor round, no project.
  const empty = defaultFilters(topic);
  const view = (current: AnalysisFilters) => (
    <ProjectCompare topic={topic} filters={current} />
  );
  const result = render(view(empty));

  expect(await screen.findByText("请选择基准")).toBeInTheDocument();
  // Nothing is queried while the comparison has no scope.
  expect(postAnalysisChartDataMock).not.toHaveBeenCalled();

  // Choosing a 基准 asks for the projects next.
  result.rerender(view({ ...empty, anchors: ["上线时间"] }));
  expect(await screen.findByText("请选择要对比的项目")).toBeInTheDocument();
  expect(postAnalysisChartDataMock).not.toHaveBeenCalled();

  // Choosing projects starts the comparison.
  result.rerender(
    view({ ...empty, anchors: ["上线时间"], projects: [PROJECT_A] }),
  );
  expect(
    await screen.findByRole("table", { name: "上线基准项目对比表" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(1),
  );
});

test("renders the comparison view with window totals and best highlights", async () => {
  renderView();

  const table = await screen.findByRole("table", {
    name: "上线基准项目对比表",
  });
  expect(within(table).getByText("游戏A")).toBeInTheDocument();
  expect(within(table).getByText("游戏B")).toBeInTheDocument();
  // 游戏C has no configured start date and cannot be selected.
  expect(within(table).queryByText("游戏C")).not.toBeInTheDocument();

  // Window totals aggregate the daily rows: 100/day vs 200/day over 30 days.
  const rowA = within(table).getByText("游戏A").closest("tr") as HTMLElement;
  const rowB = within(table).getByText("游戏B").closest("tr") as HTMLElement;
  expect(within(rowA).getAllByText("3,000").length).toBeGreaterThan(0);
  expect(within(rowB).getAllByText("6,000").length).toBeGreaterThan(0);
  expect(within(rowA).getByText("2024-01-01 ~ 2024-01-30")).toBeInTheDocument();
  expect(within(rowB).getByText("2024-03-01 ~ 2024-03-30")).toBeInTheDocument();

  // CPA is lower-is-better: 游戏B's 8 is the column best, 游戏A's 10 is not.
  const cpaCellB = within(rowB).getByText("8").closest("td");
  expect(cpaCellB).toHaveAttribute("data-best", "true");
  const cpaCellA = within(rowA).getByText("10").closest("td");
  expect(cpaCellA).not.toHaveAttribute("data-best");

  // The view itself renders no filter controls, only the refresh action.
  expect(screen.queryByLabelText("项目")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("指标")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "重新查询对比数据" }),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(1),
  );
  expect(lastPayload().queries).toHaveLength(2);
});

test("expands a project row into the window's time buckets", async () => {
  renderView();
  const table = await screen.findByRole("table", {
    name: "上线基准项目对比表",
  });
  // Collapsed by default: no bucket rows are rendered.
  expect(within(table).queryByText("第1天")).not.toBeInTheDocument();

  // The chart is visible while no detail rows are open.
  expect(screen.getByTestId("project-compare-chart")).toBeInTheDocument();
  expect(captured.height).toBe(260);
  const chartWrap = () => screen.getByTestId("project-compare-chart-wrap");
  expect(chartWrap()).toHaveAttribute("data-folded", "false");

  fireEvent.click(screen.getByRole("button", { name: "展开游戏A明细" }));
  // Daily buckets of the January window, each with its calendar date.
  expect(within(table).getByText("第1天")).toBeInTheDocument();
  expect(within(table).getByText("2024-01-01")).toBeInTheDocument();
  expect(within(table).getByText("第30天")).toBeInTheDocument();
  // Open detail rows fold the chart away to free the vertical space.
  expect(chartWrap()).toHaveAttribute("data-folded", "true");

  fireEvent.click(screen.getByRole("button", { name: "收起游戏A明细" }));
  expect(within(table).queryByText("第1天")).not.toBeInTheDocument();
  expect(chartWrap()).toHaveAttribute("data-folded", "false");
  expect(captured.height).toBe(260);
});

test("switching the chart grain recomputes buckets locally without a request", async () => {
  renderView();
  await screen.findByRole("table", { name: "上线基准项目对比表" });
  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(1),
  );
  // Daily buckets: the 30-day January window has day 1..30.
  await waitFor(() =>
    expect(capturedOption()?.xAxis?.data?.[29]).toBe("第30天"),
  );

  const callsBeforeGrainSwitch = postAnalysisChartDataMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "周" }));
  await waitFor(() =>
    expect(capturedOption()?.xAxis?.data).toEqual([
      "第1周",
      "第2周",
      "第3周",
      "第4周",
      "第5周",
    ]),
  );
  fireEvent.click(screen.getByRole("button", { name: "月" }));
  await waitFor(() => expect(capturedOption()?.xAxis?.data).toEqual(["第1月"]));
  expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(
    callsBeforeGrainSwitch,
  );
});

test("compares every project × anchor round selected in the filter state", async () => {
  const { rerenderWith } = renderView();
  await screen.findByRole("table", { name: "上线基准项目对比表" });
  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(1),
  );

  // The filter bar adds 首测 for the page; the view re-plans and queries.
  rerenderWith({ anchors: ["上线时间", "首测起始时间"] });

  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(2),
  );
  // 2 projects × 2 anchor rounds, both projects have a 首测 window.
  expect(lastPayload().queries).toHaveLength(4);
  expect(
    await screen.findByRole("table", { name: "首测基准项目对比表" }),
  ).toBeInTheDocument();
  // Two tables, one per anchor round, each marked as an external comparison.
  expect(screen.getAllByText("外对比")).toHaveLength(2);
});

test("reports a project/anchor pair without a start date as skipped", async () => {
  mockProjects(PAPP_ROWS, PROFIT_ROWS_WITHOUT_B_FIRST_TEST);
  renderView({ anchors: ["首测起始时间"] });

  await screen.findByText(/已跳过：游戏B/);
  expect(screen.getByText(/无首测起始日期/)).toBeInTheDocument();
  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(1),
  );
  // 游戏B has no 首测 window, so only 游戏A is queried.
  expect(lastPayload().queries).toHaveLength(1);
});

test("shows a comparison error with a retry that refetches", async () => {
  let sectionCalls = 0;
  postAnalysisChartDataMock.mockImplementation((payload: PostMockPayload) => {
    sectionCalls += 1;
    if (sectionCalls === 1) {
      return Promise.reject(new Error("对比查询失败"));
    }
    return Promise.resolve(sectionResponse(payload));
  });

  renderView();

  expect(await screen.findByText("对比查询失败")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));

  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(2),
  );
  const table = await screen.findByRole("table", {
    name: "上线基准项目对比表",
  });
  expect(within(table).getAllByText("3,000").length).toBeGreaterThan(0);
});

test("uses the window length from the filter state", async () => {
  renderView({ periodDays: 14 });
  await screen.findByRole("table", { name: "上线基准项目对比表" });
  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(1),
  );

  expect(lastPayload().queries).toHaveLength(2);
  const [start, end] = String(lastPayload().queries[0].time_range).split(" : ");
  expect(dayjs(end).diff(dayjs(start), "day")).toBe(14);
  expect(screen.getByText(/锚点后 14 天/)).toBeInTheDocument();
});

test("uses the projects explicitly selected in the filter state", async () => {
  renderView({ projects: [PROJECT_B] });

  const table = await screen.findByRole("table", {
    name: "上线基准项目对比表",
  });
  expect(within(table).getByText("游戏B")).toBeInTheDocument();
  expect(within(table).queryByText("游戏A")).not.toBeInTheDocument();
  await waitFor(() =>
    expect(postAnalysisChartDataMock).toHaveBeenCalledTimes(1),
  );
  expect(lastPayload().queries).toHaveLength(1);
  expect(queryProjectName(lastPayload().queries[0])).toBe("游戏B");
});

test("uses the metric selected in the filter state", async () => {
  renderView({ compareMetric: "cpa" });
  await screen.findByRole("table", { name: "上线基准项目对比表" });

  expect(screen.getByLabelText("CPA项目对比趋势图")).toBeInTheDocument();
  expect(capturedOption()?.yAxis).toMatchObject({ name: "CPA" });
});

test("shows a project metadata error with a retry", async () => {
  let attempts = 0;
  mockGet.mockImplementation((url: string) => {
    if (url === "/project/papp") {
      attempts += 1;
      if (attempts === 1) {
        return Promise.reject(new Error("项目列表加载失败"));
      }
      return Promise.resolve({ data: { result: PAPP_ROWS } });
    }
    if (url === "/project/profit-sharing") {
      return Promise.resolve({ data: { result: PROFIT_ROWS } });
    }
    return Promise.reject(new Error(`unexpected request: ${url}`));
  });

  renderView();

  expect(await screen.findByText("项目列表加载失败")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(
    await screen.findByRole("table", { name: "上线基准项目对比表" }),
  ).toBeInTheDocument();
});
