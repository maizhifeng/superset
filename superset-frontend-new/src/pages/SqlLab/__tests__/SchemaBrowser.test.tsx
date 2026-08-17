import { render, screen, fireEvent, act } from "@testing-library/react";
import SchemaBrowser from "@/pages/SqlLab/SchemaBrowser";
import { test, expect } from "vitest";

const baseProps = {
  databases: [{ id: 3, database_name: "db" }],
  databaseId: 3 as number | "",
  schemas: ["public"],
  schema: "public",
  schemasLoading: false,
  tableList: [
    { value: "ab_user", type: "table" },
    { value: "orders", type: "table" },
    { value: "payments", type: "table" },
  ],
  columnCache: {},
  loadingTable: null,
  sidebarOpen: true,
  onDatabaseChange: () => {},
  onSchemaChange: () => {},
  onToggleSidebar: () => {},
  onTableExpand: () => {},
  onTableContextMenu: () => {},
  onColumnContextMenu: () => {},
  onRefresh: () => {},
};

test("renders a table search box", () => {
  render(<SchemaBrowser {...baseProps} />);
  expect(screen.getByPlaceholderText("搜索表...")).toBeInTheDocument();
  expect(screen.getByText("ab_user")).toBeInTheDocument();
  expect(screen.getByText("orders")).toBeInTheDocument();
});

test("filters the table list by search text", () => {
  render(<SchemaBrowser {...baseProps} />);
  const input = screen.getByPlaceholderText("搜索表...");
  act(() => {
    fireEvent.change(input, { target: { value: "ab_" } });
  });
  expect(screen.getByText("ab_user")).toBeInTheDocument();
  expect(screen.queryByText("orders")).not.toBeInTheDocument();
  expect(screen.queryByText("payments")).not.toBeInTheDocument();
});
