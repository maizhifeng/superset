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
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { useNotificationStore } from "@/store/notificationStore";
import type { HomeStats, HomeStatsErrorKey } from "@/hooks/useHomeStats";
import { formatStatSummary, handleRowKeyDown } from "../utils/homeFormatting";

export default function StatStrip({ stats }: { stats: HomeStats }) {
  const navigate = useNavigate();
  const items: {
    key: HomeStatsErrorKey;
    label: string;
    value: number;
    path: string;
    error?: string;
  }[] = [
    {
      key: "dashboards",
      label: "仪表板数",
      value: stats.dashboards,
      path: "/dashboard/list",
      error: stats.errors.dashboards,
    },
    {
      key: "charts",
      label: "图表数",
      value: stats.charts,
      path: "/chart/list",
      error: stats.errors.charts,
    },
    {
      key: "datasets",
      label: "数据集数",
      value: stats.datasets,
      path: "/dataset/list",
      error: stats.errors.datasets,
    },
    {
      key: "databases",
      label: "数据库数",
      value: stats.databases,
      path: "/database/list",
      error: stats.errors.databases,
    },
    {
      key: "savedQueries",
      label: "已保存查询数",
      value: stats.savedQueries,
      path: "/saved_query/list",
      error: stats.errors.savedQueries,
    },
  ];
  const notify = useNotificationStore((s) => s.notify);
  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(formatStatSummary(items));
      notify({ severity: "success", message: "已复制数据概览" });
    } catch {
      notify({ severity: "error", message: "复制失败" });
    }
  };
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        mb: 3,
        px: 0.5,
        alignItems: "center",
      }}
    >
      {items.map((item) => (
        <Tooltip
          key={item.key}
          title={item.error ?? `查看${item.label.replace("数", "")}列表`}
        >
          <Box
            role="button"
            tabIndex={0}
            aria-label={`查看${item.label.replace("数", "")}列表`}
            onClick={() => navigate(item.path)}
            onKeyDown={(event) =>
              handleRowKeyDown(event, () => navigate(item.path))
            }
            sx={{
              display: "flex",
              alignItems: "baseline",
              gap: 0.5,
              px: 1,
              py: 0.5,
              borderRadius: 1,
              cursor: "pointer",
              "&:hover": { bgcolor: "action.hover" },
            }}
          >
            <Typography
              variant="h6"
              sx={{
                fontWeight: 700,
                lineHeight: 1,
                color: item.error ? "error.main" : "text.primary",
              }}
            >
              {stats.loading
                ? "–"
                : item.error
                  ? "!"
                  : item.value.toLocaleString()}
            </Typography>
            <Typography
              variant="caption"
              color={item.error ? "error" : "text.secondary"}
            >
              {item.error ? `${item.label}加载失败：${item.error}` : item.label}
            </Typography>
          </Box>
        </Tooltip>
      ))}
      <Button
        size="small"
        color="inherit"
        startIcon={<ContentCopyIcon sx={{ fontSize: 16 }} />}
        onClick={() => void handleCopySummary()}
        sx={{ ml: 0.5, color: "text.secondary", fontSize: "0.75rem" }}
      >
        复制概览
      </Button>
    </Box>
  );
}
