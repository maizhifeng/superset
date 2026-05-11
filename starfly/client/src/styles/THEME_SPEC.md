# 主题系统规范 - BI Dashboard

## 设计哲学：精炼工业风格 (Refined Industrial)

**核心理念**：
- 数据为王，UI 为数据服务
- 颜色分层清晰，状态一目了然
- 主题色可调，但语义不变
- 克制使用颜色，避免视觉噪音

---

## 颜色层级架构

### Layer 1: 基础色调 (Base Tones)
| 名称 | CSS 变量 | 语义 | 使用场景 |
|------|----------|------|---------|
| **Page** | `bg.page` | 页面底色 | Dashboard 背景、列表页背景 |
| **Sidebar** | `bg.sidebar` | 导航区底色 | 侧边栏、Drawer |
| **Card** | `bg.card` / `background.paper` | 内容载体 | Widget 卡片、弹窗、Paper |
| **Header** | `bg.header` / `primary.light` | 区块标识 | Widget header、表格 header、AppBar hover |

**层级关系**：Page (最深) → Sidebar → Header → Card (最浅)
```
视觉层次: 深色背景 → 浅色卡片 → 内容浮起
```

### Layer 2: 状态色调 (State Tones)
| 状态 | CSS 变量 | Alpha | 语义 | 使用场景 |
|------|----------|-------|------|---------|
| **Hover** | `bg.hover` / `action.hover` | 0.04 | 轻微关注 | 按钮 hover、列表行 hover、菜单项 hover |
| **Selected** | `bg.selected` / `action.selected` | 0.08 | 明确选中 | 当前选项、激活 tab、聚焦项 |
| **Focus** | `action.focus` | 0.12 | 键盘焦点 | input focus、button focus ring |
| **Active** | `primary.main` | 1.0 | 操作进行中 | 加载中 spinner、执行中按钮 |

### Layer 3: 边框色调 (Border Tones)
| 级别 | CSS 变量 | Alpha | 语义 | 使用场景 |
|------|----------|-------|------|---------|
| **Light** | `border.light` | 0.08 | 分组边界 | 卡片边框、组件内分隔 |
| **Medium** | `border.medium` | 0.12 | 可见边界 | 输入框边框、分割线 |
| **Strong** | `border.strong` | 0.15 | 强调边界 | 弹窗边框、模态框边框 |

### Layer 4: 语义色调 (Semantic Tones)
| 类型 | CSS 变量 | 使用场景 |
|------|----------|---------|
| **Success** | `success.main` + `success.light` | 成功操作、完成状态、正向指标 |
| **Warning** | `warning.main` + `warningBg` | 警告提示、需关注项、异常趋势 |
| **Error** | `error.main` + `error.light` | 错误状态、失败操作、负向指标 |
| **Info** | `primary.main` | 信息提示、帮助说明、中性数据 |

---

## 元素-状态-颜色映射表

### 按钮 (Button)

| 类型 | 默认状态 | Hover | Active/Pressed | Disabled |
|------|---------|-------|----------------|----------|
| **Primary** | `primary.main` 背景，白色文字 | `primary.dark` 背景 | 阴影加深 | `action.disabledBackground` 背景，`action.disabled` 文字 |
| **Secondary/Outline** | 透明背景，`primary.main` 边框和文字 | `bg.hover` 背景，边框加深 | `bg.selected` 背景 | 灰色边框，灰色文字 |
| **Ghost** | 透明背景，`text.secondary` 文字 | `bg.hover` 背景 | `bg.selected` 背景 | `text.disabled` 文字 |
| **Danger** | `error.main` 背景，白色文字 | 深红色背景 | 阴影加深 | 同 disabled |

### 输入框 (Input)

| 状态 | 背景 | 边框 | 文字 | placeholder |
|------|------|------|------|-------------|
| **默认** | `background.paper` (白) | `border.medium` | `text.primary` | `text.disabled` |
| **Hover** | `background.paper` | `primary.main` (淡) | - | - |
| **Focus** | `background.paper` | `primary.main` (2px) | - | - |
| **Error** | `background.paper` | `error.main` | `error.main` | - |
| **Disabled** | `action.disabledBackground` | 无边框 | `text.disabled` | - |

### 卡片 (Card / Widget)

| 部分 | 颜色 | 说明 |
|------|------|------|
| **Header** | `primary.light` | 主题色派生的浅色，标识卡片归属 |
| **Content** | `background.paper` | 纯白，数据展示最佳背景 |
| **Border** | `border.light` | 微妙边框，不抢焦点 |
| **Hover (整体)** | 阴影 `shadow.cardHover` + 微上移 | 提示可交互 |
| **Selected** | `primary.main` 2px outline | 编辑模式选中状态 |

### 表格 (DataGrid)

| 部分 | 颜色 | 说明 |
|------|------|------|
| **Header 行** | `primary.light` | 列标题区，响应主题色 |
| **Footer (分页)** | `primary.light` | 底部操作区，响应主题色 |
| **数据行** | `background.paper` | 数据阅读区，纯白 |
| **行 Hover** | `action.hover` | 浅色覆盖，提示可点击 |
| **行 Selected** | `action.selected` | 深色覆盖，明确选中 |

### 导航项 (Navigation)

| 状态 | 背景 | 文字 | 图标 |
|------|------|------|------|
| **默认** | 透明 | `text.secondary` | `text.secondary` |
| **Hover** | `action.hover` | `text.primary` | `primary.main` |
| **Active** | `action.selected` + 左侧竖线 `primary.main` | `primary.main` | `primary.main` |

### 浮动操作按钮 (SpeedDial)

| 部分 | 颜色 | 说明 |
|------|------|------|
| **Fab 背景** | `primary.main` | 主色调，醒目 |
| **Fab 图标** | 白色 | 高对比度 |
| **展开项背景** | `background.paper` | 白色，与主题色形成对比 |
| **展开项 Hover** | `action.hover` | 响应主题色的 hover |

### 图标 (Icon)

| 场景 | 颜色 | 说明 |
|------|------|------|
| **功能性图标 (按钮内)** | 继承父元素文字色 | 与文字协调 |
| **状态图标 (success/error)** | 对应语义色 | 明确传达状态 |
| **装饰性图标 (列表图标圆圈)** | `bg.iconBg` 背景，`primary.main` 图标 | 响应主题色 |
| **图标按钮 Hover** | `primary.main` | 提示可点击 |

### 标签/徽章 (Chip/Badge)

| 类型 | 背景 | 文字 | 边框 |
|------|------|------|------|
| **默认** | `action.selected` | `text.primary` | 无 |
| **Primary** | `primary.light` | `primary.main` | 无 |
| **Success** | `success.light` | `success.main` | 无 |
| **Error** | `error.light` | `error.main` | 无 |
| **Outline** | 透明 | `text.primary` | `border.medium` |

---

## 特殊组件规则

### GlobalFilters (全局筛选器)

| 元素 | 颜色 | 说明 |
|------|------|------|
| **筛选组背景** | `bg.selected` | 浅色分组容器 |
| **标签文字 (平台/时间)** | `primary.main` | 响应主题色 |
| **标签右侧分割线** | `border.medium` | 分隔标签和控件 |
| **Radio checked** | `primary.main` | 响应主题色 |

### FullscreenModal (全屏图表)

| 元素 | 颜色 |
|------|------|
| **背景** | `background.paper` |
| **Header 分隔线** | `border.medium` |
| **维度选择器背景** | `bg.selected` |
| **图表类型标签 active** | `primary.light` 背景，`primary.main` 文字 |

### 添加弹窗步骤指示器 (Step Indicator)

| 状态 | 圆圈颜色 | 连线颜色 | 文字颜色 |
|------|---------|---------|---------|
| **Active** | `primary.main` | `primary.main` (到下一步) | `primary.main` |
| **Completed** | `success.main` | `success.main` | `text.secondary` |
| **Inactive** | `divider` | `divider` | `text.disabled` |

---

## 动态主题色响应规则

### 当 primary.main 改变时，自动派生的变量：

| 变量 | 派生公式 | 示例 (primary: #1A73E8 → #6366F1) |
|------|---------|--------------------------------|
| `primary.light` | 亮度 × 1.35 | #E8F0FE → #C7D2FE |
| `primary.dark` | 亮度 × 0.75 | #1557B0 → #4F46E5 |
| `bg.hover` | rgba(primary, 0.04) | rgba(26,115,232,0.04) → rgba(99,111,241,0.04) |
| `bg.selected` | rgba(primary, 0.08) | rgba(26,115,232,0.08) → rgba(99,111,241,0.08) |
| `border.light` | rgba(primary, 0.08) | rgba(26,115,232,0.08) → rgba(99,111,241,0.08) |
| `border.medium` | rgba(primary, 0.12) | rgba(26,115,232,0.12) → rgba(99,111,241,0.12) |
| `divider` | rgba(primary, 0.10) | rgba(26,115,232,0.10) → rgba(99,111,241,0.10) |
| `bg.iconBg` | 同 primary.light | #E8F0FE → #C7D2FE |

### 保持不变的变量（不响应主题色）：

| 变量 | 值 | 原因 |
|------|-----|------|
| `bg.page` | #F9FAFB | 页面背景需要稳定，频繁变化会视觉疲劳 |
| `bg.sidebar` | #F9FAFB | 同页面背景，保持一致 |
| `bg.card` | #FFFFFF | 纯白是最好的数据展示背景 |
| `text.*` | 固定灰阶 | 文字颜色需要稳定以保证可读性 |
| `success/error/warning` | 固定色 | 语义色不应随主题变化，保持状态识别一致性 |

---

## 使用规范

### DO ✅

1. **状态色使用 alpha 变体**：hover 用 0.04，selected 用 0.08
2. **边框按可见性分级**：分组用 light，分割用 medium，强调用 strong
3. **文字层级分明**：标题 `text.primary`，描述 `text.secondary`，禁用 `text.disabled`
4. **图标响应主题**：功能性图标圆圈背景使用 `bg.iconBg`

### DON'T ❌

1. **不要直接使用 rgba 硬编码**：所有 rgba 应通过 CSS 变量动态生成
2. **不要混用语义色**：成功状态不要用 primary，错误状态不要用 warning
3. **不要让卡片背景响应主题**：`bg.card` 保持纯白，保证数据可读
4. **不要修改 text 颜色**：文字颜色保持固定灰阶，主题色只影响 UI 元素

---

## CSS 变量完整清单

```css
/* Primary 系列 - 响应主题 */
--mui-palette-primary-main
--mui-palette-primary-light
--mui-palette-primary-dark
--mui-palette-primary-contrastText

/* 背景层级 */
--mui-palette-bg-page          /* 固定 */
--mui-palette-bg-sidebar       /* 固定 */
--mui-palette-bg-card          /* 固定 */
--mui-palette-bg-header        /* 响应主题 */
--mui-palette-bg-hover         /* 响应主题 */
--mui-palette-bg-selected      /* 响应主题 */
--mui-palette-bg-muted         /* 响应主题 */
--mui-palette-bg-iconBg        /* 响应主题 */

/* 边框层级 - 响应主题 */
--mui-palette-border-light
--mui-palette-border-medium
--mui-palette-border-strong

/* 分隔线 - 响应主题 */
--mui-palette-divider

/* 文字层级 - 固定 */
--mui-palette-text-primary
--mui-palette-text-secondary
--mui-palette-text-disabled

/* 语义色 - 固定 */
--mui-palette-success-main
--mui-palette-success-light
--mui-palette-error-main
--mui-palette-error-light
--mui-palette-warning-main
--mui-palette-warningBg

/* Action 状态 - 响应主题 */
--mui-palette-action-hover
--mui-palette-action-selected
--mui-palette-action-focus
--mui-palette-action-disabled
--mui-palette-action-disabledBackground
```

---

## 示例：主题色从蓝色变为紫色

| 变量 | 蓝色主题 (#1A73E8) | 紫色主题 (#6366F1) |
|------|---------------------|---------------------|
| primary.main | #1A73E8 | #6366F1 |
| primary.light | #E8F0FE | #C7D2FE |
| primary.dark | #1557B0 | #4F46E5 |
| bg.selected | rgba(26,115,232,0.08) | rgba(99,111,241,0.08) |
| border.medium | rgba(26,115,232,0.12) | rgba(99,111,241,0.12) |
| **不变的** | | |
| bg.page | #F9FAFB | #F9FAFB |
| bg.card | #FFFFFF | #FFFFFF |
| text.primary | #202124 | #202124 |
| success.main | #1E8E3E | #1E8E3E |

---

## 版本

- **创建日期**: 2026-04-23
- **设计风格**: Refined Industrial
- **适用范围**: BI Dashboard 全系统
