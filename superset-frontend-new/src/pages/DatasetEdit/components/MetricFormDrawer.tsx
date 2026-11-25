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
import Drawer from "@mui/material/Drawer";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardHeader from "@mui/material/CardHeader";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import type { MetricDraft, MetricDraftField } from "../types";

const cardHeaderSx = {
  "& .MuiCardHeader-title": { fontSize: "0.8125rem", fontWeight: 600 },
};

interface MetricFormDrawerProps {
  open: boolean;
  title: string;
  submitLabel: string;
  value: MetricDraft;
  error?: string | null;
  onChange: (field: MetricDraftField, value: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}

export default function MetricFormDrawer({
  open,
  title,
  submitLabel,
  value,
  error,
  onChange,
  onClose,
  onSubmit,
}: MetricFormDrawerProps) {
  return (
    <Drawer
      open={open}
      onClose={onClose}
      variant="temporary"
      anchor="right"
      slotProps={{
        paper: {
          sx: {
            width: { xs: "100vw", sm: 480 },
            height: "100vh",
            borderRight: "none",
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
          },
        },
      }}
    >
      <Box sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <Box sx={{ px: 2.5, py: 1.5, borderBottom: 1, borderColor: "divider" }}>
          <Typography variant="h6">{title}</Typography>
        </Box>
        <Box sx={{ flex: 1, overflow: "auto", p: 2.5 }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            {error && (
              <Alert severity="error" sx={{ borderRadius: 1.5 }}>
                {error}
              </Alert>
            )}
            <Card
              elevation={0}
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <CardHeader title="基本信息" sx={cardHeaderSx} />
              <CardContent
                sx={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <TextField
                  size="small"
                  label="指标名称"
                  fullWidth
                  autoFocus
                  value={value.metric_name}
                  onChange={(event) =>
                    onChange("metric_name", event.target.value)
                  }
                />
                <TextField
                  size="small"
                  label="表达式"
                  fullWidth
                  multiline
                  rows={4}
                  value={value.expression}
                  onChange={(event) =>
                    onChange("expression", event.target.value)
                  }
                />
              </CardContent>
            </Card>
            <Card
              elevation={0}
              sx={{
                borderRadius: 2,
                border: "1px solid",
                borderColor: "divider",
              }}
            >
              <CardHeader title="可选配置" sx={cardHeaderSx} />
              <CardContent
                sx={{ display: "flex", flexDirection: "column", gap: 2 }}
              >
                <TextField
                  size="small"
                  label="显示名称"
                  fullWidth
                  value={value.verbose_name}
                  onChange={(event) =>
                    onChange("verbose_name", event.target.value)
                  }
                />
                <TextField
                  size="small"
                  label="描述"
                  fullWidth
                  value={value.description}
                  onChange={(event) =>
                    onChange("description", event.target.value)
                  }
                />
                <TextField
                  size="small"
                  label="D3 格式"
                  fullWidth
                  placeholder="例如 .1%"
                  value={value.d3format}
                  onChange={(event) => onChange("d3format", event.target.value)}
                />
              </CardContent>
            </Card>
          </Box>
        </Box>
        <Box
          sx={{
            px: 2.5,
            py: 1.5,
            borderTop: 1,
            borderColor: "divider",
            display: "flex",
            justifyContent: "flex-end",
            gap: 1,
          }}
        >
          <Button onClick={onClose}>取消</Button>
          <Button
            variant="contained"
            onClick={onSubmit}
            disabled={!value.metric_name.trim() || !value.expression.trim()}
          >
            {submitLabel}
          </Button>
        </Box>
      </Box>
    </Drawer>
  );
}
