import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Home from "@/pages/Home";
import { test, expect, vi } from "vitest";

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

test("renders welcome title", () => {
  renderHome();
  expect(screen.getByText("欢迎使用 Starfly")).toBeInTheDocument();
});

test("renders all navigation sections", () => {
  renderHome();
  expect(screen.getByText("图表")).toBeInTheDocument();
  expect(screen.getByText("仪表板")).toBeInTheDocument();
  expect(screen.getByText("SQL 实验室")).toBeInTheDocument();
  expect(screen.getByText("数据库")).toBeInTheDocument();
  expect(screen.getByText("数据集")).toBeInTheDocument();
  expect(screen.getByText("查询历史")).toBeInTheDocument();
});

test("renders description text for each section", () => {
  renderHome();
  expect(screen.getByText("创建和管理图表")).toBeInTheDocument();
  expect(screen.getByText("将图表组织到仪表板中")).toBeInTheDocument();
});

test("navigates to chart list on Charts click", () => {
  renderHome();

  userEvent.click(screen.getByText("图表"));
  expect(mockNavigate).toHaveBeenCalledWith("/chart/list");
});

test("navigates to dashboard list on Dashboards click", () => {
  renderHome();

  userEvent.click(screen.getByText("仪表板"));
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard/list");
});
