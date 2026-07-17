# 跨库查询（Federated BI）功能准确性审计与修复计划

## 背景与架构

自定义 fork 中实现了"跨库联邦查询"：将同一结构的两个数据集（主库 `aliyun` + 伙伴库 `aliyun-oversea`）通过数据集 `extra.federated` 绑定（`databases` + `partner_dataset_id`），在后端 `superset/project/bi/api.py` 的蓝图 `bi_federated`（`/api/v1/bi/chart/data`、`/api/v1/bi/filter-values`）中分别执行两侧 SQL、合并、再聚合。前端 `superset-frontend-new` 通过 `config/federatedDatasets.ts` 的 `FEDERATED_DATASETS: Set<number>` 决定走 `/bi/...` 还是标准 `/chart/data`。

涉及文件：
- 后端：`superset/project/bi/api.py`（核心：`_run_federated_query`、`_execute_federated_side`、`filter_values`）
- 前端：`src/config/federatedDatasets.ts`、`src/components/DashboardFilter/FilterPanel.tsx`、`src/pages/Dashboard/hooks/useDashboardData.ts`、`src/pages/Dashboard/ChartCard.tsx`、`src/pages/DatasetList/index.tsx`（绑定 UI）、`src/utils/query/extractQueryFields.ts`

---

## 准确性问题清单（按严重度）

### A. 跨库查询再聚合（后端 `_run_federated_query`）

**F1【严重】非可加指标被错误求和**
再聚合逻辑 `merged_df.groupby(dim_cols)[metric_cols].sum()`（api.py:183-185）对所有 `metric_cols` 一律 `sum()`。仅对 `SUM`/可加指标正确；对 `COUNT(DISTINCT x)`、`AVG(x)`、`MIN`/`MAX`、比率类指标（如 `SUM(a)/SUM(b)` 的单个 SQL 表达式）求和在数学上是错误的。合计行与按维度的合并值在这些指标类型下都错误。

**F2【严重】无 GROUP BY（合计行）路径返回两行**
当 `groupby_cols` 为空（如合计行用的 grand-total 查询会清空 groupby/columns，useDashboardData.ts:87-88），再聚合被跳过（api.py:178 的 `0 < gb_count` 不成立），`df_aliyun` 与 `df_oversea` 直接拼接成 **2 行**。前端 `useDashboardData.ts:121-127` 取 `results[1].data[0]`，**合计行只反映一个库**，漏算另一个库的贡献。已确认：联邦数据集的合计行恒为单侧数据。

**F3【高】按位置切分 `labels_expected` 假设 `[groupby..., metrics...]` 严格顺序**
`dim_cols = labels_expected[:gb_count]` / `metric_cols = labels_expected[gb_count:]`（api.py:179-180）依赖输出列严格"维度在前、指标在后"。若存在透视/时间序列等插列、或列顺序与 `query_obj.columns` 不一致，会导致维度被当作指标求和、或指标被当维度、或 `TypeError`（被 except 捕获后返回未聚合的双行）。脆弱且易静默出错。

**F4【中】联邦 Top-N / 分页不准确**
每个库各自应用 `row_limit`（api.py 两侧独立 `get_df`），合并再聚合后并非真正的全局 Top-N。跨库后被加总能进前 N 的维度可能被截断；前端 `hasMore` 基于合并集判断（useDashboardData.ts:144-148）也不一致。

**F5【中】`exec_post_processing` 在再聚合之后执行**
依赖单源粒度的后处理（贡献度、滚动、百分位等）在已合并数据上运行会失真；若 `normalize_df`/后处理改变或丢弃列，末尾 `result_df[labels_expected]`（api.py:196）可能 `KeyError`。

### B. 筛选（`/bi/filter-values`）

**F6【高】候选值忽略其他生效筛选与分页语义**
`filter_values`（api.py:300-322）对两侧均调用 `values_for_column`，但**不传入任何过滤上下文**，因此下拉框展示两库全部值的并集，无视仪表板中其他兄弟筛选/当前数据范围——可能列出导致空结果的值，且不支持交叉筛选。前端发 `page_size:100`，后端忽略分页返回至多 10000 条，前端仅展示前 100 条（FilterPanel.tsx:170-184），大列表被截断。

**F7【低】候选值合并用 `set()` 无序、未排序**（api.py:321）。

**F8【高】两套"是否联邦"真相源、需手动同步**
后端 `extra.federated` 与前端硬编码 `FEDERATED_DATASETS` 必须手动同步，且需同时维护 `superset-frontend-new` 与 `superset-frontend` 两份。若数据集已在 `extra` 绑定但漏加进 Set → 图表静默走 `/chart/data`，只显示主库（漏算、无报错）；若在 Set 但未在 `extra` 配置 → `/bi/chart/data` 返回 400。

### C. 合计行（totals row）

**F9【高】合计行源自 F2 的缺陷** → 仅单侧。即使修 F2，合计行也须对两库 grand-total 求和。
**F10【中】前端对 `分成后流水` 客户端覆写只累加首页明细（≤50 行）**（useDashboardData.ts:130-141）。明细超 50 行分页时合计被低估，且覆盖了（可能正确的）后端合计；联邦场景下应以跨库合并 sum 为准，不应再覆盖或须对完整结果聚合。
**F11【低】** `totalRow` 列序须与 `labels_expected` 一致，否则展示错位（受 F3 顺序假设影响）。

### D. 其它

**F12【低】** 联邦 payload 中 `applied_filters`/`rejected_filters` 恒为空（api.py:219-220）；若有消费者依赖这些字段（如原生筛选指示）则不反映生效筛选。

---

## 推荐修复（按优先级）

1. **F2/F9 合计行跨库求和**：在 `_run_federated_query` 中处理 `gb_count == 0` 的情形——对 `metric_cols` 跨行 `sum()`（保留单行 grand-total），而不是拼接两行。前端 `useDashboardData` 取 `results[1].data[0]` 即可正确得到双库合计。
2. **F1 非可加指标**：从指标定义区分可加/非可加。最简稳健方案：在 `extra.federated` 或数据集指标元数据中标注指标聚合语义（`sum`/`avg`/`distinct`/`ratio`/`min`/`max`），再聚合时分别用 `sum`/`mean`/`sum(distinct 近似不可用则标记不支持)`/`min`/`max`。短期：至少在文档/配置中显式声明仅支持可加 `SUM` 指标，并对非可加指标给出告警或回退（单侧/不聚合）。
3. **F3 列对齐**：不依赖位置切分。改用 `query_obj` 的 `metrics` 解析出的指标标签集合与 `groupby/columns` 标签集合来划分 `dim_cols`/`metric_cols`；并对 `labels_expected` 做集合校验，缺列/多列时记录并安全降级。
4. **F8 单一真相源**：去掉前端硬编码 Set，改由后端在 chart/filter 响应或独立 `/bi/federated-datasets` 接口返回联邦数据集 ID 列表；前端动态获取。消除手动同步。
5. **F6 筛选候选值**：`filter_values` 接受并传递当前生效的筛选上下文（复用 `values_for_column` 的 filters 参数），并在前端按 `page_size` 正确分页/搜索；避免对两库全量去重后只展示前 100。
6. **F4 分页/Top-N**：明确限制联邦查询不分页做全局 Top-N（后端先取较大 `row_limit` 再全局排序截断），或文档声明分页为近似。
7. **F10 客户端覆写**：联邦场景下移除/修正 `分成后流水` 首页覆写，改用后端跨库合计（或对整个结果集聚合）。
8. **F5/F11/F7/F12**：再聚合后做列存在性校验；候选值排序；按需填充 `applied_filters`。

---

## 验证方案

- **单元/集成测试（后端）**：构造主库+伙伴库 fixture，覆盖：
  - 可加 `SUM` 指标：验证合并值 = 两库同维度值之和（F1 正例）。
  - `COUNT(DISTINCT)`/`AVG`：验证当前实现给出错误值（复现 F1），修复后符合标注语义。
  - 无 GROUP BY 合计查询：修复前 `results[1]` 返回 2 行且 `data[0]` 仅单侧；修复后返回 1 行 = 两库求和（F2/F9）。
  - 维度顺序/插列：验证按标签划分列正确（F3）。
- **前端测试**：`useDashboardData.test.ts` 增加联邦合计行断言（取 `data[0]` 为双库合计）；`FilterPanel` 验证联邦走 `/bi/filter-values` 且候选值随兄弟筛选变化（F6/F8）。
- **端到端**：用 `docker` 起 aliyun + oversea 两个库，绑定数据集 26↔伙伴，在仪表板验证筛选下拉、图表合并值、合计行与在 SQL 中手动 `UNION ALL`+`GROUP BY` 的结果一致。
- **回归**：非联邦数据集（`FEDERATED_DATASETS` 之外）行为不变。

## 开放问题
- 非可加指标（DISTINCT/AVG/比率）在跨库场景是否允许近似、还是直接禁用？需产品确认（影响 F1 实现复杂度）。
- 联邦数据集的"单一真相源"是否采用后端接口动态下发（推荐），还是继续维护前端 Set 但加一致性校验脚本（F8）。

---

## 实施状态（已实现）

**后端 `superset/project/bi/api.py`**
- ✅ **F2/F9 合计行跨库求和**：无 GROUP BY（grand-total）路径改为对两库指标行做聚合（默认 sum），返回单行 = 双库合计；前端取 `results[1].data[0]` 即正确合计。
- ✅ **F1 非可加指标可配置**：新增 `extra.federated.metric_aggregations`（按指标标签映射 `sum/mean/min/max/median/first/last`），并对疑似非可加指标（`avg__`、`count_distinct__`、`ratio` 等）默认 sum 时输出告警。
- ✅ **F3 按列名而非位置切分**：维度列由 GROUP BY/columns 标签集合识别，指标列为其余列；位置回退仅在标签无法匹配时触发，避免插列/乱序导致错列。
- ✅ **F6 筛选候选值**：`/bi/filter-values` 现解析 `q` 中的 `filters`/`page_size`/`page`，通过参数化 SQL 谓词（`_build_predicate`/`_distinct_values`）对两侧库应用筛选与分页，并对结果排序。搜索分支传入的 `ct` 过滤现在在两侧生效。
- ✅ **F7 候选值排序** + **F8 后端真相源**：新增 `GET /api/v1/bi/federated-datasets`，返回所有 `extra.federated.enabled` 且 `databases` 长度为 2 的数据集 ID。
- 蓝图在 `superset/initialization/__init__.py` 中对 `federated_datasets` 免除 CSRF。

**前端 `superset-frontend-new`**
- ✅ **F8 动态下发**：`src/config/federatedDatasets.ts` 新增 `refreshFederatedDatasets(api)`，启动时（`main.tsx`）拉取 `/bi/federated-datasets` 并合并进 `FEDERATED_DATASETS`，硬编码 Set 作为兜底；`isFederatedDataset` 行为不变。
- ✅ **F10 合计行覆盖保护**：`useDashboardData.ts` 的 `分成后流水` 客户端覆写仅在**非联邦**数据集时执行，联邦数据集改用后端跨库合计，避免分页首页导致的低估。

**验证**
- 后端再聚合逻辑独立 pandas 测试（CASE1 可加求和 / CASE2 grand-total 单行双库求和 / CASE3 AVG→mean / CASE4 插列按名切分）全部通过。
- 前端单测：`useDashboardData.test.ts` 新增 2 例验证联邦保留后端合计、非联邦求和；`federatedDatasets.test.ts` 新增 2 例验证拉取合并与失败兜底。共 8 例通过。
- `ruff check superset/project/bi/api.py` 通过。

**未覆盖 / 后续**
- **F5 `exec_post_processing`** 在已合并数据上的后处理保真度依赖具体后处理类型（如贡献度/滚动），未专项处理；当前实现在合并+再聚合之后、全局排序分页之前执行后处理，顺序合理，但特定后处理类型仍需按场景验证。

**补充已修复项（本轮）**
- ✅ **F4 全局 Top-N / 分页**：`_run_federated_query` 不再对两侧各自分页。先按 `row_limit * multiplier`（可配 `extra.federated.row_limit_multiplier`，默认 1；上限 `FEDERATED_MAX_SIDE_ROW_LIMIT`）作为"召回窗口"取数，合并再聚合后，用 `_apply_global_order_and_pagination` 按 `query_obj.orderby`（修正了升/降序标志取反 bug）做全局排序，再统一应用 `row_offset`/`row_limit`。修复了排序升降标志 `not bool(o[1])` 的错误（应为 `bool(o[1])`）。
- ✅ **F6 前端交叉筛选**：`FilterPanel` 新增 `buildSiblingFilters`，为联邦筛选框拼接同数据集、其他已选 `value/filter_select` 筛选作为 `in` 谓词，随 `q.filters` 传入 `/bi/filter-values`；搜索分支的过滤列由写死的 `"value"` 修正为 `filter.column`；后端 `_distinct_values`/`_build_predicate` 已支持参数化谓词。非联邦路径忽略 `q.filters` 的旧行为不变。
- ✅ **F12 `applied_filters`**：chart-data payload 现由 `query_obj.filter` 推导填充 `applied_filters`（列/操作符/值），`rejected_filters` 仍为空。

**验证（本轮）**
- 后端独立 pandas 测试：全局 Top-3（合并求和后按指标降序 US>CN>UK）、offset=1（跳过 US 取 CN/UK）、`_side_query_dict` 剥离 offset 并设 side limit，全部通过；并捕获并修复排序升降标志取反 bug。
- 前端单测：新增 `FilterPanel.test.tsx` 3 例（兄弟筛选忽略自身/异库、跳过空值与非 select 类型、单值包数组）；既有 8 例仍通过。
- `ruff check superset/project/bi/api.py` 通过；前端相关文件 `tsc --noEmit` 无新增类型错误。
