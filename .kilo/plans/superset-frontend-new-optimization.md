# superset-frontend-new 优化方案

## 范围

`superset-frontend-new/` 是基于 Vite + React 18 + TypeScript + MUI v9 + Zustand 的全新前端,
用于替换旧的 `superset-frontend/`(webpack + Ant Design + Redux)。当前规模:167 个 TS/TSX 文件、
约 2.93 万行代码、22 个测试、0 个 Story、0 个 Storybook 配置、1 个未使用的 PWA 依赖。
以下按区域分组的优化建议,均给出具体行动项。

## 现状速览

| 区域 | 现状 | 风险 | 工作量 | 优先级 |
|---|---|---|---|---|
| 构建/工具链 | Vite 5 + SWC + checker,基本可用 | 低 | 低 | — |
| 无用依赖 | `vite-plugin-pwa`、`@types/jest`、`@types/node@25` 未使用 | 低 | XS | P1 |
| 路径别名 | `tsconfig` 中声明了 `@superset-ui/core` 等,但 `packages/` 目录不存在 | 高(易踩坑) | XS | P1 |
| 主题系统 | 两个几乎相同的主题创建函数;token 在 CSS 与 TS 中重复 | 中 | M | P1 |
| 状态管理 | 8+ 个 Zustand store,缺少 selector 规范,未使用 `subscribeWithSelector` | 低 | M | P2 |
| API 层 | 设计尚可,但 `index.ts` 集中了 401/刷新逻辑,达 265 行 | 中 | M | P2 |
| 路由 | `App.tsx` 250 行,手写重复的路由 | 低 | S | P2 |
| 懒加载 | 所有页面都用了 `lazy()`(好),但 `Login` 缺少边界处理 | 低 | XS | P2 |
| 认证初始化 | `useAuthStore.getState().init()` 在模块顶层调用(副作用) | 中 | S | P2 |
| Token 刷新 | 基于 `setTimeout`,手动 `setToken` 后未重新评估 | 低 | S | P3 |
| 快捷键系统 | 较完善,但 `Mousetrap.prototype.stopCallback = () => false` 是全局污染 | 中 | XS | P2 |
| 国际化 | `App.tsx` 等多处硬编码中文字符串 | 中 | L | P3 |
| 错误处理 | 没有全局 `ErrorBoundary`;`clearAuth` 未从 `authStore` 导出 | 中 | S | P2 |
| 测试 | 22 个测试 / 167 文件 ≈ 13%,远低于 AGENTS.md "优先单元测试" 的要求 | 中 | L | P1 |
| Storybook / MDX | 没有 `.storybook/` 和 story;AGENTS.md 指出 story 是单一事实源 | 高(CI/文档) | L | P3 |
| CSS / 设计 token | `--radius-sm` 等在 `index.css` 与 `spacing.ts`/`motion.ts` 中重复 | 低 | S | P2 |
| 超大组件 | `AiDrawer.tsx` 1093 行(上帝组件) | 中 | M | P2 |
| 类型安全 | 已开启 `noImplicitAny`,但 `package.json` 中 `eslint` 未真正配置 | 中 | S | P1 |
| Pre-commit / lint | 没有 `prettier` / `eslint` / `pre-commit` 配置,按 AGENTS.md 会导致 CI 失败 | 高(CI 卡点) | S | P1 |
| 性能 | 缺少 `React.memo` 与 `useMemo` 规范;未对 MUI 子包做 `React.lazy` | 低 | M | P3 |
| 可访问性 | 焦点样式只写在 CSS 中,没有 axe 测试 | 低 | M | P3 |

---

## 1. 构建与工具链(P1,~XS~S)

### 1.1 清理无用依赖
`package.json` 中已声明但实际未使用的依赖:
- `vite-plugin-pwa`(`vite.config.ts` 中无 `VitePWA`,也没有 service-worker 文件)
- `@types/jest`(项目使用 Vitest)
- `@types/node@^25`(版本过新,`^20` 更稳定、体积更小)
- `mousetrap` 类型保留;需确认 `tinycolor2` 的类型是否真在使用
- 视情况移除 `lightningcss`(仅是 dev-only 的 CSS 转换器),除非有特殊需求

**行动**:精简 `devDependencies`,刷新 `package-lock.json`,执行 `npm run build` 确认无回归。

### 1.2 让 `tsconfig.json` 对齐实际项目
- `tsconfig.json` 声明了指向 `packages/superset-ui-core/src` 等的 paths,但仓库中根本没有 `packages/` 目录。可二选一:
  - (a) 删除这些 path(更快、避免误导)
  - (b) 把 `packages/` 目录补回来(它们是旧版的契约)
  推荐先走 (a)。
- `"composite": true` 与 `"declaration": true` 是 monorepo 残留,本项目是单应用,移除可加速类型检查。
- `"rootDir": "."` 会通过 `vite.config.ts` 把 `node_modules` 路径纳入;收窄为 `./src`。

### 1.3 补齐真实的 lint 与 format
AGENTS.md 明确要求 "Always run `pre-commit run --all-files`"。但目前 `superset-frontend-new/` 中
**没有 `.pre-commit-config.yaml`、`eslint.config.*`、`.prettierrc`**。`package.json` 中的
`lint` 脚本调用 `eslint src --ext .ts,.tsx`,但 ESLint 并不在 devDependencies 中。

**行动**:
- 新增 `eslint`、`@typescript-eslint/*`、`eslint-plugin-react-hooks`、`prettier`、`prettier-plugin-organize-imports`。
- 新增最小化的 `eslint.config.js`(flat config)与 `.prettierrc.json`。
- 在仓库根新增 `.pre-commit-config.yaml`,复用 superset-frontend 的 hooks(prettier、eslint;mypy 不适用)。
- 增加 `format` 脚本,并接入 `lint`。

### 1.4 补全测试脚本与覆盖率阈值
`package.json` 已有 `test:watch` 与 `test:ui`,但缺少 `test:coverage`。当前仅 22 个测试,
覆盖率是衡量新前端质量的唯一量化信号。

**行动**:引入 `@vitest/coverage-v8`,在 `vite.config.ts` 的 `test` 块中暴露 `coverage` 字段,新增 `test:coverage` 脚本。

---

## 2. 主题与设计 token(P1,~M)

主题当前被切散到三处:
1. `src/theme/{palette,vibrantPalette,typography,components,spacing,motion,keyframes}.ts`
2. `src/index.css` 中的 `--radius-*`、`--duration-*`、`--ease-*`、`--space-*`
3. 组件中的内联 `sx={{}}` 字面量

这违背 AGENTS.md 中 "优先使用 antd 设计 token,避免自定义 CSS 和样式" 的要求。

**行动**:
- **2.1** 把设计 token 统一收敛到 `src/theme/tokens.ts`(radius、duration、ease、spacing 数值刻度)。
- **2.2** 去掉 `index.css` 中重复的 CSS 变量。优先方案:利用 MUI 已开启的 `cssVariables: true`,由主题输出 CSS 变量;备选方案:在构建步骤中由 TS token 生成 CSS 变量。
- **2.3** 把 `createPaperTheme` / `createVibrantTheme` 合并为单个 `createTheme(mode)`,只切换 palette 即可(两个函数 90% 相同)。
- **2.4** 审查 95 行的 `index.css`,用 MUI 的 `cssVariables` 与 `components.MuiCssBaseline.styleOverrides` 替代 `[data-theme="x"]` 选择器。
- **2.5** 替换残留的 `sx={{ transition: "all 200ms" }}` 字面量为 motion token(如 `theme.transitions.duration.standard`)。

---

## 3. 状态管理(P2,~M)

`src/store/` 下有 8 个 store,外加 `src/stores/conversationStore.ts`(注意:目录命名 **单复数不一致**,应合并到 `store/`)。

**行动**:
- **3.1** 把 `src/stores/conversationStore.ts` 移入 `src/store/`,删除 `src/stores/`,统一从 `store/index.ts` barrel 导出。
- **3.2** 约定:每个 store 同时导出 `useXxxStore` hook 与纯 selector(如 `selectIsAuthenticated`、`selectTheme`),供无响应式需求的组件复用。在 `App.tsx` 这类多字段消费处改用 `zustand/shallow`。
- **3.3** `navStore.toggleCategory` 在 action 内使用动态 `import()` —— 路径在同 chunk 中,可改为静态 import,减少一次隐藏的异步跳转。
- **3.4** `useAuthStore.getState().init()` 在模块顶层执行(`authStore.ts:115`),属于副作用,**任何** 模块导入(包括测试)都会触发。把 bootstrap 调用挪到 `main.tsx`,store 只导出 `init`。

---

## 4. API 层(P2,~M)

`src/api/index.ts` 265 行,把以下职责混在一起:
- token 存储
- CSRF 处理
- Axios 实例与拦截器
- JWT 解码与刷新调度
- 偶发性辅助函数(`getDataset`、`getMetricFormatMap`)

**行动**:
- **4.1** 拆分:
  - `api/client.ts` — Axios 实例与拦截器
  - `api/auth.ts` — token 存储、刷新、解码
  - `api/csrf.ts` — CSRF 令牌保障
  - `api/dataset.ts` — `getDataset`、`getMetricFormatMap`
  - `api/index.ts` — 仅做 re-export
- **4.2** 用更稳健的策略替换 `setTimeout` 式的刷新(`setupTokenRefresh`):在 `exp - 60s` 调度,每次成功 login 后重新调度;在 refresh 成功后用新 token 的过期时间重置计时器。
- **4.3** 刷新失败时 `processQueue(error, null)` 让所有排队的 promise 拿到的是 **原始** 401 错误(而非类型化的 `AuthError`)。引入一个类型化错误,让 UI 能区分鉴权失败与网络错误。
- **4.4** dataset 缓存是 `Map<string, Promise>`,失败时删除条目。增加 1 次重试,以及 PUT/POST 后的显式 `evictDataset(id)`。
- **4.5** 把所有 token/refresh/clear 逻辑从 `api/index.ts` 移到 `authStore.ts`,让 store 成为鉴权状态的唯一来源(目前 `api/index.ts` 通过 `clearAuth` 直接改 `localStorage`,绕过了 store)。

---

## 5. 路由(P2,~S)

`App.tsx:105-249` 是 14 条手写 `<Route>`,全部是 `<ProtectedLayout><X /></ProtectedLayout>` 的重复模式。

**行动**:
- **5.1** 引入 `src/routes/index.tsx`,导出 `routes: { path, element, lazy }[]` 数组,加一个轻量的 `<AppRoutes />` 组件。
- **5.2** `Login` 目前在 `ProtectedLayout` 之外,但 `GlobalShortcuts` 在未登录时返回 `null` —— 需要再次确认。
- **5.3** 补 404 页面(`*` 当前是 `<Navigate to="/" />`,但 `src/pages/NotFound/` 已存在却没接上)。

---

## 6. 认证生命周期(P2,~S)

- **6.1** `useAuthStore.init()` 在模块加载时自动调用 —— 改为在 `main.tsx` 调用,并以 `loading: true` 把渲染门控起来。`ProtectedRoute` 已处理 `loading`,主要是清理副作用。
- **6.2** 在 React 树根节点加全局 `ErrorBoundary`。当前任何页面抛错都会导致整站白屏。可基于 MUI 模式或写一个 30 行的 class 组件。
- **6.3** `clearAuth` 在 `api/index.ts` 中定义却未导出;把它暴露给 401 拦截器,避免与 `authStore.logout` 重复。

---

## 7. 快捷键系统(P2,~XS)

`hooks/useShortcut/index.ts:28`:
```ts
Mousetrap.prototype.stopCallback = () => false;
```
这是 **全局原型污染**,影响整个 bundle 中所有 Mousetrap 消费者。测试只要 import 该模块,
就会在整进程中关掉 `stopCallback`。标准做法是基于每绑定开关,或传入独立 `Mousetrap` 实例。

**行动**:用 per-bind 标记替换,或传入独立实例,避免污染原型。

---

## 8. 组件拆分(P2,~M)

`src/components/AiDrawer.tsx` 达 **1093 行**,糅合了消息渲染、智能输入、流式输出、历史、工具调用等。

**行动**:拆分为:
- `AiDrawer/`(已存在 `MessageBubble`、`SmartInput`、`types` 子目录)—— 把父级 `AiDrawer.tsx` 折进 `AiDrawer/index.tsx`,并抽出:
  - `AiDrawer/hooks/useConversation.ts`(流式、abort)
  - `AiDrawer/ConversationList.tsx`
  - `AiDrawer/ToolCallCard.tsx`
  - `AiDrawer/HeaderActions.tsx`
- 用同样思路审查 `DataGridTable.tsx`、`DataPreviewTable.tsx`、`ListPageLayout.tsx`(行数未知,但值得审计)。

---

## 9. 测试(P1,~L)

22 个测试覆盖 167 个源文件 = 13%。AGENTS.md 明确要求"优先单元测试"。关键未覆盖路径:
- `api/index.ts`(鉴权、CSRF、刷新)
- `store/authStore.ts`(login/logout/init 流程)
- `store/navStore.ts`(`toggleCategory` 副作用)
- `hooks/useShortcut/*`(已有 1 个测试,但 `firstUseTracker`、`shortcutRegistry` 需补充)
- `theme/`(无快照/对比度测试)
- `ProtectedRoute`(已有 1 个测试,OK)
- `App.tsx`(无路由测试)

**行动**:
- **9.1** 为每个 store(auth、nav、theme、breadcrumb、fullscreen、drawer、menu、notification)补测试。
- **9.2** 新增 `__tests__/api` 套件,使用 `msw` 或 fake `axios` 适配器;覆盖 401 + 刷新、CSRF 保障、dataset 缓存失效。
- **9.3** 在 `vitest` 的 `setupFiles` 中加入 `@testing-library/jest-dom` 匹配器,以及对 `IntersectionObserver`、`ResizeObserver`、`matchMedia` 的 mock。
- **9.4** 用 `MemoryRouter` 与水化后的 `useAuthStore` 给 `App.tsx` 加 smoke test。
- **9.5** 引入 `npm run test:coverage`,先设软阈值 50% 行覆盖,再逐步提升到 80%。

---

## 10. Storybook / 开发者门户(P3,~L)

AGENTS.md 指出 "story 是单一事实源"。但新前端 **零 story、零 `.storybook/` 配置**。一旦组件稳定,
这会卡住文档生成。

**行动**:
- **10.1** 引入 `storybook`、`@storybook/react-vite`、`@storybook/addon-essentials`。
- **10.2** 新增 `.storybook/main.ts` 与 `.storybook/preview.tsx`,把两种主题(`paper`、`vibrant`)作为 decorator。
- **10.3** 优先为高杠杆组件铺设 story:`superset-ui-mui/components/` 中的按钮类原子组件、`FilterBar`、`PageHeader`、`AppLayout`。
- **10.4** 在 `AGENTS.md` 中记录该模式,要求后续新组件必须随附 story。

---

## 11. 国际化(P3,~L)

`App.tsx:60-94`(快捷键标签)等多处硬编码 `zh-CN` 字符串,新组件中也很可能存在(从 `description` 字段命名可推断)。

**行动**:
- **11.1** 引入 `react-i18next` + 轻量封装 `useT()`。
- **11.2** 把所有字面量抽到 `src/locales/zh-CN.json` / `en-US.json`。
- **11.3** 在 CI 中加 lint 规则(`eslint-plugin-i18next` 或自研),标记 JSX 文本节点。

---

## 12. 性能(P3,~M)

- **12.1** 审查 `useMemo` / `useCallback` 使用。`main.tsx` 中 `Root` 组件对 `themeMode` 变化会重建 `theme`,目前已正确;`emotionCache` 是模块级,无问题。
- **12.2** MUI 体积大,确保通过深路径导入(`@mui/material/Button`),让打包器摇掉未用组件。当前代码已是该模式,保持。
- **12.3** 在路由级 `<Suspense>` 内加 skeleton 兜底(当前是全局 `CircularProgress`,SPA 切换时体验突兀)。
- **12.4** 给 `ProtectedRoute` 的子节点传递加 `React.memo`(或换 `useShallow` selector),避免主题切换时的渲染风暴。

---

## 13. 可访问性(P3,~M)

- **13.1** 仅在开发环境加入 `@axe-core/react`。
- **13.2** 引入 `eslint-plugin-jsx-a11y`。
- **13.3** 审查焦点管理:模态对话框需做焦点陷阱,关闭时还原。
- **13.4** 给全局 snackbar 加 `aria-live` 区域。

---

## 14. 文档(P3,~S)

- **14.1** 在 `superset-frontend-new/README.md` 中说明新构建、主题系统,以及如何新增页面。
- **14.2** 更新 `AGENTS.md`(或新 README),补充 `paper` / `vibrant` 主题和 `starfly` 品牌说明。
- **14.3** 在 `CONTRIBUTING.md` 列出 lint / format / test 命令。

---

## 建议实施顺序

1. **(P1) 工具链与 CI** —— 清理无用依赖、修正 tsconfig 路径、补 ESLint/Prettier/pre-commit。不做这一步,后续 PR 会卡在 CI,无法合入。
2. **(P1) 测试基线** —— 为 store、API、auth 加测试,引入 `test:coverage`。
3. **(P1) 主题收敛** —— 合并两个主题创建函数,干掉 CSS token 重复。
4. **(P2) Store 整合** —— 迁移 `stores/`,加 selector,修认证 init 副作用。
5. **(P2) API 拆分** —— 分离 `client.ts`、`auth.ts`、`csrf.ts`、`dataset.ts`。
6. **(P2) 路由重构** —— 声明式 routes 文件。
7. **(P2) 组件拆分** —— 先拆 `AiDrawer.tsx`(1093 行),再审查 `DataGridTable`、`DataPreviewTable`。
8. **(P2) 快捷键原型修复** —— 小而精准。
9. **(P3) 国际化、性能、可访问性、Storybook、文档** —— 等基础稳定后推进。

## 待澄清事项(已给出默认方案)

提出但未阻塞的问题,均给出默认行为以便开工:

1. **品牌方向**:bundle 标题是 `starfly`(见 `index.html` 与 `themeStore` 的 persist key)。
   默认:把 `starfly` 当作品牌名;若后续重塑品牌再调整。
2. **PWA**:**`vite-plugin-pwa` 按用户决策移除** —— 在 §1.1 中清理 `package.json`,不需要独立后续方案。
3. **主题**:默认仅保留 `paper` / `vibrant`,对两个主题创建函数做去重。未来若加 `dark` 模式另开方案。
4. **Storybook**:默认按 §10(P3)加入 Storybook。如果已有并行的文档计划,需先对齐再写 story。
5. **国际化**:默认 **推迟** `react-i18next`,等产品 i18n 范围定下再启动。方案中仍列出需抽取的字符串清单。
