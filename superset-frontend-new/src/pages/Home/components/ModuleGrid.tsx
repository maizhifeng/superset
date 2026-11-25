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
import Typography from "@mui/material/Typography";
import AccentCard from "@/components/AccentCard";
import Icon from "@/superset-ui-mui/components/Icon";
import { Grid2 } from "@/superset-ui-mui/components";
import type { HomeStats } from "@/hooks/useHomeStats";

interface HomeLink {
  title: string;
  path: string;
  icon: string;
  desc: string;
  color: string;
  /** 展示在卡片右上角的实时数量徽标。 */
  count?: number;
  /** 标题旁的补充说明（如 SQL 实验室显示已保存查询数）。 */
  meta?: string;
  error?: string;
}

const links: HomeLink[] = [
  {
    title: "图表",
    path: "/chart/list",
    icon: "chart",
    desc: "创建和管理图表",
    color: "primary.main",
    count: 0,
  },
  {
    title: "仪表板",
    path: "/dashboard/list",
    icon: "dashboard",
    desc: "将图表组织到仪表板中",
    color: "success.main",
    count: 0,
  },
  {
    title: "专题分析",
    path: "/analysis",
    icon: "insights",
    desc: "成本、留存、LTV、付费与渠道效率",
    color: "secondary.main",
  },
  {
    title: "SQL 实验室",
    path: "/sqllab",
    icon: "code",
    desc: "编写和运行 SQL 查询",
    color: "secondary.main",
  },
  {
    title: "数据库",
    path: "/database/list",
    icon: "database",
    desc: "连接到您的数据源",
    color: "warning.main",
  },
  {
    title: "数据集",
    path: "/dataset/list",
    icon: "table",
    desc: "管理您的数据表",
    color: "info.main",
    count: 0,
  },
  {
    title: "查询历史",
    path: "/query_history",
    icon: "history",
    desc: "查看过往查询",
    color: "error.main",
  },
];

function applyCounts(links: HomeLink[], stats: HomeStats): HomeLink[] {
  const countByPath: Record<string, number | undefined> = {
    "/chart/list": stats.charts,
    "/dashboard/list": stats.dashboards,
    "/dataset/list": stats.datasets,
    "/database/list": stats.databases,
  };
  const errorByPath: Record<string, string | undefined> = {
    "/chart/list": stats.errors.charts,
    "/dashboard/list": stats.errors.dashboards,
    "/dataset/list": stats.errors.datasets,
    "/database/list": stats.errors.databases,
    "/sqllab": stats.errors.savedQueries,
  };
  const metaByPath: Record<string, string | undefined> = {
    "/sqllab": stats.errors.savedQueries
      ? "查询数加载失败"
      : `已保存 ${stats.savedQueries} 个查询`,
  };
  return links.map((link) => ({
    ...link,
    count: errorByPath[link.path] ? undefined : countByPath[link.path],
    meta: metaByPath[link.path],
    error: errorByPath[link.path],
  }));
}

function ModuleCard({ link }: { link: HomeLink }) {
  const navigate = useNavigate();
  return (
    <AccentCard
      onClick={() => navigate(link.path)}
      icon={<Icon name={link.icon} size={22} sx={{ color: link.color }} />}
      title={link.title}
      description={link.desc}
    >
      {(typeof link.count === "number" || link.error) && (
        <Box
          title={link.error}
          sx={{
            position: "absolute",
            top: 12,
            right: 12,
            minWidth: 34,
            px: 0.75,
            py: 0.25,
            borderRadius: 1.25,
            textAlign: "center",
            fontSize: "0.8125rem",
            fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            color: link.error ? "common.white" : "text.primary",
            bgcolor: link.error ? "error.main" : "action.hover",
          }}
        >
          {link.error ? "!" : link.count?.toLocaleString()}
        </Box>
      )}
      <Box sx={{ minHeight: 20, mt: 0.75 }}>
        {link.meta && (
          <Typography
            variant="caption"
            color="text.disabled"
            sx={{ display: "block", lineHeight: "20px" }}
          >
            {link.meta}
          </Typography>
        )}
      </Box>
    </AccentCard>
  );
}

export default function ModuleGrid({ stats }: { stats: HomeStats }) {
  const grid = applyCounts(links, stats);
  return (
    <Grid2 container spacing={2}>
      {grid.map((link) => (
        <Grid2 size={{ xs: 12, sm: 6, md: 4 }} key={link.path}>
          <ModuleCard link={link} />
        </Grid2>
      ))}
    </Grid2>
  );
}
