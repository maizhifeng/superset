import { render, screen } from "@testing-library/react";
import { fireEvent } from "@testing-library/dom";
import { ThemeProvider } from "@mui/material/styles";
import { test, expect, vi } from "vitest";
import SqlQueryEditor from "@/components/SqlQueryEditor";
import type { SqlQueryEditorProps } from "@/components/SqlQueryEditor";
import { getTheme } from "@/theme";

// CodeMirror needs a real layout engine; the panel chrome is what is under test
// here, so the editor itself is replaced by a plain textarea.
vi.mock("@uiw/react-codemirror", () => ({
  default: ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (value: string) => void;
  }) => (
    <textarea
      aria-label="SQL 编辑器"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  ),
}));

function renderEditor(props: Partial<SqlQueryEditorProps> = {}) {
  const onChange = vi.fn();
  const result = render(
    <ThemeProvider theme={getTheme("paper")}>
      <SqlQueryEditor value="select 1" onChange={onChange} {...props} />
    </ThemeProvider>,
  );
  return { ...result, onChange };
}

test("renders the panel heading, engine pills and buffer stats", () => {
  renderEditor({
    value: "select 1\nfrom t",
    databaseName: "aliyun",
    backend: "postgresql",
  });

  expect(screen.getByText("SQL 查询")).toBeInTheDocument();
  expect(screen.getByText("aliyun")).toBeInTheDocument();
  expect(screen.getByText("postgresql")).toBeInTheDocument();

  const statusbar = screen.getByTestId("sql-editor-statusbar");
  expect(statusbar).toHaveTextContent("第 1 行 · 第 1 列");
  expect(statusbar).toHaveTextContent("2 行 · 15 字符");
});

test("shows the shortcut hints when actions are provided", () => {
  renderEditor({ onFormat: vi.fn(), onSave: vi.fn() });

  const statusbar = screen.getByTestId("sql-editor-statusbar");
  expect(statusbar).toHaveTextContent("Ctrl+Shift+F");
  expect(statusbar).toHaveTextContent("保存");
});

test("marks unsaved changes with a pill", () => {
  const { rerender } = renderEditor();
  expect(screen.queryByText("未保存修改")).not.toBeInTheDocument();

  rerender(
    <ThemeProvider theme={getTheme("paper")}>
      <SqlQueryEditor value="select 2" onChange={vi.fn()} dirty />
    </ThemeProvider>,
  );
  expect(screen.getByText("未保存修改")).toBeInTheDocument();
});

test("runs the toolbar actions", () => {
  const onFormat = vi.fn();
  const onCopy = vi.fn();
  const onReset = vi.fn();
  renderEditor({ onFormat, onCopy, onReset, dirty: true });

  fireEvent.click(screen.getByRole("button", { name: "格式化" }));
  fireEvent.click(screen.getByRole("button", { name: "复制" }));
  fireEvent.click(screen.getByRole("button", { name: "还原" }));

  expect(onFormat).toHaveBeenCalledTimes(1);
  expect(onCopy).toHaveBeenCalledTimes(1);
  expect(onReset).toHaveBeenCalledTimes(1);
});

test("hides actions that have no handler and disables them on an empty buffer", () => {
  const { unmount } = renderEditor();
  expect(
    screen.queryByRole("button", { name: "格式化" }),
  ).not.toBeInTheDocument();
  unmount();

  renderEditor({ value: "", onFormat: vi.fn(), onCopy: vi.fn() });
  expect(screen.getByRole("button", { name: "格式化" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "复制" })).toBeDisabled();
});

test("forwards edits from the editor", () => {
  const { onChange } = renderEditor();
  const editor = screen.getByLabelText("SQL 编辑器");

  fireEvent.change(editor, { target: { value: "select 2" } });

  expect(onChange).toHaveBeenCalledWith("select 2");
});
