import { test, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../spec/helpers/testing-library";
import PivotTable from "@/components/PivotTable";
import { formatDateValue } from "@/utils/dateHeuristics";

// 3-level row hierarchy: 平台 > 主游戏 > 渠道商
const rows = [
  { 平台: "iOS", 主游戏: "游戏A", 渠道商: "渠道X", "SUM(消耗)": 100 },
  { 平台: "iOS", 主游戏: "游戏A", 渠道商: "渠道Y", "SUM(消耗)": 50 },
  { 平台: "iOS", 主游戏: "游戏B", 渠道商: "渠道X", "SUM(消耗)": 30 },
  { 平台: "Android", 主游戏: "游戏C", 渠道商: "渠道X", "SUM(消耗)": 80 },
];

function renderPivot() {
  return renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["平台", "主游戏", "渠道商"]}
      groupbyColumns={[]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
      colTotals
      metricsLayout="COLUMNS"
    />,
  );
}

// Row-header cells nest the label in a span inside several boxes; subtotal
// rows render the label with a "汇总" suffix, so matching must be fuzzy.
const hasText = (t: string) => screen.queryAllByText(new RegExp(t)).length > 0;

function clickGroup(label: string) {
  const matches = [
    ...screen.queryAllByText(`${label} 汇总`),
    ...screen.queryAllByText(label),
  ];
  for (const m of matches) {
    const btn = m.parentElement?.querySelector("button");
    if (btn) {
      fireEvent.click(btn);
      return;
    }
  }
  throw new Error(`no toggle found for ${label}`);
}

test("collapsing a group hides its whole subtree", () => {
  renderPivot();
  // initially all groups are collapsed: only top-level group header rows
  expect(hasText("iOS")).toBe(true);
  expect(hasText("Android")).toBe(true);
  expect(hasText("游戏A")).toBe(false);

  // expand iOS -> its child groups appear (still collapsed)
  clickGroup("iOS");
  expect(hasText("游戏A")).toBe(true);
  expect(hasText("游戏B")).toBe(true);
  expect(hasText("渠道X")).toBe(false);

  // expand 游戏A -> leaf rows appear
  clickGroup("游戏A");
  expect(hasText("渠道X")).toBe(true);
  expect(hasText("渠道Y")).toBe(true);

  // collapse iOS -> the entire subtree (游戏A/B and 渠道X/Y) disappears
  clickGroup("iOS");
  expect(hasText("游戏A")).toBe(false);
  expect(hasText("游戏B")).toBe(false);
  expect(hasText("渠道X")).toBe(false);
});

test("re-expanding a group only reveals its direct children (descendants stay collapsed)", () => {
  renderPivot();
  // expand two levels under iOS
  clickGroup("iOS");
  clickGroup("游戏A");
  expect(hasText("渠道X")).toBe(true);

  // collapse iOS (cascades to descendants), then re-expand
  clickGroup("iOS");
  clickGroup("iOS");
  // direct children visible, deeper levels still collapsed
  expect(hasText("游戏A")).toBe(true);
  expect(hasText("游戏B")).toBe(true);
  expect(hasText("渠道X")).toBe(false);
  expect(hasText("渠道Y")).toBe(false);
});

test("each visible dimension label has a quick toggle for its lower-level dimensions", () => {
  renderPivot();
  // initially everything is collapsed, so only the top label row is visible
  expect(hasText("游戏A")).toBe(false);
  expect(
    screen.getByRole("button", { name: "展开全部下级维度" }),
  ).toBeInTheDocument();

  // expand all: every dimension label that has lower-level dimensions gets a
  // quick toggle (the deepest label has nothing below it)
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  expect(hasText("渠道X")).toBe(true);
  expect(
    screen.getAllByRole("button", { name: "折叠全部下级维度" }),
  ).toHaveLength(2);
});

test("quick toggle at a dimension level applies to all lower levels (2nd level -> 3rd and below)", () => {
  renderPivot();
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  expect(hasText("渠道X")).toBe(true);
  // all dimension-label columns are present
  expect(hasText("渠道商")).toBe(true);

  // collapse at the 2nd dimension (主游戏): 3rd-level detail hides, the
  // 2nd-level headers stay visible
  fireEvent.click(
    screen.getAllByRole("button", { name: "折叠全部下级维度" })[1],
  );
  expect(hasText("游戏A")).toBe(true);
  expect(hasText("游戏B")).toBe(true);
  expect(hasText("渠道X")).toBe(false);
  expect(hasText("渠道Y")).toBe(false);
  // the 3rd-level column label disappears with its rows
  expect(hasText("渠道商")).toBe(false);
  expect(hasText("主游戏")).toBe(true);

  // the 2nd-level quick toggle now offers expand again
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  expect(hasText("渠道X")).toBe(true);
  expect(hasText("渠道Y")).toBe(true);
  expect(hasText("渠道商")).toBe(true);
});

test("top-level quick toggle collapses/expands all lower-level dimensions", () => {
  renderPivot();
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  expect(hasText("渠道X")).toBe(true);

  // collapse at the 1st dimension (平台): hides every lower level
  fireEvent.click(
    screen.getAllByRole("button", { name: "折叠全部下级维度" })[0],
  );
  expect(hasText("游戏A")).toBe(false);
  expect(hasText("游戏B")).toBe(false);
  expect(hasText("渠道X")).toBe(false);
  // all lower-level label columns disappear as well
  expect(hasText("主游戏")).toBe(false);
  expect(hasText("渠道商")).toBe(false);
  expect(hasText("iOS")).toBe(true);
  expect(hasText("Android")).toBe(true);

  // expand everything again
  fireEvent.click(
    screen.getAllByRole("button", { name: "展开全部下级维度" })[0],
  );
  expect(hasText("渠道X")).toBe(true);
});

test("formatDateValue parses the supported date formats", () => {
  // ISO datetime strings keep their date part (no timezone day-shift)
  expect(formatDateValue("2024-06-03T16:00:00.000Z")).toBe("2024-06-03");
  expect(formatDateValue("2024/06/03")).toBe("2024-06-03");
  // YYYYMMDD integers
  expect(formatDateValue(20240603)).toBe("2024-06-03");
  // Unix timestamps
  expect(formatDateValue(1717372800000)).toBe("2024-06-03");
  expect(formatDateValue(1717372800)).toBe("2024-06-03");
  // non-dates pass through
  expect(formatDateValue("iOS")).toBeNull();
  expect(formatDateValue(12345)).toBeNull();
});

test("date dimension labels are formatted when dateColumns is provided", () => {
  const rows = [
    { 日期: "2024-06-03T00:00:00.000Z", 主游戏: "游戏A", "SUM(消耗)": 100 },
    { 日期: "2024-06-03T00:00:00.000Z", 主游戏: "游戏B", "SUM(消耗)": 50 },
    { 日期: "2024-06-04T00:00:00.000Z", 主游戏: "游戏A", "SUM(消耗)": 80 },
  ];
  renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["日期", "主游戏"]}
      groupbyColumns={[]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
      colTotals
      metricsLayout="COLUMNS"
      dateColumns={["日期"]}
    />,
  );
  // row-dimension labels show "YYYY-MM-DD" instead of the raw ISO string
  expect(hasText("2024-06-03")).toBe(true);
  expect(hasText("2024-06-04")).toBe(true);
  expect(hasText("T00:00:00")).toBe(false);
});

test("date column-dimension headers are formatted when dateColumns is provided", () => {
  const rows = [
    { 日期: 20240603, 主游戏: "游戏A", "SUM(消耗)": 100 },
    { 日期: 20240604, 主游戏: "游戏A", "SUM(消耗)": 80 },
  ];
  renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["主游戏"]}
      groupbyColumns={["日期"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
      colTotals
      metricsLayout="COLUMNS"
      dateColumns={["日期"]}
    />,
  );
  // column-dimension headers show "YYYY-MM-DD" instead of 20240603
  expect(hasText("2024-06-03")).toBe(true);
  expect(hasText("2024-06-04")).toBe(true);
  expect(hasText("20240603")).toBe(false);
});

test("subtotal rows show 汇总 only while lower-level dimensions are expanded", () => {
  renderPivot();
  // initially all collapsed: the top-level subtotal spans the single visible
  // level column and shows the plain label (no 汇总 without children shown)
  expect(screen.getByText("iOS").closest("td")?.getAttribute("colspan")).toBe(
    "1",
  );
  expect(hasText("iOS 汇总")).toBe(false);

  // expand everything: subtotal labels gain the 汇总 suffix and the
  // top-level subtotal spans all 3 level columns, the middle-level subtotal
  // spans its own + the remaining columns
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  expect(
    screen.getByText("iOS 汇总").closest("td")?.getAttribute("colspan"),
  ).toBe("3");
  expect(
    screen.getByText("游戏A 汇总").closest("td")?.getAttribute("colspan"),
  ).toBe("2");
  // ancestor value keeps its own column on deeper subtotal rows
  expect(screen.getByText("游戏A 汇总").closest("tr")?.textContent).toContain(
    "iOS",
  );

  // collapse 游戏A again: its subtotal row loses the 汇总 suffix
  clickGroup("游戏A");
  expect(hasText("游戏A 汇总")).toBe(false);
  expect(hasText("游戏A")).toBe(true);
  // the parent level still shows 汇总 (its children headers are visible)
  expect(hasText("iOS 汇总")).toBe(true);
});
