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

import type { ReactNode } from "react";
import { Box, Paper, Typography } from "@mui/material";
import AutoFixHighIcon from "@mui/icons-material/AutoFixHigh";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import CodeIcon from "@mui/icons-material/Code";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SaveIcon from "@mui/icons-material/Save";
import { monoFontFamily } from "@/theme/typography";

interface QueryHintCardProps {
  icon: ReactNode;
  title: string;
  hint?: string;
  description: string;
}

function QueryHintCard({ icon, title, hint, description }: QueryHintCardProps) {
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        display: "flex",
        alignItems: "flex-start",
        gap: 1,
        p: 1.25,
        borderRadius: 1.5,
        border: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        textAlign: "left",
      }}
    >
      <Box
        sx={{
          width: 26,
          height: 26,
          borderRadius: 1,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          bgcolor: "bg.muted",
          color: "primary.main",
          flexShrink: 0,
          mt: 0.125,
          "& svg": { fontSize: 16 },
        }}
      >
        {icon}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
          }}
        >
          <Typography
            variant="caption"
            sx={{ fontWeight: 600, color: "text.primary" }}
          >
            {title}
          </Typography>
          {hint && (
            <Box
              component="kbd"
              sx={{
                fontFamily: monoFontFamily,
                fontSize: "0.625rem",
                lineHeight: 1.6,
                px: 0.5,
                borderRadius: "4px",
                border: "1px solid",
                borderColor: "divider",
                bgcolor: "surface.variant",
                color: "text.secondary",
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              {hint}
            </Box>
          )}
        </Box>
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{ display: "block", mt: 0.25, lineHeight: 1.45 }}
        >
          {description}
        </Typography>
      </Box>
    </Box>
  );
}

export default function QueryResultsEmptyState({
  mode,
}: {
  mode: "sql" | "visual";
}) {
  return (
    <Paper
      variant="outlined"
      sx={{
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        borderRadius: 2,
        borderStyle: "dashed",
        borderColor: "divider",
        bgcolor: "surface.variant",
        px: { xs: 2, md: 4 },
        py: 2,
        containerType: "size",
      }}
    >
      <Box
        sx={{
          m: "auto",
          width: "100%",
          maxWidth: 720,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          "@container (max-height: 190px)": { gap: 1.5 },
        }}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: "center",
            gap: 1.5,
            textAlign: { xs: "center", sm: "left" },
          }}
        >
          <Box
            sx={{
              width: 44,
              height: 44,
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              bgcolor: "background.paper",
              border: "1px solid",
              borderColor: "divider",
              color: "primary.main",
              flexShrink: 0,
            }}
          >
            {mode === "visual" ? (
              <AutoFixHighIcon sx={{ fontSize: 22 }} />
            ) : (
              <CodeIcon sx={{ fontSize: 22 }} />
            )}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="subtitle1"
              sx={{
                fontWeight: 600,
                color: "text.primary",
                mb: 0.25,
                lineHeight: 1.4,
              }}
            >
              {mode === "visual"
                ? "运行可视化查询以查看结果"
                : "运行 SQL 以查看结果"}
            </Typography>
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ lineHeight: 1.5 }}
            >
              {mode === "visual"
                ? "在上方「数据源」选择数据库、模式与数据表，配置关联、字段、筛选与汇总，然后点击运行。"
                : "从左面板选择数据库和模式，编写 SQL，然后点击运行。"}
            </Typography>
          </Box>
        </Box>
        <Box
          sx={{
            display: "flex",
            flexDirection: { xs: "column", sm: "row" },
            alignItems: "stretch",
            gap: 1,
            width: "100%",
            "@container (max-height: 140px)": { display: "none" },
          }}
        >
          <QueryHintCard
            icon={<PlayArrowIcon />}
            title="运行查询"
            hint="Ctrl+Enter / Ctrl+R"
            description={
              mode === "visual"
                ? "按当前组装配置生成并执行 SQL"
                : "执行编辑器中的 SQL"
            }
          />
          <QueryHintCard
            icon={<FormatAlignLeftIcon />}
            title="格式化 SQL"
            hint="Ctrl+Shift+F"
            description={
              mode === "sql"
                ? "整理当前 SQL 的缩进与换行"
                : "切换到 SQL 模式后可用"
            }
          />
          {mode === "visual" ? (
            <QueryHintCard
              icon={<ArrowForwardIcon />}
              title="切换 SQL 模式"
              description="把生成的 SQL 带到编辑器继续手写"
            />
          ) : (
            <QueryHintCard
              icon={<SaveIcon />}
              title="保存为数据集"
              description="查询返回结果后可保存为数据集"
            />
          )}
        </Box>
        <Typography
          variant="caption"
          color="text.disabled"
          sx={{ "@container (max-height: 200px)": { display: "none" } }}
        >
          Ctrl+T 新建标签页 · Ctrl+S 保存查询
        </Typography>
      </Box>
    </Paper>
  );
}
