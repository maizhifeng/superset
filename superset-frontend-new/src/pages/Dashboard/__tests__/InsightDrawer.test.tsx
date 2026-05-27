import { test, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider, createTheme } from "@mui/material/styles";

const theme = createTheme();
function Wrapper({ children }: { children: React.ReactNode }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}
function renderWithProviders(ui: React.ReactElement) {
  return render(ui, { wrapper: Wrapper });
}

/* ---------- mocks ---------- */

const mockGenerate = vi.fn();
const mockSendMessage = vi.fn();
const mockClear = vi.fn();
const mockStop = vi.fn();
const mockUpdateModelConfig = vi.fn();

vi.mock("@/pages/Dashboard/hooks/useInsight", () => ({
  useInsight: vi.fn(() => ({
    insightText: "", reasoningText: "", loading: false, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  })),
}));

vi.mock("@/store/notificationStore", () => ({
  useNotificationStore: vi.fn(() => ({ notify: vi.fn() })),
}));

/* ---------- import ---------- */

import AiDrawer from "@/components/AiDrawer";
import { useInsight } from "@/pages/Dashboard/hooks/useInsight";

beforeEach(() => {
  vi.clearAllMocks();
});

/* Mock ResizeObserver which may be used by MUI Drawer */
vi.stubGlobal("ResizeObserver", vi.fn(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
})));

/* ========== rendering ========== */

test("renders nothing when closed", () => {
  renderWithProviders(
    <AiDrawer variant="insight" open={false} chartId={null} onClose={vi.fn()} />,
  );
  expect(screen.getByText("AI 洞察分析")).not.toBeVisible();
});

test("renders header and empty state when open with no analysis", () => {
  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={106} onClose={vi.fn()} />,
  );
  expect(screen.getByText("AI 洞察分析")).toBeInTheDocument();
  expect(screen.getByText("AI 可基于图表数据进行分析")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /开始分析/i })).toBeInTheDocument();
});

test("renders chart metadata when chartMeta is provided", () => {
  renderWithProviders(
    <AiDrawer variant="insight"
      open={true} chartId={106} onClose={vi.fn()}
      chartMeta={{ id: 106, slice_name: "Sales Chart", viz_type: "line" } as any}
    />,
  );
  expect(screen.getByText("图表: Sales Chart")).toBeInTheDocument();
  expect(screen.getByText("类型: line")).toBeInTheDocument();
});

test("calls generate when Start Analysis is clicked", async () => {
  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={42} onClose={vi.fn()} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /开始分析/i }));
  expect(mockGenerate).toHaveBeenCalledWith(42, {});
});

test("shows settings panel when gear icon is clicked", async () => {
  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  const gearBtn = screen.getByTestId("SettingsIcon").closest("button");
  expect(gearBtn).toBeInTheDocument();
  await userEvent.click(gearBtn!);
  expect(screen.getByLabelText(/供应商/i)).toBeInTheDocument();
  expect(screen.getByLabelText(/模型/i)).toBeInTheDocument();
});

/* ========== analysis states ========== */

test("shows loading spinner when analysis is running", () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "", loading: true, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  expect(screen.getByText("正在分析数据中…")).toBeInTheDocument();
});

test("renders sections from markdown headers in insightText", () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "## 趋势\nupward trend\n## 发现\nkey insight",
    loading: false, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  expect(screen.getByText("upward trend")).toBeInTheDocument();
  expect(screen.getByText("key insight")).toBeInTheDocument();
  expect(screen.getByText("复制全部")).toBeInTheDocument();
  expect(screen.getByText("重新生成")).toBeInTheDocument();
});

test("wraps plain text without headers in single 分析 section", () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "Some analysis result", loading: false, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Some analysis result")).toBeInTheDocument();
});

test("renders 思考 section from reasoningText when no thinking header exists", () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "## 趋势\ntrend data",
    reasoningText: "deep thoughts",
    loading: false, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  expect(screen.getByText("deep thoughts")).toBeInTheDocument();
  expect(screen.getByText("trend data")).toBeInTheDocument();
});

test("shows error state with retry button", () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "", loading: false, error: "API failed",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={5} onClose={vi.fn()} />,
  );
  expect(screen.getByText("API failed")).toBeInTheDocument();
  expect(screen.getByText("重试")).toBeInTheDocument();
});

test("retry button calls generate", async () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "", loading: false, error: "fail",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={5} onClose={vi.fn()}  filters={{ f: { value: "x", column: "col", filterType: "filter_select" } }} />,
  );
  await userEvent.click(screen.getByText("重试"));
  expect(mockGenerate).toHaveBeenCalledWith(5, { f: { value: "x", column: "col", filterType: "filter_select" } });
});

/* ========== follow-up ========== */

test("shows follow-up input when insight text exists", () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "## 趋势\nanalysis", loading: false, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  expect(screen.getByPlaceholderText("输入追问内容…")).toBeInTheDocument();
});

test("follow-up send button calls sendMessage", async () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "## 趋势\ncontent", loading: false, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  const input = screen.getByPlaceholderText("输入追问内容…");
  await userEvent.type(input, "Tell me more");
  await userEvent.click(screen.getByTestId("SendIcon").closest("button")!);
  expect(mockSendMessage).toHaveBeenCalledWith("Tell me more");
});

test("shows stop button during loading", () => {
  vi.mocked(useInsight).mockReturnValue({
    insightText: "## 趋势\npartial...", loading: true, error: "",
    generate: mockGenerate, sendMessage: mockSendMessage,
    clear: mockClear, stop: mockStop,
    modelConfig: { provider: "lmstudio", model: "gemma-4-e4b-it" },
    updateModelConfig: mockUpdateModelConfig,
  } as any);

  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={vi.fn()} />,
  );
  const stopBtn = screen.getByTestId("StopIcon").closest("button");
  expect(stopBtn).toBeInTheDocument();
  fireEvent.click(stopBtn!);
  expect(mockStop).toHaveBeenCalled();
});

/* ========== close ========== */

test("calls clear and onClose when closed via X", async () => {
  const onClose = vi.fn();
  renderWithProviders(
    <AiDrawer variant="insight" open={true} chartId={1} onClose={onClose} />,
  );
  const closeBtn = screen.getByTestId("CloseIcon").closest("button");
  await userEvent.click(closeBtn!);
  expect(mockClear).toHaveBeenCalled();
  expect(onClose).toHaveBeenCalled();
});
