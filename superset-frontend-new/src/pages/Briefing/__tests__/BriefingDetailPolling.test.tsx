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
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import api from "@/api";
import DailyReportDetail from "@/pages/Briefing/detail";
import { useNotificationStore } from "@/store/notificationStore";

vi.mock("@/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));
vi.mock("@/components/PageHeader", () => ({
  default: ({ title, actions }: { title: string; actions: ReactNode }) => (
    <div>
      <h1>{title}</h1>
      {actions}
    </div>
  ),
}));
vi.mock("@mui/x-date-pickers/DatePicker", () => ({
  DatePicker: () => null,
}));
vi.mock("@/pages/Briefing/ConfigForm", () => ({ default: () => null }));
vi.mock("@/pages/Briefing/FeishuDialog", () => ({ default: () => null }));
vi.mock("@/pages/Briefing/EChart", () => ({ default: () => null }));
vi.mock("@/pages/Briefing/WasdHint", () => ({ default: () => null }));

function networkError() {
  return Object.assign(new Error("Network Error"), { code: "ERR_NETWORK" });
}

function jobRequests() {
  return vi
    .mocked(api.get)
    .mock.calls.filter(([url]) => String(url).startsWith("/briefing/jobs/"));
}

function renderDetail() {
  return render(
    <MemoryRouter initialEntries={["/briefing/1"]}>
      <Routes>
        <Route path="/briefing/:id" element={<DailyReportDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

async function flushRequests() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function startRun() {
  fireEvent.click(screen.getByRole("button", { name: "运行简报" }));
  await flushRequests();
}

beforeEach(() => {
  vi.clearAllMocks();
  useNotificationStore.setState({ notifications: [] });
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/briefing/configs/1") {
      return Promise.resolve({
        data: { result: { id: 1, name: "测试日报", report_type: "daily" } },
      });
    }
    if (url === "/briefing/configs/1/result") {
      return Promise.resolve({ data: { result: null } });
    }
    if (url === "/briefing/configs/1/feishu") {
      return Promise.resolve({ data: { result: { targets: [] } } });
    }
    return Promise.reject(networkError());
  });
  vi.mocked(api.post).mockResolvedValue({
    data: {
      result: { job_id: "job-1", status: "running", already_running: false },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
});

test("shows poll failures and stops after a bounded number of retries", async () => {
  vi.useFakeTimers();
  let jobAttempts = 0;
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/briefing/configs/1") {
      return Promise.resolve({
        data: { result: { id: 1, name: "测试日报", report_type: "daily" } },
      });
    }
    if (url === "/briefing/configs/1/result") {
      return Promise.resolve({ data: { result: null } });
    }
    if (url === "/briefing/configs/1/feishu") {
      return Promise.resolve({ data: { result: { targets: [] } } });
    }
    if (url === "/briefing/jobs/job-1") {
      jobAttempts += 1;
      if (jobAttempts === 1) {
        return Promise.resolve({
          data: {
            result: {
              id: "job-1",
              config_id: 1,
              status: "running",
              logs: [],
            },
          },
        });
      }
    }
    return Promise.reject(networkError());
  });

  render(
    <MemoryRouter initialEntries={["/briefing/1"]}>
      <Routes>
        <Route path="/briefing/:id" element={<DailyReportDetail />} />
      </Routes>
    </MemoryRouter>,
  );

  await act(async () => {
    await Promise.resolve();
  });
  fireEvent.click(screen.getByRole("button", { name: "运行简报" }));
  await act(async () => {
    await Promise.resolve();
  });
  expect(jobRequests()).toHaveLength(1);

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
  }

  expect(screen.getByRole("alert")).toHaveTextContent("已暂停自动刷新");
  expect(jobRequests()).toHaveLength(4);

  await act(async () => {
    vi.advanceTimersByTime(1500);
    await Promise.resolve();
  });
  expect(jobRequests()).toHaveLength(4);
});

test("retries paused polling and stops when the job completes", async () => {
  vi.useFakeTimers();
  let jobAttempts = 0;
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/briefing/configs/1") {
      return Promise.resolve({
        data: { result: { id: 1, name: "测试日报", report_type: "daily" } },
      });
    }
    if (url === "/briefing/configs/1/result") {
      return Promise.resolve({ data: { result: null } });
    }
    if (url === "/briefing/configs/1/feishu") {
      return Promise.resolve({ data: { result: { targets: [] } } });
    }
    if (url === "/briefing/jobs/job-1") {
      jobAttempts += 1;
      if (jobAttempts === 1 || jobAttempts === 5) {
        return Promise.resolve({
          data: {
            result: {
              id: "job-1",
              config_id: 1,
              status: "running",
              logs: [],
            },
          },
        });
      }
      if (jobAttempts === 6) {
        return Promise.resolve({
          data: {
            result: {
              id: "job-1",
              config_id: 1,
              status: "done",
              logs: [],
            },
          },
        });
      }
    }
    return Promise.reject(networkError());
  });

  renderDetail();
  await flushRequests();
  await startRun();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await act(async () => {
      vi.advanceTimersByTime(1500);
      await Promise.resolve();
    });
  }
  expect(screen.getByRole("alert")).toHaveTextContent("已暂停自动刷新");

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(jobRequests()).toHaveLength(5);

  await act(async () => {
    vi.advanceTimersByTime(1500);
    await Promise.resolve();
  });
  expect(jobRequests()).toHaveLength(6);
  expect(screen.getByRole("button", { name: "重新运行" })).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(1500);
    await Promise.resolve();
  });
  expect(jobRequests()).toHaveLength(6);
});

test("cancels the active job and refreshes its stopped state", async () => {
  vi.useFakeTimers();
  let cancelled = false;
  vi.mocked(api.get).mockImplementation((url: string) => {
    if (url === "/briefing/configs/1") {
      return Promise.resolve({
        data: { result: { id: 1, name: "测试日报", report_type: "daily" } },
      });
    }
    if (url === "/briefing/configs/1/result") {
      return Promise.resolve({ data: { result: null } });
    }
    if (url === "/briefing/configs/1/feishu") {
      return Promise.resolve({ data: { result: { targets: [] } } });
    }
    if (url === "/briefing/jobs/job-1") {
      return Promise.resolve({
        data: {
          result: {
            id: "job-1",
            config_id: 1,
            status: cancelled ? "cancelled" : "running",
            logs: [],
          },
        },
      });
    }
    return Promise.reject(networkError());
  });
  vi.mocked(api.post)
    .mockResolvedValueOnce({
      data: {
        result: { job_id: "job-1", status: "running", already_running: false },
      },
    })
    .mockResolvedValueOnce({ data: { result: {} } });

  renderDetail();
  await flushRequests();
  await startRun();
  expect(jobRequests()).toHaveLength(1);

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "停止" }));
    await Promise.resolve();
    await Promise.resolve();
  });
  expect(api.post).toHaveBeenCalledWith("/briefing/jobs/job-1/cancel");
  cancelled = true;
  expect(useNotificationStore.getState().notifications.at(-1)?.message).toBe(
    "正在停止任务…",
  );
  expect(jobRequests()).toHaveLength(1);

  await act(async () => {
    vi.advanceTimersByTime(800);
    await Promise.resolve();
  });
  expect(jobRequests()).toHaveLength(2);
  expect(screen.getByRole("alert")).toHaveTextContent("任务已手动停止");
  expect(screen.getByText("已停止")).toBeInTheDocument();

  await act(async () => {
    vi.advanceTimersByTime(1500);
    await Promise.resolve();
  });
  expect(jobRequests()).toHaveLength(2);
});
