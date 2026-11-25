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

import { useState } from "react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import type { DatasetMetric } from "@/types/api";
import { ROWS_PER_PAGE } from "../datasetUtils";
import TablePagination from "./TablePagination";

const METRIC_HEADERS = [
  ["名称", "12%"],
  ["表达式", "36%"],
  ["显示名称", "10%"],
  ["描述", "20%"],
  ["D3 格式", "8%"],
  ["操作", "14%", "center"],
] as const;

interface MetricsTabProps {
  metrics: DatasetMetric[];
  onCopyMetricFormula: (metric: DatasetMetric) => Promise<void>;
  onEditMetric: (metric: DatasetMetric) => void;
  onDeleteMetric: (metric: DatasetMetric) => void;
}

export default function MetricsTab({
  metrics,
  onCopyMetricFormula,
  onEditMetric,
  onDeleteMetric,
}: MetricsTabProps) {
  const [page, setPage] = useState(0);
  const visibleMetrics = metrics
    .sort((a, b) => (a.metric_name || "").localeCompare(b.metric_name || ""))
    .slice(page * ROWS_PER_PAGE, (page + 1) * ROWS_PER_PAGE);

  return (
    <>
      <TableContainer
        sx={{
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 1,
          flex: 1,
          overflow: "auto",
        }}
      >
        <Table size="small" stickyHeader sx={{ tableLayout: "fixed" }}>
          <TableHead>
            <TableRow>
              {METRIC_HEADERS.map(([heading, width, align]) => (
                <TableCell
                  key={heading}
                  sx={{
                    fontWeight: 700,
                    bgcolor: "grey.50",
                    fontSize: "0.75rem",
                    width,
                    py: 1,
                    textAlign: align,
                  }}
                >
                  {heading}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {visibleMetrics.map((metric) => (
              <TableRow
                key={metric.id}
                hover
                sx={{ "&:last-child td": { border: 0 } }}
              >
                <TableCell sx={{ fontSize: "0.75rem", fontWeight: 500 }}>
                  {metric.metric_name}
                </TableCell>
                <TableCell
                  sx={{
                    fontSize: "0.75rem",
                    fontFamily: "monospace",
                    maxWidth: 350,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  <Tooltip
                    title={
                      <Typography
                        sx={{
                          fontFamily: "monospace",
                          fontSize: "0.75rem",
                        }}
                      >
                        {metric.expression}
                      </Typography>
                    }
                    placement="bottom-start"
                    slotProps={{
                      popper: {
                        sx: {
                          "& .MuiTooltip-tooltip": { maxWidth: 600 },
                        },
                      },
                    }}
                  >
                    <span>{metric.expression}</span>
                  </Tooltip>
                </TableCell>
                <TableCell sx={{ fontSize: "0.75rem" }}>
                  {metric.verbose_name ?? ""}
                </TableCell>
                <TableCell sx={{ fontSize: "0.75rem" }}>
                  {metric.description ?? ""}
                </TableCell>
                <TableCell sx={{ fontSize: "0.75rem" }}>
                  {metric.d3format ?? ""}
                </TableCell>
                <TableCell
                  sx={{
                    fontSize: "0.75rem",
                    whiteSpace: "nowrap",
                    textAlign: "center",
                    px: 0.5,
                  }}
                >
                  <IconButton
                    size="small"
                    aria-label={`复制指标 ${metric.metric_name} 的算式`}
                    onClick={() => void onCopyMetricFormula(metric)}
                    sx={{ p: 0.25 }}
                  >
                    <ContentCopyIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`编辑指标 ${metric.metric_name}`}
                    onClick={() => onEditMetric(metric)}
                    sx={{ p: 0.25 }}
                  >
                    <EditIcon fontSize="inherit" />
                  </IconButton>
                  <IconButton
                    size="small"
                    aria-label={`删除指标 ${metric.metric_name}`}
                    onClick={() => onDeleteMetric(metric)}
                    sx={{ p: 0.25, color: "error.main" }}
                  >
                    <DeleteIcon fontSize="inherit" />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        total={metrics.length}
        page={page}
        onPageChange={setPage}
      />
    </>
  );
}
