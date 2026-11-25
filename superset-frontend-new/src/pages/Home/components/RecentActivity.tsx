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

import { useNavigate } from "react-router-dom";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Paper from "@mui/material/Paper";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import BarChartIcon from "@mui/icons-material/BarChart";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import StarBorderIcon from "@mui/icons-material/StarBorder";
import StarIcon from "@mui/icons-material/Star";
import TableChartIcon from "@mui/icons-material/TableChart";
import Icon from "@/superset-ui-mui/components/Icon";
import { useNotificationStore } from "@/store/notificationStore";
import { useDashboardFavorites } from "@/store/dashboardFavorites";
import { formatRelativeTime } from "@/utils/datetime";
import type { HomeStats } from "@/hooks/useHomeStats";
import { handleRowKeyDown } from "../utils/homeFormatting";

function RecentLoadError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <Alert severity="error" sx={{ mb: 2 }}>
      {message}
    </Alert>
  );
}

function RecentDashboards({ stats }: { stats: HomeStats }) {
  const navigate = useNavigate();
  const favIds = useDashboardFavorites((s) => s.ids);
  const toggleFavorite = useDashboardFavorites((s) => s.toggle);
  const notify = useNotificationStore((s) => s.notify);
  const handleCopyLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dashboard/${id}`,
      );
      notify({ severity: "success", message: "已复制仪表板链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  if (stats.loading) return null;
  if (stats.errors.recentDashboards) {
    return <RecentLoadError message={stats.errors.recentDashboards} />;
  }
  if (stats.recentDashboards.length === 0) return null;

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
          最近更新的仪表板
        </Typography>
        <Box
          component="button"
          onClick={() => navigate("/dashboard/list")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "primary.main",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          查看全部
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {stats.recentDashboards.map((dashboard) => (
          <Box
            key={dashboard.id}
            role="button"
            tabIndex={0}
            aria-label={`打开仪表板 ${dashboard.dashboard_title}`}
            onClick={() => navigate(`/dashboard/${dashboard.id}`)}
            onKeyDown={(event) =>
              handleRowKeyDown(event, () =>
                navigate(`/dashboard/${dashboard.id}`),
              )
            }
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
            <Icon name="dashboard" size={16} sx={{ color: "success.main" }} />
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
              {dashboard.dashboard_title}
            </Typography>
            <Tooltip title="复制链接">
              <IconButton
                size="small"
                aria-label="复制链接"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCopyLink(dashboard.id);
                }}
                sx={{ p: 0.25 }}
              >
                <ContentCopyIcon
                  sx={{ fontSize: 15, color: "text.disabled" }}
                />
              </IconButton>
            </Tooltip>
            <Tooltip
              title={favIds.includes(dashboard.id) ? "取消收藏" : "收藏"}
            >
              <IconButton
                size="small"
                aria-label={favIds.includes(dashboard.id) ? "取消收藏" : "收藏"}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(dashboard.id);
                }}
                sx={{ p: 0.25 }}
              >
                {favIds.includes(dashboard.id) ? (
                  <StarIcon sx={{ fontSize: 15, color: "warning.main" }} />
                ) : (
                  <StarBorderIcon
                    sx={{ fontSize: 15, color: "text.disabled" }}
                  />
                )}
              </IconButton>
            </Tooltip>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ flexShrink: 0 }}
            >
              {formatRelativeTime(dashboard.changed_on_utc)}
            </Typography>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function RecentDatasets({ stats }: { stats: HomeStats }) {
  const navigate = useNavigate();
  const notify = useNotificationStore((s) => s.notify);

  const handleCopyLink = async (id: number) => {
    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/dataset/edit/${id}`,
      );
      notify({ severity: "success", message: "已复制数据集链接" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };

  if (stats.loading) return null;
  if (stats.errors.recentDatasets) {
    return <RecentLoadError message={stats.errors.recentDatasets} />;
  }
  if (stats.recentDatasets.length === 0) return null;

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
          最近更新的数据集
        </Typography>
        <Box
          component="button"
          onClick={() => navigate("/dataset/list")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "primary.main",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          查看全部
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {stats.recentDatasets.map((dataset) => (
          <Box
            key={dataset.id}
            role="button"
            tabIndex={0}
            aria-label={`编辑数据集 ${dataset.table_name}`}
            onClick={() => navigate(`/dataset/edit/${dataset.id}`)}
            onKeyDown={(event) =>
              handleRowKeyDown(event, () =>
                navigate(`/dataset/edit/${dataset.id}`),
              )
            }
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
            <TableChartIcon sx={{ fontSize: 16, color: "info.main" }} />
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
              {dataset.table_name}
            </Typography>
            <Tooltip title="复制链接">
              <IconButton
                size="small"
                aria-label="复制链接"
                onClick={(event) => {
                  event.stopPropagation();
                  void handleCopyLink(dataset.id);
                }}
                sx={{ p: 0.25 }}
              >
                <ContentCopyIcon
                  sx={{ fontSize: 15, color: "text.disabled" }}
                />
              </IconButton>
            </Tooltip>
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function RecentCharts({ stats }: { stats: HomeStats }) {
  const navigate = useNavigate();

  if (stats.loading) return null;
  if (stats.errors.recentCharts) {
    return <RecentLoadError message={stats.errors.recentCharts} />;
  }
  if (stats.recentCharts.length === 0) return null;

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
          最近更新的图表
        </Typography>
        <Box
          component="button"
          onClick={() => navigate("/chart/list")}
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.25,
            border: "none",
            bgcolor: "transparent",
            cursor: "pointer",
            fontSize: "0.75rem",
            color: "primary.main",
            "&:hover": { textDecoration: "underline" },
          }}
        >
          查看全部
          <ChevronRightIcon sx={{ fontSize: 14 }} />
        </Box>
      </Box>
      <Box sx={{ px: 1, py: 0.5 }}>
        {stats.recentCharts.map((chart) => (
          <Box
            key={chart.id}
            role="button"
            tabIndex={0}
            aria-label={`打开图表 ${chart.slice_name}`}
            onClick={() => navigate(`/explore?slice_id=${chart.id}`)}
            onKeyDown={(event) =>
              handleRowKeyDown(event, () =>
                navigate(`/explore?slice_id=${chart.id}`),
              )
            }
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
            <BarChartIcon sx={{ fontSize: 16, color: "primary.main" }} />
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
              {chart.slice_name}
            </Typography>
            <ChevronRightIcon sx={{ fontSize: 16, color: "text.disabled" }} />
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

export default function RecentActivity({ stats }: { stats: HomeStats }) {
  return (
    <>
      <RecentDashboards stats={stats} />
      <RecentDatasets stats={stats} />
      <RecentCharts stats={stats} />
    </>
  );
}
