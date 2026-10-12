import { render, screen, fireEvent } from "@testing-library/react";
import ResultsTable from "@/pages/SqlLab/ResultsTable";
import { test, expect, vi } from "vitest";

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

const executedQuery = {
  rows: 1,
  sql: "SELECT 1",
  state: "success",
  queryId: 1,
  limit: 100,
  limitingFactor: "LIMIT",
  progress: 100,
};

test("shows the executed-SQL controls by default", () => {
  renderTable({ query: executedQuery });
  expect(screen.getByRole("button", { name: "SQL" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /复制执行的 SQL/ }),
  ).toBeInTheDocument();
});

test("hides the executed-SQL controls when showSqlToggle is false", () => {
  render(
    <ResultsTable
      result={{ ...baseResult, query: executedQuery }}
      page={0}
      rowsPerPage={25}
      paginatedData={baseResult.data}
      onPageChange={() => {}}
      onRowsPerPageChange={() => {}}
      showSqlToggle={false}
    />,
  );
  expect(screen.queryByRole("button", { name: "SQL" })).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /复制执行的 SQL/ }),
  ).not.toBeInTheDocument();
});

test("fullscreen button requests fullscreen on the results container", () => {
  const requestFullscreen = vi.fn(() => Promise.resolve());
  const original = HTMLElement.prototype.requestFullscreen;
  Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
    value: requestFullscreen,
    configurable: true,
    writable: true,
  });
  try {
    renderTable();
    fireEvent.click(screen.getByRole("button", { name: "全屏查看结果" }));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  } finally {
    if (original) {
      Object.defineProperty(HTMLElement.prototype, "requestFullscreen", {
        value: original,
        configurable: true,
        writable: true,
      });
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)
        .requestFullscreen;
    }
  }
});
