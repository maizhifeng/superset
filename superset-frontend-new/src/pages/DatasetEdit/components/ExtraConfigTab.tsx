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

import type { Dispatch, SetStateAction } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import type { DatasetDetail } from "@/types/api";
import { CALCULATED_METRIC_NAMES } from "../types";
import type { ExtraConfig } from "../types";
import CalculatedColumnsSection from "./CalculatedColumnsSection";

const extraSectionHeaderSx = {
  "& .MuiCardHeader-title": { fontSize: "0.875rem", fontWeight: 600 },
  "& .MuiCardHeader-subheader": {
    fontSize: "0.75rem",
    color: "text.secondary",
    mt: 0.25,
  },
};

interface ExtraConfigTabProps {
  dataset: DatasetDetail;
  value: ExtraConfig;
  onChange: Dispatch<SetStateAction<ExtraConfig>>;
}

export default function ExtraConfigTab({
  dataset,
  value,
  onChange,
}: ExtraConfigTabProps) {
  const availableColumns = dataset.columns.filter(
    (column) => column.column_name && column.is_active !== false,
  );
  const availableMetrics = dataset.metrics.filter(
    (metric) =>
      metric.metric_name &&
      CALCULATED_METRIC_NAMES.includes(metric.metric_name),
  );

  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2 },
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <Card variant="outlined" sx={{ flexShrink: 0 }}>
        <CardHeader
          title="分成配置"
          subheader="指定分成报表使用的游戏名称列与渠道名称列，保存后按这两个字段计算分成。"
          sx={extraSectionHeaderSx}
        />
        <CardContent
          sx={{
            display: "grid",
            gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" },
            gap: 2,
            pt: 0,
          }}
        >
          <TextField
            size="small"
            label="游戏名称列名"
            placeholder="例如 主游戏"
            helperText="对应字段 papp_name_column"
            value={value.profit_sharing?.papp_name_column ?? ""}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                profit_sharing: {
                  ...(current.profit_sharing ?? {}),
                  papp_name_column: event.target.value,
                },
              }))
            }
          />
          <TextField
            size="small"
            label="渠道名称列名"
            placeholder="例如 渠道商"
            helperText="对应字段 channel_name_column"
            value={value.profit_sharing?.channel_name_column ?? ""}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                profit_sharing: {
                  ...(current.profit_sharing ?? {}),
                  channel_name_column: event.target.value,
                },
              }))
            }
          />
        </CardContent>
      </Card>
      <CalculatedColumnsSection
        computedColumns={value.computed_columns ?? []}
        availableColumns={availableColumns}
        availableMetrics={availableMetrics}
        hasAvailableSources={
          availableColumns.length > 0 || availableMetrics.length > 0
        }
        onChange={onChange}
      />
    </Box>
  );
}
