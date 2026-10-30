import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { test, expect, vi } from "vitest";
import ToolbarSelect from "@/components/ToolbarSelect";
import { getTheme } from "@/theme";

const options = [
  { value: "", label: "全部" },
  { value: "physical", label: "物理表" },
  { value: "virtual", label: "虚拟数据集" },
];

const renderSelect = (value: string | number = "") =>
  render(
    <ThemeProvider theme={getTheme("paper")}>
      <ToolbarSelect
        label="类型"
        value={value}
        onChange={() => {}}
        options={options}
      />
    </ThemeProvider>,
  );

test("shows the filter name as a muted placeholder while unfiltered", () => {
  renderSelect("");
  expect(screen.getByText("类型")).toBeInTheDocument();
});

test("shows the selected option label", () => {
  renderSelect("physical");
  expect(screen.getByText("物理表")).toBeInTheDocument();
});

test("reports the chosen option value", () => {
  const onChange = vi.fn();
  render(
    <ThemeProvider theme={getTheme("paper")}>
      <ToolbarSelect
        label="类型"
        value=""
        onChange={onChange}
        options={options}
      />
    </ThemeProvider>,
  );
  fireEvent.mouseDown(screen.getByRole("combobox"));
  fireEvent.click(screen.getByRole("option", { name: "虚拟数据集" }));
  expect(onChange).toHaveBeenCalledWith("virtual");
});
