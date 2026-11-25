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

import { useCallback, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { DatasetDetail, DatasetMetric } from "@/types/api";
import { EMPTY_METRIC_DRAFT } from "../types";
import type { MetricDraft, MetricDraftField } from "../types";

export function useMetricEditor(
  dataset: DatasetDetail | null,
  setDataset: Dispatch<SetStateAction<DatasetDetail | null>>,
) {
  const [addMetricOpen, setAddMetricOpen] = useState(false);
  const [editMetricOpen, setEditMetricOpen] = useState(false);
  const [editMetric, setEditMetric] = useState<DatasetMetric | null>(null);
  const [newMetric, setNewMetric] = useState<MetricDraft>({
    ...EMPTY_METRIC_DRAFT,
  });
  const [metricError, setMetricError] = useState<string | null>(null);

  const handleAddMetric = useCallback((): void => {
    setNewMetric({ ...EMPTY_METRIC_DRAFT });
    setMetricError(null);
    setAddMetricOpen(true);
  }, []);

  const handleEditMetric = useCallback((metric: DatasetMetric): void => {
    setEditMetric(metric);
    setEditMetricOpen(true);
  }, []);

  const handleEditMetricSubmit = useCallback((): void => {
    if (
      !editMetric ||
      !editMetric.metric_name.trim() ||
      !editMetric.expression.trim()
    ) {
      return;
    }
    setDataset((current) =>
      current
        ? {
            ...current,
            metrics: current.metrics.map((metric) =>
              metric.id === editMetric.id ? editMetric : metric,
            ),
          }
        : current,
    );
    setEditMetricOpen(false);
    setEditMetric(null);
  }, [editMetric, setDataset]);

  const handleDeleteMetric = useCallback(
    (target: DatasetMetric): void => {
      setDataset((current) =>
        current
          ? {
              ...current,
              metrics: current.metrics.filter(
                (metric) => metric.id !== target.id,
              ),
            }
          : current,
      );
    },
    [setDataset],
  );

  const handleAddMetricSubmit = useCallback((): void => {
    if (!newMetric.metric_name.trim() || !newMetric.expression.trim()) return;
    const name = newMetric.metric_name.trim();
    const exists = dataset?.metrics?.some(
      (metric) =>
        metric.metric_name.toLowerCase() === name.toLowerCase() &&
        metric.id !== 0,
    );
    if (exists) {
      setMetricError("已存在同名指标，请更换名称");
      return;
    }
    const added: DatasetMetric = {
      id: 0,
      metric_name: name,
      expression: newMetric.expression.trim(),
      verbose_name: newMetric.verbose_name.trim() || null,
      description: newMetric.description.trim() || null,
      d3format: newMetric.d3format.trim() || null,
      currency: null,
    };
    setDataset((current) =>
      current ? { ...current, metrics: [...current.metrics, added] } : current,
    );
    setAddMetricOpen(false);
  }, [newMetric, dataset?.metrics, setDataset]);

  const updateNewMetric = useCallback(
    (field: MetricDraftField, value: string): void => {
      setNewMetric((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const updateEditMetric = useCallback(
    (field: MetricDraftField, value: string): void => {
      setEditMetric((current) =>
        current ? { ...current, [field]: value } : current,
      );
    },
    [],
  );

  const closeAddMetric = useCallback((): void => {
    setAddMetricOpen(false);
  }, []);

  const closeEditMetric = useCallback((): void => {
    setEditMetricOpen(false);
  }, []);

  return {
    addMetricOpen,
    editMetricOpen,
    editMetric,
    newMetric,
    metricError,
    handleAddMetric,
    handleEditMetric,
    handleEditMetricSubmit,
    handleDeleteMetric,
    handleAddMetricSubmit,
    updateNewMetric,
    updateEditMetric,
    closeAddMetric,
    closeEditMetric,
  };
}
