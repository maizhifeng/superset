# Superset Frontend 重构计划

基于 `superset-frontend-new/` 代码审查，产出以下分阶段重构计划。

---

## Phase 1: 巨型组件拆分

### 1.1 `AiDrawer.tsx` (1166 行)

**现状**: 单文件含 drill-down、日报、周报、assistant、config dialog 等多种 AI 功能，stacked 布局 + 大量 inline 逻辑。

**方案**: 拆分为目录结构：

```
src/components/AiDrawer/
├── index.tsx          # 原有入口 — 精简为路由/模式选择
├── AssistantPanel.tsx # 对话模式（从 AiDrawer.tsx 剥离）
├── DrillDownPanel.tsx # 下钻模式（从 AiDrawer.tsx 剥离）
├── ReportPanel.tsx    # 日报/周报（从 AiDrawer.tsx 剥离）
├── SettingsPanel.tsx  # AI 配置面板
├── AiDrawerHeader.tsx # 顶部导航区域
├── AiDrawerFooter.tsx # 底部输入区域
└── types.ts           # drill-down 等类型（从 AiDrawer.tsx 提取）
```

### 1.2 `pages/Dashboard/index.tsx` (965 行)

**现状**: 一个组件同时做数据获取、布局、filter、undo/redo、compare、add-chart。

**方案**:
```
src/pages/Dashboard/
├── index.tsx               # 简化 — 编排子组件
├── useDashboardState.ts    # 数据获取 + 状态管理（从 index.tsx 提取）
├── DashboardHeader.tsx     # 标题栏 + breadcrumbs（从 index.tsx 提取）
├── FilterManager.tsx       # filter 抽屉/面板的编排（从 index.tsx 提取）
├── DashboardEmpty.tsx      # loading/empty/error 状态
└── DashboardModals.tsx     # AddChartDialog + CompareConfigModal + CompareModal 编排
```

### 1.3 `pages/ChartCreation/ChartEditor.tsx` (969 行)

**现状**: echart 配置、query 构建、form、图表类型推荐全在一个文件。

**方案**: 已有 `ChartPreview`、`ChartEditorForm`、`ChartTypeSelector` 分文件，但父组件仍然过重。简化 parent 到编排层，将状态管理/数据获取剥离：

```
ChartEditor.tsx  →  ChartEditorShell.tsx (容器，~150 行)
                 +  useChartEditor.ts (数据获取 + form 状态 hook)
```

### 1.4 `pages/SqlLab/index.tsx` (955 行)

**现状**: Schema 树、SQL 编辑器、结果表格、tab 管理、query history 全在单文件。

**方案**:
```
src/pages/SqlLab/
├── index.tsx           # 编排入口
├── SqlEditorPanel.tsx  # CodeMirror 封装
├── SchemaBrowser.tsx   # TreeView 部分
├── ResultsTable.tsx    # 查询结果展示
├── SqlLabTabs.tsx      # 多 tab 管理
└── useSqlLab.ts        # SQL 执行 + 状态管理 hook
```

---

## Phase 2: 共享抽象

### 2.1 通用列表页

**现状**: 7 个 List Page（Chart/Dashboard/Dataset/Database/SavedQuery/AlertReport/QueryHistory）各 280-365 行，重复代码 ~2000 行。

**方案**: 创建配置驱动通用列表页

```ts
// src/config/listPageConfig.ts
interface ListPageConfig<T> {
  endpoint: string;
  columns: GridColDef[];
  renderCard?: (row: T) => ReactNode;
  deleteEndpoint?: string;
  emptyTitle: string;
  emptyDescription: string;
  fabLabel?: string;
  filterColumn?: string;
}
```

7 个页面各自只提供配置对象 + 可选的卡片渲染函数：
```
pages/ChartList/config.ts      → 30 行配置
pages/DashboardList/config.ts  → 30 行配置
...
```

### 2.2 AccentCard 组件

**现状**: `Home/index.tsx` 和 `DashboardList/index.tsx` 分别实现带彩色上边线的卡片（`borderTop: "3px solid"`, `cardAccents[i % ...]`）。

**方案**: 创建共享组件

```tsx
// components/AccentCard.tsx
interface AccentCardProps {
  accentIndex: number;
  onClick: () => void;
  icon: ReactNode;
  title: string;
  description: string;
  children?: ReactNode; // 可选额外内容（如 DashboardList 中的 chip/actions）
}
```

### 2.3 引入 `styled()` 替代部分 `sx`

**现状**: 零 `styled()` 使用，所有样式 inline `sx`。

**方案**: 抽取高频样式模式为 styled 组件：
- `AccentCard`（如上）
- `SectionTitle` — 带下划线的区块标题
- `ToolbarRow` — 工具栏 flexbox
- `PageContainer` — 标准页面容器 padding + maxWidth

```tsx
const PageContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(3),
  maxWidth: "lg",
  margin: "0 auto",
}));
```

---

## Phase 3: 架构改进

### 3.1 AppLayout 解耦

**现状**: 460 行单组件，32 个 `use*` 调用，负责布局 + 导航 + 搜索 + AI + 用户菜单 + Tour + Snackbar。

**方案**:
```
AppLayout.tsx
├── LayoutShell.tsx        # ActivityBar + SidePanel + Main 的 flex 布局
├── SearchOverlay.tsx      # 搜索 Dialog + ChatInput + SearchExamples
├── AiMenu.tsx             # AI 按钮 + Menu
├── NavManager.tsx         # hover/pin/unpin 逻辑（从 AppLayout 提取）
└── 其余保持
```

`NavManager` hook：
```ts
function useNavManager() {
  // 将 handleNavEnter / handleNavLeave / handleActivitySelect / handleSidePanelSelect
  // 以及所有 timeout ref 提取到此 hook
}
```

### 3.2 icon mapping 数据驱动

**现状**: 16 个 icon 在 `menuIconMap` 中硬编码。

**方案**: 将 icon name 加入 API 返回的 nav items 中，由后端返回 icon 字符串，前端维护一个完整的 name→component 映射字典。

### 3.3 数据获取层

**现状**: 混合使用 `useEffect` + `useState`、自定义 hook、通用 hook，模式不统一。

**方案**:
- 短期：所有数据获取统一到自定义 hook 模式（如 `useApiData<T>(endpoint)`）
- 长期：评估引入 `@tanstack/react-query` 或 `swr` 替代手写 loading/error/refetch 逻辑

---

## Phase 4: 清理

### 4.1 删除 dead code

- `src/theme/vibrantPalette.ts` — 不再被引用
- `theme/index.ts` 中残留的 `supersetPalette` import（如果 notion 完全替代 paper 的话— 否则保留）

### 4.2 统一 focus-visible 样式

**现状**: `index.css` 的 `[data-theme="notion"] *:focus-visible` 与 `notion/components.ts` 的 `MuiOutlinedInput focused` 都定义 focus 样式，可能冲突。

**方案**: 删除 CSS 层 focus-visible 规则，统一到 Mui 组件覆写中。

---

## 验证方式

每阶段完成后：
```bash
npx tsc --noEmit       # 类型检查
npx vitest run         # 单元测试
npm run build          # 构建
npm run playwright     # E2E (若存在相关测试)
```

手动检查：Home / DashboardList / SqlLab / ChartEditor 等核心页面渲染正常。
