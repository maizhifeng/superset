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

import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

interface DescriptionTabProps {
  value: string;
  onChange: (value: string) => void;
}

export default function DescriptionTab({
  value,
  onChange,
}: DescriptionTabProps) {
  return (
    <Box
      sx={{
        p: { xs: 1.5, md: 2 },
        flex: 1,
        minHeight: 0,
        overflow: "auto",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Card
        variant="outlined"
        sx={{ width: "100%", maxWidth: 760, flexShrink: 0 }}
      >
        <CardContent
          sx={{
            p: { xs: 2, md: 2.5 },
            "&:last-child": { pb: { xs: 2, md: 2.5 } },
          }}
        >
          <Typography
            variant="subtitle1"
            component="h2"
            sx={{ fontWeight: 600, fontSize: "0.875rem" }}
          >
            数据集描述
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.5, mb: 2 }}
          >
            简要说明数据的统计口径与适用场景，帮助同事快速理解这份数据。
          </Typography>
          <TextField
            size="small"
            label="描述"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            fullWidth
            multiline
            minRows={8}
            maxRows={12}
            placeholder="例如：合并后的广告投放日报，按日期与渠道汇总充值、消耗与留存指标。"
            helperText={
              <Box
                component="span"
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 2,
                }}
              >
                <span>用于图表与数据集列表中的说明</span>
                <span>{value.length} 字</span>
              </Box>
            }
          />
        </CardContent>
      </Card>
    </Box>
  );
}
