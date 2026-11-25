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

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import CircularProgress from "@mui/material/CircularProgress";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import AddIcon from "@mui/icons-material/Add";
import DateColumnDetector from "@/components/DateColumnDetector";
import { useToolbarStore } from "@/store/toolbarStore";
import ColumnsTab from "./components/ColumnsTab";
import DatasetEditHeader from "./components/DatasetEditHeader";
import DatasetEditNotifications from "./components/DatasetEditNotifications";
import DescriptionTab from "./components/DescriptionTab";
import ExtraConfigTab from "./components/ExtraConfigTab";
import MetricFormDrawer from "./components/MetricFormDrawer";
import MetricsTab from "./components/MetricsTab";
import SqlTab from "./components/SqlTab";
import { useDatasetClipboard } from "./hooks/useDatasetClipboard";
import { useDatasetEditor } from "./hooks/useDatasetEditor";
import { useMetricEditor } from "./hooks/useMetricEditor";
import type { MetricDraft } from "./types";

export default function DatasetEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { registerTools, unregisterTools } = useToolbarStore();
  const editor = useDatasetEditor(id, navigate);
  const clipboard = useDatasetClipboard(id, editor.dataset);
  const metricEditor = useMetricEditor(editor.dataset, editor.setDataset);
  const [tabValue, setTabValue] = useState(0);
  const [columnSearch, setColumnSearch] = useState("");

  useEffect(() => {
    registerTools("dataset_edit", [
      {
        id: "add-metric",
        priority: 20,
        showOnMobile: true,
        fabIcon: <AddIcon />,
        fabLabel: "添加指标",
        action: metricEditor.handleAddMetric,
        render: null,
      },
    ]);
    return () => unregisterTools("dataset_edit");
  }, [registerTools, unregisterTools, metricEditor.handleAddMetric]);

  if (editor.loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (editor.error && !editor.dataset) {
    return (
      <Box
        sx={{
          p: 3,
          display: "flex",
          flexDirection: "column",
          height: "100%",
          overflow: "hidden",
        }}
      >
        <Alert severity="error" sx={{ borderRadius: 2 }}>
          {editor.error}
        </Alert>
      </Box>
    );
  }

  const dataset = editor.dataset;
  if (!dataset) return null;

  const isVirtual = dataset.kind !== "physical";
  const extraTabValue = isVirtual ? 4 : 3;
  const editMetricDraft: MetricDraft = {
    metric_name: metricEditor.editMetric?.metric_name ?? "",
    expression: metricEditor.editMetric?.expression ?? "",
    verbose_name: metricEditor.editMetric?.verbose_name ?? "",
    description: metricEditor.editMetric?.description ?? "",
    d3format: metricEditor.editMetric?.d3format ?? "",
  };

  return (
    <Box
      sx={{
        flex: 1,
        p: 3,
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <DatasetEditHeader
        id={id}
        dataset={dataset}
        tableName={editor.form.table_name}
        onTableNameChange={(tableName) =>
          editor.setForm((current) => ({ ...current, table_name: tableName }))
        }
        onBack={() => navigate(-1)}
        onSave={() => void editor.handleSave()}
      />

      {editor.detectedDateColumns.length > 0 && id && (
        <Box sx={{ mb: 2 }}>
          <DateColumnDetector
            datasetId={Number(id)}
            detectedColumns={editor.detectedDateColumns}
            onColumnCreated={() => {
              void editor.refreshDataset().catch(() => {});
            }}
            onDismiss={() => editor.setDetectedDateColumns([])}
          />
        </Box>
      )}

      <Card
        sx={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: 1,
            borderColor: "divider",
            px: 2,
            minHeight: 48,
          }}
        >
          <Tabs value={tabValue} onChange={(_, value) => setTabValue(value)}>
            <Tab
              label={`数据列 (${dataset.columns.length})`}
              sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
            />
            <Tab
              label={`指标 (${dataset.metrics.length})`}
              sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
            />
            <Tab
              label="描述"
              sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
            />
            {isVirtual && (
              <Tab
                label="SQL"
                sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
              />
            )}
            <Tab
              label="额外配置"
              sx={{ fontSize: "0.8125rem", minHeight: 48, py: 0 }}
            />
          </Tabs>
          {tabValue === 1 && (
            <Button
              size="small"
              variant="outlined"
              startIcon={<AddIcon />}
              onClick={metricEditor.handleAddMetric}
            >
              添加指标
            </Button>
          )}
        </Box>
        <CardContent
          sx={{
            pt: 2,
            flex: 1,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {tabValue === 0 && (
            <ColumnsTab
              columns={dataset.columns}
              modifiedColumns={editor.modifiedColumns}
              search={columnSearch}
              onSearchChange={setColumnSearch}
              onColumnUpdate={editor.updateColumn}
              onCopyColumnName={clipboard.handleCopyColumnName}
            />
          )}
          {tabValue === 1 && (
            <MetricsTab
              metrics={dataset.metrics}
              onCopyMetricFormula={clipboard.handleCopyMetricFormula}
              onEditMetric={metricEditor.handleEditMetric}
              onDeleteMetric={metricEditor.handleDeleteMetric}
            />
          )}
          {tabValue === 2 && (
            <DescriptionTab
              value={editor.form.description}
              onChange={(description) =>
                editor.setForm((current) => ({ ...current, description }))
              }
            />
          )}
          {tabValue === 3 && isVirtual && (
            <SqlTab
              dataset={dataset}
              value={editor.form.sql}
              onChange={(sql) =>
                editor.setForm((current) => ({ ...current, sql }))
              }
              onFormat={editor.handleFormatSql}
              onCopy={() => void editor.handleCopyEditorSql()}
              onReset={editor.handleResetSql}
              onSave={() => void editor.handleSave()}
            />
          )}
          {tabValue === extraTabValue && (
            <ExtraConfigTab
              dataset={dataset}
              value={editor.extraConfig}
              onChange={editor.setExtraConfig}
            />
          )}
        </CardContent>
      </Card>

      <MetricFormDrawer
        open={metricEditor.addMetricOpen}
        title="添加指标"
        submitLabel="添加"
        value={metricEditor.newMetric}
        error={metricEditor.metricError}
        onChange={metricEditor.updateNewMetric}
        onClose={metricEditor.closeAddMetric}
        onSubmit={metricEditor.handleAddMetricSubmit}
      />
      <MetricFormDrawer
        open={metricEditor.editMetricOpen}
        title="编辑指标"
        submitLabel="保存"
        value={editMetricDraft}
        onChange={metricEditor.updateEditMetric}
        onClose={metricEditor.closeEditMetric}
        onSubmit={metricEditor.handleEditMetricSubmit}
      />
      <DatasetEditNotifications
        success={editor.success}
        error={editor.error}
        onSuccessClose={() => editor.setSuccess(false)}
        onErrorClose={() => editor.setError(null)}
      />
    </Box>
  );
}
