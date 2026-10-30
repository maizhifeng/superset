import { render, screen, waitFor } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";
import dayjs from "dayjs";
import { beforeEach, expect, test, vi } from "vitest";

const { postChartDataMock } = vi.hoisted(() => ({
  postChartDataMock: vi.fn(),
}));

vi.mock("@/api/chartData", () => ({
  postChartData: postChartDataMock,
}));

import AnomalyBreakdownPopover from "@/pages/Analysis/components/AnomalyBreakdownPopover";
import type { AnalysisAnomaly } from "@/pages/Analysis/anomalies";
import { defaultFilters } from "@/pages/Analysis/filters";
import { clearAnalysisQueryCache } from "@/pages/Analysis/query";
import { getAnalysisTopic } from "@/pages/Analysis/topics";
import { notionPalette } from "@/theme/notion/palette";

const cost = getAnalysisTopic("cost")!;
const FOCUS_DATE = "2026-10-09";

const anomaly: AnalysisAnomaly = {
  index: 10,
  date: "10-09",
  value: 60,
  direction: "up",
  severity: "negative",
  deltaText: "36.2%",
  deltaValue: 36.2,
  text: "10-09 CPA较7日移动平均上升 36.2%",
};

function historyRows() {
  const rows: Record<string, string | number>[] = [];
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = dayjs(FOCUS_DATE).subtract(offset, "day").format("YYYY-MM-DD");
    const spike = offset === 0;
    rows.push(
      { 渠道商: "android", 日期: date, cpa: spike ? 80 : 50 },
      { 渠道商: "ios", 日期: date, cpa: spike ? 55 : 50 },
    );
  }
  return rows;
}

beforeEach(() => {
  postChartDataMock.mockReset();
  clearAnalysisQueryCache();
  postChartDataMock.mockResolvedValue({
    data: { result: [{ data: historyRows(), colnames: ["渠道商", "日期", "cpa"] }] },
  });
});

test("expands an anomaly into its next-dimension contribution", async () => {
  render(
    <ThemeProvider theme={createTheme({ palette: notionPalette })}>
      <AnomalyBreakdownPopover
        topic={cost}
        filters={defaultFilters(cost)}
        anomaly={anomaly}
        date={FOCUS_DATE}
        anchorEl={document.body}
        onClose={() => {}}
        onDrillDate={() => {}}
      />
    </ThemeProvider>,
  );

  await waitFor(() =>
    expect(screen.getAllByText("android").length).toBeGreaterThan(0),
  );
  // The trend's next dimension for cost is 渠道商.
  expect(screen.getByText(/按「渠道商」拆解/)).toBeInTheDocument();
  // Current value vs its own rolling baseline is shown per channel.
  expect(
    screen.getAllByText((content) =>
      content.includes("当前 80") && content.includes("均线 50"),
    ).length,
  ).toBeGreaterThan(0);
  expect(screen.getAllByText("ios").length).toBeGreaterThan(0);
  expect(screen.getByText("下钻查看当日明细")).toBeInTheDocument();

  // The narrative summarises the view and names the root cause. Tokens render
  // as nested coloured spans, so assert against the container's text content.
  const summaryHeading = screen.getByText("当前视图总结");
  expect(summaryHeading.parentElement?.textContent).toContain(
    "从渠道商来看，主要来自",
  );
  // The narrative also decomposes 主游戏 / 媒体; 渠道商 reuses the drill query.
  await waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(4));
  expect(summaryHeading.parentElement?.textContent).toContain("从主游戏来看");
  expect(summaryHeading.parentElement?.textContent).toContain("从媒体来看");
});
