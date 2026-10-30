import { render, screen } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import { test, expect, vi } from "vitest";
import type { EChartsOption } from "echarts";

const captured = vi.hoisted(() => ({
  option: null as EChartsOption | null,
  onEvents: undefined as Record<string, (params: unknown) => void> | undefined,
}));

vi.mock("@/pages/Briefing/EChart", () => ({
  default: (props: {
    option: EChartsOption;
    onEvents?: Record<string, (params: unknown) => void>;
  }) => {
    captured.option = props.option;
    captured.onEvents = props.onEvents;
    return <div data-testid="drill-chart" />;
  },
}));

import AnalysisDrillChart from "@/pages/Analysis/components/AnalysisDrillChart";
import type { DrillAnomaly } from "@/pages/Analysis/anomalies";
import { getAnalysisTopic, topicMetric } from "@/pages/Analysis/topics";
import { notionPalette } from "@/theme/notion/palette";

const cost = getAnalysisTopic("cost")!;

function renderChart(props: Partial<Parameters<typeof AnalysisDrillChart>[0]>) {
  return render(
    <ThemeProvider theme={createTheme({ palette: notionPalette })}>
      <AnalysisDrillChart
        topic={cost}
        rows={[]}
        dimension="渠道商"
        loading={false}
        {...props}
      />
    </ThemeProvider>,
  );
}

const ROWS = [
  { 渠道商: "渠道 B", 返点后消耗: 100, cpa: 30 },
  { 渠道商: "渠道 A", 返点后消耗: 300, cpa: 10 },
  { 渠道商: "渠道 C", 返点后消耗: 200, cpa: 20 },
];

test("plots the drilled dimension sorted by the table's sort metric", () => {
  renderChart({ rows: ROWS, nextDimensionLabel: "媒体", onDrill: vi.fn() });

  const xAxis = captured.option?.xAxis as { data?: string[] };
  expect(xAxis.data).toEqual(["渠道 A", "渠道 C", "渠道 B"]);
  const series = captured.option?.series as { name?: string; type?: string }[];
  // Cost trend renders spend as bars with CPA on a second axis.
  expect(series.map((item) => `${item.type}:${item.name}`)).toEqual([
    "bar:返点后消耗",
    "line:CPA",
  ]);
  expect(screen.getByText(/共 3 个渠道商/)).toBeInTheDocument();
});

test("clicks a category to drill one level deeper", () => {
  const onDrill = vi.fn();
  renderChart({ rows: ROWS, nextDimensionLabel: "媒体", onDrill });

  captured.onEvents?.click?.({ dataIndex: 1 });
  expect(onDrill).toHaveBeenCalledWith("渠道 C");
});

test("does not wire drill clicks on the last hierarchy level", () => {
  renderChart({ rows: ROWS, nextDimensionLabel: null, onDrill: vi.fn() });
  expect(captured.onEvents).toBeUndefined();
});

test("shows a skeleton while the next drill level loads", () => {
  renderChart({ rows: ROWS, loading: true });
  expect(screen.queryByTestId("drill-chart")).not.toBeInTheDocument();
});

test("explains an empty drill result for the focused date", () => {
  renderChart({ rows: [], focusDate: "2026-10-09" });
  expect(
    screen.getByText("2026-10-09 当天暂无可下钻的渠道商数据"),
  ).toBeInTheDocument();
});

const ANOMALY_HIT: DrillAnomaly = {
  index: 7,
  date: "10-08",
  value: 20,
  direction: "up",
  severity: "negative",
  deltaText: "20.0%",
  deltaValue: 20,
  text: "10-08 CPA较7日移动平均上升 20.0%",
  significant: true,
  baselineMean: 12,
  baselineSamples: 7,
};

test("marks anomalous categories and names them for root-cause attribution", () => {
  const anomalies = new Map([["渠道 A", ANOMALY_HIT]]);
  renderChart({
    rows: ROWS,
    anomalies,
    anomalyMetric: topicMetric(cost, "cpa"),
  });

  const series = captured.option?.series as {
    name?: string;
    type?: string;
    data?: { value?: number[] }[];
  }[];
  const marker = series.find((item) => item.name === "异常归因点");
  expect(marker?.type).toBe("scatter");
  // 渠道 A is the top category by spend, i.e. index 0 of the drill chart.
  expect(marker?.data?.[0].value).toEqual([0, 20]);
  expect(
    screen.getByText(/异常归因（CPA 较 7 日移动平均）/),
  ).toBeInTheDocument();
  expect(screen.getByText("渠道 A 20.0%")).toBeInTheDocument();
});

test("explains when there is not enough history to attribute the day", () => {
  renderChart({
    rows: ROWS,
    anomalies: new Map(),
    anomalyMetric: topicMetric(cost, "cpa"),
  });
  expect(screen.getByText(/历史样本不足/)).toBeInTheDocument();
});

test("falls back to the largest deviations when nothing is significant", () => {
  const deviation: DrillAnomaly = {
    ...ANOMALY_HIT,
    significant: false,
    deltaText: "12.5%",
    deltaValue: 12.5,
  };
  const anomalies = new Map([["渠道 A", deviation]]);
  renderChart({
    rows: ROWS,
    anomalies,
    anomalyMetric: topicMetric(cost, "cpa"),
  });

  expect(
    screen.getByText(/未检出显著异常；偏离均线最大/),
  ).toBeInTheDocument();
  expect(screen.getByText("渠道 A 12.5%")).toBeInTheDocument();
  const series = captured.option?.series as { name?: string }[];
  expect(series.some((item) => item.name === "异常归因点")).toBe(false);
});

test("shows progress while the drill attribution query runs", () => {
  renderChart({
    rows: ROWS,
    anomalies: new Map(),
    anomalyMetric: topicMetric(cost, "cpa"),
    anomalyLoading: true,
  });
  expect(screen.getByText(/正在计算异常归因/)).toBeInTheDocument();
});

test("keeps anomalies outside the visible categories in the chip strip", () => {
  const rows = Array.from({ length: 14 }, (_, index) => ({
    渠道商: `渠道 ${index}`,
    返点后消耗: 1000 - index,
    cpa: 10 + index,
  }));
  const anomalies = new Map([["渠道 13", ANOMALY_HIT]]);
  renderChart({
    rows,
    anomalies,
    anomalyMetric: topicMetric(cost, "cpa"),
  });

  expect(screen.getByText("渠道 13 20.0%")).toBeInTheDocument();
  expect(screen.getByText(/1 个异常项不在图中/)).toBeInTheDocument();
});

test("truncates long category labels on the axis but keeps the full value in data", () => {
  const longName = "超级长渠道商名称示例";
  renderChart({
    rows: [{ 渠道商: longName, 返点后消耗: 100, cpa: 10 }],
  });

  const xAxis = captured.option?.xAxis as {
    data?: string[];
    axisLabel?: { formatter?: (value: string) => string };
  };
  // Tooltips read the untruncated data; only the axis tick is shortened.
  expect(xAxis.data?.[0]).toBe(longName);
  expect(xAxis.axisLabel?.formatter?.(longName)).toBe("超级长渠道商名…");
});
