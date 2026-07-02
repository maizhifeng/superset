# 将分成配置注入 Dataset 26 的方案

## 方案：后端 API 注入 + 数据集 meta 驱动

通过修改 ChartData API 返回路径，在 `_send_chart_response()` 中将 `config.profit_sharing` 的分成字段注入到查询结果中。注入行为由数据集 `extra` 元数据配置驱动，无需硬编码 dataset ID 或列名。

## 架构图

```
Frontend                   Backend (Flask)                    Hologres
   │                           │                                 │
   │  POST /chart/data         │                                 │
   │  datasource: {id: 26}     │                                 │
   │──────────────────────────>│                                 │
   │                           │  command.run()                  │
   │                           │────────────────────────────────>│
   │                           │  <── SQL result ───────────────│
   │                           │                                 │
│                           │  _inject_profit_sharing()       │
│                           │  ├─ 读 datasource.extra 配置   │
│                           │  ├─ 读本地 PG: ProfitSharing    │
│                           │  ├─ 按 (game, channel) 匹配注入 │
│                           │  │   (profit_sharing 类目)      │
│                           │  └─ eval computed_columns       │
│                           │      (计算列类目·与分成解耦)    │
   │                           │                                 │
   │  <── JSON + 分成字段 ────│                                 │
```

> ProfitSharing 储存在本地 PostgreSQL（Superset 元数据库），业务数据在 Aliyun Hologres。两者通过 Flask Python 层融合。

## 设计决策

| 决策项 | 选择 | 原因 |
|--------|------|------|
| 注入点 | `ChartDataRestApi._send_chart_response()` | 覆盖同步/异步缓存/agent 所有路径 |
| 启用检测 | `SqlaTable.extra` JSON 中有 `profit_sharing` 或 `computed_columns` 任一配置即启用 | 两个类目独立，互不依赖 |
| 列名映射 | 来自 `extra.profit_sharing` 中的 `papp_name_column` / `channel_name_column` | 列名变更只需改 meta，不改代码 |
| 匹配键 | 字符串匹配 `profit_sharing.papp_name` + `profit_sharing.channel_name` | 按名称匹配，无需整数 ID |
| 分成注入条件 | 必须同时包含游戏名列和渠道名称列，否则跳过 | 防止聚合粒度丢失导致数据歧义 |
| 计算列执行 | 无论分成是否注入，只要 extra 中有 `computed_columns` 就执行 | 计算列是通用能力，不依赖分成 |
| 缓存策略 | 注射在 `command.run()` 之后执行 | 业务数据可缓存，分成数据每次实时 |
| 计算列引擎 | Python `eval()` 求值，公式中列名作为变量 | 灵活支持任意计算逻辑 |

## 数据集元数据结构设计

### Superset 原生能力分析

| 机制 | 存储位置 | 求值时机 | 能否引用注入字段 |
|------|----------|----------|----------------|
| `TableColumn.expression` | `table_columns` 表 | SQL 执行时（数据库端） | ❌ 数据库不识别 |
| `SqlMetric.expression` | `sql_metrics` 表 | SQL 执行时（数据库端） | ❌ 同上 |
| 虚拟数据集 SQL | `tables.sql` | SQL 执行时（数据库端） | ❌ 同上 |
| `extra` JSON | `tables.extra` | 纯存储，不自动执行 | ✅ 注射代码手动 eval |

**结论**：Superset 没有"后处理计算列"的原生机制。`extra` JSON 是存放 `computed_columns` 的唯一合适位置。

### 两类目独立设计

`extra` JSON 包含两个顶层 key，互不依赖：

```json
{
  "profit_sharing": {
    "papp_name_column": "主游戏",
    "channel_name_column": "渠道商"
  },
  "computed_columns": [
    {
      "name": "分成后成本",
      "formula": "ad_real_cost * float(分成比例 or '100') / 100",
      "type": "float"
    },
    {
      "name": "研发支出",
      "formula": "ad_real_cost * float(研发分成 or '0') / 100",
      "type": "float"
    },
    {
      "name": "IP支出",
      "formula": "ad_real_cost * float(IP分成 or '0') / 100",
      "type": "float"
    }
  ]
}
```

### profit_sharing 配置类目

| 字段 | 说明 |
|------|------|
| `papp_name_column` | 虚拟数据集中代表游戏名称的列名 |
| `channel_name_column` | 虚拟数据集中代表渠道名称的列名 |

### computed_columns 类目（通用计算列，与分成解耦）

| 字段 | 说明 |
|------|------|
| `name` | 计算结果列在返回 JSON 中的列名 |
| `formula` | Python 表达式，列名作为变量名 |
| `type` | 列类型标记（`float` / `int` / `str`） |

公式中可用的上下文：
- SQL 查询返回的所有列名作为变量（如 `ad_real_cost`）
- 注入的分成字段（如 `分成比例`, `研发分成`）作为变量
- 内置函数：`float()`, `int()`, `str()`, `round()`

## 注入逻辑

### 文件修改

`superset/charts/data/api.py` — `ChartDataRestApi` 类

### 伪代码

```python
def _inject_profit_sharing(self, result: dict[str, Any]) -> dict[str, Any]:
    qc: QueryContext | None = result.get("query_context")
    if not qc:
        return result

    # 1. 读取数据集 extra 配置
    ds = qc.datasource
    extra = json.loads(ds.extra or "{}")
    ps_config = extra.get("profit_sharing")
    computed = extra.get("computed_columns", [])

    if not ps_config and not computed:
        return result

    # 2. 加载 profit_sharing 数据（类目一）
    from superset import db
    from superset.models.profit_sharing import ProfitSharing

    papp_col = ps_config["papp_name_column"] if ps_config else None
    channel_col = ps_config["channel_name_column"] if ps_config else None
    profit_shares = db.session.query(ProfitSharing).all()
    ps_map = {(ps.papp_name, ps.channel_name): ps for ps in profit_shares}
    INJECT_FIELDS = ["分成比例", "研发分成", "IP分成", "分成方式", "上线时间"]

    # 3. 逐 query 处理
    for query in result.get("queries") or []:
        colnames: list[str] = query.get("colnames") or []
        data = query.get("data") or []
        new_cols: list[str] = []

        # 3a. 分成注入（粒度过载保护：必须同时有游戏名和渠道名列）
        if ps_config and papp_col in colnames and channel_col in colnames:
            new_cols.extend(INJECT_FIELDS)
            for row in data:
                try:
                    key = (str(row.get(papp_col)), str(row.get(channel_col)))
                except (ValueError, TypeError, KeyError):
                    continue
                ps = ps_map.get(key)
                if ps:
                    for field in INJECT_FIELDS:
                        row[field] = getattr(ps, field, None)

        # 3b. 计算列求值（类目二，与分成解耦）
        if computed:
            new_cols.extend(c["name"] for c in computed)
            for row in data:
                for cc in computed:
                    try:
                        local_vars = {**row, "float": float, "int": int,
                                      "str": str, "round": round}
                        row[cc["name"]] = eval(
                            cc["formula"],
                            {"__builtins__": {}},
                            local_vars,
                        )
                    except Exception:
                        row[cc["name"]] = None

        # 3c. 更新 colnames（仅追加实际注入/计算的列）
        if new_cols:
            query["colnames"] = colnames + [c for c in new_cols if c not in colnames]

    return result
```

### 调用位置

```python
def _send_chart_response(self, result, form_data=None, datasource=None, ...):
    result = self._inject_profit_sharing(result)  # ← 新增
    # ... 后续原有逻辑
```

## 与现有系统的交互

### CompareModal（superset-frontend-new）

CompareModal 通过 `POST /chart/data` 查询，会被自动注入。后端生效后：
- 查询结果的 `colnames` 自动包含分成字段
- CompareModal 中无需额外 API 调用获取上线时间
- 如需展示分成字段，修改 `COL` 常量即可（可选）

### 其他图表/仪表盘

所有基于 dataset 26 的图表自动受益，无需任何改动。

## 风险与注意事项

| 风险 | 说明 | 缓解 |
|------|------|------|
| **聚合粒度丢失** | 按 game 汇总时不带 channel，无法匹配 | 粒度过载保护：无渠道名列时字段置 NULL |
| **列名变更** | 虚拟数据集 SQL 修改列名 | 列名存在 `extra` 中，修改 meta 即可 |
| **formula Eval 安全** | 使用 `eval()` 执行公式字符串 | 公式只由 Admin 维护，非用户输入；已限制 `__builtins__` |
| **性能** | 每次查询多读一次本地 DB | ProfitSharing 表极小（< 1k 行），可忽略 |
| **缓存** | 注入在 `_send_chart_response` | 业务数据可缓存，分成数据每次实时 |
| **Async 查询** | `/data/<cache_key>` 也经过 `_send_chart_response` | 覆盖 ✓ |
| **SQLLab** | 不经过此路径 | 不在范围内；可直接写 SQL 处理 |

## 实现任务清单

### 后端

- [ ] `superset/charts/data/api.py` — 新增 `_inject_profit_sharing()` 方法
- [ ] `superset/charts/data/api.py` — 在 `_send_chart_response()` 中调用
- [ ] 通过 SQLite/测试验证注入逻辑正确性

### 配置

- [ ] 在 dataset 26 的额外配置界面填入：游戏名称列名 = `主游戏`，渠道名称列名 = `渠道商`
- [ ] 在 dataset 26 的 `extra` 字段中填入 `computed_columns`（如分成后成本等公式）

### 验证

- [ ] Explore → dataset 26 → 查询 → 结果中有 `分成比例`, `分成后成本` 等字段
- [ ] 按游戏名 + 渠道名分组查询 → 分成字段正确匹配
- [ ] 仅按游戏名分组 → 分成字段为 NULL（粒度过载保护）
- [ ] 在分成配置 UI 修改比例 → 重新查询 → 结果已更新
- [ ] 其他数据集查询不受影响
- [ ] 异步查询同样包含分成字段

### 可选（CompareModal 前端展示）

- [ ] `CompareModal.tsx` — 如需在对比表格中展示分成字段，在 `COL` 中增加映射
