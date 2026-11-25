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
import type { NavigateFunction } from "react-router-dom";
import type { DateColumnInfo } from "@/utils/dateHeuristics";
import { getDataset } from "@/api";
import { useBreadcrumbStore } from "@/store/breadcrumbStore";
import { useNotificationStore } from "@/store/notificationStore";
import type { DatasetColumn, DatasetDetail } from "@/types/api";
import { detectDateColumnsFromMeta } from "@/utils/dateHeuristics";
import { formatSqlText } from "@/utils/sqlFormat";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import api from "@/api";
import {
  buildDatasetSaveRequest,
  formFromDataset,
  parseExtraConfig,
} from "../datasetUtils";
import type { DatasetEditForm, ExtraConfig, ModifiedColumns } from "../types";

export function useDatasetEditor(
  id: string | undefined,
  navigate: NavigateFunction,
) {
  const setCustom = useBreadcrumbStore((state) => state.setCustom);
  const notify = useNotificationStore((state) => state.notify);
  const [dataset, setDataset] = useState<DatasetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState<DatasetEditForm>({
    table_name: "",
    description: "",
    sql: "",
  });
  const [extraConfig, setExtraConfig] = useState<ExtraConfig>({});
  const [detectedDateColumns, setDetectedDateColumns] = useState<
    DateColumnInfo[]
  >([]);
  const [modifiedColumns, setModifiedColumns] = useState<ModifiedColumns>({});
  const formRef = useRef(form);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout>>();
  formRef.current = form;

  useEffect(
    () => () => {
      clearTimeout(navigationTimerRef.current);
    },
    [],
  );

  const refreshDataset = useCallback(async (): Promise<void> => {
    if (!id) return;
    const nextDataset = await getDataset<DatasetDetail>(id);
    setDataset(nextDataset);
    setDetectedDateColumns(detectDateColumnsFromMeta(nextDataset.columns));
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    getDataset<DatasetDetail>(id)
      .then((nextDataset) => {
        setDataset(nextDataset);
        setCustom({ label: `编辑：${nextDataset.table_name}` });
        setForm(formFromDataset(nextDataset));
        setExtraConfig(parseExtraConfig(nextDataset.extra));
        setDetectedDateColumns(detectDateColumnsFromMeta(nextDataset.columns));
        setLoading(false);
      })
      .catch((loadError: unknown) => {
        setError(parseErrorMessage(loadError, "加载数据集失败"));
        setLoading(false);
      });
  }, [id, setCustom]);

  const handleSave = useCallback(async (): Promise<void> => {
    if (!id) return;
    setError(null);
    setSuccess(false);
    clearTimeout(navigationTimerRef.current);
    try {
      const { endpoint, payload } = buildDatasetSaveRequest(
        id,
        dataset,
        formRef.current,
        extraConfig,
        modifiedColumns,
      );
      await api.put(endpoint, payload);
      setSuccess(true);
      navigationTimerRef.current = setTimeout(
        () => navigate("/dataset/list"),
        1200,
      );
    } catch (saveError: unknown) {
      clearTimeout(navigationTimerRef.current);
      setError(parseErrorMessage(saveError, "保存失败"));
    }
  }, [id, navigate, modifiedColumns, dataset, extraConfig]);

  const handleFormatSql = useCallback((): void => {
    const sql = formRef.current.sql;
    if (!sql.trim()) return;
    let formatted: string;
    try {
      formatted = formatSqlText(sql, dataset?.database?.backend);
    } catch {
      notify({ severity: "error", message: "SQL 解析失败，暂时无法格式化" });
      return;
    }
    setForm((current) => ({ ...current, sql: formatted }));
  }, [dataset?.database?.backend, notify]);

  const handleCopyEditorSql = useCallback(async (): Promise<void> => {
    const sql = formRef.current.sql;
    if (!sql.trim()) {
      notify({ severity: "warning", message: "当前 SQL 为空" });
      return;
    }
    try {
      await navigator.clipboard.writeText(sql);
      notify({ severity: "success", message: "已复制当前 SQL" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  }, [notify]);

  const handleResetSql = useCallback((): void => {
    if (!dataset) return;
    setForm((current) => ({ ...current, sql: dataset.sql ?? "" }));
    notify({ severity: "info", message: "已还原为已保存的 SQL" });
  }, [dataset, notify]);

  const updateColumn = useCallback(
    (columnId: number, update: Partial<DatasetColumn>): void => {
      setModifiedColumns((current) => ({
        ...current,
        [columnId]: { ...current[columnId], ...update },
      }));
    },
    [],
  );

  return {
    dataset,
    setDataset,
    loading,
    error,
    setError,
    success,
    setSuccess,
    form,
    setForm,
    extraConfig,
    setExtraConfig,
    detectedDateColumns,
    setDetectedDateColumns,
    modifiedColumns,
    updateColumn,
    refreshDataset,
    handleSave,
    handleFormatSql,
    handleCopyEditorSql,
    handleResetSql,
  };
}
