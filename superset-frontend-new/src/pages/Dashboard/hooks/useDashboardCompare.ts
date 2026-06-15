import { useState, useEffect, useCallback, useRef } from "react";
import api, { getDataset } from "@/api";
import type { ChartData, ChartDataPayload } from "@/types/api";
import type { SimpleFilter } from "@/utils/query/types";
import {
  buildQueryObject,
  extractQueryFields,
} from "@/utils/query/extractQueryFields";
import { parseChartConfig } from "@/pages/Dashboard/hooks/useDashboardData";
import type {
  CompareConfig,
  CompareDimension,
} from "@/pages/Dashboard/ChartCard";
import type { ColumnOption } from "@/pages/Dashboard/CompareConfigModal";

function filterDataLocal(
  data: ChartDataPayload,
  dimensions: CompareDimension[],
): ChartDataPayload {
  if (data?.data && Array.isArray(data.data)) {
    const filtered = data.data.filter((row) =>
      dimensions.every((d) =>
        d.values.includes(String(row[d.dimension] ?? "")),
      ),
    );
    return { ...data, data: filtered };
  }
  return data;
}

interface UseDashboardCompareParams {
  chartMeta: Record<number, ChartData>;
  chartData: Record<number, ChartDataPayload>;
  chartDataRef: React.MutableRefObject<
    Record<number, ChartDataPayload>
  >;
  buildAdhocFiltersRef: React.MutableRefObject<
    (
      dsId: number,
    ) => { subject: string; operator: string; comparator: unknown }[]
  >;
}

export function useDashboardCompare({
  chartMeta,
  chartData,
  chartDataRef,
  buildAdhocFiltersRef,
}: UseDashboardCompareParams) {
  const [compareConfig, setCompareConfig] = useState<CompareConfig | null>(
    null,
  );
  const [mirrorData, setMirrorData] = useState<ChartDataPayload>({});
  const [compareModalOpen, setCompareModalOpen] = useState(false);
  const [compareChartId, setCompareChartId] = useState<number | null>(null);
  const [periodModalOpen, setPeriodModalOpen] = useState(false);
  const [periodModalChartId, setPeriodModalChartId] = useState<number | null>(
    null,
  );
  const [periodModalChartData, setPeriodModalChartData] = useState<
    ChartDataPayload | undefined
  >(undefined);
  const [datasetCompareColumns, setDatasetCompareColumns] = useState<
    ColumnOption[]
  >([]);
  const [initialCompareColumns, setInitialCompareColumns] = useState<
    ColumnOption[]
  >([]);

  const chartMetaRef = useRef(chartMeta);
  chartMetaRef.current = chartMeta;

  const fetchMirrorData = useCallback(
    async (
      chartId: number,
      dimensions: CompareDimension[],
      existingDataOverride?: ChartDataPayload,
      forceServerQuery?: boolean,
    ) => {
      const chart = chartMetaRef.current[chartId];
      if (!chart) return;

      if (!forceServerQuery) {
        const existing =
          existingDataOverride ?? chartDataRef.current[chartId];
        if (existing?.data && Array.isArray(existing.data)) {
          setMirrorData(filterDataLocal(existing, dimensions));
          return;
        }
      }

      try {
        const fd = parseChartConfig(chart);
        const dsId =
          chart.datasource_id ||
          (fd.datasource ? Number(String(fd.datasource).split("__")[0]) : 0);
        if (!dsId) return;
        const query = buildQueryObject(fd, chart.viz_type);
        if (!query.metrics || query.metrics.length === 0) return;

        const dimensionFilters: SimpleFilter[] = dimensions.map((d) => ({
          col: d.dimension,
          op: "IN",
          val: d.values,
        }));

        const buildFn = buildAdhocFiltersRef.current;
        const adhocFilters = buildFn(dsId);
        query.filters = [
          ...(adhocFilters.map((f) => ({
            col: f.subject,
            op: f.operator,
            val: f.comparator,
          })) as SimpleFilter[]),
          ...dimensionFilters,
        ];
        const force = adhocFilters.length > 0 || dimensions.length > 0;
        const payload = {
          datasource: { id: dsId, type: chart.datasource_type || "table" },
          queries: [query],
          form_data: fd,
          result_format: "json",
          result_type: "full" as const,
          force,
        };
        const postRes = await api.post("/chart/data", payload);
        const postResult = postRes.data?.result;
        const rawData = Array.isArray(postResult)
          ? postResult[0] || {}
          : postResult || {};
        setMirrorData(rawData);
      } catch {
        const existing =
          existingDataOverride ?? chartDataRef.current[chartId];
        if (existing?.data && Array.isArray(existing.data)) {
          setMirrorData(filterDataLocal(existing, dimensions));
        }
      }
    },
    [chartDataRef, buildAdhocFiltersRef],
  );

  useEffect(() => {
    if (!compareModalOpen || compareChartId == null) {
      setDatasetCompareColumns([]);
      setInitialCompareColumns([]);
      return;
    }
    const dsId = chartMeta[compareChartId]?.datasource_id;
    if (!dsId) {
      setDatasetCompareColumns([]);
      setInitialCompareColumns([]);
      return;
    }

    let chartGroupbyCols: string[] = [];
    try {
      const chart = chartMeta[compareChartId];
      if (chart) {
        const fd = parseChartConfig(chart);
        const { groupby, columns } = extractQueryFields(fd, chart.viz_type);
        chartGroupbyCols = [...groupby, ...columns].filter(Boolean);
      }
    } catch {
      // ignore
    }

    const numericTypes =
      /^int\d*$|^bigint$|^smallint$|^tinyint$|^numeric$|^decimal$|^float$|^double$|^real$|^money$/i;
    const timeTypes = /time|date|timestamp|year|month|quarter|week/i;
    const idPattern = /_?id$/i;
    getDataset<{
      columns: { column_name: string; type: string | null }[];
    }>(dsId)
      .then((dataset) => {
        const allColumns: ColumnOption[] = (dataset.columns ?? [])
          .filter((c) => {
            if (!c.column_name || !c.type) return true;
            if (timeTypes.test(c.type) || timeTypes.test(c.column_name))
              return true;
            if (idPattern.test(c.column_name)) return true;
            return !numericTypes.test(c.type);
          })
          .map((c) => ({
            datasetId: dsId,
            column: c.column_name,
            name: c.column_name,
          }));
        setDatasetCompareColumns(allColumns);
        setInitialCompareColumns(
          allColumns.filter((c) => chartGroupbyCols.includes(c.column)),
        );
      })
      .catch(() => {
        setDatasetCompareColumns([]);
        setInitialCompareColumns([]);
      });
  }, [compareModalOpen, compareChartId, chartMeta]);

  const handleToggleCompare = useCallback(
    (chartId: number) => {
      if (compareConfig?.enabled && compareConfig.chartId === chartId) {
        setCompareConfig(null);
        setMirrorData({});
      } else {
        setCompareChartId(chartId);
        setCompareModalOpen(true);
      }
    },
    [compareConfig],
  );

  const handleApplyCompare = useCallback(
    (dimensions: CompareDimension[]) => {
      if (compareChartId == null) return;
      const cc: CompareConfig = {
        enabled: true,
        chartId: compareChartId,
        dimensions,
      };
      setCompareConfig(cc);
      setCompareModalOpen(false);
      fetchMirrorData(compareChartId, dimensions, undefined, true);
    },
    [compareChartId, fetchMirrorData],
  );

  const closeCompareModal = useCallback(() => {
    setCompareModalOpen(false);
    setCompareChartId(null);
  }, []);

  const closePeriodModal = useCallback(() => {
    setPeriodModalOpen(false);
    setPeriodModalChartId(null);
    setPeriodModalChartData(undefined);
  }, []);

  const openPeriodModal = useCallback(
    (chartId: number, data: ChartDataPayload) => {
      setPeriodModalChartId(chartId);
      setPeriodModalChartData(data);
      setPeriodModalOpen(true);
    },
    [],
  );

  const compareFullData =
    compareChartId != null ? chartData[compareChartId] : undefined;
  const compareChartMeta =
    periodModalChartId != null ? chartMeta[periodModalChartId] : undefined;

  return {
    compareConfig,
    mirrorData,
    compareModalOpen,
    compareChartId,
    periodModalOpen,
    periodModalChartId,
    periodModalChartData,
    datasetCompareColumns,
    initialCompareColumns,
    handleToggleCompare,
    handleApplyCompare,
    closeCompareModal,
    closePeriodModal,
    openPeriodModal,
    fetchMirrorData,
    compareFullData,
    compareChartMeta,
  };
}
