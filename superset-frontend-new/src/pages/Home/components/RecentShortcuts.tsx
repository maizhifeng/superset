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

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, type NavigateOptions, type To } from "react-router-dom";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ClearIcon from "@mui/icons-material/Clear";
import CodeIcon from "@mui/icons-material/Code";
import Icon from "@/superset-ui-mui/components/Icon";
import { useRecentCharts } from "@/store/recentCharts";
import { useRecentDashboards } from "@/store/recentDashboards";
import {
  HOME_ITEM_SOURCES,
  useHomeItems,
  type HomeItem,
  type HomeItemSource,
} from "../hooks/useHomeItems";
import {
  formatQueryPreview,
  handleRowKeyDown,
  readRecentQueries,
  RECENT_QUERY_STORAGE_KEY,
} from "../utils/homeFormatting";

type HomeNavigation = readonly [To, NavigateOptions?];

interface RecentlyViewedSectionProps {
  title: string;
  ids: number[];
  source: HomeItemSource;
  icon: ReactNode;
  itemLabel: string;
  clear: () => void;
  getNavigation: (item: HomeItem) => HomeNavigation;
}

function RecentlyViewedSection({
  title,
  ids,
  source,
  icon,
  itemLabel,
  clear,
  getNavigation,
}: RecentlyViewedSectionProps) {
  const navigate = useNavigate();
  const items = useHomeItems(ids, source);

  if (items.length === 0) return null;

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {icon}
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
        <Box sx={{ flex: 1 }} />
        <Box
          component="button"
          onClick={clear}
          sx={{
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "text.secondary",
            "&:hover": { color: "primary.main", textDecoration: "underline" },
          }}
        >
          清空
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {items.map((item) => {
          const openItem = () => {
            const [to, options] = getNavigation(item);
            if (options) {
              navigate(to, options);
            } else {
              navigate(to);
            }
          };
          return (
            <Box
              key={item.id}
              role="button"
              tabIndex={0}
              aria-label={`${itemLabel} ${item.title}`}
              onClick={openItem}
              onKeyDown={(event) => handleRowKeyDown(event, openItem)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 1.5,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              {icon}
              <Typography
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: "0.8125rem",
                }}
              >
                {item.title}
              </Typography>
              <ChevronRightIcon sx={{ fontSize: 16, color: "text.disabled" }} />
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

const openChart: (item: HomeItem) => HomeNavigation = (item) => [
  `/explore?slice_id=${item.id}`,
];
const openDashboard: (item: HomeItem) => HomeNavigation = (item) => [
  `/dashboard/${item.id}`,
];

export function RecentlyViewedCharts() {
  const recentItems = useRecentCharts((s) => s.items);
  const ids = useMemo(() => recentItems.map((item) => item.id), [recentItems]);
  return (
    <RecentlyViewedSection
      title="最近打开的图表"
      ids={ids}
      source={HOME_ITEM_SOURCES.chart}
      icon={
        <Icon
          name="chart"
          size={16}
          sx={{ color: "primary.main", display: "flex" }}
        />
      }
      itemLabel="打开图表"
      clear={() => useRecentCharts.getState().clear()}
      getNavigation={openChart}
    />
  );
}

export function RecentlyViewedDashboards() {
  const recentItems = useRecentDashboards((s) => s.items);
  const ids = useMemo(() => recentItems.map((item) => item.id), [recentItems]);
  return (
    <RecentlyViewedSection
      title="最近打开"
      ids={ids}
      source={HOME_ITEM_SOURCES.dashboard}
      icon={
        <Icon
          name="history"
          size={16}
          sx={{ color: "text.secondary", display: "flex" }}
        />
      }
      itemLabel="打开仪表板"
      clear={() => useRecentDashboards.getState().clear()}
      getNavigation={openDashboard}
    />
  );
}

export function RecentQueries() {
  const navigate = useNavigate();
  const [queries, setQueries] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_QUERY_STORAGE_KEY);
      setQueries(readRecentQueries(raw));
    } catch {
      setQueries([]);
    }
  }, []);

  if (queries.length === 0) return null;

  const clearQueries = () => {
    localStorage.removeItem(RECENT_QUERY_STORAGE_KEY);
    setQueries([]);
  };

  return (
    <Paper
      variant="outlined"
      sx={{
        mb: 3,
        borderRadius: 2,
        overflow: "hidden",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          最近的查询
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            · {queries.length}
          </Typography>
          <Tooltip title="清除记录">
            <IconButton
              size="small"
              aria-label="清除查询记录"
              onClick={clearQueries}
              sx={{ p: 0.5, color: "text.secondary" }}
            >
              <ClearIcon sx={{ fontSize: 15 }} />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {queries.map((query, index) => {
          const oneLine = formatQueryPreview(query);
          const openQuery = () =>
            navigate("/sqllab", { state: { initialSql: query } });
          return (
            <Box
              key={`${query}-${index}`}
              role="button"
              tabIndex={0}
              aria-label={`重新运行查询 ${oneLine || query}`}
              onClick={openQuery}
              onKeyDown={(event) => handleRowKeyDown(event, openQuery)}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1.5,
                px: 1.5,
                py: 1,
                borderRadius: 1.5,
                cursor: "pointer",
                "&:hover": { bgcolor: "action.hover" },
              }}
            >
              <CodeIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              <Typography
                sx={{
                  flex: 1,
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "monospace",
                  fontSize: "0.8125rem",
                }}
              >
                {oneLine || query}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}
