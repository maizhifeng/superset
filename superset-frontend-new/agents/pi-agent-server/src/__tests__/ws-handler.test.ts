import { test, expect, vi } from "vitest";
import { executeQuerySuperset } from "../tools/querySuperset.js";

process.env.FLASK_INTERNAL_URL = "http://test:8088";

vi.mock("../tools/querySuperset.js", () => ({
  executeQuerySuperset: vi.fn(),
}));

test("executeQuerySuperset is called with correct args", async () => {
  vi.mocked(executeQuerySuperset).mockResolvedValueOnce(
    "渠道商 | 消耗\n--- | ---\n微信小游戏 | 1000"
  );

  const result = await executeQuerySuperset(
    {
      columns: ["渠道商"],
      metrics: ["SUM(消耗)"],
      time_range: "Last 7 days",
    },
    "test-user"
  );

  expect(result).toContain("微信小游戏");
  expect(result).toContain("1000");
  expect(executeQuerySuperset).toHaveBeenCalledWith(
    expect.objectContaining({
      columns: ["渠道商"],
      metrics: ["SUM(消耗)"],
    }),
    "test-user"
  );
});

test("ws-handler module loads", async () => {
  const ws = await import("../ws-handler.js");
  expect(ws).toBeDefined();
  expect(typeof ws.handleConnection).toBe("function");
});
