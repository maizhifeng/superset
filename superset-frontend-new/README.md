<!--
Licensed to the Apache Software Foundation (ASF) under one
or more contributor license agreements.  See the NOTICE file
distributed with this work for additional information
regarding copyright ownership.  The ASF licenses this file
to you under the Apache License, Version 2.0 (the
"License"); you may not use this file except in compliance
with the License.  You may obtain a copy of the License at

  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing,
software distributed under the License is distributed on an
"AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
KIND, either express or implied.  See the License for the
specific language governing permissions and limitations
under the License.
-->

# Starfly Frontend 开发文档

| 项目     | 内容                                       |
| -------- | ------------------------------------------ |
| 应用名称 | Starfly 内部数据平台                       |
| 代码目录 | `superset-frontend-new/`                   |
| 当前分支 | `feat/vite-mui-frontend`                   |
| 基线提交 | `4aaab5a60c`                               |
| 文档日期 | 2026-11-25                                 |
| 维护状态 | 活跃开发，核心功能可用，发布硬化进行中     |
| 适用读者 | 前端、后端、测试、产品、运维及安全评审人员 |

> 本文档描述的是当前定制分支，不等同于 Apache Superset 官方前端。应用依赖本仓库中的定制后端接口，不能直接作为上游 Superset 前端独立运行。

## 目录

- [1. 项目概述](#1-项目概述)
- [2. 功能特性](#2-功能特性)
- [3. 技术架构](#3-技术架构)
- [4. 开发进度与里程碑](#4-开发进度与里程碑)
- [5. 质量现状与验证](#5-质量现状与验证)
- [6. 现存问题](#6-现存问题)
- [7. 修复计划与发布门禁](#7-修复计划与发布门禁)
- [8. 开发指南](#8-开发指南)
- [9. 部署与运维](#9-部署与运维)
- [10. 安全模型与兼容边界](#10-安全模型与兼容边界)
- [11. 待决策事项](#11-待决策事项)
- [12. 关键文件索引](#12-关键文件索引)

## 1. 项目概述

### 1.1 项目定位

Starfly Frontend 是建立在 Superset 后端之上的独立单页应用，包含两层能力：

1. **通用 BI 能力**：图表、仪表板、数据集、数据库、SQL Lab、保存查询、告警和操作历史。
2. **经营分析能力**：专题分析、项目阶段对比、日报/周报、飞书推送、项目/渠道/分成配置。

应用使用 React 18、TypeScript、Vite 和 MUI 9 实现，品牌名为 Starfly。当前已接入生产 Docker 构建链路，产物由 Flask 从 `/app/mui-static` 提供。

### 1.2 当前阶段判断

- 通用 BI 主流程已经可用。
- SQL Lab 和简报模块已经具备实际业务能力。
- 六个分析专题中，成本分析和项目对比已完成专题 SQL 迁移，其余四个仍为 WIP。
- AI 助手前端入口已经移除；`agents/pi-agent-server` 作为未接入的遗留服务保留。
- 类型、Lint、单元测试和生产构建均通过；P0 与 P1 代码修复已完成，旧凭据轮换与 sidecar 依赖升级仍需运维确认。
- 四个未完工分析专题保持预期 WIP 状态，不纳入本轮 P1 修复范围。

### 1.3 代码规模

以下数据为 2026-11-25 的静态统计，发布前应重新统计：

| 指标                         |                                    当前值 |
| ---------------------------- | ----------------------------------------: |
| 目录内受 Git 跟踪文件        | 约 510（含本次新增文件，最终以 Git 为准） |
| `src` 下 TypeScript/TSX 文件 |                                       395 |
| `src` 下 TypeScript/TSX 行数 |                                约 100,829 |
| Vitest 测试文件              |                                       138 |
| Vitest 测试用例              |                                       935 |
| Playwright spec              |                                         9 |
| Playwright 逻辑用例          |                                        41 |
| Playwright 多浏览器执行次数  |                                       123 |

## 2. 功能特性

### 2.1 功能清单

| 模块       | 路由                                                    | 功能描述                                                   | 状态     |
| ---------- | ------------------------------------------------------- | ---------------------------------------------------------- | -------- |
| 登录与认证 | `/login`                                                | 账号密码登录、会话过期提示、Token 刷新、角色加载           | 已完成   |
| 首页       | `/`                                                     | 数据资产统计、最近访问、收藏入口、迷你图表                 | 已完成   |
| 全局导航   | 全局布局                                                | 菜单开关、用户路由覆盖、全局搜索、主题切换、移动端导航     | 部分完成 |
| 图表列表   | `/chart/list`                                           | 搜索、分页、收藏、复制、删除                               | 已完成   |
| 图表编辑   | `/explore`、`/explore/*`                                | 指标/维度配置、图表类型推荐、预览、保存、PNG 导出          | 部分完成 |
| 仪表板列表 | `/dashboard/list`                                       | 搜索、分页、收藏、复制、删除                               | 已完成   |
| 仪表板     | `/dashboard/:id`                                        | 图表筛选、尺寸保存、增删图表、自动刷新、周期对比           | 部分完成 |
| 数据集     | `/dataset/list`、`/dataset/create`、`/dataset/edit/:id` | 数据集创建编辑、列、指标、计算列、SQL 预览                 | 已完成   |
| 数据库     | `/database/list`、`/database/:id`                       | 连接管理、Schema/表浏览、字段元数据、样例数据              | 已完成   |
| SQL Lab    | `/sqllab`                                               | SQL/可视化双模式、多标签、补全、格式化、保存查询、CSV 导出 | 部分完成 |
| 保存查询   | `/saved_query/list`                                     | 搜索、收藏、编辑、删除、下载、打开或运行                   | 已完成   |
| 告警       | `/alert/list`                                           | 图表/SQL 告警、Cron、收件人、启停、删除                    | 已完成   |
| 操作历史   | `/query_history`                                        | 模块筛选、动作详情、耗时、复制                             | 已完成   |
| 专题分析   | `/analysis`、`/analysis/:topicId`                       | 六个专题、筛选、KPI、趋势、下钻、异常归因、快照            | 部分完成 |
| 简报       | `/briefing`、`/briefing/:id`                            | 日报/周报、异步任务、日志、停止、排程、飞书推送            | 已完成   |
| 项目配置   | `/project/settings`                                     | 游戏、渠道商、分成、测试起始日期维护                       | 已完成   |
| 系统管理   | `/system/admin`                                         | 菜单配置、用户管理、角色管理                               | 部分完成 |
| AI 助手    | 无有效路由                                              | 前端入口已移除，Agent sidecar 未接入                       | 已移除   |

路由定义见 `src/views/App.tsx:49`，旧路由重定向见 `src/views/App.tsx:89`。

### 2.2 通用 BI 能力

#### 图表与 Explore

- 新建图表支持自动推荐、折线、柱状、饼图、大数字和透视表。
- 自动推荐根据指标数量、维度数量和时间字段选择图表类型。
- 图表预览使用 ECharts、`DataPreviewTable` 和本地 `PivotTable`。
- 保存的 `form_data/params` 会转换为查询对象，再请求标准或联邦图表数据接口。

当前 Explore 是简化实现，不包含完整 Superset 插件体系、标注、坐标轴和颜色控件。

#### 仪表板

- 支持标准图表和联邦图表。
- 图表请求按每批 6 个并发执行。
- 使用单调 epoch 防止旧响应覆盖新筛选结果。
- 卡片支持小、中、全宽三种尺寸，调整后自动写回 `position_json`。
- 支持自动刷新、指标切换、前 95%/99% 精简、复制、编辑、移除和移动端全屏。
- 业务对比弹窗支持国内/海外项目、渠道商、媒体、上线/首测/二测/三测锚点、7–720 天窗口以及 LTV/ROI 模式。

当前仪表板仅渲染七类图表，其他类型会被过滤；布局不是自由拖拽编辑器。

#### 数据集与数据库

- 支持手工创建数据集，来源可以是表或 SQL。
- 数据集编辑包含列、指标、计算列和设置。
- 数据库详情包含 Schema、表、字段、主外键、样例数据和 SQL 预览。
- 联邦数据集支持跨库并行查询和透视宽表。

### 2.3 SQL Lab

- SQL 与可视化组装双模式。
- 多标签页，每个标签独立保存 SQL 或可视化模型。
- 数据库/Schema 浏览器、表字段搜索、自动补全。
- 支持运行选区、格式化、复制、最近查询和保存查询。
- 可视化模式支持多阶段 CTE、JOIN、字段、筛选、汇总、HAVING、排序和限制。
- 保存查询时将可视化模型嵌入 SQL 注释，重新打开可恢复可视化模式。
- 查询结果支持 CSV 导出和保存为数据集。

已知限制：“停止”按钮只关闭 loading，不会取消后端查询。

### 2.4 专题分析

当前包含六个专题：

| 专题          | 数据实现     | 状态   |
| ------------- | ------------ | ------ |
| 成本分析      | 后端专题 SQL | 已完成 |
| 项目对比分析  | 后端专题 SQL | 已完成 |
| 留存分析      | 共用数据集   | WIP    |
| LTV/ROI 分析  | 共用数据集   | WIP    |
| 付费分析      | 共用数据集   | WIP    |
| 渠道/媒体分析 | 共用数据集   | WIP    |

已实现能力包括：

- 当前期与上期 KPI 对比。
- 日/周趋势、对比期叠加和 7 日均线。
- 日期、周和维度层级下钻。
- 悬停预取下一级数据。
- 滚动基线异常检测与下钻归因。
- 留存和 LTV 指标成熟窗口处理。
- 默认视图快照和后台缓存预热。
- 项目锚点窗口对比与渠道商维度拆分。

WIP 专题会在页面显示未完工提示，不应作为正式交付功能宣传。

### 2.5 简报

- 仅支持日报和周报。
- 支持配置、运行、停止、日志、结果恢复和章节导航。
- 报告内容包含核心指标、平台对比、项目表现、渠道/媒体和广告异常。
- 支持定时调度、飞书消息、飞书文档卡片和 HTML 导出。
- 任务由后端异步执行，前端每 1.5 秒轮询日志和结果。
- 停止操作会调用后端取消接口。

简报是后端规则与数据驱动的报告，不等同于大模型生成。

### 2.6 AI 与 Agent

当前主 SPA 没有可用 AI 会话链路：

- 仪表板顶部保留聊天输入框，但没有传 `onSend`。
- `ChatInput` 只有在存在 `onSend` 时才发送。
- `src` 中没有 WebSocket、Agent 会话或 `@mui/x-chat` 的实际调用。
- `agents/pi-agent-server` 仍保留 WebSocket、会话持久化和 Superset 查询工具，但未接入主应用，也没有在当前 Compose 配置中部署。

因此，AI 能力当前状态为“已移除前端入口，遗留服务待清理或重构”。

## 3. 技术架构

### 3.1 技术栈

| 层次     | 技术                                      |
| -------- | ----------------------------------------- |
| UI       | React 18、MUI 9、Emotion                  |
| 语言     | TypeScript 5.4                            |
| 构建     | Vite 6、Lightning CSS                     |
| 路由     | React Router 6                            |
| 状态     | Zustand、React Query 5、页面局部状态      |
| 图表     | ECharts 5、本地透视表                     |
| SQL 编辑 | CodeMirror 6、`@codemirror/lang-sql`      |
| 请求     | Axios                                     |
| 测试     | Vitest、React Testing Library、Playwright |

### 3.2 应用数据流

```text
Browser
  -> React SPA
  -> ProtectedRoute / AppLayout
  -> Page / Hook
  -> Axios /api/v1
       -> Superset CRUD / chart/data
       -> /bi/* 联邦查询、分析、透视、快照
       -> /briefing/* 异步任务
       -> /project/* 业务配置
       -> /security/* 认证与权限
```

开发环境由 Vite 将 `/api/v1` 代理到 Superset；生产环境要求浏览器与 API 保持同源，或由反向代理正确处理 CORS、Cookie、CSRF 和转发头。

### 3.3 状态管理

#### Zustand

主要用于认证、主题、导航、菜单、用户路由覆盖、收藏、最近访问、通知、全屏和工具栏注册等全局或持久化 UI 状态。

#### React Query

当前使用较轻，主要用于仪表板图表的命令式 `fetchQuery`：

- 缓存键包含图表 ID、筛选指纹和页码。
- 普通请求 `staleTime` 为 30 秒。
- 强制刷新会先删除旧查询。
- 全局 `gcTime` 为 5 分钟，`retry` 为 0。

其他页面仍大量使用 `useState/useRef` 和模块级缓存，服务端状态管理尚未完全统一。

#### URL 状态

- 图表编辑使用 `slice_id`。
- 分析筛选写入查询参数。
- 管理页面使用 `?tab=`。
- URL 是筛选、分享和刷新恢复的重要状态来源。

### 3.4 API 层

共享 Axios 实例位于 `src/api/client.ts`：

- `baseURL` 为 `/api/v1`。
- 普通请求超时 60 秒，查询请求超时 300 秒。
- 自动附加 Bearer Token。
- 非幂等请求附加 CSRF Token。
- 401 时合并并发刷新并重试一次。

主要 API 域：

| 领域          | 端点示例                                                       |
| ------------- | -------------------------------------------------------------- |
| 认证          | `/security/login`、`/me/`、`/security/refresh`                 |
| 菜单          | `/menu/settings`                                               |
| 图表          | `/chart/`、`/chart/:id`、`/chart/data`                         |
| 仪表板        | `/dashboard/`、`/dashboard/:id`                                |
| 数据集/数据库 | `/dataset/`、`/database/`                                      |
| SQL Lab       | `/sqllab/execute/`、`/saved_query/`                            |
| 联邦查询      | `/bi/chart/data`、`/bi/pivot/wide-data`                        |
| 专题分析      | `/bi/analysis/chart-data`、`/bi/analysis/sql`                  |
| 简报          | `/briefing/configs`、`/briefing/jobs`                          |
| 项目配置      | `/project/papp`、`/project/channel`、`/project/profit-sharing` |

### 3.5 目录结构

```text
superset-frontend-new/
├── src/
│   ├── api/                 Axios、CSRF、Token、查询缓存
│   ├── components/          通用组件与业务组件
│   ├── config/              菜单、路由、联邦数据集等配置
│   ├── dashboard/           仪表板领域逻辑
│   ├── explore/             图表探索领域逻辑
│   ├── hooks/               通用 Hooks
│   ├── pages/               页面级功能
│   ├── SqlLab/              SQL Lab 领域组件
│   ├── store/               Zustand 状态
│   ├── superset-ui-mui/     本地轻量 UI 组件
│   ├── theme/               主题与设计令牌
│   ├── types/               类型声明
│   ├── utils/               查询、图表、导出、透视等工具
│   └── views/               路由与根视图
├── playwright/               E2E、性能探针
├── agents/                   Agent sidecar 与技能资产
├── scripts/                  辅助脚本
└── dist/                     构建产物，不纳入 Git
```

## 4. 开发进度与里程碑

### 4.1 模块进度

| 模块           | 状态            | 主要缺口                                                 |
| -------------- | --------------- | -------------------------------------------------------- |
| 基础设施与主题 | 已完成          | 完整 strict、ASF header 一致性                           |
| 认证与导航     | 部分完成        | 权限 override、Token 生命周期、移动端侧栏                |
| 首页           | 已完成          | 请求失败被当作 0/空数据                                  |
| 图表与仪表板   | 部分完成        | 图表类型有限、布局非自由拖拽、错误态不足                 |
| 数据集与数据库 | 已完成          | API 边界运行时校验                                       |
| SQL Lab        | 部分完成        | 停止不取消请求、分页竞态                                 |
| 专题分析       | 部分完成        | 4/6 专题仍为 WIP                                         |
| 简报           | 已完成          | 轮询失败提示、大文件拆分                                 |
| 系统管理与配置 | 部分完成        | 细粒度 capability、死代码与重复实现                      |
| AI             | 已移除          | sidecar 遗留，需清理或重构                               |
| 测试           | 已完成 P1 门禁  | 覆盖率阈值已建立；E2E 选择器仍需持续维护                 |
| CI 与交付      | 已完成 P1 门禁  | 专用 CI 与 Docker 变更触发已建立；认证 E2E 需环境 Secret |
| 安全与性能     | P0 代码修复完成 | 旧凭据轮换、sidecar 依赖升级、Router 7 迁移、首屏包体    |

### 4.2 里程碑记录

| 里程碑                | 时间                     | 主要交付                                           | 代表提交                                 |
| --------------------- | ------------------------ | -------------------------------------------------- | ---------------------------------------- |
| M1 前端基座           | 2026-05-11               | MUI 仪表板、图表数据回退、基础 CRUD                | `f254f4befa`                             |
| M2 SQL Lab 与测试基础 | 2026-05-17               | SQL Lab、树浏览、快捷键、数据集管理、测试设施      | `f5f846371e`、`9714e94284`               |
| M3 体验与性能         | 2026-05-21 至 2026-08-03 | 移动端工具栏、主题、图表编辑、分包、类型与测试门禁 | `982ca6f482`、`ffff52869a`、`05c833748e` |
| M4 AI 探索            | 2026-05-25 至 2026-08-11 | Agent、流式聊天、模型配置、MUI X Chat              | `1f83844b03`、`4bcc646382`、`60f25fa0a6` |
| M5 联邦与简报         | 2026-07-22 至 2026-09-30 | 跨库联邦查询、简报改版、排程、飞书与 HTML 导出     | `8fe2d1363e`、`51b86c99b9`、`7be2beb690` |
| M6 分析与可视化 SQL   | 2026-10-30 至 2026-11-14 | 分析快照、周视图下钻、项目对比、可视化 SQL 精简    | `6576f0a771`、`5f72d73689`、`e21c34cc60` |
| M7 AI 下线与简报硬化  | 2026-11-03 至 2026-11-20 | 移除 AI 抽屉、修复 SQL Lab、简报波动判级与时区     | `6213fec811`、`4f4f0ac648`               |
| 当前阶段              | 2026-11-25               | 发布前安全、质量、性能与文档治理                   | 进行中                                   |

### 4.3 下一阶段目标

1. 轮换曾提交到 Git 历史的 E2E 凭据，并在任何环境启用 sidecar 前升级其依赖。
2. 完成 P1 交互、错误态、严格类型、可访问性、CI 与分页竞态修复。
3. 保持四个 WIP 分析专题的预期状态，不在本轮调整。
4. 拆分超大页面，降低首屏包体。
5. 明确 AI sidecar 的保留或移除决策。

## 5. 质量现状与验证

### 5.1 2026-11-25 验证结果

| 检查                    | 结果     | 说明                                                |
| ----------------------- | -------- | --------------------------------------------------- |
| `npm run type`          | 通过     | 完整 `strict`，无类型诊断                           |
| `npm run lint`          | 通过     | 0 errors，10 warnings                               |
| `npm run test:coverage` | 通过     | 138 文件、935 用例全部通过                          |
| 覆盖率                  | 通过门禁 | 行 48.97%、分支 41.47%、函数 44.64%                 |
| 格式化后定向回归        | 通过     | 22 文件、84 用例                                    |
| `npm run build`         | 通过     | 有 MUI 导出与 chunk 大小警告                        |
| Playwright 登录页冒烟   | 通过     | Chromium，无 E2E 凭据                               |
| 认证 E2E                | 待执行   | 需配置 `E2E_USER/E2E_PASSWORD` 与后端环境           |
| Firefox                 | 未执行   | 本机缺少浏览器二进制                                |
| `npm audit --omit=dev`  | 0 high   | 2 moderate，均为 React Router 6，需单独规划 v7 迁移 |
| Agent sidecar 单测      | 通过     | 13 文件、129 用例全部通过                           |
| Agent sidecar 类型检查  | 通过     | `npx tsc --noEmit`                                  |
| Agent sidecar 生产审计  | 3 high   | 重新部署前必须升级 `pi-coding-agent` 及其依赖       |

### 5.2 测试体系

#### Vitest

- 使用 jsdom、Vitest 和 React Testing Library。
- 已启用 V8 coverage，门禁为行 ≥45%、分支 ≥36%、函数 ≥38%。
- 当前覆盖登录、API、Dashboard 竞态、Analysis 预取、SQL Lab、Briefing、Store、工具函数等。

#### Playwright

- 覆盖登录、图表列表、仪表板列表、SQL Lab、可视化组装器、项目对比和 Briefing。
- 配置 Chromium、Firefox 和 mobile-chrome 三个项目。
- 没有 `webServer`，默认依赖外部 `http://localhost:9000`。
- 列表页选择器已从原生 `table` 升级为 MUI DataGrid/移动卡片语义；认证 E2E 仍需在配置 `E2E_USER/E2E_PASSWORD` 的环境执行。
- 没有 WebKit、可访问性扫描、视觉回归或性能预算。
- 专用工作流 `.github/workflows/superset-frontend-new.yml` 在新前端变更时执行 type、lint、coverage、build、首屏 Brotli ≤ 220 KiB、Playwright 列表与生产依赖审计；认证 E2E 为环境门控任务。
- `superset-frontend-new/` 变更同时纳入 Docker change detector，但不会触发旧前端 Jest 工作流。

#### 性能验证

现有 `perf-report.json` 是 2026-08-21 的 Vite 开发模式数据，不能代表当前生产包。`perf-report-tail.json` 的多个关键字段为 `null`，探针存在 resource buffer 和异步竞态问题，暂不能作为发布门禁。

### 5.3 生产包现状

| 指标              |                     当前值 |
| ----------------- | -------------------------: |
| JS chunks         |                        118 |
| JS 原始总大小     |                 约 3.75 MB |
| JS gzip 总大小    |                 约 1.20 MB |
| JS Brotli 总大小  |                 约 1.02 MB |
| 首屏 JS 原始大小  |                  约 694 KB |
| 首屏 JS Brotli    |                  约 191 KB |
| Source map 总大小 | 默认 0；仅显式调试构建生成 |

登录页已不再预加载 DataGrid、TreeView、DatePickers 或 CodeMirror；首屏 Brotli 从约 361 KB 降至约 191 KB。

## 6. 现存问题

### 6.1 P0：发布前必须处理

| ID     | 问题                             | 状态                                 | 证据                                                                                                |
| ------ | -------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------- |
| FE-001 | E2E 默认凭据硬编码               | 代码已修复；旧凭据待轮换             | `playwright/helpers/credentials.ts:1`                                                               |
| FE-002 | ECharts HTML tooltip 未转义      | 已修复                               | `src/utils/escapeHtml.ts:20`                                                                        |
| FE-003 | React Query 缓存未按用户隔离     | 已修复                               | `src/pages/Dashboard/hooks/useDashboardData.ts:54`、`src/store/authStore.ts:180`                    |
| FE-004 | 本地 route override 可绕过角色门 | 已修复                               | `src/components/ProtectedRoute.tsx:62`                                                              |
| FE-005 | Token 生命周期不一致             | 已修复生命周期；HttpOnly 迁移仍为 P1 | `src/api/tokenStorage.ts:9`、`src/store/authStore.ts:156`                                           |
| FE-006 | 直接依赖存在已知漏洞             | high 已清零；2 moderate 待 Router 7  | `package.json:42`                                                                                   |
| FE-007 | Agent sidecar 授权与缓存隔离缺陷 | 代码已修复；依赖升级待完成           | `agents/pi-agent-server/src/router.ts:171`、`agents/pi-agent-server/src/tools/querySuperset.ts:370` |

补充说明：

- FE-001 已移除源码默认值，但 Git 历史仍包含旧凭据，必须在所有环境轮换。
- FE-002 已覆盖全部 11 个 ECharts HTML tooltip，并保留可信 marker HTML。
- FE-004 前端只做体验控制，后端 API 授权仍须独立验证。
- FE-005 当前仍使用 localStorage；迁移到 HttpOnly Cookie/BFF 属于 P1。
- FE-006 剩余 2 个 moderate 均来自 React Router 6；v7 会引入大范围 Promise 导航改造，需独立排期。
- FE-007 当前主 SPA 未接入 sidecar；授权、owner 校验和缓存隔离已修复，但 URL token 已移除，客户端重新接入时必须先发送 `auth` 消息。sidecar 依赖仍有 3 个 high，重新部署前必须升级。

### 6.2 P1：稳定性与开发体验

| ID     | 问题                             | 状态                                   | 证据                                                                                   |
| ------ | -------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------- |
| FE-008 | 未接线或未完成交互               | 已修复；SQL Stop 为客户端取消          | `src/pages/SqlLab/api.ts:27`、`src/pages/Dashboard/useDashboardToolbar.tsx:63`         |
| FE-009 | 错误态不统一且缺少 ErrorBoundary | 已修复                                 | `src/components/ErrorBoundary.tsx:20`、`src/hooks/useHomeStats.ts:47`                  |
| FE-010 | TypeScript 约束不完整            | 已开启 strict；生产代码禁止显式 any    | `tsconfig.json:3`、`eslint.config.js:30`                                               |
| FE-011 | 可访问性不足                     | 已修复核心问题                         | `index.html:2`、`src/pages/Dashboard/ChartCard.tsx:86`                                 |
| FE-012 | CI 与覆盖率缺口                  | 已建立专用 CI、coverage 与 Docker 触发 | `../.github/workflows/superset-frontend-new.yml:1`、`../scripts/change_detector.py:83` |
| FE-013 | 列表分页竞态                     | 已修复                                 | `src/hooks/usePaginatedList.ts:190`                                                    |
| FE-014 | 四个分析专题仍为 WIP             | 预期行为，保持现状                     | `src/pages/Analysis/topics.tsx:317`                                                    |

### 6.3 P2：可维护性与交付治理

| ID     | 问题                       | 状态                                                   | 证据                                                                                                        |
| ------ | -------------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| FE-015 | 超大文件与重复实现         | 主要页面已拆分；持续治理中等文件                       | `src/pages/Home/index.tsx:1`、`src/pages/DatasetEdit/index.tsx:1`、`src/pages/Dashboard/CompareModal.tsx:1` |
| FE-016 | 死代码与失效配置           | 已完成清理                                             | `package.json:1`、`vite.config.ts:80`                                                                       |
| FE-017 | 首屏包体偏重               | 已完成首轮优化；Brotli 约 191 KB                       | `dist/index.html:16`                                                                                        |
| FE-018 | Source map 默认公开        | 已默认关闭，支持私有构建显式开启                       | `vite.config.ts:84`                                                                                         |
| FE-019 | 外部字体与部署假设未文档化 | 已移除第三方字体并补充部署说明                         | `index.html:13`                                                                                             |
| FE-020 | 规范与文档缺口             | 本次变更代码文件 ASF header 已全部补齐；MUI 例外已记录 | `src/main.tsx:1`                                                                                            |

## 7. 修复计划与发布门禁

### 7.1 分阶段修复计划与执行状态

工作量为人日估算，需在排期时由团队确认。以下保留原计划，并同步当前完成状态。

#### 阶段 0：立即止损，建议 1–2 人日

| 任务                                  | 责任角色         | 状态                     | 验收标准                                            |
| ------------------------------------- | ---------------- | ------------------------ | --------------------------------------------------- |
| 移除并轮换 E2E 默认凭据               | 测试、运维、安全 | 代码已完成；旧凭据待轮换 | 源码无默认密码；测试仅从环境变量读取；旧凭据失效    |
| 停止暴露 Agent sidecar                | 运维             | 待环境确认               | 3001 端口不对用户网络开放；Compose 不启动未接入服务 |
| 升级 Axios、ECharts 与 React Router 6 | 前端             | 已完成                   | 生产审计 0 high；Router 7 迁移单独排期              |
| 移除未使用的 alpha 聊天依赖           | 前端             | 已完成                   | `@mui/x-chat` 不再出现在依赖与锁文件                |

#### 阶段 1：安全隔离，建议 4–6 人日

| 任务                             | 责任角色         | 状态                         | 验收标准                                                            |
| -------------------------------- | ---------------- | ---------------------------- | ------------------------------------------------------------------- |
| 统一 HTML 转义工具并修复 tooltip | 前端、安全       | 已完成                       | 维度名、系列名、列名全部转义；恶意字符串回归测试通过                |
| React Query 缓存按用户隔离       | 前端             | 已完成                       | 登出、切换用户、模拟用户时清空缓存；跨账号测试通过                  |
| 修正 route override 语义         | 前端、后端       | 代码已完成；服务端回归待环境 | override 不能授予角色/capability；服务端授权测试通过                |
| 重构 Token 生命周期              | 前端、后端、安全 | 已完成                       | 登出清理 Axios 默认头；access/refresh 成对恢复；最近 SQL 按用户隔离 |
| 修复或下线 Agent sidecar         | 前端、后端、安全 | 代码已完成；依赖升级待处理   | 所有会话操作认证并校验 owner；缓存按用户/dataset/RLS 隔离           |

#### 阶段 2：稳定性与质量门禁，建议 8–12 人日

| 任务                                | 责任角色     | 状态     | 验收标准                                                       |
| ----------------------------------- | ------------ | -------- | -------------------------------------------------------------- |
| 修复 SQL Lab 停止和列表分页竞态     | 前端         | 已完成   | 停止后请求取消；新筛选不会命中旧页请求                         |
| 统一 loading/error/empty/success    | 前端         | 已完成   | 关键页面具备错误提示和重试                                     |
| 增加 ErrorBoundary 与懒加载失败回退 | 前端         | 已完成   | 组件异常不导致无提示白屏                                       |
| 开启完整 strict 并清理核心 `any`    | 前端         | 已完成   | `strict` 通过；生产代码禁止显式 `any`                          |
| 修复核心可访问性问题                | 前端、QA     | 已完成   | `lang=zh-CN`；可点击元素支持键盘；图标按钮有可访问名称         |
| 建立新前端 CI                       | DevOps、前端 | 已完成   | type、lint、coverage、build、audit 自动执行；认证 E2E 环境门控 |
| 更新 E2E 选择器                     | 测试         | 部分完成 | 登录选择器已修复；列表与 SQL Lab 用例仍需在认证环境复跑        |

#### 阶段 3：产品完善与性能，建议 10–20 人日

| 任务                                   | 责任角色         | 状态           | 验收标准                                                                                          |
| -------------------------------------- | ---------------- | -------------- | ------------------------------------------------------------------------------------------------- |
| 完成或下线四个 WIP 专题                | 产品、前端、数据 | 按预期保留 WIP | 本轮不调整，继续以未完工状态展示                                                                  |
| 拆分简报、对比弹窗、SQL Lab 大文件     | 前端             | 主要页面已完成 | Home 1977→67；DatasetEdit 1914→289；CompareModal 2924→1629；SQL Lab 2040→1610；Briefing 5810→5381 |
| 清理死代码、alpha 依赖和失效 workspace | 前端             | 已完成         | 未使用组件、依赖、workspace 与 alias 已移除                                                       |
| 优化首屏按需加载                       | 前端             | 已完成首轮     | 登录页不加载 DataGrid/TreeView/Pickers；Brotli 约 191 KB                                          |
| 制定 source map 与字体部署策略         | 运维、前端       | 已完成         | map 默认关闭；字体不再依赖第三方域名                                                              |
| 完善部署与安全运行手册                 | 运维、安全       | 部分完成       | README 已补充开发与低资源验证；CSP、回滚演练仍待完善                                              |

### 7.2 发布门禁

| 门禁                   | 当前状态 | 目标                                                                  |
| ---------------------- | -------- | --------------------------------------------------------------------- |
| P0 安全问题关闭        | 部分满足 | FE-001 至 FE-007 代码修复完成；凭据轮换与 sidecar 依赖升级待确认      |
| P1 代码问题关闭        | 已满足   | FE-008 至 FE-013 已完成；FE-014 按预期保留 WIP                        |
| 类型检查               | 已满足   | 完整 `strict` 持续通过                                                |
| Lint                   | 已满足   | 0 errors，warning 有归零计划                                          |
| 单元测试               | 已满足   | 138 文件、935 用例通过                                                |
| 覆盖率                 | 已满足   | 行 ≥45%、分支 ≥36%、函数 ≥38%                                         |
| 生产构建               | 已满足   | 无阻断性依赖警告                                                      |
| CI                     | 已满足   | 专用工作流覆盖 type/lint/coverage/build/audit；Docker 触发已建立      |
| E2E 核心流程           | 部分满足 | 认证用例需显式 E2E 凭据；完整流程待环境执行                           |
| 依赖审计               | 部分满足 | 主应用 0 high、2 moderate 待 Router 7；sidecar 3 high，部署前必须升级 |
| Agent sidecar 部署门禁 | 未满足   | 依赖升级、端口暴露检查与真实多用户回归待完成                          |
| 缓存与权限隔离         | 部分满足 | 单测通过；真实多用户 RLS PoC 待执行                                   |
| 首屏预算               | 已满足   | CI 检查首屏 JS Brotli ≤ 220 KiB；当前约 191 KiB                       |
| 部署回滚手册           | 部分满足 | 完成并演练一次回滚                                                    |

### 7.3 建议验收测试

| 验收项                                                  | 当前状态                              |
| ------------------------------------------------------- | ------------------------------------- |
| 两个不同 RLS 用户连续访问同一图表，不能看到彼此缓存数据 | 单测已覆盖；真实多用户 RLS 环境待验证 |
| 普通用户通过本地 override 不能进入 Admin 页面           | 单测已覆盖                            |
| 登出后所有请求不再携带旧 Authorization                  | 单测已覆盖                            |
| 模拟用户切换后 refresh 不会改变当前身份                 | 单测已覆盖                            |
| 图表维度值包含 HTML 标签时，tooltip 不执行脚本          | 回归测试已覆盖                        |
| SQL Lab 停止后，迟到响应不写入结果区                    | 单测已覆盖                            |
| 列表切换筛选和排序时，页码重置与请求顺序正确            | 单测已覆盖                            |
| 登录页生产包不请求 DataGrid、TreeView 和 DatePickers    | 待性能优化                            |
| 简报任务轮询失败时显示可重试错误                        | 单测已覆盖                            |
| 键盘用户可以完成主要导航和列表操作                      | 组件测试已覆盖核心路径                |

## 8. 开发指南

### 8.1 环境要求

- Node.js：建议与 Docker 构建保持一致，当前 Docker 使用 Node 22。
- npm：使用仓库锁文件安装依赖。
- Superset 后端：默认 `http://localhost:8088`。
- 前端开发服务：默认 `http://localhost:9000`。

当前本地验证使用 Node 26，Docker 构建使用 Node 22，存在版本差异，应统一或纳入 CI 矩阵。

### 8.2 启动开发环境

```bash
curl -f http://localhost:8088/health

cd superset-frontend-new
npm ci
SUPERSET_HOST=http://localhost:8088 npm run dev
```

如果后端未启动，请按仓库开发文档完成 Superset 环境初始化。

### 8.3 常用命令

```bash
npm run type                 # TypeScript 类型检查
npm run lint                 # ESLint，仅检查 src
npm test                     # Vitest
npm run test:coverage       # Vitest + V8 coverage 门禁
npm run test:watch           # Vitest watch
npm run build                # tsc --noEmit + vite build
npm run check:bundle         # 首屏 JS Brotli ≤ 220 KiB
npm run preview              # 预览生产构建
npm run playwright           # Playwright 全量
npm run playwright:ui        # Playwright UI
```

认证相关 E2E 必须显式提供测试账号，源码中不再保留默认密码：

```bash
export E2E_USER="<test-user>"
export E2E_PASSWORD="<test-password>"
npm run playwright
```

未设置变量时，无需登录的用例仍可运行；认证用例会以明确错误快速失败。

指定单个测试文件：

```bash
npm test -- src/pages/Dashboard/hooks/__tests__/useDashboardData.test.ts
npx playwright test playwright/tests/auth/login.spec.ts --project=chromium
```

遗留 Agent sidecar 单独验证：

```bash
cd agents/pi-agent-server
npm test
npx tsc --noEmit
```

### 8.4 开发约定

- 新代码使用 TypeScript，禁止新增 `any`。
- 新文件添加 ASF License Header。
- 优先使用函数组件和 Hooks。
- 异步区域必须区分 loading、error、empty 和 success。
- 用户可见文本接入统一国际化方案；当前项目仍以中文硬编码为主。
- API 响应边界增加类型守卫或 schema 校验。
- 前端权限只用于体验控制，最终授权必须由后端执行。
- 不在代码、测试或文档中提交真实密码、Token 或私钥。
- 修改后至少运行 type、lint、相关单测和生产构建。

### 8.5 提交前检查

```bash
git status
git diff --check
npm run type
npm run lint
npm test
npm run build
```

涉及 Python 或全仓库变更时，按根目录 `../AGENTS.md` 运行 pre-commit。

### 8.6 低资源环境验证

WSL、sandbox 或内存较小的环境不要对大批量变更一次运行完整 pre-commit。`prettier-frontend-new` 会逐文件启动 `npx prettier`，与 ESLint、TypeScript 并发时可能耗尽内存。

推荐串行执行：

```bash
npm run type
npm run lint
npm test -- <相关测试文件>
npm run build
```

格式化只针对当前小批次文件执行一次；完成后单独运行需要的钩子：

```bash
pre-commit run check-yaml --files .github/workflows/superset-frontend-new.yml
pre-commit run ruff --files scripts/change_detector.py
pre-commit run mypy --files scripts/change_detector.py
```

不要将 `test:coverage` 与 `build` 并行运行。出现内存压力或工具超时时，停止当前验证并改用定向检查，不要重复启动全量任务。

## 9. 部署与运维

### 9.1 构建链路

根目录 `../Dockerfile` 包含 `superset-node-mui` 阶段：

1. 使用 Node 22。
2. 在 `superset-frontend-new` 执行 `npm ci`。
3. 执行 TypeScript 检查和 Vite 构建。
4. 将 `dist` 复制到最终镜像的 `/app/mui-static`。
5. Flask 通过 `/assets/<path>` 提供静态资源，未知 SPA 路径回退到 `index.html`。

### 9.2 部署前提

- 浏览器访问 API 必须保持同源，或正确配置 CORS、Cookie、CSRF 和代理头。
- 必须保留 Superset 会话 Cookie 和 CSRF 行为。
- 定制接口 `/bi/*`、`/briefing/*`、`/project/*`、`/menu/settings` 必须由本仓库后端提供。
- 字体使用系统字体与本机可选字体，不依赖 Google Fonts 等第三方域名。
- 生产环境必须配置 CSP、HSTS、frame-ancestors 等响应头；CSP 需兼容 Emotion 内联样式，同时禁止内联脚本。
- Source map 默认关闭；仅私有调试时可执行 `GENERATE_SOURCEMAP=true npm run build`，产物不得公网发布。
- 未接入的 Agent sidecar 不应暴露端口。

### 9.3 发布冒烟清单

- [ ] `/health` 返回正常。
- [ ] `/login` 可访问，登录成功并进入首页。
- [ ] 图表列表可搜索并进入图表编辑。
- [ ] 仪表板列表可搜索并打开仪表板。
- [ ] SQL Lab 可读取元数据并执行只读查询。
- [ ] 分析大厅可进入已完成专题。
- [ ] 简报列表和详情可打开。
- [ ] 管理页面仅授权角色可访问。
- [ ] 浏览器控制台无阻断性错误。
- [ ] 关键 API 响应时间和错误率处于预期范围。
- [ ] 旧版本镜像可回滚。

### 9.4 回滚策略

- 保留上一版本镜像和构建产物索引。
- 数据库结构未变化时，直接回滚应用镜像。
- 涉及后端定制接口变化时，前后端必须配套回滚。
- 回滚后执行登录、仪表板和 SQL Lab 冒烟。

## 10. 安全模型与兼容边界

### 10.1 安全模型

本项目遵循仓库根目录 `../SECURITY.md`：

- Public 默认无数据访问能力。
- Gamma 只能访问被授权数据集。
- Alpha 可访问所有数据源，但 SQL 执行仍需要 `sql_lab` 能力。
- Admin 是受信任运维主体。
- 嵌入式 guest token 只能访问其授权仪表板。
- 异步任务必须使用发起用户的身份，并保留 RLS 和对象级授权。

前端路由、菜单、收藏和缓存不是授权来源。后端必须在 API、DAO 和任务层执行最终授权。

### 10.2 当前兼容边界

- 本应用是独立 SPA，直接使用 MUI 9 与本地 `superset-ui-mui`，不复用父仓库 `@superset-ui/core`；这是已记录的架构例外。
- 仅支持当前定制后端，不复用上游完整 Superset 插件生态。
- 图表和仪表板能力是简化实现。
- 部分页面直接依赖中文字段和业务指标。
- 联邦数据集配置同时存在服务端下发和前端兜底。
- 当前没有完整运行时环境配置机制。
- 当前 AI 能力不可用。
- 当前移动端导航已支持触摸与抽屉操作。

## 11. 待决策事项

| 决策       | 选项                              | 建议                                               |
| ---------- | --------------------------------- | -------------------------------------------------- |
| Node 版本  | 统一 Node 22 / 升级 Docker        | 优先统一 Node 22，降低本地与构建差异               |
| Token 存储 | HttpOnly Cookie/BFF / 短期 Bearer | 优先 HttpOnly Cookie+BFF；保留 Bearer 时缩短寿命   |
| AI sidecar | 清理 / 保留并重构 / 重新接入      | 当前建议清理；重新接入前完成授权和缓存隔离         |
| Source map | 关闭 / 私有存储 / 公网公开        | 生产关闭或限制访问                                 |
| 字体       | Google Fonts / 自托管             | 内网和生产环境优先自托管                           |
| WIP 专题   | 完成 / 下线                       | 产品明确优先级后逐专题交付                         |
| 仪表板能力 | 维持简化 / 补齐拖拽与插件         | 根据用户需求决定，不建议默认承诺完整 Superset 能力 |

## 12. 关键文件索引

| 用途             | 文件                                             |
| ---------------- | ------------------------------------------------ |
| 应用入口         | `src/main.tsx`                                   |
| 路由             | `src/views/App.tsx`                              |
| 路由权限         | `src/config/routePermissions.ts`                 |
| 前端守卫         | `src/components/ProtectedRoute.tsx`              |
| Axios 客户端     | `src/api/client.ts`                              |
| Token 存储       | `src/api/tokenStorage.ts`                        |
| 认证状态         | `src/store/authStore.ts`                         |
| React Query 配置 | `src/api/queryClient.ts`                         |
| 仪表板数据       | `src/pages/Dashboard/hooks/useDashboardData.ts`  |
| 仪表板状态       | `src/pages/Dashboard/hooks/useDashboardState.ts` |
| ECharts 配置     | `src/utils/echarts.ts`                           |
| SQL Lab 状态     | `src/pages/SqlLab/useSqlLab.ts`                  |
| 专题定义         | `src/pages/Analysis/topics.tsx`                  |
| 专题页面         | `src/pages/Analysis/TopicPage.tsx`               |
| 简报详情         | `src/pages/Briefing/detail.tsx`                  |
| Vite 配置        | `vite.config.ts`                                 |
| TypeScript 配置  | `tsconfig.json`                                  |
| Playwright 配置  | `playwright.config.ts`                           |
| Agent sidecar    | `agents/pi-agent-server/`                        |
| 安全模型         | `../SECURITY.md`                                 |
| 仓库开发规范     | `../AGENTS.md`                                   |
