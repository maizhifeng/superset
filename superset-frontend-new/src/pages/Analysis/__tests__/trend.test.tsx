import { fireEvent, render, screen } from "@testing-library/react";
import { ThemeProvider, alpha, createTheme } from "@mui/material/styles";
import dayjs from "dayjs";
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
    return <div data-testid="chart" />;
  },
}));

import AnalysisTrendChart from "@/pages/Analysis/components/AnalysisTrendChart";
import { getAnalysisTopic } from "@/pages/Analysis/topics";
import { notionPalette } from "@/theme/notion/palette";
import { supersetPalette } from "@/theme/palette";

interface CapturedSeries {
  name?: string;
  type?: string;
  yAxisIndex?: number;
  data?: unknown;
  itemStyle?: { color?: string; borderColor?: string; borderWidth?: number };
  lineStyle?: { type?: string; width?: number; color?: string };
  tooltip?: { formatter?: (params: unknown) => string };
  markLine?: {
    data?: { xAxis?: string; lineStyle?: { type?: string } }[];
  };
}

interface CapturedAxis {
  show?: boolean;
  name?: string;
  min?: number;
  max?: number;
  axisLabel?: {
    hideOverlap?: boolean;
    formatter?: (value: number) => string;
  };
}

function capturedSeries(): CapturedSeries[] {
  return captured.option?.series as unknown as CapturedSeries[];
}

function capturedAxes(): CapturedAxis[] {
  return captured.option?.yAxis as unknown as CapturedAxis[];
}

const retention = getAnalysisTopic("retention")!;
const cost = getAnalysisTopic("cost")!;

function retentionRow(
  date: string,
  values: { retention2?: number; payRate1?: number; paidRetention7?: number } = {},
) {
  return {
    日期: date,
    "2日留存率": values.retention2 ?? 0.2,
    "1日付费率": values.payRate1 ?? 0.01,
    "7日付费留存率": values.paidRetention7 ?? 0.3,
  };
}

/** Rows 60-52 days ago, with an optional anomaly on the last day. */
function comparisonFixture(lastRetention2: number) {
  const currentDates = Array.from({ length: 9 }, (_, index) =>
    dayjs()
      .subtract(60 - index, "day")
      .format("YYYY-MM-DD"),
  );
  const previousDates = Array.from({ length: 9 }, (_, index) =>
    dayjs()
      .subtract(90 - index, "day")
      .format("YYYY-MM-DD"),
  );
  return {
    currentDates,
    previousDates,
    rows: currentDates.map((date, index) =>
      retentionRow(date, {
        retention2: index === 8 ? lastRetention2 : 0.2,
      }),
    ),
    previousRows: previousDates.map((date) => retentionRow(date)),
  };
}

test("drops immature retention points from the trend series", () => {
  const dates = [10, 8, 6, 4, 2, 1].map((offset) =>
    dayjs().subtract(offset, "day").format("YYYY-MM-DD"),
  );
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={dates.map((date) => retentionRow(date))}
      loading={false}
    />,
  );

  const series = capturedSeries();
  // Series order: 2-day retention, 1-day pay rate, 7-day paid retention.
  expect(series[0].data).toEqual([0.2, 0.2, 0.2, 0.2, 0.2, null]);
  expect(series[2].data).toEqual([0.3, 0.3, null, null, null, null]);
});

test("puts the 1-day pay rate on a right-hand axis", () => {
  const payRateSeries = retention.trend.series.find(
    (series) => series.metric === "payRate1",
  );
  expect(payRateSeries?.axis).toBe("right");

  render(
    <AnalysisTrendChart
      topic={retention}
      rows={[
        retentionRow("2026-10-01"),
        retentionRow("2026-10-02"),
        retentionRow("2026-10-03"),
      ]}
      loading={false}
    />,
  );

  const series = capturedSeries();
  expect(series[0].yAxisIndex).toBe(0);
  expect(series[1].yAxisIndex).toBe(1);
  expect(series[2].yAxisIndex).toBe(0);

  const axes = capturedAxes();
  expect(axes).toHaveLength(2);
  expect(axes[0].name).toBe("2日留存率");
  expect(axes[1].name).toBe("1日付费率");
});

test("draws the previous-period line in the compared metric's colour", () => {
  const currentDates = [60, 59].map((offset) =>
    dayjs().subtract(offset, "day").format("YYYY-MM-DD"),
  );
  const previousDates = [90, 89].map((offset) =>
    dayjs().subtract(offset, "day").format("YYYY-MM-DD"),
  );
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={currentDates.map((date) => retentionRow(date))}
      previousRows={previousDates.map((date, index) =>
        retentionRow(date, { retention2: 0.3 + index * 0.1 }),
      )}
      showComparison
      comparisonOffsetDays={30}
      loading={false}
    />,
  );

  const series = capturedSeries();
  const comparedColor = series[0].itemStyle?.color;
  expect(comparedColor).toBeTruthy();
  expect(series).toHaveLength(4);
  expect(series[3].name).toBe("2日留存率（上期）");
  expect(series[3].lineStyle?.type).toBe("dashed");
  expect(series[3].lineStyle?.width).toBe(1.5);
  // Comparison line reuses the compared metric's colour at reduced alpha.
  expect(series[3].lineStyle?.color).toBe(alpha(comparedColor!, 0.5));
  expect(series[3].itemStyle?.color).toBe(alpha(comparedColor!, 0.5));
  expect(series[3].data).toEqual([0.3, 0.4]);

  const tooltip = captured.option?.tooltip as {
    formatter?: (params: unknown) => string;
  };
  const html = tooltip.formatter?.([{ dataIndex: 0 }]) ?? "";
  expect(html).toContain("2日留存率: 20.0%");
  // The previous-period value sits directly under the metric it compares.
  expect(html).toContain("2日留存率（上期）: 30.0%");
});

test("uses each theme's categorical chart palette for series colours", () => {
  const cases: [string, typeof supersetPalette | typeof notionPalette][] = [
    ["paper", supersetPalette],
    ["notion", notionPalette],
  ];
  for (const [themeName, palette] of cases) {
    const theme = createTheme({ palette });
    const { currentDates, previousDates, rows, previousRows } =
      comparisonFixture(0.2);
    render(
      <ThemeProvider theme={theme}>
        <AnalysisTrendChart
          topic={retention}
          rows={rows}
          previousRows={previousRows}
          showComparison
          comparisonOffsetDays={30}
          loading={false}
        />
      </ThemeProvider>,
    );

    const series = capturedSeries();
    expect(`${themeName}:${series[0].itemStyle?.color}`).toBe(
      `${themeName}:${theme.palette.chart[0]}`,
    );
    expect(`${themeName}:${series[1].itemStyle?.color}`).toBe(
      `${themeName}:${theme.palette.chart[1]}`,
    );
    expect(`${themeName}:${series[2].itemStyle?.color}`).toBe(
      `${themeName}:${theme.palette.chart[2]}`,
    );
    expect(`${themeName}:${series[3].lineStyle?.color}`).toBe(
      `${themeName}:${alpha(theme.palette.chart[0], 0.5)}`,
    );
    expect(currentDates).toHaveLength(9);
    expect(previousDates).toHaveLength(9);
  }
});

test("falls back to semantic palette colours without a chart palette", () => {
  const defaultTheme = createTheme();
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={[retentionRow("2026-10-01")]}
      loading={false}
    />,
  );
  const series = capturedSeries();
  expect(series[0].itemStyle?.color).toBe(
    defaultTheme.palette.primary.main,
  );
  expect(series[1].itemStyle?.color).toBe(
    defaultTheme.palette.warning.main,
  );
});

test("cost analysis compares CPA on the right axis", () => {
  const currentDates = Array.from({ length: 9 }, (_, index) =>
    dayjs()
      .subtract(60 - index, "day")
      .format("YYYY-MM-DD"),
  );
  const previousDates = Array.from({ length: 9 }, (_, index) =>
    dayjs()
      .subtract(90 - index, "day")
      .format("YYYY-MM-DD"),
  );
  render(
    <AnalysisTrendChart
      topic={cost}
      rows={currentDates.map((date) => ({
        日期: date,
        返点后消耗: 100,
        cpa: 10,
      }))}
      previousRows={previousDates.map((date) => ({
        日期: date,
        返点后消耗: 90,
        cpa: 9,
      }))}
      showComparison
      comparisonOffsetDays={30}
      loading={false}
    />,
  );

  const series = capturedSeries();
  expect(series[2].name).toBe("CPA（上期）");
  expect(series[2].yAxisIndex).toBe(1);
});

test("calls onDateClick with the clicked series date", () => {
  const onDateClick = vi.fn();
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={[retentionRow("2026-10-01")]}
      onDateClick={onDateClick}
      loading={false}
    />,
  );

  captured.onEvents?.click({ componentType: "series", dataIndex: 0 });
  expect(onDateClick).toHaveBeenCalledWith("2026-10-01");
});

test("maps an anomaly marker click back to its date", () => {
  const { currentDates, rows, previousRows } = comparisonFixture(0.15);
  const onDateClick = vi.fn();
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={rows}
      previousRows={previousRows}
      showComparison
      comparisonOffsetDays={30}
      onDateClick={onDateClick}
      loading={false}
    />,
  );

  captured.onEvents?.click({
    componentType: "series",
    seriesName: "异常点",
    dataIndex: 0,
    data: { value: [8, 0.15] },
  });
  expect(onDateClick).toHaveBeenCalledWith(currentDates[8]);
});

test("marks negative anomalies with a ringed triangle above the lines", () => {
  const { currentDates, rows, previousRows } = comparisonFixture(0.15);
  const defaultTheme = createTheme();
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={rows}
      previousRows={previousRows}
      showComparison
      comparisonOffsetDays={30}
      loading={false}
    />,
  );

  const series = capturedSeries();
  const markers = series[4];
  expect(markers.name).toBe("异常点");
  const markerData = markers.data as {
    value: [number, number];
    symbolSize: number;
    symbolRotate?: number;
    itemStyle?: {
      color?: string;
      borderColor?: string;
      borderWidth?: number;
    };
  }[];
  expect(markerData).toHaveLength(1);
  expect(markerData[0].value).toEqual([8, 0.15]);
  expect(markerData[0].symbolSize).toBe(15);
  expect(markerData[0].symbolRotate).toBe(180);
  expect(markerData[0].itemStyle?.color).toBe(
    defaultTheme.palette.error.main,
  );
  expect(markerData[0].itemStyle?.borderWidth).toBe(2);
  expect(markerData[0].itemStyle?.borderColor).toBe(
    defaultTheme.palette.background.paper,
  );

  // The dashed rule anchors the marker to its x position.
  expect(markers.markLine?.data).toHaveLength(1);
  expect(markers.markLine?.data?.[0].xAxis).toBe(currentDates[8]);
  expect(markers.markLine?.data?.[0].lineStyle?.type).toBe("dashed");

  // Marker tooltip explains date, value and impact.
  const html = markers.tooltip?.formatter?.({ dataIndex: 0 }) ?? "";
  expect(html).toContain(currentDates[8]);
  expect(html).toContain("2日留存率");
  expect(html).toContain("15.0%");
  expect(html).toContain("影响：负面");
});

test("renders compact anomaly chips with the impact legend", () => {
  const { currentDates, rows, previousRows } = comparisonFixture(0.15);
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={rows}
      previousRows={previousRows}
      showComparison
      comparisonOffsetDays={30}
      loading={false}
    />,
  );

  expect(
    screen.getByText("检测到 1 个异常波动（1 个负面）"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(`${currentDates[8].slice(5)} 2日留存率 5.0pp`),
  ).toBeInTheDocument();
  expect(
    screen.getByText("颜色表示影响（红=负面，绿=正面）"),
  ).toBeInTheDocument();
});

test("collapses anomalies beyond the third into a more chip", () => {
  // A spike every 8 days: the trailing 7-day baseline is clean again by the
  // next spike, so all four departures are detected.
  const currentDates = Array.from({ length: 32 }, (_, index) =>
    dayjs()
      .subtract(60 - index, "day")
      .format("YYYY-MM-DD"),
  );
  const previousDates = Array.from({ length: 32 }, (_, index) =>
    dayjs()
      .subtract(90 - index, "day")
      .format("YYYY-MM-DD"),
  );
  const isSpike = (index: number) => index >= 7 && (index - 7) % 8 === 0;
  render(
    <AnalysisTrendChart
      topic={cost}
      rows={currentDates.map((date, index) => ({
        日期: date,
        返点后消耗: 100,
        cpa: isSpike(index) ? 1000 : 10,
      }))}
      previousRows={previousDates.map((date) => ({
        日期: date,
        返点后消耗: 90,
        cpa: 10,
      }))}
      showComparison
      comparisonOffsetDays={30}
      loading={false}
    />,
  );

  expect(
    screen.getByText("检测到 4 个异常波动（4 个负面）"),
  ).toBeInTheDocument();
  expect(screen.getAllByText(/CPA 9900\.0%/)).toHaveLength(3);
  expect(screen.getByText("更多 1 条")).toBeInTheDocument();
});

test("formats axis labels and reserves grid padding", () => {
  const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
  render(
    <AnalysisTrendChart
      topic={retention}
      rows={dates.map((date) => retentionRow(date))}
      loading={false}
    />,
  );

  const xAxis = captured.option?.xAxis as {
    axisLabel?: {
      hideOverlap?: boolean;
      formatter?: (value: string) => string;
    };
  };
  expect(xAxis.axisLabel?.hideOverlap).toBe(true);
  expect(xAxis.axisLabel?.formatter?.("2026-10-01")).toBe("10-01");

  const axes = capturedAxes();
  expect(axes[0].axisLabel?.formatter?.(0.2)).toBe("20%");
  // The pay-rate axis spans ~1%, so its ticks keep one decimal.
  expect(axes[1].axisLabel?.formatter?.(0.01)).toBe("1.0%");

  const grid = captured.option?.grid as { right?: number; bottom?: number };
  expect(grid.right).toBeGreaterThanOrEqual(12);
  expect(grid.right).toBeLessThanOrEqual(20);
  expect(grid.bottom).toBeGreaterThanOrEqual(40);
  expect(grid.bottom).toBeLessThanOrEqual(48);
});

test("emits the hovered date so drill prefetch can warm the next view", () => {
  const onDateHover = vi.fn();
  const { currentDates, rows } = comparisonFixture(0.2);
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        loading={false}
        onDateHover={onDateHover}
      />
    </ThemeProvider>,
  );

  captured.onEvents?.mouseover?.({ componentType: "series", dataIndex: 3 });
  expect(onDateHover).toHaveBeenCalledWith(currentDates[3]);
});

test("line series expose clickable symbols and line events for date drill", () => {
  const { currentDates, rows } = comparisonFixture(0.2);
  render(
    <ThemeProvider theme={createTheme({ palette: notionPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        loading={false}
        onDateClick={vi.fn()}
      />
    </ThemeProvider>,
  );

  const series = captured.option?.series as {
    type?: string;
    showSymbol?: boolean;
    triggerLineEvent?: boolean;
  }[];
  expect(series.length).toBeGreaterThan(0);
  for (const item of series.filter((entry) => entry.type === "line")) {
    expect(item.showSymbol).toBe(true);
    expect(item.triggerLineEvent).toBe(true);
  }
  expect(currentDates.length).toBe(rows.length);
});

test("overlays the 7-day rolling baseline when enabled", () => {
  const { rows } = comparisonFixture(0.2);
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        loading={false}
        showRollingBaseline
      />
    </ThemeProvider>,
  );

  const series = capturedSeries() as (CapturedSeries & {
    data?: (number | null)[];
  })[];
  const baseline = series.find((item) => item.name === "2日留存率（7日移动平均）");
  expect(baseline).toBeDefined();
  expect(baseline?.type).toBe("line");
  expect((baseline?.data ?? []).some((value) => value !== null)).toBe(true);
  const legend = captured.option?.legend as { data?: string[] };
  expect(legend.data).toContain("2日留存率（7日移动平均）");
});

test("switches the trend to Sunday–Saturday weekly buckets", () => {
  const { rows } = comparisonFixture(0.2);
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        loading={false}
        weeklyView
      />
    </ThemeProvider>,
  );

  const xAxis = captured.option?.xAxis as {
    data?: string[];
    axisLabel?: { formatter?: (value: string) => string };
  };
  expect(xAxis.data?.length).toBeGreaterThan(0);
  expect(xAxis.data?.every((label) => label.includes("~"))).toBe(true);
  expect(xAxis.axisLabel?.formatter?.(xAxis.data?.[0] ?? "")).toBe(
    xAxis.data?.[0],
  );
  const series = capturedSeries() as (CapturedSeries & {
    data?: unknown[];
  })[];
  expect(series[0].data?.length).toBe(xAxis.data?.length);
});

test("weekly tooltip carries the previous week and WoW change without overlay", () => {
  const { rows, previousRows } = comparisonFixture(0.2);
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        previousRows={previousRows}
        comparisonOffsetDays={30}
        showComparison={false}
        weeklyView
        loading={false}
      />
    </ThemeProvider>,
  );

  const tooltip = captured.option?.tooltip as {
    formatter?: (params: unknown) => string;
  };
  const html = tooltip.formatter?.([{ dataIndex: 1 }]) ?? "";
  expect(html).toContain("2日留存率（上一周）");
  expect(html).toContain("周环比:");
});

test("weekly view adds the WoW delta as a main-chart series and legend", () => {
  const sundays = ["2026-08-30", "2026-09-06", "2026-09-13", "2026-09-20"];
  const cpaValues = [10, 12, 9, 13.5];
  const rows = sundays.map((date, index) => ({
    日期: date,
    "返点后消耗": 100000,
    cpa: cpaValues[index],
    新增进入: 100,
  }));
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart topic={cost} rows={rows} loading={false} weeklyView />
    </ThemeProvider>,
  );

  const series = capturedSeries() as (CapturedSeries & {
    type?: string;
    xAxisIndex?: number;
    yAxisIndex?: number;
    data?: (
      | { value?: number; label?: { show?: boolean; formatter?: string } }
      | null
    )[];
  })[];
  const deltaSeries = series.find((item) => item.name === "CPA 周环比");
  expect(deltaSeries).toBeDefined();
  expect(deltaSeries?.type).toBe("bar");
  expect(deltaSeries?.xAxisIndex).toBe(0);
  // Cost has two main axes (spend left, CPA right), so the delta axis is third.
  expect(deltaSeries?.yAxisIndex).toBe(2);
  expect(deltaSeries?.data?.[1]?.value).toBeCloseTo(20);
  expect(deltaSeries?.data?.[1]?.label?.formatter).toBe("+20.0%");
  expect(deltaSeries?.data?.[2]?.value).toBeCloseTo(-25);
  // It is a normal chart series, so it also appears in the legend.
  const legend = captured.option?.legend as { data?: string[] };
  expect(legend.data).toContain("CPA 周环比");

  // The WoW axis is hidden; exact values live in the labels instead.
  const axes = capturedAxes();
  expect(axes[2].show).toBe(false);
  expect(axes[2].name).toBeUndefined();
  const labelled = (name: string) =>
    (series.find((entry) => entry.name === name)?.data ?? []).filter(
      (entry) => entry?.label?.show,
    );
  // Four weekly points: every bar is labelled, the line keeps only key points.
  expect(labelled("返点后消耗")).toHaveLength(4);
  expect(labelled("CPA").length).toBeLessThanOrEqual(3);
  expect(labelled("CPA 周环比").length).toBeGreaterThan(0);
});

test("weekly view thins labels when the range contains many weeks", () => {
  const sundays = Array.from({ length: 13 }, (_, index) =>
    dayjs()
      .subtract(90 - index * 7, "day")
      .startOf("week")
      .format("YYYY-MM-DD"),
  );
  const rows = sundays.map((date, index) => ({
    日期: date,
    返点后消耗: 100000 + index * 1000,
    cpa: 10 + (index % 4),
    新增进入: 100,
  }));
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart topic={cost} rows={rows} loading={false} weeklyView />
    </ThemeProvider>,
  );

  const series = capturedSeries() as (CapturedSeries & {
    data?: ({ label?: { show?: boolean } } | null)[];
  })[];
  const countLabels = (name: string) =>
    (series.find((entry) => entry.name === name)?.data ?? []).filter(
      (entry) => entry?.label?.show,
    ).length;
  const points = (series[0].data ?? []).length;
  expect(points).toBeGreaterThan(6);
  // Sparse labels: only key columns/points are labelled on long ranges.
  expect(countLabels("返点后消耗")).toBeLessThanOrEqual(2);
  expect(countLabels("CPA 周环比")).toBeLessThanOrEqual(2);
  expect(countLabels("CPA")).toBeLessThanOrEqual(3);
});

test("weekly view reports the clicked week start for drilling", () => {
  const { rows } = comparisonFixture(0.05);
  const onWeekClick = vi.fn();
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        weeklyView
        onWeekClick={onWeekClick}
        loading={false}
      />
    </ThemeProvider>,
  );

  captured.onEvents?.click?.({ componentType: "series", dataIndex: 0 });
  expect(onWeekClick).toHaveBeenCalledTimes(1);
  expect(onWeekClick.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

test("weekly view hides daily baseline, anomalies and date drill", () => {
  captured.onEvents = undefined;
  const onDateClick = vi.fn();
  const { rows, previousRows } = comparisonFixture(0.05);
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        previousRows={previousRows}
        comparisonOffsetDays={30}
        showComparison
        showRollingBaseline
        weeklyView
        onDateClick={onDateClick}
        loading={false}
      />
    </ThemeProvider>,
  );

  const series = capturedSeries();
  expect(series.some((item) => item.name === "异常点")).toBe(false);
  expect(
    series.some((item) => String(item.name ?? "").includes("7日移动平均")),
  ).toBe(false);
  expect(captured.onEvents).toBeUndefined();
  expect(screen.queryByText(/检测到/)).toBeNull();
  // Weekly roll-up compares against the previous week instead of the shifted day.
  expect(
    series.some((item) => item.name === "2日留存率（上一周）"),
  ).toBe(true);
});

test("trims extreme comparison outliers from the axis range", () => {
  const { rows, previousRows } = comparisonFixture(0.2);
  const extremePrevious = previousRows.map((row, index) =>
    index === 0 ? { ...row, "2日留存率": 5 } : row,
  );
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        previousRows={extremePrevious}
        comparisonOffsetDays={30}
        showComparison
        loading={false}
      />
    </ThemeProvider>,
  );

  const yAxis = captured.option?.yAxis as { max?: number }[];
  // The 500% outlier must not stretch the 20% axis; the trimmed max stays
  // close to the p95 instead of jumping to the outlier.
  expect(yAxis[0].max).toBeLessThan(1);
  expect(screen.getByText(/坐标轴已忽略个别极端值/)).toBeInTheDocument();
});

test("anomaly chips open the sub-dimension breakdown", () => {
  const onAnomalyClick = vi.fn();
  const { rows, previousRows } = comparisonFixture(0.05);
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        previousRows={previousRows}
        comparisonOffsetDays={30}
        showComparison
        onAnomalyClick={onAnomalyClick}
        loading={false}
      />
    </ThemeProvider>,
  );

  expect(
    screen.getByText("· 点击标签查看构成明细"),
  ).toBeInTheDocument();
  const chip = screen.getByText(
    (content) =>
      content.includes("2日留存率") && /\d+\.\d+%|pp/.test(content),
  );
  fireEvent.click(chip);

  expect(onAnomalyClick).toHaveBeenCalledTimes(1);
  const [anomaly, fullDate, anchor] = onAnomalyClick.mock.calls[0];
  expect(anomaly.date).toMatch(/\d{2}-\d{2}/);
  // The popover query needs the full ISO date, not the chip's MM-DD label.
  expect(fullDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(anchor).toBeInstanceOf(HTMLElement);
});

test("anomalies are based on the rolling baseline, not the comparison line", () => {
  const { rows } = comparisonFixture(0.05);
  render(
    <ThemeProvider theme={createTheme({ palette: supersetPalette })}>
      <AnalysisTrendChart
        topic={retention}
        rows={rows}
        // Comparison line hidden, yet the baseline detector still runs.
        showComparison={false}
        loading={false}
      />
    </ThemeProvider>,
  );

  expect(screen.getByText(/检测到 1 个异常波动/)).toBeInTheDocument();
  const series = capturedSeries();
  expect(series.some((item) => item.name === "异常点")).toBe(true);
  expect(series.some((item) => String(item.name ?? "").includes("（上期）"))).toBe(
    false,
  );
});
