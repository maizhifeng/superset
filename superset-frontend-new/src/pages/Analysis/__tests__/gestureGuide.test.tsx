import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import AnalysisGestureGuide from "@/pages/Analysis/components/AnalysisGestureGuide";

const STORAGE_KEY = "analysis-gesture-guide-test-v1";
const ANCHOR = { left: 12, top: 24 };

beforeEach(() => {
  localStorage.removeItem(STORAGE_KEY);
});

test("shows a textless hand gesture and remembers the dismissal", () => {
  const onDismiss = vi.fn();
  const { unmount } = render(
    <AnalysisGestureGuide
      storageKey={STORAGE_KEY}
      anchor={ANCHOR}
      ariaLabel="点击异常处查看构成"
      onDismiss={onDismiss}
    />,
  );

  const hand = screen.getByRole("button", { name: "点击异常处查看构成" });
  // Gesture only: a pointing hand icon, no explanatory copy.
  expect(hand.textContent?.trim()).toBe("");
  fireEvent.click(hand);
  expect(onDismiss).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByRole("button", { name: "点击异常处查看构成" }),
  ).not.toBeInTheDocument();
  expect(localStorage.getItem(STORAGE_KEY)).toBe("1");

  unmount();
  render(
    <AnalysisGestureGuide
      storageKey={STORAGE_KEY}
      anchor={ANCHOR}
      ariaLabel="点击异常处查看构成"
    />,
  );
  // Dismissed once → hidden on the next visit.
  expect(
    screen.queryByRole("button", { name: "点击异常处查看构成" }),
  ).not.toBeInTheDocument();
});

test("stays hidden without an anchor or when not relevant", () => {
  render(
    <AnalysisGestureGuide
      storageKey={STORAGE_KEY}
      anchor={null}
      ariaLabel="点击异常处查看构成"
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();

  render(
    <AnalysisGestureGuide
      storageKey={STORAGE_KEY}
      anchor={ANCHOR}
      visible={false}
      ariaLabel="点击异常处查看构成"
    />,
  );
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});
