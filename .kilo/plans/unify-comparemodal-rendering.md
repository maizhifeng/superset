# 统一 CompareModal 渲染结构

## 问题
项目内对比模式和多项目对比模式使用不同的渲染结构，导致代码重复和展示不一致。

## 目标
两模式使用完全相同的组件结构，包含：
- 同步滚动（横竖方向）
- 标题行固定（sticky header）
- 动态分配表格高度（flex 各 50%）
- 表格内容排序正确

## 修改方案

### 1. 提取 `renderScrollableTable(tblKey, header, children)`

统一的可滚动表格容器，包含浮动横滚动条：

```typescript
const renderScrollableTable = (tblKey: string, header: React.ReactNode, children: React.ReactNode) => (
  <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
    {header}
    <Box
      ref={(el) => scrollRefs.current.set(tblKey, el)}
      sx={{ flex: 1, overflow: "auto", minWidth: 0, "&::-webkit-scrollbar": { height: 0 }, scrollbarWidth: "none" }}
      onScroll={(e) => onScroll(tblKey, e.currentTarget)}
    >
      {children}
    </Box>
    <Box
      ref={(el) => scrollRefs.current.set(tblKey + "_hz", el)}
      sx={{ overflowX: "auto", overflowY: "hidden", bgcolor: "background.paper", position: "sticky", bottom: 0, zIndex: 2 }}
      onScroll={(e) => onScroll(tblKey + "_hz", e.currentTarget)}
    >
      <Box sx={{ width: totalWidth, height: 1 }} />
    </Box>
  </Box>
);
```

### 2. 更新 `renderSection` 支持 `tableName: string`

`renderGroup` 已正确处理 `isPrimary` 判断（`tableName === "primary"`），非 primary 的表格自动使用次级样式。`renderSection` 的 `tableName` 类型改为 `string`，`TableHead` 显示条件改为 `tableName === "primary" || tableName === "intra_secondary"`。

### 3. 生成次级 `treeRows`

将 `intraSecondaryResult.data` 转换为 `treeRows` 兼容格式：

```typescript
if (hasSecondaryData) {
  // 汇总行（parent）
  const aggRow = {};
  for (const col of columns) {
    if (isDimCol(...)) {
      aggRow[col.name] = col.name === COL.papp_name ? "其余渠道汇总" : "其余渠道";
    } else {
      // 求和
      for (const r of intraSecondaryResult.data) {
        if (typeof v === "number") aggRow[col.name] = (aggRow[col.name] || 0) + v;
      }
    }
  }
  // 时间列填 "汇总"
  const timeCol = columns.find(c => ["日期","周","月"].includes((c as any).displayName));
  if (timeCol) aggRow[timeCol.name] = "汇总";

  // 明细行——缺失维度填"其余渠道"，时间戳格式化
  const detailRows = intraSecondaryResult.data.map(r => {
    const row = {};
    for (const col of columns) {
      const raw = r[col.name];
      if (raw != null) {
        row[col.name] = isTime && typeof raw === "number" ? formatDate(raw) : raw;
      } else if (col.name === COL.cch_name || col.name === COL.cch_name_id) {
        row[col.name] = "其余渠道";
      } else { row[col.name] = ""; }
    }
    return row;
  });
  intraSecondaryRows = [aggRow, ...detailRows];
}
```

### 4. 统一返回值结构

```tsx
<Box flexContainer (flex: 1, overflow: hidden, column)>
  <Box primaryContainer (flex: isIntraMode ? "1 1 50%" : 1, column, overflow: hidden)>
    {renderScrollableTable("_primary", null,
      <>
        {/* 多项目：primary + secondary renderSection */}
        {/* 项目内：只有 primary renderSection */}
      </>
    )}
  </Box>
  {isIntraMode && (
    <Box secondaryContainer (flex: "1 1 50%", column, overflow: hidden)>
      <Typography>其余渠道汇总</Typography>
      {hasSecondaryData
        ? renderScrollableTable("_intra_secondary", null,
            renderSection("intra_secondary_data", intraSecondaryRows, "intra_secondary")
          )
        : <Box>无其他渠道数据</Box>
      }
    </Box>
  )}
</Box>
```

### 5. 同步滚动

`onScroll` 回调注册在 `scrollRefs` Map 中，通过 `_primary` / `_primary_hz` / `_intra_secondary` / `_intra_secondary_hz` 键区分。HZ 源只同步 `scrollLeft`，非 HZ 源同时同步 `scrollLeft` + `scrollTop`，通过 `_hz_` 前缀判断。

### 6. 标题行固定

`thSx` 已有 `position: "sticky", top: 0, zIndex: 6`，保持不动。所有表格（含次表）都使用同一 `thSx`。

### 7. 动态高度分配

外层容器 `flex: 1` 撑满 DialogContent，内层主/次容器各 `flex: "1 1 50%"` 平分高度，内部 `renderScrollableTable` 的表格区域 `flex: 1` 填满剩余空间。

## 修改位置

- `src/pages/Dashboard/CompareModal.tsx`
  - 第 908 行附近：`const totalWidth` → 替换为 `renderScrollableTable` + 更新 `renderSection`
  - 第 932-1047 行：替换模式判断与返回 JSX
  - 保持 `renderGroup`、`onScroll`、`colGroup`、`colWidths`、所有状态和查询逻辑不变
