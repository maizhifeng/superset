import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { test, expect } from "vitest";

test("returns Error message for Error instances", () => {
  expect(parseErrorMessage(new Error("Something broke"))).toBe(
    "Something broke",
  );
});

test("returns message from API error response", () => {
  const apiErr = {
    response: {
      data: { message: "Validation failed" },
    },
  };
  expect(parseErrorMessage(apiErr)).toBe("Validation failed");
});

test("returns fallback for unknown error shapes", () => {
  expect(parseErrorMessage("just a string")).toBe("An error occurred");
  expect(parseErrorMessage(null)).toBe("An error occurred");
  expect(parseErrorMessage(undefined)).toBe("An error occurred");
  expect(parseErrorMessage(42)).toBe("An error occurred");
});

test("returns custom fallback when provided", () => {
  expect(parseErrorMessage({}, "Custom fallback")).toBe("Custom fallback");
});

test("prefers direct Error message over fallback", () => {
  expect(parseErrorMessage(new Error("Explicit error"), "Fallback")).toBe(
    "Explicit error",
  );
});
