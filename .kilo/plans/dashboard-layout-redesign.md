# 仪表盘布局重新设计

## 设计决策

| 选项 | 决策 |
|------|------|
| 后端数据兼容 | 保持 ROOT→GRID→ROW→COLUMN→CHART 树结构不变，CHART meta.width 存列跨度 |
| 大小调整 | 预设尺寸按钮（小=3列/中=6列/大=9列/全宽=12列），放弃拖拽缩放 |
| 自适应列数 | 桌面按容器宽度动态计算列数，移动端 <768px 单列全宽 |
| 溢出控制 | CSS Grid `1fr` 列宽天然自适应，永不横向溢出 |

---

## 架构变更

### 当前 → 新设计

| 当前 | 新设计 |
|------|--------|
| react-grid-layout (position absolute) | CSS Grid (`grid-template-columns: repeat(N, 1fr)`) |
| 12列固定列网格 | 自适应列数 `N = floor(containerWidth / minCardWidth)` |
| 拖拽移动 + 右下角缩放 | 卡片工具栏预设尺寸按钮（↕️小/中/大/全宽） |
| 固定 rowHeight + 计算高度 | 卡片高度由内容决定（图表 + 数据），自适应 |
| x/y/h 参与存储和计算 | 仅保留 width，x/y/h 不再使用 |
| 拖拽排序 | 暂不实现排序（后续可选） |

---

## 任务清单

### 1. `ChartCard.tsx` — 增加尺寸选择按钮
- 在工具栏增加下拉或分段按钮，选项：小(3) / 中(6) / 大(9) / 全宽(N)
- 选中态高亮，依据 `item.w` 当前值
- 点击后回调 `onSizeChange(chartId, newWidth)` → 写入 nodeMap → 触发 saveLayout
- 移动端隐藏该按钮

### 2. `utils/dashboard/layout.ts` — 简化 flattenLayout
- 移除 `getChildWidth` 中的 ROW/COLUMN 宽度计算（不再需要）
- 移除 h/y/x 映射逻辑
- 仅保留：i, chartId, sliceName, w (width 列跨度), minW
- 返回类型新增 `w` 表示列数（1-12）

### 3. `DashboardGrid.tsx` — CSS Grid 替代 react-grid-layout
- 删除 `<GridLayout>` 及其 import
- 替换为 `<Box display="grid" gridTemplateColumns="repeat(N, 1fr)" gap="8px">`
- `N` = `Math.max(1, Math.floor(containerWidth / 200))`（minCardWidth=200px）
- 移动端 (<768px) 强制 `N=1`，`gap="4px"`
- 每个卡片 `<Box gridColumn="span item.w">`
- 删除 `overflow: hidden`（CSS Grid 天然不溢出）
- 删除 drag/resize config props

### 4. `useDashboardLayout.ts` — 精简
- 删除 `handleLayoutChange`（不再需要 onLayoutChange）
- 删除 `isDragging` state
- 删除 `saveLayout` 中对 x/y/h 的处理
- 保留 ResizeObserver，新增 `minCardWidth` 常量
- 保留 `containerWidth`, `containerRef`
- 新增 `saveLayout` 调用点：尺寸按钮 → 更新 nodeMap → 写 width → saveLayout

### 5. `useDashboardState.ts` — 移除 gridLayout 中间层
- 删除 `gridLayout` memo（不再需要 react-grid-layout 格式转换）
- `layoutItems` 直接传给 DashboardGrid
- 新增 `onSizeChange` 回调：更新 nodeMap 中对应 CHART 的 meta.width → 触发 saveLayout

### 6. `Dashboard/index.tsx` — 清理闲置 props
- 移除传给 DashboardGrid 的 `onDragStart/onDragStop/onResizeStart/onResizeStop`
- 移除 `isDragging` state 传递
- 移除 `onLayoutChange` 传递

### 7. CSS/样式清理
- 删除 `react-grid-layout/css/styles.css` import
- 删除 `react-resizable/css/styles.css` import
- 移除 `.drag-handle` CSS（如果图表卡片有 drag-handle class）
- 确保卡片内部 `overflow: hidden` 保持（图表容器需要）

### 8. 测试更新
- 更新 `DashboardGrid.test.tsx` — 替换 GridLayout 测试为 CSS Grid 测试
- 更新 `useDashboardLayout` 相关测试

---

## 风险 & 注意事项

1. **存量仪表板迁移**：width 值（1-12）直接复用为列跨度。无 width 的卡片默认 width=6（中）。GRID/ROW 层级在 flattenLayout 中扁平化时忽略。
2. **卡片高度**：图表卡片高度由 ECharts + 表格内容决定。大表格卡片可能会很长，这是期望行为（只竖滚动）。
3. **列数计算**：`minCardWidth=200px` 时，1900px 容器 → 9 列，1200px → 6 列，900px → 4 列。调整 minCardWidth 可改变密度。
4. **拖拽排序**：本次不实现。后续可引入 dnd-kit 或保持固定顺序。
5. **列跨度语义**：小=3 在 12 列网格下表现良好，但在 6 列网格下等于半宽。这是一个设计取舍——列跨度绝对值在不同列数下含义不同。
