# superset-frontend-new 整体改造方案

## 两条正交工作线

```
工作线 A: 左侧双级导航 (双抽屉)  ← 替换顶部 Tabs
工作线 B: AiDrawer 增强           ← 对话持久化 + 富消息 + 斜杠命令

两者互不冲突, 可并行实施。
共同目标: 仪表盘始终是第一优先公民。
```

---

## 工作线 A: 左侧双抽屉导航

### 模式说明

不是"一个抽屉内展开折叠", 而是 **两个独立的抽屉级联**:

```
┌──────┬──────────────┬──────────────────────────────────────┐
│ D1   │ D2           │  Main Content                        │
│图标栏│ 列表栏        │                                      │
│      │ (点击 D1 后  │  Dashboard (始终挂载)                │
│  📊  │  滑出)       │                                      │
│  📈  │ 仪表板列表    │  ┌── Overlay (全屏) ──────────────┐ │
│  💾  │ ├ 销售       │  │  SQL Lab / 图表详情 / 数据集   │ │
│  📋  │ ├ 市场       │  │  [✕] 关闭 → 恢复仪表盘         │ │
│  🔧  │ ├ 运营       │  └────────────────────────────────┘ │
│      │ │            │                                      │
│      │ └──────────  │              ┌── AiDrawer ──┐        │
│      │              │              │  AI 对话面板  │        │
│      │              │              │  (右侧, 共存) │        │
│      │              │              └──────────────┘        │
└──────┴──────────────┴──────────────────────────────────────┘
```

### 行为规则

| 操作 | D1 (图标栏) | D2 (列表栏) | Main Content |
|------|-------------|-------------|--------------|
| 初始态 | 48px, 图标可见 | 隐藏 (0px) | 全宽 |
| 点击 D1 图标 | 高亮选中项 | 滑出 240px, 显示该类别列表 | 右移 240px |
| 再次点击同一图标 | 不变 | 收起 (0px) | 恢复全宽 |
| 点击不同 D1 图标 | 切换高亮 | D2 内容替换为该类别列表 | 保持不变 |
| 点击 D2 列表项 | 不变 | 不变 | 打开 Overlay (全屏覆盖) |
| 关闭 Overlay | 不变 | 不变 | 恢复 Dashboard 可见 |
| Dashboard 切换 | 不变 | D2 列表项高亮切换 | 背景 Dashboard 切换 |

### 布局层级

```
AppLayout
└── Box (flex row, height: 100vh, overflow: hidden)
    ├── Drawer 1: ActivityBar (48px, flex-shrink: 0)
    │   ├── 图标按钮 × N (各导航类别)
    │   └── 底部: 设置 | 用户
    │
    ├── Drawer 2: SidePanel (240px, conditional)
    │   ├── Header: 类别名称 + 关闭按钮
    │   ├── 搜索/筛选 (可选)
    │   ├── 列表项 (可滚动)
    │   │   ├── 项名称 + 图标
    │   │   └── 点击 → open overlay
    │   └── 加载状态 / 空状态
    │
    ├── Box (flex column, flex: 1, min-width: 0)
    │   ├── AppBar (精简)
    │   │   ├── Logo
    │   │   ├── Search (ChatInput)
    │   │   ├── AI 按钮 (现有)
    │   │   └── UserMenu (现有)
    │   └── Main Content (flex: 1, relative, overflow: auto)
    │       ├── Dashboard (背景, 始终挂载)
    │       └── DetailOverlay (条件渲染, position: absolute 全覆盖)
    │
    ├── AiDrawer (现有, 右侧 persistent drawer)
    └── MobileDrawer (现有, 移动端)
```

D2 使用 MUI Drawer `variant="persistent"`, anchor="left", 与 AppLayout 的 flex 布局配合:
- D2 打开时 main content margin-left 增加 240px
- D2 关闭时 main content 恢复

### 核心组件 (新建)

#### 1. `src/components/ActivityBar/ActivityBar.tsx`
- 高度 100vh, 宽度 48px, flex column
- 顶部: 导航图标按钮列表
- 底部: 设置 icon + 用户头像
- 选中态高亮 (背景色 + 左侧竖条指示器)
- 使用 MUI `<Box>` + `<IconButton>`, 无自定义样式

```typescript
interface ActivityBarItem {
  id: NavCategory;
  icon: React.ReactNode; // MUI icon component
  label: string; // tooltip
}

interface ActivityBarProps {
  items: ActivityBarItem[];
  activeId: NavCategory | null;
  onSelect: (id: NavCategory) => void;
}
```

#### 2. `src/components/SidePanel/SidePanel.tsx`
- 宽度 240px, 高度 100vh, border-right
- 动画滑入/滑出 (MUI Drawer persistent)
- Header: 类别名称 + 关闭 (✕) 按钮
- 列表: 可滚动, 每项点击触发 onSelect
- 加载态: CircularProgress
- 空态: "暂无数据"
- 支持搜索/筛选 (可选, 类别项多时显示)

```typescript
interface SidePanelProps {
  open: boolean;
  title: string;
  items: { id: number | string; label: string }[];
  loading: boolean;
  activeItemId?: number | string | null;
  onSelect: (id: number | string) => void;
  onClose: () => void;
}
```

#### 3. `src/store/navStore.ts`
Zustand store, 管理导航状态:

```typescript
interface NavStore {
  // D1: 当前激活的类别
  activeCategory: NavCategory | null;
  // D2: 是否打开
  sidePanelOpen: boolean;
  // D2: 当前类别的列表项 (从 API 缓存)
  sidePanelItems: { id: number; label: string }[];
  sidePanelLoading: boolean;
  // Overlay
  activeOverlay: { type: string; id?: number | string } | null;
  
  // Actions
  toggleCategory: (cat: NavCategory) => Promise<void>;
  closeSidePanel: () => void;
  openOverlay: (type: string, id?: number | string) => void;
  closeOverlay: () => void;
  selectDashboard: (id: number) => void; // 切换背景仪表盘
}
```

行为:
- `toggleCategory("dashboard")` → 如果已打开则关闭, 否则打开并 fetch 仪表盘列表
- `toggleCategory("sqllab")` → 如果已打开则关闭, 否则打开 (SQLLab 无列表, 直接显示 New Query 按钮)
- `openOverlay("chart", 42)` → 右侧全屏打开图表详情
- `selectDashboard(5)` → 切换背景仪表盘为 ID 5

API fetch 逻辑 (复用 AppLayout 现有 `handleCrumbClick` 的 pattern):
```
GET /{category}/?q=(page_size:200,page:0)
→ nameField: dashboard→dashboard_title, chart→slice_name, dataset→table_name, saved_query→label
```

#### 4. `src/components/DetailOverlay/DetailOverlay.tsx`
- MUI Drawer, `variant="temporary"`, `anchor="right"`
- 宽度: `100vw` (覆盖整个 main content)
- 内部渲染基于 `overlay.type`:
  - `chart` → `<ChartEditor>` (复用 `src/pages/ChartCreation/ChartEditor.tsx`)
  - `sqllab` → `<SqlLab>` (复用 `src/pages/SqlLab/index.tsx`)
  - `dataset` → `<DatasetDetail>` (复用 `src/pages/DatasetEdit/index.tsx`)
  - `dashboard` → 不打开 overlay, 调用 `selectDashboard(id)` 切换背景
  - `settings` → `<Settings>` 页面
  - 常规列表页 (chart-list, dashboard-list, dataset-list) → 对应列表组件
- 自带 Header: 标题 + 关闭按钮
- transition: slide 从右进入

#### 5. `src/components/DetailOverlay/OverlayContent.tsx`
- 按 type 分发到具体页面组件
- 统一包裹层: 关闭按钮 + 标题 + 加载/错误状态
- iframe-like 隔离: 每个 overlay 内容在自己的容器中渲染

### 修改文件

#### 1. `src/components/AppLayout.tsx` (大改)
- 移除 `<AppNavBar>` (顶部 Tabs 导航)
- 移除 `<AppBreadcrumbs>` 
- 移除 crumbs 相关 state/logic (`crumbAnchorEl`, `crumbOptions`, `itemLabels`, `handleCrumbClick`)
- 简化 AppBar: 只保留 Logo + Search + AI button + UserMenu
- AppBar 左侧添加 hamburger(移动端) 替代为 ActivityBar 自身的 toggle
- 添加 `<ActivityBar>` 到左侧
- 添加 `<SidePanel>` (条件渲染)
- 添加 `<DetailOverlay>` (条件渲染)
- 调整 flex 布局: ActivityBar(48px) + SidePanel(可变的240px) + Main(flex:1)
- 保持 `<AiDrawer>` + `<MobileDrawer>` + `<TourGuide>` + `<GlobalSnackbar>` 不变

#### 2. `src/views/App.tsx` (微调)
- 保持路由不变
- Dashboard 路由 (`/dashboard/:id`) 现在作为背景页持久化
- 新增 route: `/` → Home (保持不变)
- Overlay 内容通过 navStore 控制, 不依赖路由参数

#### 3. 各类别 API 列表数据获取
从 AppLayout 现有 `handleCrumbClick` 中的 API 调用逻辑 (175-220行) 提取为独立工具函数:
```typescript
// src/utils/fetchNavItems.ts
export async function fetchNavItems(category: NavCategory): Promise<{id: number; label: string}[]> {
  const nameFieldMap = {
    dashboard: "dashboard_title",
    chart: "slice_name",
    dataset: "table_name",
    saved_query: "label",
  };
  const res = await api.get(`/${category}/?q=(page_size:200,page:0)`);
  // ... mapping logic
}
```

### 不需要的 / 废弃

| 文件 | 原因 |
|------|------|
| `AppNavBar.tsx` | 顶部 Tabs 被 ActivityBar 替代 |
| `AppBreadcrumbs.tsx` | 导航路径改变, 不再需要面包屑 |
| `config.ts` (knownSections) | 由 navStore 的类别配置接管 |
| `MobileDrawer.tsx` | 保留移动端使用, 但 ActivityBar 在桌面端替代它 |

---

## 工作线 B: AiDrawer 增强

(与工作线 A 独立, 可并行实施)

### 新建文件 (5 个)

#### 1. `src/stores/conversationStore.ts`
- Zustand + persist
- Thread: `{ id, title, createdAt, messages[], context? }`
- 关闭 drawer 不清除
- "new chat" 创建新线程
- 保留最近 20 线程, 每线程 100 条

#### 2. `src/hooks/useAiStream.ts`
- 从 AiDrawer `useAiChat.streamChat` 提取为独立 hook
- 纯流式通信, 无业务逻辑
- `requestAnimationFrame` 节流渲染
- 返回: `{ stream, stop, streaming }`

#### 3. `src/components/AiDrawer/types.ts`
```typescript
type MessageContent =
  | { type: "text"; body: string }
  | { type: "chart"; chartId: number; title: string }
  | { type: "table"; columns: string[]; rows: Record<string, unknown>[] }
  | { type: "sql"; sql: string }
  | { type: "error"; message: string; retryable: boolean }
```

#### 4. `src/components/AiDrawer/SmartInput.tsx`
- 斜杠命令: `/explain`, `/sql`, `/chart`, `/help`
- Enter 发送, Shift+Enter 换行
- 流式时显示 stop 按钮
- 复用现有视觉风格 (TextField + IconButton)

#### 5. `src/components/AiDrawer/MessageBubble.tsx`
- text → LightMdRenderer
- chart → echarts-for-react
- table → MUI Table
- sql → 语法高亮代码块
- error → 错误 + 重试
- hover: 复制 / 重新生成

### 修改文件

#### 1. `src/components/AiDrawer.tsx` (重构)
- 移除内联 `useAiChat` → 导入 conversationStore + useAiStream
- 移除内联 `ChatBubble` → 导入 MessageBubble
- 移除内联 `TextField` → 导入 SmartInput
- 保留: Drawer 容器/拖拽/Header/知识库卡片/insight 模式/daily/weekly/drill-down
- 新增: context 头 ("仪表板: 销售概览", 从 context.dashboardId 读取)

#### 2. `src/pages/Dashboard/index.tsx`
- `handleOpenInsight` 增加 `dashboardId` 字段

#### 3. `src/store/drawerState.ts`
- `OpenInsightOpts` 增加 `dashboardId?: string`

### 不需要的
- ❌ AiConfigDialog.tsx — 不动
- ❌ ChatInput.tsx — 不动 (还在 AppBar search 中使用)
- ❌ 所有样式/主题 — 不动

---

## 实施顺序

### Phase A1: ActivityBar + SidePanel (导航骨架)
| 文件 | 动作 |
|------|------|
| `src/store/navStore.ts` | 新建 |
| `src/utils/fetchNavItems.ts` | 新建 (从 AppLayout 提取列表 API 逻辑) |
| `src/components/ActivityBar/ActivityBar.tsx` | 新建 |
| `src/components/SidePanel/SidePanel.tsx` | 新建 |
| `src/components/AppLayout.tsx` | 大改: 引入双抽屉, 移除顶部 Tabs/Breadcrumbs |

### Phase A2: DetailOverlay (详情覆盖)
| 文件 | 动作 |
|------|------|
| `src/components/DetailOverlay/DetailOverlay.tsx` | 新建 |
| `src/components/DetailOverlay/OverlayContent.tsx` | 新建 |
| `src/components/AppLayout.tsx` | 接入 DetailOverlay |

### Phase B1: AiDrawer 增强 (与 A 并行)
| 文件 | 动作 |
|------|------|
| `src/stores/conversationStore.ts` | 新建 |
| `src/hooks/useAiStream.ts` | 新建 |
| `src/components/AiDrawer/types.ts` | 新建 |
| `src/components/AiDrawer/SmartInput.tsx` | 新建 |
| `src/components/AiDrawer/MessageBubble.tsx` | 新建 |
| `src/components/AiDrawer.tsx` | 重构 |

### Phase B2: 上下文传递
| 文件 | 动作 |
|------|------|
| `src/store/drawerState.ts` | OpenInsightOpts 加 dashboardId |
| `src/pages/Dashboard/index.tsx` | handleOpenInsight 传 dashboardId |

---

## 不变的文件

| 文件 | 原因 |
|------|------|
| `src/theme/` | 不动 |
| `src/api/index.ts` | 不动 |
| `src/store/authStore.ts` | 不动 |
| `src/types/api.ts` | 不动 |
| `src/pages/Home/index.tsx` | 保持现有 |
| `src/pages/Dashboard/DashboardGrid.tsx` | 不动 |
| `src/pages/Dashboard/ChartCard.tsx` | 不动 (已有 AI 按钮) |
| `src/pages/Dashboard/useDashboardToolbar.tsx` | 不动 |
| `src/pages/Dashboard/DashboardToolbar.tsx` | 不动 |
| `src/pages/SqlLab/index.tsx` | 通过 overlay 引用, 不动 |
| `src/pages/ChartCreation/ChartEditor.tsx` | 通过 overlay 引用, 不动 |
| `src/components/AiConfigDialog.tsx` | 不动 |
| `src/components/ChatInput.tsx` | 不动 (AppBar search 仍用) |

---

## 工作量估算

| 模块 | 新建 | 修改 | 废弃 | 复杂度 |
|------|------|------|------|--------|
| ActivityBar + SidePanel | 4 | 1 | ~3 | 中 |
| DetailOverlay | 2 | 1 | 0 | 中 |
| AiDrawer 增强 | 5 | 3 | 0 | 高 |
| 上下文传递 | 0 | 2 | 0 | 低 |
| **合计** | **~11** | **~7** | **~3** | |
