/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import { test, expect, vi } from "vitest";
import { executeQuerySuperset } from "../tools/querySuperset.js";

process.env.FLASK_INTERNAL_URL = "http://test:8088";

vi.mock("../tools/querySuperset.js", () => ({
  executeQuerySuperset: vi.fn(),
}));

test("executeQuerySuperset is called with correct args", async () => {
  vi.mocked(executeQuerySuperset).mockResolvedValueOnce(
    "渠道商 | 消耗\n--- | ---\n微信小游戏 | 1000",
  );

  const context = { userId: "test-user", token: "test-token", datasetId: 26 };
  const result = await executeQuerySuperset(
    {
      columns: ["渠道商"],
      metrics: ["SUM(消耗)"],
      time_range: "Last 7 days",
    },
    context,
  );

  expect(result).toContain("微信小游戏");
  expect(result).toContain("1000");
  expect(executeQuerySuperset).toHaveBeenCalledWith(
    expect.objectContaining({
      columns: ["渠道商"],
      metrics: ["SUM(消耗)"],
    }),
    context,
  );
});

test("ws-handler module loads", async () => {
  const ws = await import("../ws-handler.js");
  expect(ws).toBeDefined();
  expect(typeof ws.handleConnection).toBe("function");
});
