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
import api from "@/api";

export interface HomeItem {
  id: number;
  title: string;
  sql?: string;
}

type HomeItemTitleKey =
  | "dashboard_title"
  | "slice_name"
  | "table_name"
  | "database_name"
  | "label"
  | "name";

export interface HomeItemSource {
  endpoint: string;
  titleKey: HomeItemTitleKey;
  fallbackPrefix: string;
  includeSql?: boolean;
}

export const HOME_ITEM_SOURCES = {
  dashboard: {
    endpoint: "/dashboard",
    titleKey: "dashboard_title",
    fallbackPrefix: "仪表板",
  },
  chart: {
    endpoint: "/chart",
    titleKey: "slice_name",
    fallbackPrefix: "图表",
  },
  dataset: {
    endpoint: "/dataset",
    titleKey: "table_name",
    fallbackPrefix: "数据集",
  },
  database: {
    endpoint: "/database",
    titleKey: "database_name",
    fallbackPrefix: "数据库",
  },
  savedQuery: {
    endpoint: "/saved_query",
    titleKey: "label",
    fallbackPrefix: "查询",
    includeSql: true,
  },
  alert: {
    endpoint: "/report",
    titleKey: "name",
    fallbackPrefix: "警报",
  },
} as const satisfies Record<string, HomeItemSource>;

type HomeItemResponse = {
  result?: Partial<Record<HomeItemTitleKey, string>> & { sql?: string };
};

export function useHomeItems(
  ids: readonly number[],
  source: HomeItemSource,
): HomeItem[] {
  const [items, setItems] = useState<HomeItem[]>([]);

  useEffect(() => {
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    const controller = new AbortController();
    Promise.all(
      ids.map((id) =>
        api
          .get<HomeItemResponse>(`${source.endpoint}/${id}`, {
            signal: controller.signal,
          })
          .then((res) => {
            const result = res.data.result;
            return {
              id,
              title:
                result?.[source.titleKey] ?? `${source.fallbackPrefix} ${id}`,
              ...(source.includeSql ? { sql: result?.sql } : {}),
            };
          })
          .catch(() => null),
      ),
    )
      .then((resolved) =>
        setItems(resolved.filter((item): item is HomeItem => item !== null)),
      )
      .catch(() => setItems([]));
    return () => controller.abort();
  }, [ids, source]);

  return items;
}
