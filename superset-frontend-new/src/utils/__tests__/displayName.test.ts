import { formatPersonName } from "@/utils/displayName";
import { test, expect } from "vitest";

test("formats Latin names given-family with a space", () => {
  expect(formatPersonName({ first_name: "Zhifeng", last_name: "Mai" })).toBe(
    "Zhifeng Mai",
  );
});

test("formats CJK names surname-first without a space", () => {
  expect(formatPersonName({ first_name: "刘", last_name: "小涵" })).toBe(
    "刘小涵",
  );
});

test("falls back to username, email, or an empty string", () => {
  expect(formatPersonName({ username: "zhifeng.mai" })).toBe("zhifeng.mai");
  expect(formatPersonName({ email: "a@b.com" })).toBe("a@b.com");
  expect(formatPersonName({ first_name: "  " })).toBe("");
  expect(formatPersonName(null)).toBe("");
});
