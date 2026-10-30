import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import AnalysisHome from "@/pages/Analysis";
import { clearAnalysisOverviewCache } from "@/pages/Analysis/hooks/useAnalysisOverview";
import { useRecentAnalysisTopics } from "@/store/recentAnalysisTopics";

const { postChartDataMock } = vi.hoisted(() => ({
  postChartDataMock: vi.fn(),
}));

vi.mock("@/api/chartData", () => ({
  postChartData: postChartDataMock,
}));

const TOPIC_TITLES = [
  "成本分析",
  "留存分析",
  "LTV / ROI 分析",
  "付费分析",
  "渠道 / 媒体分析",
];

const OVERVIEW_RESPONSE = {
  data: {
    result: [
      {
        data: [{ 消耗: 1234, 新增进入: 100, 流水ROI: 1.5, cpa: 10 }],
      },
      {
        data: [{ 消耗: 1000, 新增进入: 90, 流水ROI: 1.2, cpa: 8 }],
      },
    ],
  },
};

function renderHome() {
  return render(
    <MemoryRouter initialEntries={["/analysis"]}>
      <Routes>
        <Route path="/analysis" element={<AnalysisHome />} />
        <Route path="/analysis/:topicId" element={<div>topic page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  postChartDataMock.mockReset();
  postChartDataMock.mockResolvedValue(OVERVIEW_RESPONSE);
  clearAnalysisOverviewCache();
  useRecentAnalysisTopics.setState({ items: [] });
});

afterEach(() => {
  clearAnalysisOverviewCache();
  useRecentAnalysisTopics.setState({ items: [] });
});

test("renders the 30-day overview and every analysis topic", async () => {
  renderHome();

  // The page title/subtitle live in the breadcrumb chrome now.
  expect(screen.queryByText("专题分析")).not.toBeInTheDocument();
  expect(screen.getByText("近 30 天总览")).toBeInTheDocument();
  for (const title of TOPIC_TITLES) {
    expect(screen.getByText(title)).toBeInTheDocument();
  }

  // Current-period values are formatted with the shared metric formatters.
  expect(await screen.findByText("1.23K")).toBeInTheDocument();
  expect(screen.getByText("150.0%")).toBeInTheDocument();
  expect(screen.getByText("100")).toBeInTheDocument();

  // Both windows are spelled out so the delta basis is never ambiguous.
  expect(screen.getByText(/统计窗口 \d{4}-\d{2}-\d{2}/)).toBeInTheDocument();
  expect(screen.getByText(/对比窗口 \d{4}-\d{2}-\d{2}/)).toBeInTheDocument();

  await waitFor(() => expect(postChartDataMock).toHaveBeenCalledTimes(1));
  const payload = postChartDataMock.mock.calls[0][0] as {
    datasource: { id: number; type: string };
    queries: unknown[];
  };
  expect(payload.datasource).toEqual({ id: 26, type: "table" });
  expect(payload.queries).toHaveLength(2);
});

test("opens a topic page when its card is clicked", () => {
  renderHome();

  fireEvent.click(screen.getByText("留存分析"));
  expect(screen.getByText("topic page")).toBeInTheDocument();
});

test("opens a topic page from the keyboard", () => {
  renderHome();

  const card = screen.getByRole("button", { name: "进入成本分析" });
  fireEvent.keyDown(card, { key: "Enter" });
  expect(screen.getByText("topic page")).toBeInTheDocument();
});

test("keeps the data-scope panel collapsed until toggled", () => {
  renderHome();

  const toggle = screen.getByRole("button", { name: /数据口径与观察期/ });
  expect(toggle).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText(/ad_combined_report/)).not.toBeInTheDocument();

  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByText(/ad_combined_report/)).toBeInTheDocument();
  expect(screen.getByText(/返点后消耗计算/)).toBeInTheDocument();
});

test("shows recently viewed topics only when the store has entries", () => {
  const { unmount } = renderHome();
  expect(screen.queryByTestId("analysis-recent-topics")).not.toBeInTheDocument();
  unmount();

  useRecentAnalysisTopics.getState().record("retention");
  useRecentAnalysisTopics.getState().record("cost");
  renderHome();

  expect(screen.getByTestId("analysis-recent-topics")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "最近查看：成本分析" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "最近查看：留存分析" }),
  ).toBeInTheDocument();
});

test("opens a recently viewed topic and can clear the row", () => {
  useRecentAnalysisTopics.getState().record("cost");
  const { unmount } = renderHome();

  fireEvent.click(screen.getByRole("button", { name: "最近查看：成本分析" }));
  expect(screen.getByText("topic page")).toBeInTheDocument();
  unmount();

  renderHome();
  fireEvent.click(screen.getByRole("button", { name: "清空最近查看" }));
  expect(screen.queryByTestId("analysis-recent-topics")).not.toBeInTheDocument();
});

test("keeps the hall usable when the overview request fails and retries", async () => {
  postChartDataMock.mockRejectedValueOnce(new Error("Network Error"));
  renderHome();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "近 30 天总览加载失败",
  );
  // The topic grid stays available while only the overview is in error.
  expect(screen.getByText("成本分析")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "重试" }));
  expect(await screen.findByText("1.23K")).toBeInTheDocument();
});
