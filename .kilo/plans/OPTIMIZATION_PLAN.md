# Superset Frontend New 优化计划

> 本文档持续跟踪 `superset-frontend-new/` 相对于 `superset-frontend/`（旧版）的优化进展。
> 每项优化按 **P0（阻塞）→ P4（长期）** 排序。

---

## 一、总体状态

| 阶段 | 优化项数 | ✅ 已完成 | 🔄 进行中 | ❌ 未开始 |
|------|----------|-----------|-----------|-----------|
| Phase 1: 基础修复 | 3 | 0 | 0 | 3 |
| Phase 2: 质量基础设施 | 5 | 0 | 0 | 5 |
| Phase 3: 构建优化 | 4 | 0 | 0 | 4 |
| Phase 4: 代码质量与 DX | 5 | 0 | 0 | 5 |
| Phase 5: 功能补齐 | 5 | 0 | 0 | 5 |
| **合计** | **22** | **0** | **0** | **22** |

---

## 二、优化跟踪

### Phase 1: 基础修复 (P0)

> 阻塞性问题，不修复则项目无法正常运行或构建。

#### #1 packages / plugins 目录缺失

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **分类** | 修复 |
| **当前状态** | ❌ 未开始 |
| **描述** | `package.json` 声明 `"workspaces": ["packages/*", "plugins/*"]` 以及多个 `file:` 依赖（`@superset-ui/core`、`@superset-ui/chart-controls` 等），但磁盘上无对应目录。`src/utils/query/` 等模块的 import 无法解析，构建将直接失败。 |
| **对比旧版** | 旧版有完整的 4 个 packages + 19 个 plugins 目录，由 Lerna 管理 |
| **方案建议** | 从 `superset-frontend/` 复制必要的 packages（superset-ui-core、superset-ui-chart-controls、superset-ui-switchboard、superset-core），或重构为内联实现 |
| **验收标准** | `npm run build` 通过；运行时所有 chart/data API 调用正常 |

#### #2 资源文件与空目录补全

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **分类** | 修复 |
| **当前状态** | ❌ 未开始 |
| **描述** | `index.html` 引用 `/src/assets/images/favicon.png` 但 `src/assets/` 目录不存在；`src/types/` 为空目录；`src/pages/NotFound/` 为空目录。 |
| **方案建议** | 添加 favicon 到 `src/assets/images/`；移除空目录或补充内容；为 404 路由添加友好提示页面 |
| **验收标准** | 浏览器 tab 显示 favicon；访问不存在路由时显示 NotFound 页面（非白屏） |

#### #3 浏览器兼容与引擎约束缺失

| 字段 | 内容 |
|------|------|
| **优先级** | P0 |
| **分类** | 修复 |
| **当前状态** | ❌ 未开始 |
| **描述** | 无 `browserslist`（旧版明确声明 "last 3 chrome/firefox/safari/edge"）、无 `.nvmrc`（旧版指定 `^22.22.0`）、`package.json` 无 `engines` 字段。LightningCSS 默认可能输出不兼容的 CSS。 |
| **方案建议** | 在 `package.json` 补充 `browserslist` + `engines`；在项目根添加 `.nvmrc` |
| **验收标准** | `npx browserslist` 输出预期的 target 浏览器列表 |

---

### Phase 2: 质量基础设施 (P1)

> 重要功能缺口，影响项目的质量保障能力和多语言用户。

#### #4 添加国际化 (i18n) 支持

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **分类** | 功能 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版有完整 `.po` 翻译文件系统、`po2json.sh` 构建脚本、基于 Flask 的多语言支持。新版所有界面为硬编码英文。Superset 是国际化开源项目，此为重大回归。 |
| **方案建议** | 集成 `react-intl` 或复用旧版的 i18n 方案；至少覆盖导航、页面标题、操作按钮等高频文案 |
| **验收标准** | 新建页面支持中/英文切换；核心操作文案无硬编码 |

#### #5 建立测试基础设施

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **分类** | 测试 |
| **当前状态** | ❌ 未开始 |
| **描述** | 仅有 `setupTests.ts`（空加载 `@testing-library/jest-dom`），无单元测试、集成测试、E2E 测试。旧版有 Jest（单元）、Playwright（E2E）、Cypress（已弃用）、Storybook test-runner。 |
| **方案建议** | Vitest 已配置，需要（1）添加 mock 工厂与 fixture 数据；（2）为核心模块（Auth、API、Store）添加测试；（3）复用旧版 `spec/helpers/testing-library.tsx` 的 provider wrapper 模式 |
| **验收标准** | 核心模块测试覆盖 >= 1 个用例；`npm run test` 通过 |

#### #6 添加 Storybook 组件开发环境

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **分类** | 工具 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版有 `.storybook/` 配置（8 个 addon、7 个 shared utility、test-runner），Storybook 覆盖 19 个 chart plugin。新版无组件目录。 |
| **方案建议** | 至少为 `DataGridTable`、`AppLayout`、`PageHeader` 等核心 UI 组件添加 story |
| **验收标准** | `npm run storybook` 可启动，核心组件有 story 展示 |

#### #7 添加扩展 / 插件系统

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **分类** | 架构 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版通过 `src/extensions/` + `superset-core` packages + ModuleFederationPlugin 实现插件化架构，chart plugin 可独立加载。新版所有功能和图表类型硬编码在 `src/` 中。 |
| **方案建议** | 评估是否需要保留插件架构；若不需要，清理 tsconfig 中 `plugins/` 的 path alias |
| **验收标准** | 明确插件架构方向（保留/移除），配置相应清理 |

#### #8 添加 Embedded SDK

| 字段 | 内容 |
|------|------|
| **优先级** | P1 |
| **分类** | 功能 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版 `src/embedded/` 支持仪表盘嵌入 iframe，`@superset-ui/switchboard` 处理宿主与嵌入页的通信。新版完全缺失。 |
| **方案建议** | 按需实现，依赖 switchboard package 可用性 |
| **验收标准** | 嵌入调用方式确定（支持/不支持） |

---

### Phase 3: 构建优化 (P2)

> 性能与构建体验优化。

#### #9 配置 Vite 代码分割

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **分类** | 构建 |
| **当前状态** | ❌ 未开始 |
| **描述** | `vite.config.ts` 的 `build` 段仅有 `outDir`/`emptyOutDir`/`sourcemap`，未配置 `rollupOptions.output.manualChunks`。React、MUI、ECharts 等大型依赖应分 chunk。旧版通过 Webpack `splitChunks` 配置了 vendor / thumbnail 等 cache group。 |
| **方案建议** | 添加 manualChunks 配置，分离 vendor-react / vendor-mui / vendor-echarts |
| **验收标准** | 生产构建产物按预期分 chunk；热启动速度不受影响 |

```ts
// rollupOptions.output.manualChunks 参考配置
{
  'vendor-react': ['react', 'react-dom', 'react-router-dom'],
  'vendor-mui': ['@mui/material', '@mui/x-data-grid', '@mui/x-date-pickers'],
  'vendor-echarts': ['echarts', 'echarts-for-react'],
}
```

#### #10 扩展 optimizeDeps

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **分类** | 构建 |
| **当前状态** | ❌ 未开始 |
| **描述** | 当前仅 `include: ['immer']`。MUI 9 大量内部依赖（emotion、stylis 等）可能触发 Vite 的 deoptimization 警告，影响 dev server 冷启动速度。 |
| **方案建议** | 监控 `vite dev` 启动日志，将出现 deoptimization 警告的依赖加入 `optimizeDeps.include` |
| **验收标准** | dev server 冷启动无 deoptimization 警告 |

#### #11 添加 Bundle 分析工具

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **分类** | 构建 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版有 `webpack-bundle-analyzer` + `speed-measure-webpack-plugin`。新版无任何 bundle 分析手段。 |
| **方案建议** | 添加 `vite-plugin-visualizer`，集成到 `npm run build:analyze` 脚本 |
| **验收标准** | `npm run build:analyze` 输出可视化的 bundle 分析报告 |

#### #12 修复代理规则冗余

| 字段 | 内容 |
|------|------|
| **优先级** | P2 |
| **分类** | 构建 |
| **当前状态** | ❌ 未开始 |
| **描述** | `vite.config.ts` 中 `/api` 和 `/api/v1` 的 proxy 配置完全相同，`/api` 已覆盖 `/api/v1`。 |
| **方案建议** | 移除重复的 `/api/v1` 规则，仅保留 `/api` 规则 |
| **验收标准** | dev server 启动；`/api/v1/me/` 等请求正常代理 |

---

### Phase 4: 代码质量与开发者体验 (P3)

#### #13 完善 ESLint 配置

| 字段 | 内容 |
|------|------|
| **优先级** | P3 |
| **分类** | 质量 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版有 519 行的 `.eslintrc.js`（TypeScript、React、import 等全面覆盖）+ 286 行的 `oxlint.json`（OXC 作为主 linter）+ 3 个自定义 ESLint 插件（theme-colors、icons、i18n-strings）。新版 `package.json` 声明了 `"lint": "eslint src --ext .ts,.tsx"` 但无 ESLint 配置文件。 |
| **方案建议** | 添加 ESLint 配置，至少覆盖 `@typescript-eslint`、`eslint-plugin-react`、`eslint-plugin-import`；对齐旧版 oxlint 的关键规则（no-unused-vars、no-console、prefer-const 等） |
| **验收标准** | `npm run lint` 可执行并输出有效的 lint 结果 |

#### #14 添加 pre-commit hooks

| 字段 | 内容 |
|------|------|
| **优先级** | P3 |
| **分类** | DX |
| **当前状态** | ❌ 未开始 |
| **描述** | 无 git hooks，开发者可能提交代码格式不统一或有类型错误。旧版在项目级别没有明确的 pre-commit 配置（CI 中运行 lint + type check）。 |
| **方案建议** | 添加 `husky` + `lint-staged`，commit 前自动运行 `eslint --fix` + `tsc --noEmit` |
| **验收标准** | commit 时自动触发 lint + type check，失败则阻止提交 |

#### #15 添加 Error Boundary

| 字段 | 内容 |
|------|------|
| **优先级** | P3 |
| **分类** | 质量 |
| **当前状态** | ❌ 未开始 |
| **描述** | `App.tsx` 中 `<Suspense>` 仅有加载状态的 `CircularProgress` fallback，无错误 fallback。页面组件报错将白屏。旧版有 `ErrorBoundary` 组件 + `ErrorMessage` 组件。 |
| **方案建议** | 添加全局 `ErrorBoundary` 组件包裹 `<Suspense>`，提供"出错了，点击重试"UI |
| **验收标准** | 抛出异常时显示 Error Boundary UI (非白屏)，有重试按钮 |

#### #16 集成 TanStack React Query

| 字段 | 内容 |
|------|------|
| **优先级** | P3 |
| **分类** | 架构 |
| **当前状态** | ❌ 未开始 |
| **描述** | 当前 pages 直接使用 `useEffect` + `useState` + Axios 进行数据获取，无缓存、无自动重验证、无竞态处理（loading 指示器不精确）。旧版使用 `@tanstack/react-query` 封装了 `useApiList`、`useApiMutation` 等 hooks。 |
| **方案建议** | 集成 `@tanstack/react-query`；封装 `useApiGet` / `useApiList` / `useApiMutation` hooks；先行替换 Dashboard 和列表页的数据获取 |
| **验收标准** | Dashboard chart 数据有缓存 + 自动重验证；列表页搜索有 debounce + 取消上一请求 |

#### #17 HTTP 客户端异常处理优化

| 字段 | 内容 |
|------|------|
| **优先级** | P3 |
| **分类** | 质量 |
| **当前状态** | ❌ 未开始 |
| **描述** | `api/index.ts` 中 401 响应使用 `window.location.href = '/login'` 硬导航，无法保持 SPA 内部状态。应该使用 React Router 的 `navigate` 进行 SPA 内导航，保存当前路径以便登录后跳回。 |
| **方案建议** | 通过 Context 将 `navigate` 函数注入 API 层，或使用 `axios-retry` 拦截器在 401 时触发全局 navigate |
| **验收标准** | 401 后 SPA 内导航到 `/login`；登录后重定向回原始路径 |

---

### Phase 5: 功能补齐 (P4)

> 长期改进，按需分步实现。

#### #18 Dashboard 功能增强

| 字段 | 内容 |
|------|------|
| **优先级** | P4 |
| **分类** | 功能 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版 Dashboard 有 Native Filters（原生过滤器）、Drill-by（钻取）、CSS 模板、自动刷新间隔、缓存策略。新版仅有基础 react-grid-layout + filter drawer。 |
| **方案建议** | 按优先级：Native Filter 联动 → 图表刷新 → 缓存策略 → Drill-by |
| **验收标准** | Dashboard Filter 可选值从服务端动态加载并可联动过滤 |

#### #19 图表类型扩展

| 字段 | 内容 |
|------|------|
| **优先级** | P4 |
| **分类** | 功能 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版有 19 个 chart plugin（ECharts、AG Grid、Deck.GL 3D 地图、NVD3、各种 legacy 图表）。新版仅有 ECharts 基础类型（line/bar/area/pie/table/big_number）。 |
| **方案建议** | 按需移植：Pivot Table → Heatmap → Sunburst → Deck.GL |
| **验收标准** | 至少再集成 2 种图表类型 |

#### #20 SQL Lab 完善

| 字段 | 内容 |
|------|------|
| **优先级** | P4 |
| **分类** | 功能 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版 SQL Lab 有多 tab 管理、ACE 编辑器（语法高亮 + 自动补全）、模板变量、结果缓存、查询历史侧栏、结果导出。新版仅有基础 textarea + run button。 |
| **方案建议** | 按优先级：结果分页/导出 → 语法高亮 → 多 tab → 模板变量 |
| **验收标准** | SQL 编辑有语法高亮；结果可分页浏览并导出 CSV |

#### #21 Alerts & Reports 完善

| 字段 | 内容 |
|------|------|
| **优先级** | P4 |
| **分类** | 功能 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版有完整告警 / 报表 CRUD 界面。新版 UI 框架（列表页 + DataGrid）存在但 CRUD 交互不完整：不可编辑、不可删除、不可创建。 |
| **方案建议** | 补齐告警和报表的完整 CRUD 操作 |
| **验收标准** | 告警/报表列表可创建、编辑、删除、搜索 |

#### #22 Feature Flag 系统

| 字段 | 内容 |
|------|------|
| **优先级** | P4 |
| **分类** | 功能 |
| **当前状态** | ❌ 未开始 |
| **描述** | 旧版通过 `bootstrap_data.common.feature_flags` 从后端传递特性开关。新版无任何 feature flag 机制。 |
| **方案建议** | 简单实现：基于 `localStorage` 的 local flags + 可选的后端 `/api/v1/feature_flags` 端点 |
| **验收标准** | 可通过配置控制新功能的显示/隐藏 |

---

## 三、验收标准总清单

### Phase 1 验收
- [ ] `npm run build` 可成功构建
- [ ] 项目根存在 browserslist、.nvmrc、engines 配置
- [ ] favicon 正常显示
- [ ] 404 路由显示 NotFound 页面
- [ ] `npm run lint` 可执行

### Phase 2 验收
- [ ] 核心文案无硬编码，支持中/英文切换
- [ ] Auth、API、Store 模块有 Vitest 测试且通过
- [ ] 核心 UI 组件有 Storybook story
- [ ] 明确插件架构方向

### Phase 3 验收
- [ ] 构建产物按 vendor / mui / echarts 分 chunk
- [ ] `npm run build:analyze` 可输出 bundle 分析报告
- [ ] proxy 配置无冗余

### Phase 4 验收
- [ ] 页面报错时显示 Error Boundary UI（非白屏）
- [ ] commit 前自动运行 lint + type check
- [ ] API 数据获取使用 React Query hooks，有缓存策略
- [ ] 401 后 SPA 导航到登录页，支持回跳

### Phase 5 验收
- [ ] Dashboard Filter 可选值动态加载 + 联动过滤
- [ ] 至少集成 2 种新增图表类型
- [ ] SQL 编辑器有语法高亮 + 结果分页导出
- [ ] 告警/报表可创建、编辑、删除
- [ ] Feature Flag 可控制新功能显示/隐藏

---

## 四、变更日志

| 日期 | 变更内容 | 更新人 |
|------|----------|--------|
| - | 文档初始化 | - |

---

## 五、参考：关键对比指标

| 指标 | superset-frontend | superset-frontend-new |
|------|-------------------|-----------------------|
| UI 框架 | Ant Design 5 | MUI 9 |
| 构建工具 | Webpack 5 + SWC | Vite 5 + esbuild/SWC |
| 状态管理 | Redux + Redux Toolkit | Zustand |
| 测试框架 | Jest + Playwright + Cypress | Vitest（仅配置） |
| 路由 | react-router-dom v5 | react-router-dom v6 |
| CSS 方案 | CSS Modules + Antd tokens | LightningCSS + Emotion + CSS 变量 |
| 国际化 | 完整 i18n | 无 |
| 图表类型 | 19 个 plugins | 6 种基础类型 |
| 扩展系统 | extensions + ModuleFederation | 无 |
| 包管理 | Lerna monorepo | npm workspaces |
| 代码规范 | OXC linter + ESLint + 3 自定义规则 | ESLint（未配置） |
| Storybook | 完整配置 | 无 |
| E2E 测试 | Playwright + Cypress | 无 |
