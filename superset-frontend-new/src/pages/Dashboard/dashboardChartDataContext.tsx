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

import { createContext, useContext, type ReactNode } from "react";
import type { ChartData, ChartDataPayload, ChartDataRow } from "@/types/api";
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
  chartErrors?: Record<number, string>;
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
