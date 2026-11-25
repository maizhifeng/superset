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

import { test, expect, vi, beforeEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSqlLab } from "@/pages/SqlLab/useSqlLab";
import { useNotificationStore } from "@/store/notificationStore";
import api from "@/api";
import type { QueryResult } from "@/types/api";

vi.mock("@/store/authStore", () => ({
  useAuthStore: (
    selector: (state: { user: { username: string } }) => unknown,
  ) => selector({ user: { username: "alice" } }),
}));

vi.mock("@/api", () => ({
  default: {
    get: vi.fn(() => Promise.resolve({ data: { result: [] } })),
    post: vi.fn(),
  },
  QUERY_TIMEOUT_MS: 300_000,
}));

const postMock = api.post as unknown as Mock;
const getMock = api.get as unknown as Mock;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

type ExecuteResponse = { data: QueryResult };

function okResult(one: number): ExecuteResponse {
  return {
    data: {
      status: "success",
      columns: [{ name: "one" }],
      data: [{ one }],
    },
  };
}

function executionSignal(callIndex = 0): AbortSignal {
  const config = postMock.mock.calls[callIndex]?.[2] as {
    signal: AbortSignal;
  };
  return config.signal;
}

/** Render the hook with a database/SQL already available so runs can start. */
function renderSqlLab() {
  return renderHook(() =>
    useSqlLab({ initialDatabaseId: 2, initialSql: "SELECT 1 AS one" }),
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  postMock.mockReset();
  getMock.mockReset();
  getMock.mockImplementation(() => Promise.resolve({ data: { result: [] } }));
  localStorage.clear();
});

/**
 * 让 hook 的数据库列表返回一个带 engine 的数据库（格式化按引擎选方言）。
 * `/database/?q=...` 返回库列表，其余 schema/table 类请求返回空列表。
 */
function mockDatabases(): void {
  getMock.mockImplementation((url: string) =>
    Promise.resolve({
      data: {
        result:
          url.startsWith("/database/") && !url.startsWith("/database/2/")
            ? [{ id: 2, database_name: "aliyun", backend: "postgresql" }]
            : [],
      },
    }),
  );
}

test("an older failure is dropped after a newer success", async () => {
  const older = deferred<ExecuteResponse>();
  const newer = deferred<ExecuteResponse>();
  postMock
    .mockImplementationOnce(() => older.promise)
    .mockImplementationOnce(() => newer.promise);

  const { result } = renderSqlLab();
  await act(async () => {});

  let olderRun: Promise<void> = Promise.resolve();
  let newerRun: Promise<void> = Promise.resolve();
  act(() => {
    olderRun = result.current.handleRun();
    newerRun = result.current.handleRunSql("SELECT 2 AS two");
  });
  expect(postMock).toHaveBeenCalledTimes(2);
  expect(result.current.loading).toBe(true);

  // The newer run succeeds first and owns the UI state.
  await act(async () => {
    newer.resolve(okResult(2));
    await newerRun;
  });
  expect(result.current.result?.data).toEqual([{ one: 2 }]);
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(false);

  // The superseded run fails afterwards; its error must not leak in.
  await act(async () => {
    older.reject(new Error("cold start race"));
    await olderRun;
  });
  expect(result.current.result?.data).toEqual([{ one: 2 }]);
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(false);
});

test("an older success is dropped after a newer failure", async () => {
  const older = deferred<ExecuteResponse>();
  const newer = deferred<ExecuteResponse>();
  postMock
    .mockImplementationOnce(() => older.promise)
    .mockImplementationOnce(() => newer.promise);

  const { result } = renderSqlLab();
  await act(async () => {});

  let olderRun: Promise<void> = Promise.resolve();
  let newerRun: Promise<void> = Promise.resolve();
  act(() => {
    olderRun = result.current.handleRunSql("SELECT 1 AS old");
    newerRun = result.current.handleRunSql("SELECT 2 AS new");
  });

  await act(async () => {
    newer.reject(new Error("query rejected"));
    await newerRun;
  });
  expect(result.current.error).toBe("query rejected");
  expect(result.current.result).toBeNull();

  // The superseded success arriving later must not clear the error / show data.
  await act(async () => {
    older.resolve(okResult(1));
    await olderRun;
  });
  expect(result.current.error).toBe("query rejected");
  expect(result.current.result).toBeNull();
  expect(result.current.loading).toBe(false);
  // A dropped execution must not be recorded as a recent query either.
  expect(result.current.recentQueries).toEqual([]);
});

test("an older request settling does not clear the newer request's loading", async () => {
  const older = deferred<ExecuteResponse>();
  const newer = deferred<ExecuteResponse>();
  postMock
    .mockImplementationOnce(() => older.promise)
    .mockImplementationOnce(() => newer.promise);

  const { result } = renderSqlLab();
  await act(async () => {});

  let olderRun: Promise<void> = Promise.resolve();
  let newerRun: Promise<void> = Promise.resolve();
  act(() => {
    olderRun = result.current.handleRun();
    newerRun = result.current.handleRunSql("SELECT 2 AS two");
  });

  // The older run settles while the newer one is still in flight.
  await act(async () => {
    older.resolve(okResult(1));
    await olderRun;
  });
  expect(result.current.loading).toBe(true);
  expect(result.current.result).toBeNull();

  await act(async () => {
    newer.resolve(okResult(2));
    await newerRun;
  });
  expect(result.current.loading).toBe(false);
  expect(result.current.result?.data).toEqual([{ one: 2 }]);
});

test("success clears the previous error and failure clears the previous result", async () => {
  postMock
    .mockRejectedValueOnce(new Error("first failure"))
    .mockResolvedValueOnce(okResult(1))
    .mockRejectedValueOnce(new Error("second failure"));

  const { result } = renderSqlLab();
  await act(async () => {});

  await act(async () => {
    await result.current.handleRun();
  });
  expect(result.current.error).toBe("first failure");
  expect(result.current.result).toBeNull();

  await act(async () => {
    await result.current.handleRun();
  });
  expect(result.current.error).toBeNull();
  expect(result.current.result?.data).toEqual([{ one: 1 }]);

  await act(async () => {
    await result.current.handleRun();
  });
  expect(result.current.error).toBe("second failure");
  expect(result.current.result).toBeNull();
});

test("handleRun does not record recent queries while handleRunSql does", async () => {
  postMock.mockResolvedValue(okResult(1));

  const { result } = renderSqlLab();
  await act(async () => {});

  await act(async () => {
    await result.current.handleRun();
  });
  expect(result.current.recentQueries).toEqual([]);

  await act(async () => {
    await result.current.handleRunSql("SELECT 7 AS seven");
  });
  expect(result.current.recentQueries[0]).toBe("SELECT 7 AS seven");
});

test("format uses the shared dialect-aware formatter (uppercase keywords)", async () => {
  mockDatabases();
  const { result } = renderSqlLab();
  await act(async () => {});
  await act(async () => {});

  act(() => result.current.setSql("select a,b,count(*) as c from t where x=1"));
  act(() => result.current.handleFormatSql());

  // 与数据集编辑页一致：方言感知 + 关键字大写 + 2 空格缩进 + 换行。
  expect(result.current.sql).toContain("SELECT\n");
  expect(result.current.sql).toContain("FROM\n");
  expect(result.current.sql).toContain("count(*) AS c");
  expect(result.current.sql).not.toMatch(/\bselect\b/);
});

test("format keeps the original SQL and notifies when parsing fails", async () => {
  mockDatabases();
  const notifySpy = vi.spyOn(useNotificationStore.getState(), "notify");
  const { result } = renderSqlLab();
  await act(async () => {});
  await act(async () => {});

  act(() => result.current.setSql("select ( from t"));
  act(() => result.current.handleFormatSql());

  expect(result.current.sql).toBe("select ( from t");
  expect(notifySpy).toHaveBeenCalledWith(
    expect.objectContaining({
      severity: "error",
      message: "SQL 解析失败，暂时无法格式化",
    }),
  );
});

test("shows an explicit permission message when execute returns 403", async () => {
  postMock.mockRejectedValue({
    response: { status: 403, data: { message: "Forbidden" } },
  });
  const { result } = renderSqlLab();
  await act(async () => {});

  await act(async () => {
    await result.current.handleRun();
  });

  expect(result.current.error).toContain("sql_lab");
  expect(result.current.error).toContain("权限");
  expect(result.current.error).not.toMatch(/Forbidden/i);
});

test("shows an explicit rate-limit message when execute returns 429", async () => {
  postMock.mockRejectedValue({ response: { status: 429, data: {} } });
  const { result } = renderSqlLab();
  await act(async () => {});

  await act(async () => {
    await result.current.handleRun();
  });

  expect(result.current.error).toContain("频繁");
  expect(result.current.error).toContain("429");
});

test("stop aborts the active request and ignores its late success", async () => {
  const request = deferred<ExecuteResponse>();
  postMock.mockReturnValueOnce(request.promise);
  const { result } = renderSqlLab();
  await act(async () => {});

  let run: Promise<void> = Promise.resolve();
  act(() => {
    run = result.current.handleRunSql("SELECT 1 AS one");
  });
  const signal = executionSignal();
  expect(signal.aborted).toBe(false);
  expect(result.current.loading).toBe(true);

  act(() => result.current.stopQuery());

  expect(signal.aborted).toBe(true);
  expect(result.current.loading).toBe(false);

  await act(async () => {
    request.resolve(okResult(1));
    await run;
  });

  expect(result.current.result).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(false);
  expect(result.current.recentQueries).toEqual([]);
});

test("stop suppresses the aborted request's rejection", async () => {
  const request = deferred<ExecuteResponse>();
  postMock.mockReturnValueOnce(request.promise);
  const { result } = renderSqlLab();
  await act(async () => {});

  let run: Promise<void> = Promise.resolve();
  act(() => {
    run = result.current.handleRun();
  });
  act(() => result.current.stopQuery());

  await act(async () => {
    request.reject(
      new DOMException("The operation was aborted.", "AbortError"),
    );
    await run;
  });

  expect(result.current.error).toBeNull();
  expect(result.current.result).toBeNull();
  expect(result.current.loading).toBe(false);
});

test("a new run aborts the previous request and stop aborts only the latest", async () => {
  const older = deferred<ExecuteResponse>();
  const newer = deferred<ExecuteResponse>();
  postMock
    .mockReturnValueOnce(older.promise)
    .mockReturnValueOnce(newer.promise);
  const { result } = renderSqlLab();
  await act(async () => {});

  let olderRun: Promise<void> = Promise.resolve();
  let newerRun: Promise<void> = Promise.resolve();
  act(() => {
    olderRun = result.current.handleRunSql("SELECT 1 AS old");
    newerRun = result.current.handleRunSql("SELECT 2 AS new");
  });

  expect(executionSignal(0).aborted).toBe(true);
  expect(executionSignal(1).aborted).toBe(false);

  act(() => result.current.stopQuery());

  expect(executionSignal(1).aborted).toBe(true);
  expect(result.current.loading).toBe(false);

  await act(async () => {
    newer.resolve(okResult(2));
    older.resolve(okResult(1));
    await Promise.all([olderRun, newerRun]);
  });

  expect(result.current.result).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.recentQueries).toEqual([]);
});

test("a query can run successfully after stopping the previous request", async () => {
  const stopped = deferred<ExecuteResponse>();
  postMock
    .mockReturnValueOnce(stopped.promise)
    .mockResolvedValueOnce(okResult(2));
  const { result } = renderSqlLab();
  await act(async () => {});

  let stoppedRun: Promise<void> = Promise.resolve();
  act(() => {
    stoppedRun = result.current.handleRun();
  });
  act(() => result.current.stopQuery());

  await act(async () => {
    await result.current.handleRun();
  });

  expect(executionSignal(1).aborted).toBe(false);
  expect(result.current.result?.data).toEqual([{ one: 2 }]);
  expect(result.current.loading).toBe(false);

  await act(async () => {
    stopped.resolve(okResult(1));
    await stoppedRun;
  });

  expect(result.current.result?.data).toEqual([{ one: 2 }]);
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(false);
});
