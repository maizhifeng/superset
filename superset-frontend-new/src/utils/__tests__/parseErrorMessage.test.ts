import { parseErrorMessage } from "@/utils/parseErrorMessage";
import { test, expect } from "vitest";

test("returns Error message for Error instances", () => {
  expect(parseErrorMessage(new Error("Something broke"))).toBe(
    "Something broke",
  );
});

test("returns informative message from API error response", () => {
  const apiErr = {
    response: {
      data: { message: "Validation failed" },
    },
  };
  expect(parseErrorMessage(apiErr)).toBe("Validation failed");
});

test("returns Superset errors[] messages instead of a vague fallback", () => {
  const apiErr = {
    response: {
      status: 400,
      data: {
        errors: [
          { message: "Syntax error near FROM", error_type: "SYNTAX_ERROR" },
          { message: "Line 1", error_type: "SYNTAX_ERROR" },
        ],
      },
    },
  };
  expect(parseErrorMessage(apiErr, "执行查询时发生错误")).toBe(
    "Syntax error near FROM；Line 1",
  );
});

test("maps vague 403 payloads to an explicit permission message", () => {
  const apiErr = {
    response: { status: 403, data: { message: "Forbidden" } },
  };
  const message = parseErrorMessage(apiErr, "执行查询时发生错误");
  expect(message).toContain("权限");
  expect(message).not.toMatch(/Forbidden/i);
});

test("maps 429, 404 and 5xx to explicit messages", () => {
  expect(parseErrorMessage({ response: { status: 429, data: {} } })).toContain(
    "频繁",
  );
  expect(parseErrorMessage({ response: { status: 404, data: {} } })).toContain(
    "不存在",
  );
  expect(parseErrorMessage({ response: { status: 502, data: {} } })).toContain(
    "HTTP 502",
  );
});

test("maps raw axios transport errors by status instead of showing fallback", () => {
  expect(
    parseErrorMessage(
      new Error("Request failed with status code 401"),
      "用户名或密码错误",
    ),
  ).toBe("登录状态已过期，请重新登录");
  expect(
    parseErrorMessage(new Error("Network Error"), "网络异常，请稍后重试"),
  ).toBe("网络异常，请检查网络连接后重试");
});

test("maps timeout errors to explicit wording", () => {
  const apiErr = {
    code: "ECONNABORTED",
    message: "timeout of 300000ms exceeded",
  };
  expect(parseErrorMessage(apiErr, "执行查询时发生错误")).toContain("超时");
});

test("ignores vague backend messages and uses the status mapping", () => {
  expect(
    parseErrorMessage({
      response: { status: 500, data: { message: "Internal Server Error" } },
    }),
  ).toContain("服务端错误（HTTP 500）");
});

test("returns fallback for unknown error shapes", () => {
  expect(parseErrorMessage("just a string")).toBe("操作失败，请稍后重试");
  expect(parseErrorMessage(null)).toBe("操作失败，请稍后重试");
  expect(parseErrorMessage(undefined)).toBe("操作失败，请稍后重试");
  expect(parseErrorMessage(42)).toBe("操作失败，请稍后重试");
});

test("returns custom fallback when provided", () => {
  expect(parseErrorMessage({}, "Custom fallback")).toBe("Custom fallback");
});

test("prefers direct Error message over fallback", () => {
  expect(parseErrorMessage(new Error("Explicit error"), "Fallback")).toBe(
    "Explicit error",
  );
});
