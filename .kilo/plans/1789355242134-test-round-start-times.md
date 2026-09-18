# 分成配置新增「首测/二测/三测起始时间」（对齐上线时间全链路）

## Goal

在 `/project/settings?tab=profit-sharing`（分成配置，`ProfitSharingConfig`）为每条 游戏×渠道 行新增 3 个固定轮次日期字段：`首测起始时间`、`二测起始时间`、`三测起始时间`，并让它们像 `上线时间` 一样贯穿：数据库列 → 后端 GET/PUT → 图表数据注入与自动数据集指标 → DatasetEdit 快捷指标 → CompareModal 对比起始锚点。

## Confirmed Decisions

- 轮次固定为 3 个：首测 / 二测 / 三测；不做动态轮次管理（增减轮次需改代码）。
- 日期为自由文本（占位符 `YYYY/MM/DD`），不做格式校验，与 `上线时间` 一致。
- CompareModal 使用**多选**锚点：弹窗顶部一排可多选的 Chips（上线/首测/二测/三测），至少保留一个；只选一个时保持原有单一对比，选中多个时按轮次独立分表（**外对比**，周期文案变为「各轮次后 N 天」，基准旁显示「外对比」角标）。默认仅选「上线」，不改变现有默认行为。
- 锚点日期缺失时逐级回退（每个游戏/渠道独立判断）：
  1. 该渠道 + 选中轮次的日期 `perChannel[anchor][pid][channel]`
  2. 该游戏选中轮次的全游戏最早日期 `global[anchor][pid]`（多行取最早）
  3. 测试轮次**不再回退到上线时间**：该轮次完全没有日期时视为该游戏没有这一轮测试，不生成标签/分表（否则只有上线时间的游戏会多出重复的首测/二测/三测分表）
  4. 上线时间锚点只取上线时间的渠道/全游戏日期
  5. 均无 → 不生成时间窗口（保持现状：查询不加时间过滤）
- 窗口结束时间截断使用 `resolveMilestoneDate`（该阶段无日期时回退到上线时间），仅用于限制 end，不用于决定分表是否存在。

## Tasks (ordered)

### 1. 数据模型

`superset/models/profit_sharing.py`（现有列 21-28 行后）：

- 新增 3 列：`首测起始时间`、`二测起始时间`、`三测起始时间`，均为 `Column(String(255), nullable=True)`。
- `sync()` 无需改动；已有行保留已填值，新同步行这三列为 NULL。

### 2. Alembic 迁移

新建 `superset/migrations/versions/2026-09-14_10-00_add_test_round_start_times.py`：

- `revision = "add_test_round_start_times"`，`down_revision = "add_channel_ios_share"`（当前 head，见 `2026-07-17_17-59_add_ios_virtual_share_to_channel.py`）。
- 完全照抄 `2026-07-17_17-30_add_merchant_and_ios_virtual_share.py` 的写法：逐个 `if not table_has_column("profit_sharing", <列名>, schema="config")` → `op.batch_alter_table("profit_sharing", schema="config")` 加列；`downgrade()` 反序守卫删除。
- 不修改 `consolidate_v1` 的建表语句（迁移链顺序执行即可）。

### 3. 后端 API

`superset/project/channel/api.py`：

- `list_profit_sharing`（73-99 行）序列化字典新增 3 个字段（`r.首测起始时间 or ""` 等）。
- `update_profit_sharing`（110-176 行）新增 3 个 `data.get(...)` walrus 赋值块，并在返回 result 中带上 3 个字段。PUT 仍为整体提交，`分成比例` 重算逻辑不受影响。
- CSRF 豁免已覆盖该路由，无需改动。

### 4. 图表数据注入与自动指标

`superset/charts/data/api.py`：

- `FIELD_MAP`（598-605 行）新增 3 项（key 与 value 均为中文列名）。`DISPLAY_FIELDS`、`INJECT_FIELDS_SET` 自动派生。
- 结果：`_ensure_profit_sharing_metrics` 会在首次查询时自动为数据集创建同名 `SqlMetric`；`_inject_profit_sharing` 会按 游戏名+渠道名 匹配注入这三列；`columns`/`metrics` 两种请求路径均已覆盖。

### 5. 分成配置前端

`superset-frontend-new/src/pages/ProfitSharingConfig/index.tsx`：

- `WhitelistRow`（32-46 行）新增 3 个 `string` 字段。
- `COLUMNS`（50-63 行）在 `"上线时间"` 之后追加 3 个列名。
- `handleSaveAll`（123-147 行）与 `handleSave`（170-195 行）的 PUT body 带上 3 个字段。
- `updateField`（197-215 行）联合类型新增 3 个字段名。
- 表头 `minWidth` 分支（422-437 行）：将 3 个新日期列与 `上线时间` 同宽（建议抽 `DATE_COLUMNS` 集合判断）。表将变为 15 个数据列 + 操作列，横向滚动由 `CardContent overflow:auto` 承载，需目测 1280px 宽度下可用。
- 行内单元格：复制 `上线时间` 单元格（794-823 行）的结构 —— 编辑态 `TextField variant="standard"`、居中、`fontSize 0.75rem`、占位符 `YYYY/MM/DD`；非编辑态 `renderText`。建议抽一个局部 `renderDateCell(row, field)` 避免 4 份重复。

### 6. DatasetEdit 快捷指标

`superset-frontend-new/src/pages/DatasetEdit/index.tsx`（约 1321-1329 行的指标白名单数组）：追加 `"首测起始时间"`、`"二测起始时间"`、`"三测起始时间"`，使计算列公式可快捷插入。

### 7. CompareModal 锚点轮次

新增可测试纯函数 `superset-frontend-new/src/pages/Dashboard/compareStartDate.ts`：

- `ANCHORS = [{ key: "上线时间", label: "上线" }, { key: "首测起始时间", label: "首测" }, { key: "二测起始时间", label: "二测" }, { key: "三测起始时间", label: "三测" }]`，导出 `AnchorKey`、`ANCHOR_LABELS`。
- `buildStartMaps(rows: ProfitSharingRow[]) => Record<AnchorKey, { global: Record<string,string>; perChannel: Record<string, Record<string,string>> }>`：按现有逻辑逐锚点聚合（global 取最早，perChannel 逐渠道覆盖）。
- `resolveStartDate(maps, anchorKey, pappId, channelName?)`：实现 Confirmed Decisions 中的 5 级回退链。
- `anchorSectionLabel(anchor, label, multi)`：多选轮次时分表标签加「轮次 · 」前缀，查询侧与渲染侧的 sectionAggregateCacheRef key 保持一致。
- `hasAnyStart(maps, pappId): boolean`：任一锚点有日期即可选。

修改 `superset-frontend-new/src/pages/Dashboard/CompareModal.tsx`：

- GET `/project/profit-sharing` 的响应类型（291-295 行）扩展 3 个字段。
- 用 `startMaps` 状态替换 `launchByChannel`（113-116 行，由 `buildStartMaps` 构建，构建代码在 302-314 行）；新增 `selectedAnchors: AnchorKey[]` 状态（默认 `["上线时间"]`，至少保留一个），弹窗关闭重置（177-200 行的 reset 逻辑里追加）。
- `resolveDateRange(game, cchName, anchor)`（348-366 行）按指定锚点取窗口；依赖数组同步更新。窗口计算仍为 `dayjs(start).format("YYYY/MM/DD")`，`start.add(periodDays, "day")`。
- 数据侧按（轮次 × 游戏 × 渠道商）构建 detail/聚合查询，每行打 `__anchor` 标记（`colNames` 过滤掉该内部字段），section 聚合缓存 key 带轮次前缀；内对比（其余渠道次表）仅在单选轮次时启用。
- 渲染侧 `buildSections` 按 `__anchor` 拆分数据：多选时对每个轮次分别生成一套分表，标签加轮次前缀，与查询侧缓存 key 一致。
- `PERIODS`（65-71 行）标签动态化：单选时 `${轮次}后 N 天`，多选时「各轮次后 N 天」。
- DialogTitle（1188 行附近）基准 Chips 改为多选切换（点击 toggle，至少保留一个），多选时显示「外对比」角标；外对比判定与 `sectionCount` 计入轮次数（轮次数 × 现有维度组合），超过 4 项时沿用现有警告样式。
- 分表标签行：按与 `buildSections` 相同的组合规则生成标签（多游戏 → 每游戏；多轮次 → 每轮次；多渠道商/媒体 → 每组合），每个标签展示该分表自己的测试时间窗口（`start ~ end)`，含轮次/渠道商/媒体前缀），保证**标签数 = 分表数**；单选轮次且无多维度时标签格式与原来一致（`游戏 [start ~ end)`）。
- **分表与标签顺序按数据日期先后**（`compareSectionOrder`：窗口起始日期升序 → 同日按阶段 首测/二测/三测/上线 → 再按标签），与点击轮次/游戏的先后无关。
- 回退链走完仍无日期（该组合无首测/二测/三测且无上线时间）时**不参与查询**：不发送带空字符串的日期过滤（避免 Hologres 联邦查询报 "All federated database sides failed"），不生成标签与分表，并在标签行下方灰字「已跳过：xxx」提示；`维度组合独立分表 (N项)` 的 N 与标签数一致。
- 查询进度可视化：`查询` 期间在标签行下方显示 `LinearProgress` + 阶段文案（正在查询明细数据 → 正在查询对比汇总 → 正在查询分表汇总 → 正在生成对比结果）、`已完成 N/总数` 与 `已用 Ns` 秒表（每秒刷新）；总数 = 明细+汇总（每组合各 1 次）+ 内对比次表（最多 2 次）+ 分表汇总（维度组合数），每个阶段结束时推进到阶段边界，部分组合被跳过时进度条仍能走到 100%。
- 窗口结束时间按阶段顺序（首测 → 二测 → 三测 → 上线）截断：`end = min(start + 周期, 下一阶段起始时间)`，下一阶段日期缺失时沿用（回退到上线时间）；窗口为**前闭后开** `[start, end)`（过滤条件用 `>= start` + `< end`，标签展示为 `[start ~ end)`），因此首测不包含二测起始当天。
- 手动录入的非补零日期（如 `2024/9/20`）在 `buildStartMaps` 中按 `dayjs` 解析比较取最早，避免字符串比较导致的最早日期错误。
- 游戏列表（315-322 行）：过滤条件从「有 `上线时间`」改为 `hasAnyStart(...)`，使只有测试日期、尚无上线时间的游戏也能出现在对比列表；`GameOption.上线时间` 字段保留用于最后一级回退。
- 各查询路径（405、507、661、803、896、924、971、1645 行）均通过 `resolveDateRange`/`buildSections` 按轮次取窗口与分表，无需逐处修改。

### 8. 前端单测

新增 `superset-frontend-new/src/pages/Dashboard/__tests__/compareStartDate.test.ts`（vitest，参考 `__tests__/compareColumns.test.ts`）：

- 每个锚点 global 取最早日期、perChannel 按渠道取值。
- 回退链：缺轮次 → 该轮次全游戏最早 → 该游戏渠道上线时间 → 游戏上线时间 → `undefined`。
- `hasAnyStart` 对仅填测试日期的游戏返回 true。
- `buildStartMaps` 忽略空字符串日期。

## Out of Scope

- 不做动态轮次管理/增删 UI（轮次数固定为 3）。
- 不引入日期选择器或格式校验（保持自由文本，与 `上线时间` 一致）。
- 不修改 `papp_metadata`、渠道配置、BI API 及其它消费方。
- 不改 CompareModal 的其它对比逻辑（外对比/内对比、LTV 模式等）。

## Validation

- 前端（`superset-frontend-new/`）：`npm run type`、`npm run lint`、`npm test`。
- 后端（仓库根）：激活虚拟环境后 `pre-commit run --files <改动文件>`（ruff/mypy/pylint），必要时 `pre-commit run mypy`。
- 迁移：启动后端执行 `superset db upgrade`，确认三列存在于 `config.profit_sharing`。
- 手工验证：
  1. 分成配置页编辑某行填写三个轮次日期并保存 → 刷新后值保留；「全部保存」同样生效；「同步」后已填值不被清空。
  2. 打开使用含 `profit_sharing` 配置数据集的图表，选择指标 `首测起始时间` → 结果注入且 `指标` 列表出现该指标；DatasetEdit 计算列可插入这三个名称。
  3. CompareModal：默认仍按上线时间（文案「上线后 N 天」）；切到「首测」后周期文案变「首测后 N 天」，未填首测的游戏自动回退到上线时间窗口；仅有测试日期的游戏可选且能查询；关闭重开弹窗锚点恢复「上线」。
- 回归检查：原有 12 列表格布局、编辑/保存交互、`分成比例` 自动计算均不受影响。

## Risks

- 分成配置表变宽（15 数据列 + 操作列），需确认现有横向滚动体验仍可用。
- `YYYY/MM/DD` 字符串按字典序比较取最早；格式错误会像 `上线时间` 一样导致 `dayjs` 无效、不生成窗口（既有行为，不新增处理）。
- 自动指标写入用户元数据库属既有机制（首次查询触发），不引入新的写路径。
