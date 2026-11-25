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
import BarChartIcon from "@mui/icons-material/BarChart";
import CodeIcon from "@mui/icons-material/Code";
import DashboardIcon from "@mui/icons-material/Dashboard";
import HistoryIcon from "@mui/icons-material/History";
import TableChartIcon from "@mui/icons-material/TableChart";
import { useRecentDashboards } from "@/store/recentDashboards";
import type { ReactNode } from "react";

export default function QuickActions() {
  const navigate = useNavigate();
  const recentDbs = useRecentDashboards((s) => s.items);
  const lastId = recentDbs.length > 0 ? recentDbs[0].id : null;
  const actions: {
    label: string;
    icon: ReactNode;
    onClick: () => void;
    color: string;
  }[] = [
    ...(lastId
      ? [
          {
            label: "继续上次",
            icon: <HistoryIcon sx={{ fontSize: 20 }} />,
            onClick: () => navigate(`/dashboard/${lastId}`),
            color: "text.secondary",
          },
        ]
      : []),
    {
      label: "新建图表",
      icon: <BarChartIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/explore"),
      color: "primary.main",
    },
    {
      label: "打开 SQL 实验室",
      icon: <CodeIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/sqllab"),
      color: "secondary.main",
    },
    {
      label: "新建仪表板",
      icon: <DashboardIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/dashboard/list"),
      color: "success.main",
    },
    {
      label: "新建数据集",
      icon: <TableChartIcon sx={{ fontSize: 20 }} />,
      onClick: () => navigate("/dataset/create"),
      color: "info.main",
    },
  ];
  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 1,
        mb: 3,
      }}
    >
      {actions.map((action) => (
        <Button
          key={action.label}
          variant="outlined"
          size="small"
          onClick={action.onClick}
          startIcon={action.icon}
          sx={{ textTransform: "none", color: action.color }}
        >
          {action.label}
        </Button>
      ))}
    </Box>
  );
}
