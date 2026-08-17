import { test, expect, afterEach, vi } from "vitest";
import { verifyToken, resetTokenCache } from "../ws-auth.js";

process.env.FLASK_INTERNAL_URL = "http://test:8088";

afterEach(() => {
  resetTokenCache();
  vi.unstubAllGlobals();
});

function mockFetch(response: { ok: boolean; status: number; json?: unknown }) {
  const fn = vi.fn().mockResolvedValue({
    ok: response.ok,
    status: response.status,
    json: async () => response.json,
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

test("returns the username for a valid token", async () => {
  const fn = mockFetch({
    ok: true,
    status: 200,
    json: { result: { username: "alice" } },
  });
  const username = await verifyToken("valid-token");
  expect(username).toBe("alice");
  expect(fn).toHaveBeenCalledWith(
    "http://test:8088/api/v1/me/",
    expect.objectContaining({
      headers: { Authorization: "Bearer valid-token" },
    }),
  );
});

test("returns null for a rejected token", async () => {
  mockFetch({ ok: false, status: 401, json: {} });
  expect(await verifyToken("bad-token")).toBeNull();
});

test("returns null when the response has no username", async () => {
  mockFetch({ ok: true, status: 200, json: { result: {} } });
  expect(await verifyToken("no-user-token")).toBeNull();
});

test("returns null when Superset is unreachable", async () => {
  const fn = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
  vi.stubGlobal("fetch", fn);
  expect(await verifyToken("unreachable-token")).toBeNull();
});

test("returns null for an empty token", async () => {
  expect(await verifyToken("")).toBeNull();
});

test("caches verification results within the TTL window", async () => {
  const fn = mockFetch({
    ok: true,
    status: 200,
    json: { result: { username: "bob" } },
  });
  expect(await verifyToken("cached-token")).toBe("bob");
  expect(await verifyToken("cached-token")).toBe("bob");
  expect(fn).toHaveBeenCalledTimes(1);
});

test("re-fetches after the cache expires", async () => {
  const fn = mockFetch({
    ok: true,
    status: 200,
    json: { result: { username: "carol" } },
  });
  await verifyToken("expiring-token");
  vi.setSystemTime(Date.now() + 61_000);
  await verifyToken("expiring-token");
  expect(fn).toHaveBeenCalledTimes(2);
});
