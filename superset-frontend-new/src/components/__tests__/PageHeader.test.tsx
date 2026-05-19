import { render, screen } from "@testing-library/react";
import PageHeader from "@/components/PageHeader";
import { test, expect } from "vitest";
import Button from "@mui/material/Button";

test("renders title", () => {
  render(<PageHeader title="Dashboard" />);
  expect(screen.getByText("Dashboard")).toBeInTheDocument();
});

test("renders subtitle when provided", () => {
  render(<PageHeader title="Dashboard" subtitle="Manage your dashboards" />);
  expect(screen.getByText("Manage your dashboards")).toBeInTheDocument();
});

test("does not render subtitle when not provided", () => {
  const { container } = render(<PageHeader title="Dashboard" />);
  const captions = container.querySelectorAll(".MuiTypography-caption");
  expect(captions.length).toBe(0);
});

test("renders actions when provided", () => {
  render(<PageHeader title="Dashboard" actions={<Button>Create</Button>} />);
  expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument();
});

test("does not render actions container when not provided", () => {
  const { container } = render(<PageHeader title="Dashboard" />);
  const buttons = container.querySelectorAll("button");
  expect(buttons.length).toBe(0);
});
