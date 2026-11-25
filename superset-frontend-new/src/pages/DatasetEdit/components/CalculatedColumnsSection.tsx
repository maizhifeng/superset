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

import { useCallback } from "react";
import type { Dispatch, SetStateAction } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import type { DatasetColumn, DatasetMetric } from "@/types/api";
import type { ComputedColumnConfig, ExtraConfig } from "../types";

const extraSectionHeaderSx = {
  "& .MuiCardHeader-title": { fontSize: "0.875rem", fontWeight: 600 },
  "& .MuiCardHeader-subheader": {
    fontSize: "0.75rem",
    color: "text.secondary",
    mt: 0.25,
  },
};

interface CalculatedColumnsSectionProps {
  computedColumns: ComputedColumnConfig[];
  availableColumns: DatasetColumn[];
  availableMetrics: DatasetMetric[];
  hasAvailableSources: boolean;
  onChange: Dispatch<SetStateAction<ExtraConfig>>;
}

export default function CalculatedColumnsSection({
  computedColumns,
  availableColumns,
  availableMetrics,
  hasAvailableSources,
  onChange,
}: CalculatedColumnsSectionProps) {
  const updateColumn = useCallback(
    (index: number, update: Partial<ComputedColumnConfig>): void => {
      onChange((current) => {
        const columns = [...(current.computed_columns ?? [])];
        columns[index] = { ...columns[index], ...update };
        return { ...current, computed_columns: columns };
      });
    },
    [onChange],
  );

  const appendSource = useCallback(
    (index: number, name: string): void => {
      onChange((current) => {
        const columns = [...(current.computed_columns ?? [])];
        columns[index] = {
          ...columns[index],
          formula: columns[index].formula + name,
        };
        return { ...current, computed_columns: columns };
      });
    },
    [onChange],
  );

  return (
    <Card variant="outlined" sx={{ flexShrink: 0 }}>
      <CardHeader
        title="计算列"
        subheader="用公式基于已有列与指标派生新的可分析列，添加后可参与图表计算。"
        sx={extraSectionHeaderSx}
        action={
          <Button
            size="small"
            variant="outlined"
            startIcon={<AddIcon />}
            onClick={() =>
              onChange((current) => ({
                ...current,
                computed_columns: [
                  ...(current.computed_columns ?? []),
                  { name: "", formula: "", type: "float" },
                ],
              }))
            }
          >
            添加计算列
          </Button>
        }
      />
      <CardContent
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          pt: 0,
        }}
      >
        {computedColumns.length === 0 && (
          <Box
            sx={{
              p: 3,
              textAlign: "center",
              border: 1,
              borderStyle: "dashed",
              borderColor: "divider",
              borderRadius: 1.5,
            }}
          >
            <Typography
              variant="body2"
              sx={{ fontSize: "0.8125rem", fontWeight: 500 }}
            >
              暂无计算列
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5 }}
            >
              点击右上角「添加计算列」创建第一条计算列。
            </Typography>
          </Box>
        )}
        {computedColumns.map((column, index) => (
          <Box
            key={index}
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              p: 2,
              display: "flex",
              flexDirection: "column",
              gap: 1.5,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
              }}
            >
              <Typography
                variant="subtitle2"
                sx={{ fontSize: "0.8125rem", fontWeight: 600 }}
              >
                计算列 {index + 1}
              </Typography>
              <Tooltip title="删除计算列">
                <IconButton
                  size="small"
                  color="error"
                  aria-label={`删除计算列 ${index + 1}`}
                  onClick={() =>
                    onChange((current) => ({
                      ...current,
                      computed_columns: (current.computed_columns ?? []).filter(
                        (_, columnIndex) => columnIndex !== index,
                      ),
                    }))
                  }
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
            <Box
              sx={{
                display: "flex",
                gap: 1.5,
                alignItems: "flex-start",
              }}
            >
              <TextField
                size="small"
                label="名称"
                placeholder="例如 分成后成本"
                value={column.name}
                onChange={(event) =>
                  updateColumn(index, { name: event.target.value })
                }
                sx={{ flex: 1 }}
              />
              <FormControl size="small" sx={{ minWidth: 100 }}>
                <InputLabel id={`computed-column-type-label-${index}`}>
                  类型
                </InputLabel>
                <Select
                  labelId={`computed-column-type-label-${index}`}
                  id={`computed-column-type-${index}`}
                  value={column.type}
                  label="类型"
                  onChange={(event) =>
                    updateColumn(index, { type: event.target.value })
                  }
                >
                  <MenuItem value="float">float</MenuItem>
                  <MenuItem value="int">int</MenuItem>
                  <MenuItem value="str">str</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <TextField
              size="small"
              label="公式"
              placeholder="ad_real_cost * float(渠道商分成 or '100') / 100"
              value={column.formula}
              onChange={(event) =>
                updateColumn(index, { formula: event.target.value })
              }
              multiline
              rows={2}
              sx={{
                "& textarea": {
                  fontFamily: "monospace",
                  fontSize: "0.8125rem",
                },
              }}
            />
            <Box>
              <Typography
                variant="caption"
                sx={{
                  display: "block",
                  fontWeight: 600,
                  fontSize: "0.75rem",
                }}
              >
                可用列与指标
              </Typography>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.25, mb: 1 }}
              >
                点击名称会追加到公式末尾。
              </Typography>
              <Box
                sx={{
                  maxHeight: 160,
                  overflow: "auto",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 0.75,
                  p: 1,
                  border: 1,
                  borderColor: "divider",
                  borderRadius: 1.5,
                  bgcolor: "grey.50",
                }}
              >
                {!hasAvailableSources && (
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ px: 0.5, py: 1 }}
                  >
                    暂无可用的列或指标
                  </Typography>
                )}
                {availableColumns.map((availableColumn) => (
                  <Chip
                    key={`column-${availableColumn.column_name}`}
                    size="small"
                    variant="outlined"
                    label={
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "baseline",
                          gap: 0.5,
                        }}
                      >
                        <span>{availableColumn.column_name}</span>
                        {availableColumn.verbose_name &&
                          availableColumn.verbose_name !==
                            availableColumn.column_name && (
                            <Box
                              component="span"
                              sx={{
                                fontSize: "0.65rem",
                                color: "text.secondary",
                              }}
                            >
                              / {availableColumn.verbose_name}
                            </Box>
                          )}
                      </Box>
                    }
                    onClick={() =>
                      appendSource(index, availableColumn.column_name)
                    }
                    sx={{
                      fontFamily: "monospace",
                      fontSize: "0.7rem",
                      bgcolor: "background.paper",
                    }}
                  />
                ))}
                {availableMetrics.map((metric) => (
                  <Chip
                    key={`metric-${metric.metric_name}`}
                    size="small"
                    variant="outlined"
                    color="info"
                    label={
                      <Box
                        component="span"
                        sx={{
                          display: "inline-flex",
                          alignItems: "baseline",
                          gap: 0.5,
                        }}
                      >
                        <span>{metric.metric_name}</span>
                        {metric.verbose_name &&
                          metric.verbose_name !== metric.metric_name && (
                            <Box
                              component="span"
                              sx={{
                                fontSize: "0.65rem",
                                color: "text.secondary",
                              }}
                            >
                              / {metric.verbose_name}
                            </Box>
                          )}
                      </Box>
                    }
                    onClick={() => appendSource(index, metric.metric_name)}
                    sx={{
                      fontFamily: "monospace",
                      fontSize: "0.7rem",
                      bgcolor: "background.paper",
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}
