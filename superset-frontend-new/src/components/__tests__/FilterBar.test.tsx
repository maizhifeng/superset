import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FilterBar from "@/components/FilterBar";
import { test, expect, vi, beforeEach } from "vitest";

beforeEach(() => {
  vi.useFakeTimers();
});

test("renders with initial value", () => {
  render(<FilterBar value="test" onChange={vi.fn()} />);
  const input = screen.getByRole("textbox");
  expect(input).toHaveValue("test");
});

test("calls onChange after debounce delay", () => {
  const onChange = vi.fn();
  render(<FilterBar value="" onChange={onChange} />);

  const input = screen.getByRole("textbox");
  act(() => {
    input.focus();
  });

  // Fire input event via userEvent
  act(() => {
    input.setAttribute("value", "chart");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });

  // Should not have called yet (debounced)
  expect(onChange).not.toHaveBeenCalledWith("chart");

  // Advance timers past debounce (300ms)
  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(onChange).toHaveBeenCalledWith("chart");
});

test("clear button resets value", () => {
  const onChange = vi.fn();
  render(<FilterBar value="searching" onChange={onChange} />);

  const clearButton = screen.getByRole("button");
  userEvent.click(clearButton);

  expect(onChange).toHaveBeenCalledWith("");
});

test("renders with custom placeholder", () => {
  render(
    <FilterBar value="" onChange={vi.fn()} placeholder="Find charts..." />,
  );
  expect(screen.getByPlaceholderText("Find charts...")).toBeInTheDocument();
});

test("updates local value when value prop changes", () => {
  const { rerender } = render(<FilterBar value="old" onChange={vi.fn()} />);
  rerender(<FilterBar value="new" onChange={vi.fn()} />);
  expect(screen.getByRole("textbox")).toHaveValue("new");
});
