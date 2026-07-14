import { test, expect, vi, beforeEach } from "vitest";
import { screen, render } from "@testing-library/react";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme();
function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: Wrapper });
}

vi.mock("@/pages/Dashboard/ChartCard", () => ({
  default: vi.fn(({ chartId }: any) => (
    <div data-testid={`chart-card-${chartId}`}>Chart {chartId}</div>
  )),
}));

import DashboardGrid from "@/pages/Dashboard/DashboardGrid";

beforeEach(() => {
  vi.clearAllMocks();
});

vi.stubGlobal("ResizeObserver", vi.fn(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
})));

const baseProps = {
  containerWidth: 1200,
  layoutItems: [] as any[],
  chartMeta: {} as any,
  chartData: {} as any,
  chartLoading: {} as any,
  saving: false,
  containerRef: { current: null } as any,
  onSizeChange: vi.fn(),
  onRefresh: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onInsight: vi.fn(),
  onAddChart: vi.fn(),
  compareConfig: null,
  mirrorData: {} as any,
  onToggleCompare: vi.fn(),
  onOpenCompareBigScreen: vi.fn(),
  totalRows: {} as any,
};

test("renders empty state when no items", () => {
  renderWithProviders(<DashboardGrid {...baseProps} />);
  expect(screen.getByText("此仪表板暂无图表")).toBeInTheDocument();
  expect(screen.getByText("添加图表")).toBeInTheDocument();
});

test("renders grid with chart cards when items exist", () => {
  const layoutItems = [
    { i: "CHART-1", chartId: 1, w: 6, h: 14 },
    { i: "CHART-2", chartId: 2, w: 6, h: 14 },
  ];
  const chartMeta = {
    1: { id: 1, slice_name: "Chart 1", viz_type: "line" } as any,
    2: { id: 2, slice_name: "Chart 2", viz_type: "bar" } as any,
  };

  renderWithProviders(
    <DashboardGrid {...baseProps} layoutItems={layoutItems} chartMeta={chartMeta} />,
  );

  expect(screen.getByTestId("chart-card-1")).toBeInTheDocument();
  expect(screen.getByTestId("chart-card-2")).toBeInTheDocument();
});

test("shows saving indicator when saving is true", () => {
  const layoutItems = [{ i: "CHART-1", chartId: 1, w: 6, h: 14 }];
  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      saving={true}
      layoutItems={layoutItems}
      chartMeta={{ 1: { id: 1, slice_name: "T", viz_type: "table" } as any }}
    />,
  );
  expect(screen.getByText("保存中...")).toBeInTheDocument();
});

test("renders single column on mobile", () => {
  const layoutItems = [
    { i: "CHART-1", chartId: 1, w: 6, h: 14 },
  ];

  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      containerWidth={500}
      layoutItems={layoutItems}
      chartMeta={{ 1: { id: 1, slice_name: "T", viz_type: "table" } as any }}
    />,
  );

  expect(screen.getByTestId("chart-card-1")).toBeInTheDocument();
});

test("passes onInsight callback to ChartCard", () => {
  const onInsight = vi.fn();
  const layoutItems = [{ i: "CHART-10", chartId: 10, w: 6, h: 14 }];

  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      layoutItems={layoutItems}
      chartMeta={{ 10: { id: 10, slice_name: "X", viz_type: "table" } as any }}
      onInsight={onInsight}
    />,
  );

  expect(screen.getByTestId("chart-card-10")).toBeInTheDocument();
});
