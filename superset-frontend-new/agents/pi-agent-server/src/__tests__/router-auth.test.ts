import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { handleConnection } from "../router.js";
import { verifyToken } from "../ws-auth.js";
import { setWsVerifiedUser } from "../session-store.js";

vi.mock("../ws-auth.js", () => ({
  verifyToken: vi.fn(),
}));

class FakeWS extends EventEmitter {
  readyState = 1;
  static OPEN = 1;
  sent: string[] = [];

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.emit("close");
  }
}

function emitJson(ws: FakeWS, msg: unknown): void {
  ws.emit("message", Buffer.from(JSON.stringify(msg)));
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function parsedSent(ws: FakeWS): Array<Record<string, unknown>> {
  return ws.sent.map((s) => JSON.parse(s));
}

const sessionFactory = vi.fn().mockResolvedValue({ dispose: vi.fn() });

beforeEach(() => {
  vi.mocked(verifyToken).mockReset();
  vi.mocked(verifyToken).mockResolvedValue("alice");
  sessionFactory.mockClear();
  setWsVerifiedUser({} as never, undefined as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("rejects new_session without a verified token", async () => {
  vi.mocked(verifyToken).mockResolvedValue(null);
  const ws = new FakeWS();
  handleConnection(ws, sessionFactory, [], undefined, "default");

  emitJson(ws, { type: "new_session", storeSessionId: "s1" });
  await flush();

  const errors = parsedSent(ws).filter((m) => m.type === "error");
  expect(errors.length).toBeGreaterThan(0);
  expect(String(errors[0].message)).toContain("未认证");
  expect(sessionFactory).not.toHaveBeenCalled();
});

test("rejects prompt without a verified token", async () => {
  vi.mocked(verifyToken).mockResolvedValue(null);
  const ws = new FakeWS();
  handleConnection(ws, sessionFactory, [], undefined, "default");

  emitJson(ws, { type: "prompt", message: "查一下数据" });
  await flush();

  const errors = parsedSent(ws).filter((m) => m.type === "error");
  expect(String(errors[0].message)).toContain("未认证");
  expect(sessionFactory).not.toHaveBeenCalled();
});

test("creates a session after successful auth, using the verified username", async () => {
  const ws = new FakeWS();
  handleConnection(ws, sessionFactory, [], undefined, "default");

  emitJson(ws, { type: "auth", access_token: "valid-token" });
  emitJson(ws, { type: "new_session", storeSessionId: "s1" });
  await flush();

  expect(verifyToken).toHaveBeenCalledWith("valid-token");
  expect(sessionFactory).toHaveBeenCalledWith("alice", ws);
  const created = parsedSent(ws).filter((m) => m.type === "session_created");
  expect(created.length).toBeGreaterThan(0);
});

test("verifies the token passed via the connection query parameter", async () => {
  const ws = new FakeWS();
  handleConnection(ws, sessionFactory, [], "query-token", "default");

  emitJson(ws, { type: "new_session", storeSessionId: "s1" });
  await flush();

  expect(verifyToken).toHaveBeenCalledWith("query-token");
  expect(sessionFactory).toHaveBeenCalledWith("alice", ws);
});

test("does not trust a client-supplied user_id", async () => {
  const ws = new FakeWS();
  handleConnection(ws, sessionFactory, [], "valid-token", "default");

  emitJson(ws, {
    type: "new_session",
    storeSessionId: "s1",
    user_id: "attacker",
  });
  await flush();

  // Identity comes from the verified token, not the message payload
  expect(sessionFactory).toHaveBeenCalledWith("alice", ws);
});
