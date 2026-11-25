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

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dayjs } from "dayjs";
import api from "@/api";
import { useNotificationStore } from "@/store/notificationStore";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { ReportType } from "./params";
import type { JobLog } from "./jobTypes";
import type { JobStatus } from "./reportStyles";

const MAX_POLL_FAILURES = 3;

interface JobInfo<TResult> {
  id: string;
  config_id: number;
  status: Exclude<JobStatus, "idle">;
  logs: JobLog[];
  error?: string;
  cancel_requested?: boolean;
  result?: TResult;
}

export function useBriefingJob<TResult>({
  configId,
  reportDate,
  reportType,
}: {
  configId: number;
  reportDate: Dayjs | null;
  reportType: ReportType;
}) {
  const notify = useNotificationStore((s) => s.notify);
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>("idle");
  const [logs, setLogs] = useState<JobLog[]>([]);
  const [logsExpanded, setLogsExpanded] = useState(true);
  const [result, setResult] = useState<TResult | null>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState<number>(Date.now());
  const [pollError, setPollError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollFailuresRef = useRef(0);
  const logsTouchedRef = useRef(false);

  useEffect(() => {
    if (jobStatus !== "running") return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [jobStatus]);

  useEffect(() => {
    if (jobStatus === "idle") return;
    if (jobStatus === "running") {
      setLogsExpanded(true);
      return;
    }
    if (logsTouchedRef.current) return;
    const timer = setTimeout(() => setLogsExpanded(false), 4000);
    return () => clearTimeout(timer);
  }, [jobStatus]);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const restoreResult = useCallback((latest: TResult) => {
    setResult(latest);
    setJobStatus("done");
  }, []);

  const loadJob = useCallback(
    async (jid: string): Promise<JobInfo<TResult>["status"] | null> => {
      try {
        const res = await api.get<{ result: JobInfo<TResult> }>(
          `/briefing/jobs/${jid}`,
        );
        const job = res.data.result;
        pollFailuresRef.current = 0;
        setPollError(null);
        setLogs(job.logs ?? []);
        setJobError(job.error ?? null);
        if (job.status === "done" && job.result) {
          setResult(job.result);
        }
        if (job.status !== "running") {
          setJobStatus(job.status);
          stopPolling();
        }
        return job.status;
      } catch (err: unknown) {
        pollFailuresRef.current += 1;
        const message = parseErrorMessage(err, "任务状态加载失败");
        setPollError(
          pollFailuresRef.current >= MAX_POLL_FAILURES
            ? `连续 ${MAX_POLL_FAILURES} 次加载任务状态失败，已暂停自动刷新。${message}`
            : `任务状态加载失败（${pollFailuresRef.current}/${MAX_POLL_FAILURES}）：${message}`,
        );
        if (pollFailuresRef.current >= MAX_POLL_FAILURES) stopPolling();
        return null;
      }
    },
    [stopPolling],
  );

  const startPolling = useCallback(
    (jid: string) => {
      stopPolling();
      pollRef.current = setInterval(() => {
        void loadJob(jid);
      }, 1500);
    },
    [loadJob, stopPolling],
  );

  const retryPolling = useCallback(async () => {
    if (!jobId) return;
    pollFailuresRef.current = 0;
    setPollError(null);
    const status = await loadJob(jobId);
    if (status === "running") startPolling(jobId);
  }, [jobId, loadJob, startPolling]);

  const run = useCallback(
    async (override?: Dayjs | null) => {
      if (!configId) return;
      if (jobStatus === "running") {
        notify({
          severity: "info",
          message: "该简报正在执行中，请先等待或停止当前任务。",
        });
        return;
      }
      stopPolling();
      setJobStatus("running");
      setLogs([]);
      setResult(null);
      setJobError(null);
      setPollError(null);
      pollFailuresRef.current = 0;
      setStartedAt(Date.now());
      try {
        const params: { override_date?: string } = {};
        if (override) {
          params.override_date =
            reportType === "weekly"
              ? override.format("YYYY-MM-DD")
              : override.add(1, "day").format("YYYY-MM-DD");
        }
        const startRes = await api.post<{
          result: { job_id: string; status: string; already_running: boolean };
        }>("/briefing/jobs", { config_id: configId, ...params });
        const { job_id, already_running } = startRes.data.result;
        setJobId(job_id);
        if (already_running) {
          notify({
            severity: "info",
            message: "检测到该简报已有执行中的任务，已切换到该任务。",
          });
        }
        const status = await loadJob(job_id);
        if (status === "running") startPolling(job_id);
      } catch (error) {
        const message = parseErrorMessage(error, "任务启动失败");
        setJobError(message);
        setJobStatus("error");
        notify({ severity: "error", message });
      }
    },
    [
      configId,
      reportType,
      jobStatus,
      notify,
      loadJob,
      startPolling,
      stopPolling,
    ],
  );

  const handleRun = useCallback(() => {
    void run(reportDate);
  }, [run, reportDate]);

  const handleStop = useCallback(async () => {
    if (!jobId) return;
    try {
      await api.post(`/briefing/jobs/${jobId}/cancel`);
      notify({ severity: "info", message: "正在停止任务…" });
      setTimeout(() => void loadJob(jobId), 800);
    } catch {
      notify({ severity: "error", message: "停止失败" });
    }
  }, [jobId, notify, loadJob]);

  const toggleLogs = useCallback(() => {
    logsTouchedRef.current = true;
    setLogsExpanded((value) => !value);
  }, []);

  const isRunning = jobStatus === "running";
  const elapsedSec = startedAt ? Math.floor((now - startedAt) / 1000) : 0;
  const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

  return {
    jobId,
    jobStatus,
    logs,
    logsExpanded,
    result,
    jobError,
    pollError,
    isRunning,
    elapsedSec,
    lastLog,
    handleRun,
    handleStop,
    retryPolling,
    toggleLogs,
    restoreResult,
  };
}
