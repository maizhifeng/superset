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
  expect(screen.getByText("Welcome to Starfly")).toBeInTheDocument();
});

test("renders all navigation sections", () => {
  renderHome();
  expect(screen.getByText("Charts")).toBeInTheDocument();
  expect(screen.getByText("Dashboards")).toBeInTheDocument();
  expect(screen.getByText("SQL Lab")).toBeInTheDocument();
  expect(screen.getByText("Databases")).toBeInTheDocument();
  expect(screen.getByText("Datasets")).toBeInTheDocument();
  expect(screen.getByText("Query History")).toBeInTheDocument();
});

test("renders description text for each section", () => {
  renderHome();
  expect(screen.getByText("Create and manage charts")).toBeInTheDocument();
  expect(
    screen.getByText("Organize charts into dashboards"),
  ).toBeInTheDocument();
});

test("navigates to chart list on Charts click", async () => {
  renderHome();

  await userEvent.click(screen.getByText("Charts"));
  expect(mockNavigate).toHaveBeenCalledWith("/chart/list");
});

test("navigates to dashboard list on Dashboards click", async () => {
  renderHome();

  await userEvent.click(screen.getByText("Dashboards"));
  expect(mockNavigate).toHaveBeenCalledWith("/dashboard/list");
});
