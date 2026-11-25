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

import { useEffect, useState } from "react";
import rison from "rison";
import api from "@/api";
import { parseErrorMessage } from "@/utils/parseErrorMessage";
import type { DashboardListItem } from "@/types/api";

export type HomeStatsErrorKey =
  | "dashboards"
  | "charts"
  | "datasets"
  | "savedQueries"
  | "databases"
  | "recentDashboards"
  | "recentDatasets"
  | "recentCharts";

export type HomeStatsErrors = Partial<Record<HomeStatsErrorKey, string>>;

export interface HomeStats {
  dashboards: number;
  charts: number;
  datasets: number;
  savedQueries: number;
  databases: number;
  recentDashboards: DashboardListItem[];
  recentDatasets: { id: number; table_name: string }[];
  recentCharts: { id: number; slice_name: string }[];
  errors: HomeStatsErrors;
  loading: boolean;
  retry: () => void;
}

const RECENT_LIMIT = 6;

type CountResponse = { result: unknown[]; count: number };

function fetchCount(endpoint: string, signal: AbortSignal): Promise<number> {
  const qs = rison.encode({ page_size: 1, page: 0 });
  return api
    .get<CountResponse>(`${endpoint}?q=${qs}`, { signal })
    .then((res) => res.data.count);
}

/**
 * Home 页概览数据：并行拉取各模块数量与最近的仪表板。
 * 各请求独立容错——任一接口失败只影响对应统计项，不影响整页渲染。
 */
export function useHomeStats(): HomeStats {
  const [dashboards, setDashboards] = useState(0);
  const [charts, setCharts] = useState(0);
  const [datasets, setDatasets] = useState(0);
  const [savedQueries, setSavedQueries] = useState(0);
  const [databases, setDatabases] = useState(0);
  const [recentDashboards, setRecentDashboards] = useState<DashboardListItem[]>(
    [],
  );
  const [recentDatasets, setRecentDatasets] = useState<
    { id: number; table_name: string }[]
  >([]);
  const [recentCharts, setRecentCharts] = useState<
    { id: number; slice_name: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<HomeStatsErrors>({});
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setErrors({});
    const controller = new AbortController();
    let settled = 0;
    const tasks: {
      key: HomeStatsErrorKey;
      message: string;
      request: Promise<void>;
    }[] = [
      {
        key: "dashboards",
        message: "加载仪表板数量失败",
        request: fetchCount("/dashboard/", controller.signal).then(
          setDashboards,
        ),
      },
      {
        key: "charts",
        message: "加载图表数量失败",
        request: fetchCount("/chart/", controller.signal).then(setCharts),
      },
      {
        key: "datasets",
        message: "加载数据集数量失败",
        request: fetchCount("/dataset/", controller.signal).then(setDatasets),
      },
      {
        key: "savedQueries",
        message: "加载已保存查询数量失败",
        request: fetchCount("/saved_query/", controller.signal).then(
          setSavedQueries,
        ),
      },
      {
        key: "databases",
        message: "加载数据库数量失败",
        request: fetchCount("/database/", controller.signal).then(setDatabases),
      },
      {
        key: "recentDashboards",
        message: "加载最近更新的仪表板失败",
        request: api
          .get<{ result: DashboardListItem[] }>(
            `/dashboard/?q=${rison.encode({
              page_size: RECENT_LIMIT,
              page: 0,
              order_column: "changed_on_delta_humanized",
              order_direction: "desc",
            })}`,
            { signal: controller.signal },
          )
          .then((res) => setRecentDashboards(res.data.result)),
      },
      {
        key: "recentDatasets",
        message: "加载最近更新的数据集失败",
        request: api
          .get<{ result: { id: number; table_name: string }[] }>(
            `/dataset/?q=${rison.encode({
              page_size: RECENT_LIMIT,
              page: 0,
              order_column: "changed_on_delta_humanized",
              order_direction: "desc",
            })}`,
            { signal: controller.signal },
          )
          .then((res) => setRecentDatasets(res.data.result)),
      },
      {
        key: "recentCharts",
        message: "加载最近更新的图表失败",
        request: api
          .get<{ result: { id: number; slice_name: string }[] }>(
            `/chart/?q=${rison.encode({
              page_size: RECENT_LIMIT,
              page: 0,
              order_column: "changed_on_delta_humanized",
              order_direction: "desc",
            })}`,
            { signal: controller.signal },
          )
          .then((res) => setRecentCharts(res.data.result)),
      },
    ];
    for (const task of tasks) {
      task.request
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          setErrors((current) => ({
            ...current,
            [task.key]: parseErrorMessage(err, task.message),
          }));
          if (task.key === "recentDashboards") setRecentDashboards([]);
          if (task.key === "recentDatasets") setRecentDatasets([]);
          if (task.key === "recentCharts") setRecentCharts([]);
        })
        .finally(() => {
          settled += 1;
          if (settled === tasks.length && !controller.signal.aborted) {
            setLoading(false);
          }
        });
    }
    return () => {
      controller.abort();
    };
  }, [reloadKey]);

  return {
    dashboards,
    charts,
    datasets,
    savedQueries,
    databases,
    recentDashboards,
    recentDatasets,
    recentCharts,
    errors,
    loading,
    retry: () => setReloadKey((key) => key + 1),
  };
}
