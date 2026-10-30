import { render } from "@testing-library/react";
import { test, expect, vi } from "vitest";
import { getAnalysisTopic } from "@/pages/Analysis/topics";

const captured = vi.hoisted(() => ({
  sortingOrder: undefined as readonly (string | null)[] | undefined,
  initialState: undefined as
    | {
        sorting?: { sortModel?: { field: string; sort: string }[] };
      }
    | undefined,
  onRowClick: undefined as
    ((params: { row: Record<string, unknown> }) => void) | undefined,
}));

vi.mock("@/components/DataGridTable", () => ({
  default: (props: {
    sortingOrder?: readonly (string | null)[];
    initialState?: {
      sorting?: { sortModel?: { field: string; sort: string }[] };
    };
    onRowClick?: (params: { row: Record<string, unknown> }) => void;
  }) => {
    captured.sortingOrder = props.sortingOrder;
    captured.initialState = props.initialState;
    captured.onRowClick = props.onRowClick;
    return <div data-testid="grid" />;
  },
}));

import AnalysisBreakdownTable from "@/pages/Analysis/components/AnalysisBreakdownTable";

test("sorts descending, then ascending, then back to the initial state", () => {
  const topic = getAnalysisTopic("cost")!;
  render(
    <AnalysisBreakdownTable
      topic={topic}
      dimension="主游戏"
      onDimensionChange={() => {}}
      loading={false}
      rows={[{ 主游戏: "游戏 A", 返点后消耗: 100 }]}
    />,
  );

  expect(captured.sortingOrder).toEqual(["desc", "asc", null]);
  expect(captured.initialState?.sorting?.sortModel).toEqual([
    { field: "返点后消耗", sort: "desc" },
  ]);
});

test("drills into a dimension value when a row is clicked", () => {
  const topic = getAnalysisTopic("cost")!;
  const onDrill = vi.fn();
  render(
    <AnalysisBreakdownTable
      topic={topic}
      dimension="主游戏"
      onDimensionChange={() => {}}
      onDrill={onDrill}
      loading={false}
      rows={[{ 主游戏: "游戏 A", 返点后消耗: 100 }]}
    />,
  );

  captured.onRowClick?.({ row: { __dimension: "游戏 A" } });
  expect(onDrill).toHaveBeenCalledWith("主游戏", "游戏 A");
});
