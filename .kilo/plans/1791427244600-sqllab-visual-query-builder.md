# /sqllab 可视化 SQL 组装器（Metabase 风格）实施计划

目标：把 `superset-frontend-new` 的 `/sqllab` 从纯 SQL 编辑器升级为「可视化组装 + 原生 SQL」双模式页面。可视化模式用 Metabase 式步骤流组装查询（选表 / JOIN / 筛选 / 聚合 / 排序 / 限制 / 自定义表达式），实时生成单条 SELECT，通过现有 `POST /api/v1/sqllab/execute/` 执行，结果区复用现有表格。**不改后端。**

## 已确认决策（访谈结论）

1. **双模式切换**：`/sqllab` 顶部加「可视化组装 / SQL 编辑器」切换，共享数据库/模式选择与结果区；可视化生成的 SQL 可带入 SQL 编辑器继续手改。
2. **v1 功能边界**：单阶段完整构建 —— 单表或 JOIN 多表、选列与别名、筛选（AND/OR 平铺）、聚合（分组维 + count/count distinct/sum/avg/min/max/custom + HAVING）、排序、行数限制、自定义 SQL 表达式列。不做多阶段 Notebook。
3. **持久化**：可视模型以单行 JSON 注释内嵌在 SQL 首行（`-- superset-viz: {...}`），随保存查询/复制自动往返；保存为数据集、执行时自动剔除注释。零后端改动。
4. **方言**：按 `Database.backend` 映射引号、日期截断、sql-formatter 方言；未知引擎回退 ANSI 双引号。
5. **交互形态**：Metabase 步骤流卡片（数据源 → 关联 → 字段 → 筛选 → 汇总 → 排序与限制），折叠时显示人话摘要；可折叠查看生成的 SQL（只读）。
6. **结果展示**：复用现有 `ResultsTable`（分页/导出/保存为数据集不变），不内嵌图表。
7. **默认模式**：进入 `/sqllab` 默认可视化（localStorage 记住上次选择）；SQL→可视化仅在 SQL 带合法模型注释时可用，若正文被手改与模型不一致则弹确认框。
8. **日期粒度**：分组维为时间列时可选 原始值/按天/周/月/季/年，按引擎映射。

## 非目标（明确排除）

- 多阶段 Notebook / 嵌套子查询；SQL→可视化的反解（无 SQL parser）；虚拟数据集（SQL dataset）作为数据源；跨 schema JOIN；DISTINCT；列值自动补全（distinct 拉取）；内嵌图表；URL permalink 分享；后端任何改动。

## 复用的现有接口

| 用途 | 接口 |
| --- | --- |
| 执行查询 | `POST /api/v1/sqllab/execute/` body `{database_id, sql}`（现有 `handleRunSql`） |
| 表列表 | `GET /api/v1/database/{id}/tables/?q=(schema_name:...)` |
| 表元数据（列类型/主键/外键） | `GET /api/v1/database/{id}/table/{table}/{schema}/` → `{columns:[{name,type,longType,keys,comment}], foreignKeys:[{column_names,referred_table,referred_columns,referred_schema}], primaryKey, selectStar}` |
| 保存查询 | `POST /api/v1/saved_query/` body `{label, sql, db_id, schema}`（SQL 含模型注释） |
| 数据库列表 | `GET /api/v1/database/`（含 `backend` 字段，用于方言映射） |

## 可视模型 JSON（version 1）

```ts
interface VisualQueryModel {
  v: 1;
  databaseId: number;          // 恢复上下文用
  schema: string;              // 恢复上下文用；v1 内所有表同 schema
  table: string;               // 基表
  joins: {
    id: string;
    type: "inner" | "left" | "right" | "full";
    table: string;             // 同 schema
    keys: { left: ColumnRef; right: ColumnRef }[]; // AND 连接
  }[];
  columns: { source: Ref; alias?: string }[];     // 无聚合时的输出列
  expressions: { id: string; name: string; sql: string }[]; // 自定义表达式
  filters: FilterCondition[];  // WHERE，顺序即求值顺序
  groupBy: { ref: Ref; dateUnit?: "day"|"week"|"month"|"quarter"|"year" }[];
  metrics: {
    id: string;
    kind: "count"|"count_distinct"|"sum"|"avg"|"min"|"max"|"custom";
    ref?: Ref;                 // custom 之外
    customSql?: string;        // custom 时
    label: string;             // 输出别名，去重
  }[];
  having: FilterCondition[];   // 引用 metric id 或 groupBy ref
  sorts: { ref: Ref | { metricId: string }; desc: boolean }[];
  limit: number;               // 必填，默认 1000
}
type Ref = { kind: "column"; joinId?: string; column: string }        // 未带 joinId = 基表
        | { kind: "expression"; expressionId: string };
interface FilterCondition {
  id: string;
  connector: "and" | "or";     // 第一行忽略
  ref: Ref | { metricId: string };   // having 里用 metricId
  op: string;                  // 见操作符目录
  values: (string | number | null)[];
}
```

**聚合规则（Metabase 语义）**：`metrics.length > 0 || groupBy.length > 0` 时，SELECT = groupBy 维度 + metrics（`columns` 被隐藏并禁用编辑，UI 给提示）；否则 SELECT = `columns`。排序在聚合时只能引用分组维/指标别名，未聚合时只能引用输出列。

## SQL 生成规则

- **表引用**：`<quote(schema)>.<quote(table)>`；列引用 `<表限定>.<quote(column)>`（表限定用表名，同名冲突加 `_2` 后缀；模型用 joinId 定位，不暴露别名给用户）。表达式引用内联为 `(<expr>)`。
- **引号映射**（`dialects.ts`）：双引号 `"`：postgres, redshift, duckdb, snowflake, trino, presto, oracle, sqlite, vertica 及默认；反引号：mysql, mariadb, tidb, clickhouse, bigquery, hive, spark, databricks；方括号：mssql。转义：重复引号字符（`]]` for mssql）。
- **字面量**：字符串 `'...'`（`'` → `''`）；数字校验后裸写；布尔 `TRUE/FALSE`；NULL 保留；日期 `'YYYY-MM-DD'` 或 `'YYYY-MM-DD HH:mm:ss'`。
- **日期截断**（不支持则回退原始列并在 UI 提示"当前引擎不支持时间粒度"）：
  - postgres/redshift/duckdb/snowflake/trino：`DATE_TRUNC('month', col)`（unit 小写）
  - mysql/mariadb/tidb：day `DATE(col)`，week `DATE_FORMAT(DATE_SUB(col, INTERVAL WEEKDAY(col) DAY),'%Y-%m-%d')`，month `DATE_FORMAT(col,'%Y-%m-01')`，quarter `CONCAT(YEAR(col),'-',LPAD((QUARTER(col)-1)*3+1,2,'0'),'-01')`，year `DATE_FORMAT(col,'%Y-01-01')`
  - sqlite：`strftime(fmt, col)`（按 unit 给 fmt，month/week 用 `%Y-%m-01` 起算）
  - clickhouse：`toStartOfDay/Week/Month/Quarter/Year(col)`
  - bigquery：`DATE_TRUNC(col, MONTH)`
  - mssql：`DATETRUNC(month, col)`（SQL Server 2022+，不支持时回退原始值）
- **结构**：`SELECT ... FROM ... [LEFT JOIN t ON a.k = b.k AND ...] WHERE ... GROUP BY ... HAVING ... ORDER BY ... LIMIT n`；无尾分号；聚合查询的 ORDER BY 用指标/维度别名（已加引号）。
- **预览格式化**：`sql-formatter`，language 用 backend→formatter 方言映射（模块内维护映射表，如 postgresql/mysql/sqlite/trino/bigquery/snowflake/clickhouse/duckdb/redshift/transactsql），失败则展示原文。

## 注释内嵌（modelIO.ts）

- 标记：SQL **首行** `-- superset-viz: <单行紧凑 JSON>`。
- `embedModel(sql, model)` / `extractModel(sql) -> { model, body } | null` / `stripVisualComment(sql)`。
- 提取用正则匹配首行；JSON parse 后跑 `validateModel()`（`v===1`、`table` 非空、数组结构合法），失败视为无注释。
- 首行注释后接原始 SQL 正文；执行、保存为数据集、客户端复制 SQL 时用 `stripVisualComment`。

## 实施任务（按序）

1. **类型与元数据**（`src/types/api.ts`）：新增 `TableColumnMeta`、`TableForeignKeyMeta`、`TableMetadata`。
2. **方言模块**（`src/pages/SqlLab/visual/dialects.ts`）：backend→引号/日期截断/formatter 方言映射；`quoteIdent(backend, id)`、`dateTrunc(backend, expr, unit)`。
3. **操作符与类型分类**（`src/pages/SqlLab/visual/operators.ts`）：`classifyColumn(type,longType) -> string|number|temporal|boolean|other`（temporal 优先于 string 判断）；各类型操作符目录（中文 label）：通用 `为空/不为空`；string `=,≠,包含,不包含,开头是,结尾是,属于,不属于`；number `=,≠,>,≥,<,≤,介于,属于,不属于`；temporal `当天,早于,晚于,介于`；boolean `为真,为假`；HAVING 仅数值类。含 `formatLiteral` 与值校验。
4. **SQL 生成器**（`src/pages/SqlLab/visual/sqlBuilder.ts`）：`buildSql(model, backend, tableMetas) -> string` 纯函数，按上述规则输出；生成 `SELECT` 别名（`AS "label"`，去重、始终加引号）。表名/列名从 `tableMetas`（`${schema}:${table}` 键）取原始名称。
5. **模型序列化**（`src/pages/SqlLab/visual/modelIO.ts`）：如上。
6. **状态与数据获取**（`src/pages/SqlLab/useSqlLab.ts` 改造）：
   - tabs 结构扩展为 `{ id, name, sql, mode: "sql"|"visual", model?: VisualQueryModel }`；切换 tab 时恢复 mode/model；新增 tab 继承当前模式（visual 新 tab 给空模型）；localStorage 记 `superset-sqllab-mode`。
   - 新增 `tableMetadataCache`（键 `dbId:schema:table`）+ `fetchTableMetadata(dbId, schema, table)`，带 in-flight 去重，同时回填现有 `columnCache` 的列名（避免重复请求）。
   - 新增 `handleRunVisual()`：由 model + `databases` 中的 backend 生成 SQL（剔除注释路径：直接生成即无注释），调用现有 `handleRunSql`（自动进最近查询）。
   - `UseSqlLabOptions` 增加 `initialSchema`；从 location state 恢复。
7. **可视查询 hook**（`src/pages/SqlLab/visual/useVisualQuery.ts`）：模型 state + 更新 actions（addJoin/removeJoin/updateJoin、toggleColumn、addFilter/updateFilter/removeFilter、addMetric/updateMetric、setGroupBy、addExpression…），变更时按需 `fetchTableMetadata`（基表 + 已加入的 join 表），派生 `generatedSql = buildSql(...)`、`dialectSupported`、模型完整度（能否运行）。
8. **UI 组件**（`src/pages/SqlLab/visual/components/`）：
   - `VisualQueryBuilder.tsx`：步骤流容器（MUI `Paper`/`Accordion` 风格卡片），顶部统一「运行」按钮；折叠摘要文本生成函数；空态引导（"从左侧选择表，或点击下方选择基表"）。
   - `DataSourceStep.tsx`：基表选择（当前数据库/模式下带搜索的下拉，或由 SchemaBrowser 右键加入；切换数据库/schema 时若有模型则确认重置）。
   - `JoinStep.tsx`：列出现有 JOIN（类型+表+键摘要，可删）；「添加关联表」对话框：选表（同 schema）→ 连接类型 → 键对（左右列下拉）；若两表外键匹配（`foreignKeys.referred_table/referred_columns`），一键填充建议键。
   - `ColumnsStep.tsx`：输出列多选（带搜索、全选/清空、上下移排序）+ 自定义表达式管理（名称 + SQL 文本框）；聚合模式下禁用并提示。
   - `FilterStep.tsx`：筛选行列表（连接词 AND/OR、列/表达式、按类型操作符、值输入：文本/数字/布尔下拉/日期用 `@mui/x-date-pickers` DatePicker；in 类逗号分隔多值，between 两个输入）。
   - `SummaryStep.tsx`：分组维度（列/表达式 + 日期粒度下拉）+ 指标（函数 + 列/表达式，或自定义 SQL + label）+ HAVING 行。
   - `SortLimitStep.tsx`：排序键（引用维度/指标/输出列 + 升降序，多行）+ 行数限制（100/500/1000/5000/10000 或自定义，默认 1000）。
   - `SqlPreview.tsx`：折叠只读 SQL + 复制按钮。
9. **页面集成**（`src/pages/SqlLab/index.tsx`）：
   - 顶部 `ToggleButtonGroup`「可视化组装 / SQL 编辑器」+ 现有标签页栏保留；localStorage 记住模式。
   - 模式切换规则：V→S 时把 `withModelComment(generatedSql, model)` 写入 `sql` 并 toast 提示；S→V 时 `extractModel(sql)`：无注释 → 对话框「当前 SQL 无法自动转换为可视化查询」[新建可视化查询（清空）/取消]；有注释但正文 ≠ `buildSql(model)`（忽略空白归一化比较）→ 警告「SQL 已被手工修改，进入可视化模式将丢弃这些修改」[继续/取消]。
   - 工具栏按模式裁剪：visual 仅保留 运行/停止/保存查询/新建标签页/最近查询/保存为数据集（后两者沿用现有逻辑）；sql 保留现有全套按钮。
   - 运行：visual 用 `handleRunVisual`；`initialRun` 时模型就绪后自动执行一次。
   - 保存查询（visual）：POST `withModelComment(generatedSql, model)`；保存为数据集：`stripVisualComment(sql)`；`ResultsTable` 展示的已执行 SQL 天然无注释。
   - 「最近查询」加载：SQL 含注释时同时恢复 visual 模式与模型，否则仅 SQL（执行 SQL 无注释，因此历史通常是 SQL 模式，属预期）。
10. **SchemaBrowser 适配**（`src/pages/SqlLab/SchemaBrowser.tsx`）：visual 模式下表/列右键菜单改为「加入查询作为基表 / 添加为 JOIN 表 / 添加为输出列 / 复制名称」；sql 模式保持现有「插入 / 复制」。
11. **保存查询打开链路**（`src/pages/SavedQueryList/index.tsx`）：`openInSqlLab`/`handleRunSaved` 传递 `initialSchema`（detail 的 `schema` 字段）与 `initialDatabaseId`；SQL 注释存在时 SqlLab 自动进入 visual 并优先采用模型内的 databaseId/schema（若数据库列表中存在）。
12. **测试**（vitest，遵循 `test()` 单层风格）：
    - `src/pages/SqlLab/visual/__tests__/sqlBuilder.test.ts`：单表选列、别名引号与去重、各类型筛选（含 in/between/null/转义）、JOIN 类型与多键、聚合+HAVING、分组+日期粒度各引擎断言、排序/限制、同名表后缀、各方言引号与整段 SQL 快照。
    - `__tests__/operators.test.ts`：类型分类、操作符可用性、literal 格式化。
    - `__tests__/modelIO.test.ts`：embed/extract/strip 往返、非法 JSON、版本不符、手改正文检测。
    - `src/pages/SqlLab/__tests__/VisualQueryBuilder.test.tsx`：mock 元数据下步骤渲染、添加筛选后 SQL 预览更新、聚合模式禁用字段步骤。
13. **验证**：在 `superset-frontend-new/` 运行 `npm run type`、`npm run lint`、`npm run test` 全部通过；手工验证见下。

## 手工验收清单（dev server http://localhost:9000/sqllab）

1. 默认进入可视化模式；选库/选 schema/选表 → 步骤摘要正确；点运行出结果。
2. 选列 + 筛选（文本 contains、数字 between、日期范围、in 多值、为空）→ SQL 预览正确、执行成功。
3. 添加 LEFT JOIN（外键建议一键填充、多键对）→ SQL 正确、结果正确。
4. 分组 + 指标 + HAVING + 日期粒度（月）+ 排序 + 限制 100 → 结果正确；字段步骤禁用提示出现。
5. 自定义表达式（如 `price * qty`）用于输出列、筛选、SUM 指标。
6. 保存查询 → 在「已保存查询」列表"在 SQL 实验室中打开" → 自动回到可视化模式且条件完整（含库/schema）。
7. 切到 SQL 编辑器：SQL 首行注释存在、手工改正文后再切回可视化出现丢弃确认；无注释的手写 SQL 切换给出无法转换对话框。
8. 保存为数据集：数据集 SQL 不含注释。
9. SQL 模式旧功能回归：运行选中、格式化、复制、标签页、快捷键、右键插入均正常。

## 风险与缓解

- **方言边界**（日期截断/引号）：每引擎单元测试；未知引擎回退 ANSI 引号 + 原始日期分组并 UI 提示。
- **元数据接口失败/无权限**：步骤内错误提示 + 重试按钮；基表未选时运行禁用。
- **别名/同名表冲突**：生成器统一去重（别名后缀、表限定后缀），始终加引号避免保留字。
- **手改 SQL 与模型漂移**：空白归一化比较 + 切换确认；不尝试反解 SQL。
- **大列数表**：列选择器带搜索；不引入虚拟滚动（列数通常可控）。
- **回滚**：功能为页面内增量；出问题可仅用 SQL 模式（模式默认值存 localStorage）。
