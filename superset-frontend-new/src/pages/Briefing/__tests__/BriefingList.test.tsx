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
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { AxiosRequestConfig, GenericAbortSignal } from "axios";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import api from "@/api";
import BriefingList from "@/pages/Briefing";
import { useNotificationStore } from "@/store/notificationStore";

vi.mock("@/api", () => ({
  default: { get: vi.fn() },
}));

vi.mock("@/pages/Briefing/ConfigForm", () => ({ default: () => null }));
vi.mock("@/pages/Briefing/FeishuDialog", () => ({ default: () => null }));
vi.mock("@/pages/Briefing/ScheduleDialog", () => ({
  default: () => null,
  NextRunCountdown: () => null,
}));

function networkError() {
  return Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
}

const row = {
  id: 1,
  name: "测试日报",
  report_type: "daily" as const,
  schedule: {
    id: 2,
    name: "测试日报",
    crontab: "0 8 * * *",
    crontab_humanized: "每天 08:00",
    timezone: "Asia/Shanghai",
    active: true,
    next_run_at: "2099-01-01T00:00:00Z",
    recipients: [],
  },
};

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
  vi.useRealTimers();
});

test("shows a list error instead of a permanent spinner and retries", async () => {
  vi.mocked(api.get)
    .mockRejectedValueOnce(networkError())
    .mockResolvedValueOnce({ data: { result: [row] } });

  render(
    <MemoryRouter>
      <BriefingList />
    </MemoryRouter>,
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "网络异常，请检查网络连接后重试",
  );
  expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "重试" }));

  expect(await screen.findByText("测试日报")).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(api.get).toHaveBeenCalledTimes(2);
});

test("retry replaces an in-flight silent poll", async () => {
  vi.useFakeTimers();
  let pollSignal: GenericAbortSignal | undefined;
  vi.mocked(api.get)
    .mockResolvedValueOnce({ data: { result: [row] } })
    .mockRejectedValueOnce(networkError())
    .mockImplementationOnce((_url: string, config?: AxiosRequestConfig) => {
      pollSignal = config?.signal;
      return new Promise((_resolve, reject) => {
        pollSignal?.addEventListener?.(
          "abort",
          () => reject(new Error("aborted")),
          {
            once: true,
          },
        );
      });
    })
    .mockResolvedValueOnce({
      data: { result: [{ ...row, name: "刷新后的简报" }] },
    });

  render(
    <MemoryRouter>
      <BriefingList />
    </MemoryRouter>,
  );

  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
  expect(screen.getByRole("alert")).toHaveTextContent("网络异常");
  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
  expect(api.get).toHaveBeenCalledTimes(3);
  expect(pollSignal?.aborted).toBe(false);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(screen.getByText("刷新后的简报")).toBeInTheDocument();
  expect(pollSignal?.aborted).toBe(true);
  expect(api.get).toHaveBeenCalledTimes(4);
});

test("keeps polling failures visible and bounded while retaining rows", async () => {
  vi.useFakeTimers();
  vi.mocked(api.get)
    .mockResolvedValueOnce({ data: { result: [row] } })
    .mockRejectedValue(networkError());

  render(
    <MemoryRouter>
      <BriefingList />
    </MemoryRouter>,
  );

  await act(async () => {
    await Promise.resolve();
  });
  expect(screen.getByText("测试日报")).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
  expect(screen.getByRole("alert")).toHaveTextContent("网络异常");
  expect(screen.getByText("测试日报")).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
  });
  expect(screen.getAllByRole("alert")).toHaveLength(1);
  expect(api.get).toHaveBeenCalledTimes(3);
  expect(useNotificationStore.getState().notifications).toEqual([]);
});
