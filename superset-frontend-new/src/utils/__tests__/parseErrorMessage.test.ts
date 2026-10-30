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

test("prefers localized fallback for raw axios transport errors", () => {
  expect(
    parseErrorMessage(
      new Error("Request failed with status code 401"),
      "用户名或密码错误",
    ),
  ).toBe("用户名或密码错误");
  expect(
    parseErrorMessage(new Error("Network Error"), "网络异常，请稍后重试"),
  ).toBe("网络异常，请稍后重试");
});
