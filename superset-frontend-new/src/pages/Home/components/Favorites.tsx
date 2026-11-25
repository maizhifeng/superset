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

import { useNavigate, type NavigateOptions, type To } from "react-router-dom";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import { useAlertFavorites } from "@/store/alertFavorites";
import { useChartFavorites } from "@/store/chartFavorites";
import { useDashboardFavorites } from "@/store/dashboardFavorites";
import { useDatabaseFavorites } from "@/store/databaseFavorites";
import { useDatasetFavorites } from "@/store/datasetFavorites";
import { useSavedQueryFavorites } from "@/store/savedQueryFavorites";
import {
  HOME_ITEM_SOURCES,
  useHomeItems,
  type HomeItem,
  type HomeItemSource,
} from "../hooks/useHomeItems";
import { handleRowKeyDown } from "../utils/homeFormatting";

type HomeNavigation = readonly [To, NavigateOptions?];

const openDashboardLabel = (item: HomeItem) => `打开仪表板 ${item.title}`;
const openChartLabel = (item: HomeItem) => `打开图表 ${item.title}`;
const editDatasetLabel = (item: HomeItem) => `编辑数据集 ${item.title}`;
const openDatabaseLabel = (item: HomeItem) => `打开数据库 ${item.title}`;
const openQueryLabel = (item: HomeItem) => `打开查询 ${item.title}`;
const openAlertLabel = (item: HomeItem) => `打开警报 ${item.title}`;

const openDashboard: (item: HomeItem) => HomeNavigation = (item) => [
  `/dashboard/${item.id}`,
];
const openChart: (item: HomeItem) => HomeNavigation = (item) => [
  `/explore?slice_id=${item.id}`,
];
const editDataset: (item: HomeItem) => HomeNavigation = (item) => [
  `/dataset/edit/${item.id}`,
];
const openDatabase: (item: HomeItem) => HomeNavigation = (item) => [
  `/database/${item.id}`,
];
const openQuery: (item: HomeItem) => HomeNavigation = (item) => [
  "/sqllab",
  { state: { initialSql: item.sql ?? "" } },
];
const openAlert: (item: HomeItem) => HomeNavigation = () => ["/alert/list"];

interface FavoriteSectionProps {
  title: string;
  ids: number[];
  source: HomeItemSource;
  toggleFavorite: (id: number) => void;
  getRowLabel: (item: HomeItem) => string;
  getNavigation: (item: HomeItem) => HomeNavigation;
}

function FavoriteSection({
  title,
  ids,
  source,
  toggleFavorite,
  getRowLabel,
  getNavigation,
}: FavoriteSectionProps) {
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
        <StarIcon sx={{ fontSize: 16, color: "warning.main" }} />
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          {title}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          · {items.length}
        </Typography>
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
              aria-label={getRowLabel(item)}
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
              <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
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
              <Tooltip title="移除收藏">
                <IconButton
                  size="small"
                  aria-label={`移除收藏 ${item.title}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    toggleFavorite(item.id);
                  }}
                  sx={{ p: 0.25 }}
                >
                  <StarBorderIcon
                    sx={{ fontSize: 15, color: "text.disabled" }}
                  />
                </IconButton>
              </Tooltip>
            </Box>
          );
        })}
      </Box>
    </Paper>
  );
}

export function FavoriteDashboards() {
  const ids = useDashboardFavorites((s) => s.ids);
  const toggleFavorite = useDashboardFavorites((s) => s.toggle);
  return (
    <FavoriteSection
      title="收藏的仪表板"
      ids={ids}
      source={HOME_ITEM_SOURCES.dashboard}
      toggleFavorite={toggleFavorite}
      getRowLabel={openDashboardLabel}
      getNavigation={openDashboard}
    />
  );
}

export function FavoriteCharts() {
  const ids = useChartFavorites((s) => s.ids);
  const toggleFavorite = useChartFavorites((s) => s.toggle);
  return (
    <FavoriteSection
      title="收藏的图表"
      ids={ids}
      source={HOME_ITEM_SOURCES.chart}
      toggleFavorite={toggleFavorite}
      getRowLabel={openChartLabel}
      getNavigation={openChart}
    />
  );
}

export function FavoriteDatasets() {
  const ids = useDatasetFavorites((s) => s.ids);
  const toggleFavorite = useDatasetFavorites((s) => s.toggle);
  return (
    <FavoriteSection
      title="收藏的数据集"
      ids={ids}
      source={HOME_ITEM_SOURCES.dataset}
      toggleFavorite={toggleFavorite}
      getRowLabel={editDatasetLabel}
      getNavigation={editDataset}
    />
  );
}

export function FavoriteDatabases() {
  const ids = useDatabaseFavorites((s) => s.ids);
  const toggleFavorite = useDatabaseFavorites((s) => s.toggle);
  return (
    <FavoriteSection
      title="收藏的数据库"
      ids={ids}
      source={HOME_ITEM_SOURCES.database}
      toggleFavorite={toggleFavorite}
      getRowLabel={openDatabaseLabel}
      getNavigation={openDatabase}
    />
  );
}

export function FavoriteSavedQueries() {
  const ids = useSavedQueryFavorites((s) => s.ids);
  const toggleFavorite = useSavedQueryFavorites((s) => s.toggle);
  return (
    <FavoriteSection
      title="收藏的查询"
      ids={ids}
      source={HOME_ITEM_SOURCES.savedQuery}
      toggleFavorite={toggleFavorite}
      getRowLabel={openQueryLabel}
      getNavigation={openQuery}
    />
  );
}

export function FavoriteAlerts() {
  const ids = useAlertFavorites((s) => s.ids);
  const toggleFavorite = useAlertFavorites((s) => s.toggle);
  return (
    <FavoriteSection
      title="收藏的警报"
      ids={ids}
      source={HOME_ITEM_SOURCES.alert}
      toggleFavorite={toggleFavorite}
      getRowLabel={openAlertLabel}
      getNavigation={openAlert}
    />
  );
}
