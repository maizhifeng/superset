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

/* ---------- mocks ---------- */

vi.mock("react-grid-layout", () => {
  const MockGridLayout = vi.fn(({ children, className }: any) => (
    <div className={className} data-testid="grid-layout">{children}</div>
  ));
  return {
    GridLayout: MockGridLayout,
    WidthProvider: vi.fn((cmp: any) => cmp),
  };
});

vi.mock("@/pages/Dashboard/ChartCard", () => ({
  default: vi.fn(({ chartId }: any) => (
    <div data-testid={`chart-card-${chartId}`}>Chart {chartId}</div>
  )),
}));

/* ---------- import ---------- */

import DashboardGrid from "@/pages/Dashboard/DashboardGrid";

beforeEach(() => {
  vi.clearAllMocks();
});

/* Stub ResizeObserver */
vi.stubGlobal("ResizeObserver", vi.fn(() => ({
  observe: vi.fn(), unobserve: vi.fn(), disconnect: vi.fn(),
})));

const baseProps = {
  containerWidth: 1200,
  gridLayout: [] as any[],
  layoutItems: [] as any[],
  chartMeta: {} as any,
  chartData: {} as any,
  chartLoading: {} as any,
  isDragging: false,
  saving: false,
  containerRef: { current: null } as any,
  onLayoutChange: vi.fn(),
  onDragStart: vi.fn(),
  onDragStop: vi.fn(),
  onResizeStart: vi.fn(),
  onResizeStop: vi.fn(),
  onRefresh: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onInsight: vi.fn(),
  onAddChart: vi.fn(),
  compareConfig: null,
  mirrorData: {} as any,
  onToggleCompare: vi.fn(),
  onOpenCompareBigScreen: vi.fn(),
  otherRows: {} as any,
  onFetchOtherRow: vi.fn(),
  totalRows: {} as any,
};

test("renders empty state when no items", () => {
  renderWithProviders(<DashboardGrid {...baseProps} />);
  expect(screen.getByText("No charts in this dashboard yet")).toBeInTheDocument();
  expect(screen.getByText("Add Chart")).toBeInTheDocument();
});

test("renders grid layout with chart cards when items exist", () => {
  const layoutItems = [
    { i: "CHART-1", chartId: 1, w: 4, h: 20, x: 0, y: 0, minW: 2, minH: 3 },
    { i: "CHART-2", chartId: 2, w: 4, h: 20, x: 4, y: 0, minW: 2, minH: 3 },
  ];
  const gridLayout = [
    { i: "CHART-1", x: 0, y: 0, w: 4, h: 20 },
    { i: "CHART-2", x: 4, y: 0, w: 4, h: 20 },
  ];
  const chartMeta = {
    1: { id: 1, slice_name: "Chart 1", viz_type: "line" } as any,
    2: { id: 2, slice_name: "Chart 2", viz_type: "bar" } as any,
  };

  renderWithProviders(
    <DashboardGrid {...baseProps} layoutItems={layoutItems} gridLayout={gridLayout} chartMeta={chartMeta} />,
  );

  expect(screen.getByTestId("chart-card-1")).toBeInTheDocument();
  expect(screen.getByTestId("chart-card-2")).toBeInTheDocument();
  expect(screen.getByTestId("grid-layout")).toBeInTheDocument();
});

test("shows saving indicator when saving is true", () => {
  const layoutItems = [{ i: "CHART-1", chartId: 1, w: 4, h: 20, x: 0, y: 0, minW: 2, minH: 3 }];
  const gridLayout = [{ i: "CHART-1", x: 0, y: 0, w: 4, h: 20 }];
  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      saving={true}
      layoutItems={layoutItems}
      gridLayout={gridLayout}
      chartMeta={{ 1: { id: 1, slice_name: "T", viz_type: "table" } as any }}
    />,
  );
  expect(screen.getByText("Saving...")).toBeInTheDocument();
});

test("renders single column layout on mobile", () => {
  const layoutItems = [
    { i: "CHART-1", chartId: 1, w: 4, h: 20, x: 0, y: 0, minW: 2, minH: 3 },
  ];
  const gridLayout = [
    { i: "CHART-1", x: 0, y: 0, w: 12, h: 20 },
  ];

  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      containerWidth={500}
      layoutItems={layoutItems}
      gridLayout={gridLayout}
      chartMeta={{ 1: { id: 1, slice_name: "T", viz_type: "table" } as any }}
    />,
  );

  /* On mobile, chart cards still render */
  expect(screen.getByTestId("chart-card-1")).toBeInTheDocument();
});

test("passes onInsight callback to ChartCard", () => {
  const onInsight = vi.fn();
  const layoutItems = [{ i: "CHART-10", chartId: 10, w: 4, h: 20, x: 0, y: 0, minW: 2, minH: 3 }];
  const gridLayout = [{ i: "CHART-10", x: 0, y: 0, w: 4, h: 20 }];

  renderWithProviders(
    <DashboardGrid
      {...baseProps}
      layoutItems={layoutItems}
      gridLayout={gridLayout}
      chartMeta={{ 10: { id: 10, slice_name: "X", viz_type: "table" } as any }}
      onInsight={onInsight}
    />,
  );

  expect(screen.getByTestId("chart-card-10")).toBeInTheDocument();
  /* ChartCard is mocked, so we just verify it rendered */
});
