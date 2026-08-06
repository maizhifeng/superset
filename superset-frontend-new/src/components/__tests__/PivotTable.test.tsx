import { test, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../spec/helpers/testing-library";
import PivotTable from "@/components/PivotTable";

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

// Row-header cells nest the label in a span inside several boxes, so
// getByText matches multiple elements; also, expanded groups repeat ancestor
// labels as inherited cells. Click the collapse toggle of the group header
// that actually owns the label.
const hasText = (t: string) => screen.queryAllByText(t).length > 0;

function clickGroup(label: string) {
  const matches = screen.queryAllByText(label);
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
