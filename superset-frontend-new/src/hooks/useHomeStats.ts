import { useEffect, useRef, useState } from "react";
import rison from "rison";
import api from "@/api";
import type { DashboardListItem } from "@/types/api";

export interface HomeStats {
  dashboards: number;
  charts: number;
  datasets: number;
  savedQueries: number;
  databases: number;
  recentDashboards: DashboardListItem[];
  recentDatasets: { id: number; table_name: string }[];
  recentCharts: { id: number; slice_name: string }[];
  loading: boolean;
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
  const [recentDashboards, setRecentDashboards] = useState<
    DashboardListItem[]
  >([]);
  const [recentDatasets, setRecentDatasets] = useState<
    { id: number; table_name: string }[]
  >([]);
  const [recentCharts, setRecentCharts] = useState<
    { id: number; slice_name: string }[]
  >([]);
  const [loading, setLoading] = useState(true);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const controller = new AbortController();
    let settled = 0;
    const tasks = [
      fetchCount("/dashboard/", controller.signal).then(setDashboards),
      fetchCount("/chart/", controller.signal).then(setCharts),
      fetchCount("/dataset/", controller.signal).then(setDatasets),
      fetchCount("/saved_query/", controller.signal).then(setSavedQueries),
      fetchCount("/database/", controller.signal).then(setDatabases),
      api
        .get<{ result: DashboardListItem[] }>(
          `/dashboard/?q=${rison.encode({
            page_size: RECENT_LIMIT,
            page: 0,
            order_column: "changed_on_delta_humanized",
            order_direction: "desc",
          })}`,
          { signal: controller.signal },
        )
        .then((res) => setRecentDashboards(res.data.result))
        .catch(() => setRecentDashboards([])),
      api
        .get<{ result: { id: number; table_name: string }[] }>(
          `/dataset/?q=${rison.encode({
            page_size: RECENT_LIMIT,
            page: 0,
            order_column: "changed_on_delta_humanized",
            order_direction: "desc",
          })}`,
          { signal: controller.signal },
        )
        .then((res) => setRecentDatasets(res.data.result))
        .catch(() => setRecentDatasets([])),
      api
        .get<{ result: { id: number; slice_name: string }[] }>(
          `/chart/?q=${rison.encode({
            page_size: RECENT_LIMIT,
            page: 0,
            order_column: "changed_on_delta_humanized",
            order_direction: "desc",
          })}`,
          { signal: controller.signal },
        )
        .then((res) => setRecentCharts(res.data.result))
        .catch(() => setRecentCharts([])),
    ];
    for (const t of tasks) {
      t.catch(() => {
        if (controller.signal.aborted) return;
      }).finally(() => {
        settled += 1;
        if (settled === tasks.length && !controller.signal.aborted) {
          setLoading(false);
        }
      });
    }
    return () => controller.abort();
  }, []);

  return {
    dashboards,
    charts,
    datasets,
    savedQueries,
    databases,
    recentDashboards,
    recentDatasets,
    recentCharts,
    loading,
  };
}
