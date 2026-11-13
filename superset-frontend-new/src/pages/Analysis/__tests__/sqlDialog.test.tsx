import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";

const { fetchAnalysisTopicSqlMock, optionsMock } = vi.hoisted(() => ({
  fetchAnalysisTopicSqlMock: vi.fn(),
  optionsMock: vi.fn(),
}));

vi.mock("@/api/chartData", () => ({
  fetchAnalysisTopicSql: fetchAnalysisTopicSqlMock,
}));

vi.mock("@/pages/Analysis/hooks/useProjectCompareOptions", () => ({
  useProjectCompareOptions: optionsMock,
}));

import AnalysisSqlDialog from "@/pages/Analysis/components/AnalysisSqlDialog";
import { defaultFilters } from "@/pages/Analysis/filters";
import { buildStartMaps } from "@/pages/Dashboard/compareStartDate";
import { getAnalysisTopic } from "@/pages/Analysis/topics";

const cost = getAnalysisTopic("cost")!;
const projectCompare = getAnalysisTopic("project-compare")!;

// Metadata the comparison dialog needs to plan its per-project queries.
const START_MAPS = buildStartMaps([
  {
    papp_id: 1,
    region: "domestic",
    channel_name: "",
    上线时间: "2024/01/01",
    首测起始时间: "2024/01/01",
    二测起始时间: "",
    三测起始时间: "",
  },
  {
    papp_id: 2,
    region: "oversea",
    channel_name: "",
    上线时间: "2024/03/01",
    首测起始时间: "",
    二测起始时间: "",
    三测起始时间: "",
  },
]);
const PROJECT_OPTIONS = [
  { papp_id: "1", region: "domestic" as const, papp_name: "游戏A" },
  { papp_id: "2", region: "oversea" as const, papp_name: "游戏B" },
];

optionsMock.mockReturnValue({
  options: PROJECT_OPTIONS,
  startMaps: START_MAPS,
  loading: false,
  error: null,
  reload: vi.fn(),
});

const PREVIEW = {
  data: {
    result: {
      topic: "cost",
      title: "成本分析",
      base_sql: {
        mainland: "MAINLAND BASE SQL",
        oversea: "OVERSEA BASE SQL",
        wide_mainland: "WIDE MAINLAND BASE SQL",
      },
      queries: [
        {
          index: 0,
          mainland_sql: "MAINLAND KPI SQL",
          oversea_sql: "OVERSEA KPI SQL",
          wide_mainland_sql: "WIDE MAINLAND KPI SQL",
          labels: ["消耗", "cpa__num", "cpa__den"],
        },
        {
          index: 1,
          mainland_sql: "MAINLAND PREV SQL",
          oversea_sql: "OVERSEA PREV SQL",
          wide_mainland_sql: "WIDE MAINLAND PREV SQL",
          labels: ["消耗"],
        },
      ],
    },
  },
};

test("shows the default-view SQL for both federated sides", async () => {
  fetchAnalysisTopicSqlMock.mockResolvedValue(PREVIEW);
  render(
    <AnalysisSqlDialog
      topic={cost}
      filters={defaultFilters(cost)}
      open
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText("MAINLAND KPI SQL")).toBeInTheDocument();
  expect(fetchAnalysisTopicSqlMock).toHaveBeenCalledWith(
    "cost",
    expect.arrayContaining([expect.objectContaining({ result_type: "full" })]),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );

  fireEvent.click(screen.getByRole("tab", { name: "海外侧" }));
  expect(await screen.findByText("OVERSEA KPI SQL")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /历史宽视图/ }));
  expect(await screen.findByText("WIDE MAINLAND KPI SQL")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("tab", { name: /基础 SQL/ }));
  expect(await screen.findByText("MAINLAND BASE SQL")).toBeInTheDocument();
  expect(screen.getByText("OVERSEA BASE SQL")).toBeInTheDocument();
  expect(screen.getByText("WIDE MAINLAND BASE SQL")).toBeInTheDocument();
});

test("shows loading failures instead of an empty dialog", async () => {
  fetchAnalysisTopicSqlMock.mockRejectedValue(new Error("后端不可用"));
  render(
    <AnalysisSqlDialog
      topic={cost}
      filters={defaultFilters(cost)}
      open
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText("后端不可用")).toBeInTheDocument();
});

test("compiles the comparison topic's live per-project queries", async () => {
  const filters = {
    ...defaultFilters(projectCompare),
    anchors: ["上线时间"] as const,
    projects: ["domestic:1", "oversea:2"],
  };
  const comparePreview = {
    data: {
      result: {
        topic: "project-compare",
        title: "项目对比分析",
        base_sql: {
          mainland: "MAINLAND BASE SQL",
          oversea: "OVERSEA BASE SQL",
          wide_mainland: "WIDE MAINLAND BASE SQL",
        },
        queries: [
          {
            index: 0,
            mainland_sql: "MAINLAND PROJECT A SQL",
            oversea_sql: "OVERSEA PROJECT A SQL",
            wide_mainland_sql: "WIDE PROJECT A SQL",
            labels: ["日期"],
          },
          {
            index: 1,
            mainland_sql: "MAINLAND PROJECT B SQL",
            oversea_sql: "OVERSEA PROJECT B SQL",
            wide_mainland_sql: "WIDE PROJECT B SQL",
            labels: ["日期"],
          },
        ],
      },
    },
  };
  fetchAnalysisTopicSqlMock.mockResolvedValue(comparePreview);

  render(
    <AnalysisSqlDialog
      topic={projectCompare}
      filters={{ ...filters, anchors: [...filters.anchors] }}
      open
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText("MAINLAND PROJECT A SQL")).toBeInTheDocument();
  // One query per selected project × anchor, titled with its window.
  expect(
    screen.getByText("游戏A（国内） · 上线 · 2024-01-01 ~ 2024-01-30"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("游戏B（海外） · 上线 · 2024-03-01 ~ 2024-03-30"),
  ).toBeInTheDocument();
  expect(fetchAnalysisTopicSqlMock).toHaveBeenCalledWith(
    "project-compare",
    expect.arrayContaining([
      expect.objectContaining({
        groupby: ["日期"],
        row_limit: 800,
        time_range: "2024-01-01 : 2024-01-31",
      }),
      expect.objectContaining({
        groupby: ["日期"],
        row_limit: 800,
        time_range: "2024-03-01 : 2024-03-31",
      }),
    ]),
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});

test("explains that the comparison SQL follows the current selection", async () => {
  fetchAnalysisTopicSqlMock.mockResolvedValue({ data: { result: null } });

  render(
    <AnalysisSqlDialog
      topic={projectCompare}
      filters={defaultFilters(projectCompare)}
      open
      onClose={vi.fn()}
    />,
  );

  expect(await screen.findByText(/当前未选择基准或项目/)).toBeInTheDocument();
  expect(fetchAnalysisTopicSqlMock).toHaveBeenCalledWith(
    "project-compare",
    [],
    expect.objectContaining({ signal: expect.any(AbortSignal) }),
  );
});
