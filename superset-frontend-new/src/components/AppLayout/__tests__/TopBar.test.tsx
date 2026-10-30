import { test, expect, beforeEach, afterEach, vi } from "vitest";
import { fireEvent, render, screen, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TopBar from "@/components/AppLayout/TopBar";
import FabStack from "@/components/AppLayout/FabStack";
import { useToolbarStore } from "@/store/toolbarStore";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import RefreshIcon from "@mui/icons-material/Refresh";

function setupMatchMedia() {
  let mobile = false;
  const listeners = new Set<() => void>();
  const makeMediaQueryList = (query: string) => {
    const isMobileQuery = query.includes("max-width:599.95");
    const mql = {
      get matches() {
        return isMobileQuery ? mobile : !mobile;
      },
      media: query,
      addListener: (fn: () => void) => listeners.add(fn),
      removeListener: (fn: () => void) => listeners.delete(fn),
      addEventListener: (_: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
      dispatchEvent: () => true,
    };
    return mql;
  };
  window.matchMedia = vi.fn(
    makeMediaQueryList,
  ) as unknown as typeof window.matchMedia;
  return {
    setMobile: (value: boolean) => {
      mobile = value;
      listeners.forEach((fn) => fn());
    },
  };
}

beforeEach(() => {
  useToolbarStore.setState({ registry: {}, inlinePage: null });
  useBreadcrumbStore.setState({ custom: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("renders breadcrumbs, tip marquee and tools from registry", () => {
  setupMatchMedia();
  useToolbarStore.setState({
    registry: {
      page: [
        {
          id: "search",
          priority: 0,
          showOnMobile: false,
          render: <input placeholder="搜索图表..." />,
        },
        {
          id: "refresh",
          priority: 20,
          showOnMobile: false,
          fabIcon: <RefreshIcon />,
          fabLabel: "刷新",
          action: vi.fn(),
          render: null,
        },
      ],
    },
  });
  useBreadcrumbStore.setState({
    custom: { label: "我的仪表板", status: "published" },
  });

  render(
    <MemoryRouter initialEntries={["/dashboard/1"]}>
      <TopBar tip={{ id: "dashboard", title: "仪表板", message: "测试提示" }} />
    </MemoryRouter>,
  );

  expect(screen.getByPlaceholderText("搜索图表...")).toBeInTheDocument();
  expect(screen.getByText("我的仪表板")).toBeInTheDocument();
  expect(screen.getByLabelText("刷新")).toBeInTheDocument();
  expect(screen.getAllByText(/测试提示/).length).toBeGreaterThan(0);
});

test("renders section crumb from knownSections without custom label", () => {
  setupMatchMedia();
  render(
    <MemoryRouter initialEntries={["/chart/list"]}>
      <TopBar tip={null} />
    </MemoryRouter>,
  );
  expect(screen.getByText("首页")).toBeInTheDocument();
  expect(screen.getByText("图表")).toBeInTheDocument();
});

test("hides tools and tip on mobile", () => {
  const mm = setupMatchMedia();
  useToolbarStore.setState({
    registry: {
      page: [
        {
          id: "search",
          priority: 0,
          showOnMobile: false,
          render: <input placeholder="搜索图表..." />,
        },
      ],
    },
  });

  render(
    <MemoryRouter initialEntries={["/chart/list"]}>
      <TopBar tip={{ id: "chart_list", title: "图表", message: "测试提示" }} />
    </MemoryRouter>,
  );

  act(() => {
    mm.setMobile(true);
  });
  expect(screen.queryByPlaceholderText("搜索图表...")).not.toBeInTheDocument();
  expect(screen.queryByText(/测试提示/)).not.toBeInTheDocument();
  expect(screen.getByText("图表")).toBeInTheDocument();
});

test("FabStack renders fabs only on mobile", () => {
  const mm = setupMatchMedia();
  useToolbarStore.setState({
    registry: {
      page: [
        {
          id: "add",
          priority: 5,
          showOnMobile: true,
          fabIcon: <RefreshIcon />,
          fabLabel: "添加",
          action: vi.fn(),
          render: null,
        },
      ],
    },
  });

  const { rerender } = render(<FabStack />);
  expect(screen.queryByLabelText("添加")).not.toBeInTheDocument();

  act(() => {
    mm.setMobile(true);
  });
  rerender(<FabStack />);
  expect(screen.getByLabelText("添加")).toBeInTheDocument();
});

test("FabStack renders fabRender content on mobile", () => {
  const mm = setupMatchMedia();
  useToolbarStore.setState({
    registry: {
      page: [
        {
          id: "filter",
          priority: 10,
          showOnMobile: true,
          fabRender: <button type="button">筛选面板</button>,
          render: null,
        },
      ],
    },
  });

  act(() => {
    mm.setMobile(true);
  });
  render(<FabStack />);
  expect(screen.getByText("筛选面板")).toBeInTheDocument();
});

test("hides page tools while a PageFrame renders them inline", () => {
  setupMatchMedia();
  useToolbarStore.setState({
    registry: {
      page: [
        {
          id: "search",
          priority: 0,
          showOnMobile: false,
          render: <input placeholder="搜索图表..." />,
        },
      ],
    },
    inlinePage: "chart_list",
  });

  render(
    <MemoryRouter initialEntries={["/chart/list"]}>
      <TopBar tip={null} />
    </MemoryRouter>,
  );

  expect(screen.queryByPlaceholderText("搜索图表...")).not.toBeInTheDocument();
  // Global actions stay available while page tools render inline.
  expect(screen.getByLabelText("复制当前链接")).toBeInTheDocument();
  expect(screen.getByLabelText("全屏")).toBeInTheDocument();
});

test("opens the breadcrumb topic dropdown on hover", async () => {
  setupMatchMedia();
  useBreadcrumbStore.setState({
    custom: {
      label: "成本分析",
      options: [
        { label: "成本分析", path: "/analysis/cost", selected: true },
        { label: "留存分析", path: "/analysis/retention" },
      ],
    },
  });

  render(
    <MemoryRouter initialEntries={["/analysis/cost"]}>
      <TopBar tip={null} />
    </MemoryRouter>,
  );

  const crumb = screen.getByRole("button", { name: /成本分析/ });
  fireEvent.mouseEnter(crumb);
  expect(
    await screen.findByRole("menuitem", { name: "留存分析" }),
  ).toBeInTheDocument();

  fireEvent.click(screen.getByRole("menuitem", { name: "留存分析" }));
  expect(
    screen.queryByRole("menuitem", { name: "留存分析" }),
  ).not.toBeInTheDocument();
});
