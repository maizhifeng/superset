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

import { useCallback } from "react";
import { useNotificationStore } from "@/store/notificationStore";
import type { Notification } from "@/store/notificationStore";
import type { DatasetDetail, DatasetMetric } from "@/types/api";
import { getDatasetSql } from "../datasetUtils";

type Notify = (notification: Omit<Notification, "id">) => void;

async function copyText(
  text: string,
  message: string,
  notify: Notify,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    notify({ severity: "success", message });
  } catch {
    notify({ severity: "error", message: "复制失败" });
  }
}

export function useDatasetClipboard(
  id: string | undefined,
  dataset: DatasetDetail | null,
) {
  const notify = useNotificationStore((state) => state.notify);

  const handleCopyId = useCallback(async (): Promise<void> => {
    if (!id) return;
    await copyText(id, `已复制数据集 ID ${id}`, notify);
  }, [id, notify]);

  const handleCopySql = useCallback(async (): Promise<void> => {
    if (!dataset) return;
    await copyText(getDatasetSql(dataset), "已复制查询 SQL", notify);
  }, [dataset, notify]);

  const handleCopyColumnNames = useCallback(async (): Promise<void> => {
    if (!dataset) return;
    const names = dataset.columns.map((column) => column.column_name);
    if (names.length === 0) {
      notify({ severity: "warning", message: "该数据集暂无列" });
      return;
    }
    await copyText(names.join("\n"), `已复制 ${names.length} 个列名`, notify);
  }, [dataset, notify]);

  const handleCopyAllMetricNames = useCallback(async (): Promise<void> => {
    if (!dataset) return;
    const names = dataset.metrics
      .map((metric) => metric.metric_name)
      .filter(Boolean);
    if (names.length === 0) {
      notify({ severity: "warning", message: "该数据集暂无指标" });
      return;
    }
    await copyText(names.join("\n"), `已复制 ${names.length} 个指标名`, notify);
  }, [dataset, notify]);

  const handleCopyMetricFormula = useCallback(
    async (metric: DatasetMetric): Promise<void> => {
      await copyText(
        metric.expression ?? "",
        `已复制指标"${metric.metric_name}"的算式`,
        notify,
      );
    },
    [notify],
  );

  const handleCopyColumnName = useCallback(
    async (name: string, type?: string): Promise<void> => {
      if (!name) return;
      await copyText(
        type ? `${name} (${type})` : name,
        `已复制列名 ${name}`,
        notify,
      );
    },
    [notify],
  );

  return {
    handleCopyId,
    handleCopySql,
    handleCopyColumnNames,
    handleCopyAllMetricNames,
    handleCopyMetricFormula,
    handleCopyColumnName,
  };
}
