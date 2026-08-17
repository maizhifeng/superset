import { render, screen } from "@testing-library/react";
import ResultsTable from "@/pages/SqlLab/ResultsTable";
import { test, expect } from "vitest";

const baseResult = {
  status: "success",
  columns: [{ name: "a" }, { name: "b" }],
  data: [
    { a: 1, b: "x" },
    { a: 2, b: "y" },
  ],
};

function renderTable(overrides = {}) {
  return render(
    <ResultsTable
      result={{ ...baseResult, data: [...baseResult.data], ...overrides }}
      page={0}
      rowsPerPage={25}
      paginatedData={baseResult.data}
      onPageChange={() => {}}
      onRowsPerPageChange={() => {}}
    />,
  );
}

test("shows an enabled export button when there are result rows", () => {
  renderTable();
  const btn = screen.getByRole("button", { name: /导出为 CSV/ });
  expect(btn).toBeInTheDocument();
  expect(btn).not.toBeDisabled();
});

test("disables the export button when there is no data", () => {
  renderTable({ data: [] });
  const btn = screen.getByRole("button", { name: /导出为 CSV/ });
  expect(btn).toBeDisabled();
});

test("renders the export button label", () => {
  renderTable();
  expect(screen.getByText("导出为 CSV")).toBeInTheDocument();
});

test("shows a copy-as-TSV button that is disabled without data", () => {
  renderTable();
  const btn = screen.getByRole("button", { name: /复制为 TSV/ });
  expect(btn).toBeInTheDocument();
  expect(btn).not.toBeDisabled();
});

test("disables the copy button when there is no data", () => {
  renderTable({ data: [] });
  expect(screen.getByRole("button", { name: /复制为 TSV/ })).toBeDisabled();
});
