import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import RefreshIcon from "@mui/icons-material/Refresh";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { test, expect, vi, beforeEach } from "vitest";
import PageFrame from "@/components/PageFrame";
import { useToolbarStore } from "@/store/toolbarStore";
import { getTheme } from "@/theme";

beforeEach(() => {
  useToolbarStore.setState({ registry: {}, inlinePage: null });
});

const renderFrame = () =>
  render(
    <ThemeProvider theme={getTheme("paper")}>
      <PageFrame
        page="demo_page"
        title="演示列表"
        subtitle="共 3 项"
        actions={<button type="button">额外操作</button>}
        toolbar={<input placeholder="筛选" />}
      >
        <div>内容区域</div>
      </PageFrame>
    </ThemeProvider>,
  );

test("renders title, subtitle, actions, content and marks tools inline", () => {
  renderFrame();

  expect(screen.getByText("演示列表")).toBeInTheDocument();
  expect(screen.getByText("共 3 项")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "额外操作" })).toBeInTheDocument();
  expect(screen.getByPlaceholderText("筛选")).toBeInTheDocument();
  expect(screen.getByText("内容区域")).toBeInTheDocument();
  expect(useToolbarStore.getState().inlinePage).toBe("demo_page");
});

test("renders a primary tool as a labelled button", () => {
  const action = vi.fn();
  useToolbarStore.setState({
    registry: {
      demo_page: [
        {
          id: "create",
          priority: 1,
          showOnMobile: true,
          fabIcon: <RefreshIcon />,
          fabLabel: "新建演示",
          action,
          render: null,
        },
      ],
    },
  });

  renderFrame();
  const button = screen.getByRole("button", { name: /新建演示/ });
  expect(button).toBeInTheDocument();
  button.click();
  expect(action).toHaveBeenCalledTimes(1);
});

test("collects menu tools into the 更多 overflow menu", async () => {
  const action = vi.fn();
  useToolbarStore.setState({
    registry: {
      demo_page: [
        {
          id: "copy",
          priority: 1,
          showOnMobile: false,
          render: null,
          variant: "menu",
          fabIcon: <ContentCopyIcon />,
          fabLabel: "复制图表名",
          action,
        },
      ],
    },
  });

  renderFrame();

  // Not a toolbar button; it only exists inside the overflow menu.
  expect(screen.queryByText("复制图表名")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "更多操作" }));
  fireEvent.click(await screen.findByText("复制图表名"));
  expect(action).toHaveBeenCalledTimes(1);
});
