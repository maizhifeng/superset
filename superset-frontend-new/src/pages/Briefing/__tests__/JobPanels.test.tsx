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

import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import JobLogPanel, { JobStatusBar } from "@/pages/Briefing/JobPanels";

const logs = [
  { ts: "2026-11-25T08:00:00", level: "info", message: "任务已启动" },
  { ts: "2026-11-25T08:00:01", level: "success", message: "数据查询完成" },
];

test("log panel keeps the collapsed summary and waits for the first log", () => {
  const onToggle = vi.fn();
  const { rerender } = render(
    <JobLogPanel
      logs={[]}
      status="running"
      expanded={false}
      onToggle={onToggle}
    />,
  );

  expect(screen.getByText("等待任务启动…")).toBeInTheDocument();
  fireEvent.click(screen.getByText(/执行日志/));
  expect(onToggle).toHaveBeenCalledTimes(1);

  rerender(
    <JobLogPanel
      logs={logs}
      status="running"
      expanded={false}
      onToggle={onToggle}
    />,
  );
  expect(screen.queryByText("等待任务启动…")).not.toBeInTheDocument();
  expect(screen.getAllByText("数据查询完成")).toHaveLength(2);
});

test("expanded log panel follows the latest line", () => {
  const { rerender } = render(
    <JobLogPanel logs={logs} status="running" expanded onToggle={vi.fn()} />,
  );
  const logBox = screen.getByText("数据查询完成").parentElement?.parentElement;
  expect(logBox).not.toBeNull();
  if (!logBox) return;
  Object.defineProperty(logBox, "scrollHeight", {
    configurable: true,
    value: 240,
  });

  rerender(
    <JobLogPanel
      logs={[
        ...logs,
        { ts: "2026-11-25T08:00:02", level: "info", message: "生成报表" },
      ]}
      status="running"
      expanded
      onToggle={vi.fn()}
    />,
  );

  expect(logBox.scrollTop).toBe(240);
  expect(screen.getByText("[08:00:02]")).toBeInTheDocument();
});

test("status bar shows elapsed time and latest log only while running", () => {
  const { rerender } = render(
    <JobStatusBar status="running" elapsedSec={65} lastLog={logs[1]} />,
  );

  expect(screen.getByText("执行中")).toBeInTheDocument();
  expect(screen.getByText("已运行 1 分 05 秒")).toBeInTheDocument();
  expect(screen.getByText("数据查询完成")).toBeInTheDocument();

  rerender(
    <JobStatusBar status="cancelled" elapsedSec={65} lastLog={logs[1]} />,
  );
  expect(screen.getByText("已停止")).toBeInTheDocument();
  expect(screen.queryByText("已运行 1 分 05 秒")).not.toBeInTheDocument();
  expect(screen.getByText("数据查询完成")).toBeInTheDocument();
});
