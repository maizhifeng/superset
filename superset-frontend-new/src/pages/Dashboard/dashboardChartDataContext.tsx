import { createContext, useContext, type ReactNode } from "react";
import type {
  ChartData,
  ChartDataPayload,
  ChartDataRow,
} from "@/types/api";
import type { CompareConfig } from "@/pages/Dashboard/ChartCard";

/**
 * React context carrying the per-chart data maps for the dashboard grid.
 *
 * These maps used to be passed straight through DashboardGrid's props to
 * every ChartCard.  Hoisting them into a context keeps DashboardGrid's props
 * focused on layout + callbacks while leaves (ChartCard) read the data they
 * need without prop drilling.  The provider is created by the Dashboard page
 * from useDashboardState.
 */

export interface DashboardChartData {
  chartMeta: Record<number, ChartData>;
  chartData: Record<number, ChartDataPayload>;
  chartLoading: Record<number, boolean>;
  totalRows?: Record<number, ChartDataRow | null>;
  pivotTotalRows?: Record<number, ChartDataRow[]>;
  pivotSubtotalRows?: Record<number, ChartDataRow[][]>;
  metricFormatMaps?: Record<number, Record<string, string>>;
  chartPages?: Record<number, number>;
  chartHasMore?: Record<number, boolean>;
  mirrorData?: ChartDataPayload;
  compareConfig?: CompareConfig | null;
}

const DashboardChartDataContext = createContext<DashboardChartData | null>(
  null,
);

export function DashboardChartDataProvider({
  value,
  children,
}: {
  value: DashboardChartData;
  children: ReactNode;
}) {
  return (
    <DashboardChartDataContext.Provider value={value}>
      {children}
    </DashboardChartDataContext.Provider>
  );
}

export function useDashboardChartData(): DashboardChartData {
  const ctx = useContext(DashboardChartDataContext);
  if (!ctx) {
    throw new Error(
      "useDashboardChartData must be used within DashboardChartDataProvider",
    );
  }
  return ctx;
}
