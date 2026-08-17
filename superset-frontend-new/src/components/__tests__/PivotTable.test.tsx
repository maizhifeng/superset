import { test, expect } from "vitest";
import { createRef } from "react";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../spec/helpers/testing-library";
import PivotTable, {
  type PivotTableHandle,
} from "@/components/PivotTable";
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

test("fraction mode scales backend totals consistently with the fractioned cells", () => {
  const rows = [
    { 国家: "US", 平台: "iOS", "SUM(消耗)": 100 },
    { 国家: "US", 平台: "Android", "SUM(消耗)": 200 },
    { 国家: "CN", 平台: "iOS", "SUM(消耗)": 300 },
    { 国家: "CN", 平台: "Android", "SUM(消耗)": 400 },
  ];
  renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["国家"]}
      groupbyColumns={["平台"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum as Fraction of Total"
      colTotals
      rowTotals
      metricsLayout="COLUMNS"
      totalRows={[
        { 平台: "iOS", "SUM(消耗)": 400 },
        { 平台: "Android", "SUM(消耗)": 600 },
      ]}
    />,
  );
  // cells are fractioned by the raw grand total (1000)
  expect(hasText("0.1")).toBe(true);
  expect(hasText("0.4")).toBe(true);
  // the backend-provided totals row is scaled by the same denominator, so it
  // matches the fractioned column sums (0.4 / 0.6) instead of raw 400 / 600
  const totalsRow = screen
    .getAllByText("合计")
    .map((el) => el.closest("tr") as HTMLElement)
    .find((tr) => tr.textContent?.includes("0.6")) as HTMLElement;
  const cells = Array.from(totalsRow.querySelectorAll("td"));
  expect(cells.some((td) => td.textContent === "0.4")).toBe(true);
  expect(cells.some((td) => td.textContent === "0.6")).toBe(true);
  expect(cells.some((td) => td.textContent === "400")).toBe(false);
  // grand total shows the fractioned grand total (1)
  expect(cells.some((td) => td.textContent === "1")).toBe(true);
});

test("pct95 with a date row dimension renders groups in chronological order", () => {
  const rows = [
    { 平台: "iOS", 日期: "2024-06-05", "SUM(消耗)": 600 },
    { 平台: "iOS", 日期: "2024-06-03", "SUM(消耗)": 300 },
    { 平台: "iOS", 日期: "2024-06-04", "SUM(消耗)": 100 },
  ];
  const { container } = renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["平台", "日期"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
      dateColumns={["日期"]}
      pct95={{ enabled: true, metric: "SUM(消耗)", threshold: 0.95 }}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  // detail rows follow date ascending (2024-06-03 → 06-05), not the metric
  // descending order (600, 300, 100) the 95% mode would otherwise apply
  const dateRows = Array.from(container.querySelectorAll("tbody tr"))
    .map((tr) => tr.textContent ?? "")
    .filter((t) => t.includes("2024-06"));
  expect(dateRows[0]).toContain("2024-06-03");
  expect(dateRows[1]).toContain("2024-06-04");
  expect(dateRows[2]).toContain("2024-06-05");
});

test("pct95 with a date row dimension sorts collapsed groups by the split metric", () => {
  const rows = [
    { 平台: "iOS", 日期: "2024-06-03", "SUM(消耗)": 300 },
    { 平台: "iOS", 日期: "2024-06-04", "SUM(消耗)": 250 },
    { 平台: "Android", 日期: "2024-06-01", "SUM(消耗)": 400 },
    { 平台: "Android", 日期: "2024-06-02", "SUM(消耗)": 600 },
  ];
  const { container } = renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["平台", "日期"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
      dateColumns={["日期"]}
      pct95={{ enabled: true, metric: "SUM(消耗)", threshold: 0.95 }}
    />,
  );
  // everything is collapsed: non-date groups rank by the split metric
  // descending (Android 1000 > iOS 550), not by appearance order
  const firstRow = container.querySelector("tbody tr") as HTMLElement;
  expect(firstRow.textContent).toContain("Android");

  // expanding all keeps the chronological detail order inside each group
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  const dateRows = Array.from(container.querySelectorAll("tbody tr"))
    .map((tr) => tr.textContent ?? "")
    .filter((t) => t.includes("2024-06"));
  expect(dateRows[0]).toContain("2024-06-01");
  expect(dateRows[1]).toContain("2024-06-02");
  expect(dateRows[2]).toContain("2024-06-03");
  expect(dateRows[3]).toContain("2024-06-04");
});

test("dragging a header resize handle changes the column width", () => {
  const rows = [
    { 平台: "iOS", "SUM(消耗)": 100 },
    { 平台: "Android", "SUM(消耗)": 300 },
  ];
  const { container } = renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["平台"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
    />,
  );
  const handle = container.querySelector(
    '[data-resize-key="v-0"]',
  ) as HTMLElement;
  expect(handle).not.toBeNull();
  const headerCell = screen.getByText("消耗").closest("th") as HTMLElement;
  const before = parseFloat(headerCell.style.minWidth || "90");

  // drag the handle 40px to the right: a boundary indicator line follows
  // the pointer while dragging, then disappears on release
  fireEvent.mouseDown(handle, { clientX: 100 });
  fireEvent.mouseMove(window, { clientX: 140 });
  const indicator = container.querySelector(
    '[data-testid="resize-indicator"]',
  ) as HTMLElement;
  expect(indicator).not.toBeNull();
  expect(indicator.style.left).toBe("139px");
  fireEvent.mouseUp(window);
  expect(
    container.querySelector('[data-testid="resize-indicator"]'),
  ).toBeNull();

  const after = parseFloat(headerCell.style.minWidth);
  expect(after).toBeGreaterThanOrEqual(before + 39);
});

test("virtualizes the body once the container has a viewport", () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({
    平台: `p${i}`,
    "SUM(消耗)": i,
  }));
  const { container } = renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["平台"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
    />,
  );
  const scrollable = container.querySelector(
    ".MuiTableContainer-root",
  ) as HTMLElement;
  expect(scrollable).not.toBeNull();
  // give the container a viewport and scroll down; without it (jsdom default)
  // the full body renders, so this only runs when virtualization kicks in
  Object.defineProperty(scrollable, "clientHeight", {
    value: 100,
    configurable: true,
  });
  Object.defineProperty(scrollable, "scrollTop", {
    value: 1000,
    configurable: true,
  });
  fireEvent.scroll(scrollable);
  const bodyRows = Array.from(container.querySelectorAll("tbody tr"));
  // only a window around scrollTop is rendered instead of all 300 rows
  expect(bodyRows.length).toBeLessThan(100);
  expect(bodyRows.length).toBeGreaterThan(20);
  const text = bodyRows.map((tr) => tr.textContent ?? "").join("|");
  expect(text).not.toContain("p0");
  expect(text).toContain("p40");
  expect(text).not.toContain("p299");
});

test("detail rows use a smaller font than headers and subtotal rows", () => {
  const rows = [
    { 平台: "iOS", 主游戏: "游戏A", "SUM(消耗)": 100 },
    { 平台: "iOS", 主游戏: "游戏B", "SUM(消耗)": 200 },
  ];
  renderWithProviders(
    <PivotTable
      data={rows}
      groupbyRows={["平台", "主游戏"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));

  // header cell: base size
  const headerCell = screen.getByText("消耗").closest("th") as HTMLElement;
  expect(headerCell.style.fontSize).toBe("0.7rem");

  // subtotal row cells: base size
  const subtotalRow = screen
    .getByText("iOS 汇总")
    .closest("tr") as HTMLElement;
  const subtotalFonts = Array.from(subtotalRow.querySelectorAll("td")).map(
    (td) => td.style.fontSize,
  );

  expect(subtotalFonts.length).toBeGreaterThan(0);
  expect(subtotalFonts.every((f) => f === "0.7rem")).toBe(true);

  // detail rows: slightly smaller
  const detailFonts = Array.from(
    screen.getByText("iOS 汇总").closest("table")!.querySelectorAll("tbody tr"),
  )
    .filter(
      (tr) =>
        tr.textContent?.includes("游戏A") && !tr.textContent?.includes("汇总"),
    )
    .flatMap((tr) => Array.from(tr.querySelectorAll("td")))
    .map((td) => td.style.fontSize);
  expect(detailFonts.length).toBeGreaterThan(0);
  expect(detailFonts.every((f) => f === "0.65rem")).toBe(true);
});

test("getLayoutText copies the current visible layout, not all detail rows", () => {
  const ref = createRef<PivotTableHandle>();
  const rows = [
    { 平台: "iOS", 主游戏: "游戏A", 渠道商: "渠道X", "SUM(消耗)": 100 },
    { 平台: "iOS", 主游戏: "游戏A", 渠道商: "渠道Y", "SUM(消耗)": 50 },
    { 平台: "iOS", 主游戏: "游戏B", 渠道商: "渠道X", "SUM(消耗)": 30 },
    { 平台: "Android", 主游戏: "游戏C", 渠道商: "渠道X", "SUM(消耗)": 80 },
  ];
  renderWithProviders(
    <PivotTable
      ref={ref}
      data={rows}
      groupbyRows={["平台", "主游戏", "渠道商"]}
      metrics={["SUM(消耗)"]}
      aggregateFunction="Sum"
      colTotals
      metricsLayout="COLUMNS"
    />,
  );
  // default: everything collapsed → only the top-level subtotal rows and the
  // totals row, formatted like the table (subtotal sums, formatted values)
  const collapsedLines = ref.current!.getLayoutText()!.split("\n");
  expect(collapsedLines).toHaveLength(4);
  expect(collapsedLines[0]).toBe("平台\tSUM(消耗)");
  expect(collapsedLines[1]).toContain("iOS");
  expect(collapsedLines[1]).toContain("180");
  expect(collapsedLines[3]).toContain("合计");
  expect(collapsedLines[3]).toContain("260");
  expect(ref.current!.getLayoutText()!).not.toContain("游戏A");

  // expanding reveals the detail rows in the copied layout
  fireEvent.click(screen.getByRole("button", { name: "展开全部下级维度" }));
  const expanded = ref.current!.getLayoutText()!;
  expect(expanded).toContain("游戏A");
  expect(expanded).toContain("渠道X");
  expect(expanded).toContain("渠道Y");
  expect(expanded).toContain("100");
  expect(expanded).toContain("80");
});
