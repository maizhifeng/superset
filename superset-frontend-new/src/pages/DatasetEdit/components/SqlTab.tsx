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
import type { DatasetDetail } from "@/types/api";
import SqlQueryEditor from "@/components/SqlQueryEditor";
import { ConfirmModal } from "@/superset-ui-mui/components";

interface SqlTabProps {
  dataset: DatasetDetail;
  value: string;
  onChange: (value: string) => void;
  onFormat: () => void;
  onCopy: () => void;
  onReset: () => void;
  onSave: () => void;
}

export default function SqlTab({
  dataset,
  value,
  onChange,
  onFormat,
  onCopy,
  onReset,
  onSave,
}: SqlTabProps) {
  const [resetSqlConfirmOpen, setResetSqlConfirmOpen] = useState(false);

  return (
    <>
      <SqlQueryEditor
        value={value}
        onChange={onChange}
        backend={dataset.database?.backend}
        databaseName={dataset.database?.database_name}
        subtitle="虚拟数据集 · 保存后会按新的 SQL 重新解析数据列"
        dirty={value !== (dataset.sql ?? "")}
        placeholder="在此输入 SQL，例如 SELECT * FROM schema.table"
        onFormat={onFormat}
        onCopy={onCopy}
        onReset={() => setResetSqlConfirmOpen(true)}
        onSave={onSave}
      />
      <ConfirmModal
        open={resetSqlConfirmOpen}
        title="还原 SQL"
        description="确定要丢弃当前未保存的 SQL 修改吗？此操作不可撤销。"
        confirmText="还原"
        cancelText="取消"
        danger
        onConfirm={() => {
          onReset();
          setResetSqlConfirmOpen(false);
        }}
        onCancel={() => setResetSqlConfirmOpen(false)}
      />
    </>
  );
}
