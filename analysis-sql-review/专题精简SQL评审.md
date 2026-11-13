# /analysis 五个专题「精简 SQL」改造 · SQL 评审稿

> 状态：**待评审，尚未实施任何改动**（未改源码、未改元数据库）。
> 页面：http://localhost:9000/analysis（`superset-frontend-new/src/pages/Analysis`）
> 评审重点：§3 大陆侧 5 段 SQL、§4 海外侧 5 段 SQL、§10 待确认问题
> **实施更新（2026-11-09）**：已采用**方案 B**（后端直接执行专题 SQL，不创建独立数据集），
> 并在成本专题页提供「查看 SQL」按钮；实施细节见 `实施记录-成本分析.md`。
> 生成日期：2026-11-09　数据源：Superset dataset 26（大陆）/ 38（海外 partner）

---

## 0. 方案一句话

保留现有查询链路（前端 → `/api/v1/bi/chart/data` → 双侧执行 → 合并 → 比率重算 → 缓存/快照），只把「5 个专题共用一份 50 列大 SQL」换成「**每个专题一份只含自身字段的精简 SQL**」：大陆侧 1 份 + 海外 partner 侧 1 份，共 10 份（SQL 见 §3、§4）。

**落地形态二选一（请确认）**：

| 方案 | 做法 | 改动量 | 备注 |
|---|---|---|---|
| **A（推荐）** | 每个专题新建一个虚拟数据集（SQL 如下），海外侧新建 partner 数据集；前端只切数据集 id | 小：仅元数据 + 前端 4 处常量 | 现有 Superset 查询引擎、缓存、快照、预热全部复用 |
| B | 后端新增专题 SQL 执行通道，按查询粒度（KPI/趋势/明细/下钻）直接执行并聚合 | 大：新增后端端点 + 前端改造 | 可把页面所选日期下推到 SQL，收益更大（§8.2） |

本稿的 SQL 是两套方案共用的「专题数据 SQL」；方案 A 原样落为数据集 SQL，方案 B 在此之上做粒度聚合。

---

## 1. 现状与裁剪空间

- 数据集 26（`ad_combined_report`）：**50 列、10,285 字符 SQL**；每次查询都会在 `aliyun` 与 `aliyun-oversea` 两侧各跑一遍，大陆侧视图是「消耗视图（约 320 万行）+ 归因充值表（约 317 万行）」两个分支的 UNION，手游分支约 637 万行、小游戏分支约 570 万行。
- 前端每个专题首屏发 3 个 `/bi/chart/data` 请求（共 5 个 QueryObject）+ 5 个 filter-values 请求；每个 QueryObject 都按全量 50 列聚合，与专题真正需要的列无关。
- 五个专题实际只用到 **29 / 50 列**；按单专题拆分后每份 SQL 只需 **10–18 列**（见下表），另有 **21 列五个专题完全不用**（60/90 日充值、60/90 日付费留存、曝光、点击、下载、DAU、团队、商户充值、`[ID]` 列等）。

| 专题 | 需要的列数 | 保留列 | 可从 dataset 26 移除 |
|---|---|---|---|
| 成本分析 | 11 | 日期、平台、地区、媒体、渠道商、主游戏、消耗、返点后消耗、新增进入、1日充值、1日付费数 | 39 列 |
| 留存分析 | 18 | 日期、平台、地区、媒体、渠道商、主游戏、新增进入、1日付费数、2日留存数、2日付费留存数、3日付费留存数、4日付费留存数、5日付费留存数、6日付费留存数、7日付费留存数、14日付费留存数、21日付费留存数、30日付费留存数 | 32 列 |
| LTV / ROI 分析 | 14 | 日期、平台、地区、媒体、渠道商、主游戏、新增进入、返点后消耗、1日充值、3日充值、7日充值、14日充值、30日充值、累计充值 | 36 列 |
| 付费分析 | 12 | 日期、平台、地区、媒体、渠道商、主游戏、充值流水、累计充值、新增进入、1日付费数、活跃付费、累计付费数 | 38 列 |
| 渠道 / 媒体分析 | 10 | 日期、平台、地区、媒体、渠道商、主游戏、消耗、返点后消耗、新增进入、充值流水 | 40 列 |

> 6 个维度列（日期 + 平台/地区/媒体/渠道商/主游戏）对所有专题都保留：筛选栏固定 5 列（主游戏/地区/媒体/渠道商/平台），拆解维度与趋势/下钻也依赖它们。

---

## 2. 每个专题的字段与指标映射

### 成本分析（`cost`）

| 响应字段 | 类型 | 定义（分子 ÷ 分母） | 需要的原始列 |
|---|---|---|---|
| 消耗 | SUM | — | 消耗 |
| 返点后消耗 | SUM | — | 返点后消耗 |
| 新增进入 | SUM | — | 新增进入 |
| cpa | 比率 | 返点后消耗 ÷ 新增进入 | 返点后消耗、新增进入 |
| cpp | 比率 | 返点后消耗 ÷ 1日付费数 | 返点后消耗、1日付费数 |
| 自然新增% | 比率 | 媒体=自然量 的新增 ÷ 全部新增 | 媒体、新增进入 |
| ltv_1 | 比率 | 1日充值 ÷ 新增进入 | 1日充值、新增进入 |
| roi_1 | 比率 | 1日充值 ÷ 返点后消耗 | 1日充值、返点后消耗 |

指标目录里的 revenue1 / roi7 / revenueRoi 三个条目从未进入该专题任何查询，因此 SQL 不需要 7日充值、流水ROI；需要 1日充值（来自 ltv_1 / roi_1 表达式）。

**该专题 SQL 暴露的字段（11）**：日期、平台、地区、媒体、渠道商、主游戏、消耗、返点后消耗、新增进入、1日充值、1日付费数

### 留存分析（`retention`）

| 响应字段 | 类型 | 定义（分子 ÷ 分母） | 需要的原始列 |
|---|---|---|---|
| 新增进入 | SUM | — | 新增进入 |
| 1日付费数 | SUM | — | 1日付费数 |
| 2日留存率 | 比率 | 2日留存数 ÷ 新增进入 | 2日留存数、新增进入 |
| 1日付费率 | 比率 | 1日付费数 ÷ 新增进入 | 1日付费数、新增进入 |
| N日付费留存率 | 比率 | N日付费留存数 ÷ 1日付费数 | N日付费留存数、1日付费数 |

该专题所有指标都来自「归因/充值」明细分支，不依赖广告消耗分支；因此大陆侧 SQL 直接读 ad_data_sum_report / wxh5_data_sum_report，不再扫描约 320 万行的消耗视图（这是提升最大的一个专题）。

**该专题 SQL 暴露的字段（18）**：日期、平台、地区、媒体、渠道商、主游戏、新增进入、1日付费数、2日留存数、2日付费留存数、3日付费留存数、4日付费留存数、5日付费留存数、6日付费留存数、7日付费留存数、14日付费留存数、21日付费留存数、30日付费留存数

### LTV / ROI 分析（`ltv-roi`）

| 响应字段 | 类型 | 定义（分子 ÷ 分母） | 需要的原始列 |
|---|---|---|---|
| ltv_1 / 3 / 7 / 14 / 30 | 比率 | N日充值 ÷ 新增进入 | N日充值、新增进入 |
| roi_1 / 3 / 7 / 14 / 30 | 比率 | N日充值 ÷ 返点后消耗 | N日充值、返点后消耗 |
| 累计roi | 比率 | 累计充值 ÷ 返点后消耗 | 累计充值、返点后消耗 |

回收曲线（1/3/7/14/30 天）复用 KPI 行，不需要额外查询；该专题同时需要消耗与充值两个分支。

**该专题 SQL 暴露的字段（14）**：日期、平台、地区、媒体、渠道商、主游戏、新增进入、返点后消耗、1日充值、3日充值、7日充值、14日充值、30日充值、累计充值

### 付费分析（`payment`）

| 响应字段 | 类型 | 定义（分子 ÷ 分母） | 需要的原始列 |
|---|---|---|---|
| 充值流水 | SUM | — | 充值流水（operate 侧，均摊后） |
| 累计充值 | SUM | — | 累计充值 |
| 新增进入 | SUM | — | 新增进入 |
| 1日付费数 | SUM | — | 1日付费数 |
| 1日付费率 | 比率 | 1日付费数 ÷ 新增进入 | 1日付费数、新增进入 |
| 活跃付费 | SUM | — | 活跃付费（operate 侧，均摊后） |
| 累计付费数 | SUM | — | 累计付费数 |

充值流水 / 活跃付费 来自 operate 侧，保留原 SQL 的 COUNT(*) OVER 均摊写法，确保明细按维度拆分后的分配口径与现网完全一致。

**该专题 SQL 暴露的字段（12）**：日期、平台、地区、媒体、渠道商、主游戏、充值流水、累计充值、新增进入、1日付费数、活跃付费、累计付费数

### 渠道 / 媒体分析（`channel`）

| 响应字段 | 类型 | 定义（分子 ÷ 分母） | 需要的原始列 |
|---|---|---|---|
| 消耗 | SUM | — | 消耗 |
| 返点后消耗 | SUM | — | 返点后消耗 |
| 新增进入 | SUM | — | 新增进入 |
| cpa | 比率 | 返点后消耗 ÷ 新增进入 | 返点后消耗、新增进入 |
| 充值流水 | SUM | — | 充值流水（operate 侧，均摊后） |
| 流水ROI | 比率 | 充值流水 ÷ 返点后消耗 | 充值流水、返点后消耗 |

默认拆解维度是「媒体」，筛选栏 5 列（含地区）仍全部可用，所以 6 个维度列都要保留。

**该专题 SQL 暴露的字段（10）**：日期、平台、地区、媒体、渠道商、主游戏、消耗、返点后消耗、新增进入、充值流水


---

## 3. 大陆侧精简 SQL（5 份）

结构沿用现网 dataset 26 的「mobile / mini_game 两分支 → UNION ALL → 维表 join」，只保留本专题度量。三处按专题做了取舍：

1. **成本 / LTV-ROI / 渠道** 需要消耗与充值两侧，SQL 仍读 `report_sygame_ad_data_view`；
2. **留存** 的指标全部来自归因充值分支，直接读 `ad_data_sum_report` / `wxh5_data_sum_report`，不再扫描约 320 万行的消耗视图；
3. **付费 / 渠道** 需要 operate 侧的充值流水（含活跃付费），保留 `opreate_data_report` / `wxh5_opreate_data_report` 与原来的 `COUNT(*) OVER` 均摊写法。

日期下限沿用 `report_date >= 20250101`（数据集 SQL 无法拿到页面所选时间窗，静态 SQL 无法下推，见 §8.2）。

### 3.1 成本分析

**`final/mainland-cost.sql`**（58 行）

```sql
with
mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(ad_cost) as "消耗",
    SUM(ad_real_cost) as "返点后消耗",
    SUM(coalesce(n_unum, na_devnum)) as "新增进入",
    SUM(rt_paid_money_1) as "1日充值",
    SUM(paid_unum_1) as "1日付费数"
  from sj_report_data.report_sygame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(ad_cost) as "消耗",
    SUM(ad_real_cost) as "返点后消耗",
    SUM(act_num) as "新增进入",
    SUM(rt_paid_money_1) as "1日充值",
    SUM(paid_unum_1) as "1日付费数"
  from sj_report_data.report_minigame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
combined as (
  select * from mobile
  union all
  select * from mini_game
)
select
  case when combined.report_date > 0
    and LENGTH(cast(combined.report_date as TEXT)) = 8
    then TO_DATE(cast(combined.report_date as TEXT), 'YYYYMMDD') end as "日期",
  combined.platform as "平台",
  'mainland'::varchar as "地区",
  case when combined.pad_id = 0 then '自然量' else ch.channel_name end as "媒体",
  pt.cch_name as "渠道商",
  pp.papp_name as "主游戏",
  COALESCE(combined."消耗", 0) as "消耗",
  COALESCE(combined."返点后消耗", 0) as "返点后消耗",
  COALESCE(combined."新增进入", 0) as "新增进入",
  COALESCE(combined."1日充值", 0) as "1日充值",
  COALESCE(combined."1日付费数", 0) as "1日付费数"
from combined
left join ad_manager.ad_channel ch on combined.pad_id = ch.channel_id
left join sj_platform.part_channel pt on combined.cch_id = pt.cch_id
left join sj_platform.part_papp pp on combined.papp_id = pp.papp_id
```

### 3.2 留存分析

**`final/mainland-retention.sql`**（79 行）

```sql
with
mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(coalesce(n_unum, na_devnum)) as "新增进入",
    SUM(paid_unum_1) as "1日付费数",
    SUM(day2_dau) as "2日留存数",
    SUM(pay_retained_2) as "2日付费留存数",
    SUM(pay_retained_3) as "3日付费留存数",
    SUM(pay_retained_4) as "4日付费留存数",
    SUM(pay_retained_5) as "5日付费留存数",
    SUM(pay_retained_6) as "6日付费留存数",
    SUM(pay_retained_7) as "7日付费留存数",
    SUM(pay_retained_14) as "14日付费留存数",
    SUM(pay_retained_21) as "21日付费留存数",
    SUM(pay_retained_30) as "30日付费留存数"
  from sj_report_data.ad_data_sum_report
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(act_num) as "新增进入",
    SUM(paid_unum_1) as "1日付费数",
    SUM(day2_dau) as "2日留存数",
    SUM(pay_retained_2) as "2日付费留存数",
    SUM(pay_retained_3) as "3日付费留存数",
    SUM(pay_retained_4) as "4日付费留存数",
    SUM(pay_retained_5) as "5日付费留存数",
    SUM(pay_retained_6) as "6日付费留存数",
    SUM(pay_retained_7) as "7日付费留存数",
    SUM(pay_retained_14) as "14日付费留存数",
    SUM(pay_retained_21) as "21日付费留存数",
    SUM(pay_retained_30) as "30日付费留存数"
  from sj_report_data.wxh5_data_sum_report
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
combined as (
  select * from mobile
  union all
  select * from mini_game
)
select
  case when combined.report_date > 0
    and LENGTH(cast(combined.report_date as TEXT)) = 8
    then TO_DATE(cast(combined.report_date as TEXT), 'YYYYMMDD') end as "日期",
  combined.platform as "平台",
  'mainland'::varchar as "地区",
  case when combined.pad_id = 0 then '自然量' else ch.channel_name end as "媒体",
  pt.cch_name as "渠道商",
  pp.papp_name as "主游戏",
  COALESCE(combined."新增进入", 0) as "新增进入",
  COALESCE(combined."1日付费数", 0) as "1日付费数",
  COALESCE(combined."2日留存数", 0) as "2日留存数",
  COALESCE(combined."2日付费留存数", 0) as "2日付费留存数",
  COALESCE(combined."3日付费留存数", 0) as "3日付费留存数",
  COALESCE(combined."4日付费留存数", 0) as "4日付费留存数",
  COALESCE(combined."5日付费留存数", 0) as "5日付费留存数",
  COALESCE(combined."6日付费留存数", 0) as "6日付费留存数",
  COALESCE(combined."7日付费留存数", 0) as "7日付费留存数",
  COALESCE(combined."14日付费留存数", 0) as "14日付费留存数",
  COALESCE(combined."21日付费留存数", 0) as "21日付费留存数",
  COALESCE(combined."30日付费留存数", 0) as "30日付费留存数"
from combined
left join ad_manager.ad_channel ch on combined.pad_id = ch.channel_id
left join sj_platform.part_channel pt on combined.cch_id = pt.cch_id
left join sj_platform.part_papp pp on combined.papp_id = pp.papp_id
```

### 3.3 LTV / ROI 分析

**`final/mainland-ltv-roi.sql`**（67 行）

```sql
with
mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(coalesce(n_unum, na_devnum)) as "新增进入",
    SUM(ad_real_cost) as "返点后消耗",
    SUM(rt_paid_money_1) as "1日充值",
    SUM(rt_paid_money_3) as "3日充值",
    SUM(rt_paid_money_7) as "7日充值",
    SUM(rt_paid_money_14) as "14日充值",
    SUM(rt_paid_money_30) as "30日充值",
    SUM(total_paid_money) as "累计充值"
  from sj_report_data.report_sygame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(act_num) as "新增进入",
    SUM(ad_real_cost) as "返点后消耗",
    SUM(rt_paid_money_1) as "1日充值",
    SUM(rt_paid_money_3) as "3日充值",
    SUM(rt_paid_money_7) as "7日充值",
    SUM(rt_paid_money_14) as "14日充值",
    SUM(rt_paid_money_30) as "30日充值",
    SUM(total_paid_money) as "累计充值"
  from sj_report_data.report_minigame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
combined as (
  select * from mobile
  union all
  select * from mini_game
)
select
  case when combined.report_date > 0
    and LENGTH(cast(combined.report_date as TEXT)) = 8
    then TO_DATE(cast(combined.report_date as TEXT), 'YYYYMMDD') end as "日期",
  combined.platform as "平台",
  'mainland'::varchar as "地区",
  case when combined.pad_id = 0 then '自然量' else ch.channel_name end as "媒体",
  pt.cch_name as "渠道商",
  pp.papp_name as "主游戏",
  COALESCE(combined."新增进入", 0) as "新增进入",
  COALESCE(combined."返点后消耗", 0) as "返点后消耗",
  COALESCE(combined."1日充值", 0) as "1日充值",
  COALESCE(combined."3日充值", 0) as "3日充值",
  COALESCE(combined."7日充值", 0) as "7日充值",
  COALESCE(combined."14日充值", 0) as "14日充值",
  COALESCE(combined."30日充值", 0) as "30日充值",
  COALESCE(combined."累计充值", 0) as "累计充值"
from combined
left join ad_manager.ad_channel ch on combined.pad_id = ch.channel_id
left join sj_platform.part_channel pt on combined.cch_id = pt.cch_id
left join sj_platform.part_papp pp on combined.papp_id = pp.papp_id
```

### 3.4 付费分析

**`final/mainland-payment.sql`**（121 行）

```sql
with
mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(coalesce(n_unum, na_devnum)) as "新增进入",
    SUM(paid_unum_1) as "1日付费数",
    SUM(total_paid_unum) as "累计付费数",
    SUM(total_paid_money) as "累计充值"
  from sj_report_data.report_sygame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(act_num) as "新增进入",
    SUM(paid_unum_1) as "1日付费数",
    SUM(total_paid_unum) as "累计付费数",
    SUM(total_paid_money) as "累计充值"
  from sj_report_data.report_minigame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
operate_mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    SUM(p_money) as p_money
    , SUM(p_unum) as pay_users
  from sj_report_data.opreate_data_report
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id
),
operate_mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    SUM(p_money) as p_money
    , SUM(p_num) as pay_users
  from xh_report_data.wxh5_opreate_data_report
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id
),
mobile_full as (
  select
    COALESCE(a.platform, op.platform) as platform,
    COALESCE(a.report_date, op.report_date) as report_date,
    COALESCE(a.cch_id, op.cch_id) as cch_id,
    COALESCE(a.papp_id, op.papp_id) as papp_id,
    COALESCE(a.pad_id, 0) as pad_id,
    COALESCE(a.ptid, '') as ptid,
    a."新增进入",
    a."1日付费数",
    a."累计付费数",
    a."累计充值",
    COALESCE(op.p_money, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(a.report_date, op.report_date), COALESCE(a.cch_id, op.cch_id), COALESCE(a.papp_id, op.papp_id)), 0) as "充值流水",
    COALESCE(op.pay_users, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(a.report_date, op.report_date), COALESCE(a.cch_id, op.cch_id), COALESCE(a.papp_id, op.papp_id)), 0) as "活跃付费"
  from mobile a
  full outer join operate_mobile op
    on a.report_date = op.report_date
    and a.cch_id = op.cch_id
    and a.papp_id = op.papp_id
),
mini_game_full as (
  select
    COALESCE(a.platform, op.platform) as platform,
    COALESCE(a.report_date, op.report_date) as report_date,
    COALESCE(a.cch_id, op.cch_id) as cch_id,
    COALESCE(a.papp_id, op.papp_id) as papp_id,
    COALESCE(a.pad_id, 0) as pad_id,
    COALESCE(a.ptid, '') as ptid,
    a."新增进入",
    a."1日付费数",
    a."累计付费数",
    a."累计充值",
    COALESCE(op.p_money, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(a.report_date, op.report_date), COALESCE(a.cch_id, op.cch_id), COALESCE(a.papp_id, op.papp_id)), 0) as "充值流水",
    COALESCE(op.pay_users, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(a.report_date, op.report_date), COALESCE(a.cch_id, op.cch_id), COALESCE(a.papp_id, op.papp_id)), 0) as "活跃付费"
  from mini_game a
  full outer join operate_mini_game op
    on a.report_date = op.report_date
    and a.cch_id = op.cch_id
    and a.papp_id = op.papp_id
),
combined as (
  select * from mobile_full
  union all
  select * from mini_game_full
)
select
  case when combined.report_date > 0
    and LENGTH(cast(combined.report_date as TEXT)) = 8
    then TO_DATE(cast(combined.report_date as TEXT), 'YYYYMMDD') end as "日期",
  combined.platform as "平台",
  'mainland'::varchar as "地区",
  case when combined.pad_id = 0 then '自然量' else ch.channel_name end as "媒体",
  pt.cch_name as "渠道商",
  pp.papp_name as "主游戏",
  COALESCE(combined."新增进入", 0) as "新增进入",
  COALESCE(combined."1日付费数", 0) as "1日付费数",
  COALESCE(combined."累计付费数", 0) as "累计付费数",
  COALESCE(combined."累计充值", 0) as "累计充值",
  COALESCE(combined."充值流水", 0) as "充值流水",
  COALESCE(combined."活跃付费", 0) as "活跃付费"
from combined
left join ad_manager.ad_channel ch on combined.pad_id = ch.channel_id
left join sj_platform.part_channel pt on combined.cch_id = pt.cch_id
left join sj_platform.part_papp pp on combined.papp_id = pp.papp_id
```

### 3.5 渠道 / 媒体分析

**`final/mainland-channel.sql`**（113 行）

```sql
with
mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(ad_cost) as "消耗",
    SUM(ad_real_cost) as "返点后消耗",
    SUM(coalesce(n_unum, na_devnum)) as "新增进入"
  from sj_report_data.report_sygame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ptid,
    SUM(ad_cost) as "消耗",
    SUM(ad_real_cost) as "返点后消耗",
    SUM(act_num) as "新增进入"
  from sj_report_data.report_minigame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id, pad_id, ptid
),
operate_mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    SUM(p_money) as p_money
    , SUM(p_unum) as pay_users
  from sj_report_data.opreate_data_report
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id
),
operate_mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    SUM(p_money) as p_money
    , SUM(p_num) as pay_users
  from xh_report_data.wxh5_opreate_data_report
  where report_date >= 20250101 and papp_id != 61
  group by report_date, cch_id, papp_id
),
mobile_full as (
  select
    COALESCE(a.platform, op.platform) as platform,
    COALESCE(a.report_date, op.report_date) as report_date,
    COALESCE(a.cch_id, op.cch_id) as cch_id,
    COALESCE(a.papp_id, op.papp_id) as papp_id,
    COALESCE(a.pad_id, 0) as pad_id,
    COALESCE(a.ptid, '') as ptid,
    a."消耗",
    a."返点后消耗",
    a."新增进入",
    COALESCE(op.p_money, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(a.report_date, op.report_date), COALESCE(a.cch_id, op.cch_id), COALESCE(a.papp_id, op.papp_id)), 0) as "充值流水"
  from mobile a
  full outer join operate_mobile op
    on a.report_date = op.report_date
    and a.cch_id = op.cch_id
    and a.papp_id = op.papp_id
),
mini_game_full as (
  select
    COALESCE(a.platform, op.platform) as platform,
    COALESCE(a.report_date, op.report_date) as report_date,
    COALESCE(a.cch_id, op.cch_id) as cch_id,
    COALESCE(a.papp_id, op.papp_id) as papp_id,
    COALESCE(a.pad_id, 0) as pad_id,
    COALESCE(a.ptid, '') as ptid,
    a."消耗",
    a."返点后消耗",
    a."新增进入",
    COALESCE(op.p_money, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(a.report_date, op.report_date), COALESCE(a.cch_id, op.cch_id), COALESCE(a.papp_id, op.papp_id)), 0) as "充值流水"
  from mini_game a
  full outer join operate_mini_game op
    on a.report_date = op.report_date
    and a.cch_id = op.cch_id
    and a.papp_id = op.papp_id
),
combined as (
  select * from mobile_full
  union all
  select * from mini_game_full
)
select
  case when combined.report_date > 0
    and LENGTH(cast(combined.report_date as TEXT)) = 8
    then TO_DATE(cast(combined.report_date as TEXT), 'YYYYMMDD') end as "日期",
  combined.platform as "平台",
  'mainland'::varchar as "地区",
  case when combined.pad_id = 0 then '自然量' else ch.channel_name end as "媒体",
  pt.cch_name as "渠道商",
  pp.papp_name as "主游戏",
  COALESCE(combined."消耗", 0) as "消耗",
  COALESCE(combined."返点后消耗", 0) as "返点后消耗",
  COALESCE(combined."新增进入", 0) as "新增进入",
  COALESCE(combined."充值流水", 0) as "充值流水"
from combined
left join ad_manager.ad_channel ch on combined.pad_id = ch.channel_id
left join sj_platform.part_channel pt on combined.cch_id = pt.cch_id
left join sj_platform.part_papp pp on combined.papp_id = pp.papp_id
```


---

## 4. 海外侧精简 SQL（5 份）

海外侧沿用 dataset 38 的口径：

- 金额列是「USD × 10000」，`* 7 / 10000.0` = 按固定汇率 7.0 换成人民币「元」，与大陆侧同量纲；
- 付费留存类指标海外没有数据，保留 `0` 占位列，保证两侧列名一致（联邦合并要求）；
- `平台` 固定 `oversea`、`渠道商` 实际是 `system`（android / ios / third）、`地区` 是 `region`；
- 支付流水表改为 `paid_date_s` / `corder_year` 过滤：现网 `TO_CHAR(TO_TIMESTAMP(paid_date_s))` 写法会让 33M 行分区表全分区扫描（实测 631ms），改成裸 epoch 后只扫 1 个分区（实测 62ms），性价比很高。

### 4.1 成本分析

**`final/oversea-cost.sql`**（44 行）

```sql
with
agg as (
  select
    report_date,
    ad_cch_id,
    papp_id,
    tid,
    system,
    region,
  SUM(ad_menoy) * 7 / 10000.0 as "消耗",
  SUM(before_cost) * 7 / 10000.0 as "返点后消耗",
  SUM(rt_device_num) as "新增进入",
  SUM(paid_money) * 7 / 10000.0 as "1日充值",
  SUM(paid_money_7) * 7 / 10000.0 as "7日充值",
  SUM(paid_num) as "1日付费数"
  from overseas_report_data.ad_operate_data_report
  where report_date >= 20240101
    and ad_cch_id not in (59, 64)
  group by report_date, ad_cch_id, papp_id, tid, system, region
)
select
  'oversea'::varchar as "平台",
  agg.region as "地区",
  agg.ad_cch_id as pad_id,
  agg.papp_id as papp_id,
  case when agg.report_date > 0
    and LENGTH(cast(agg.report_date as TEXT)) = 8
    then TO_DATE(cast(agg.report_date as TEXT), 'YYYYMMDD')::date
  end as "日期",
  COALESCE(agg."消耗", 0) as "消耗",
  COALESCE(agg."返点后消耗", 0) as "返点后消耗",
  COALESCE(agg."新增进入", 0) as "新增进入",
  COALESCE(agg."1日充值", 0) as "1日充值",
  COALESCE(agg."7日充值", 0) as "7日充值",
  COALESCE(agg."1日付费数", 0) as "1日付费数",
  CASE WHEN ch.ad_cch_name IS NULL THEN '未知'
    WHEN ch.ad_cch_name = 'Rastar自然量' THEN '自然量'
    ELSE ch.ad_cch_name END as "媒体",
  agg.system as "渠道商[ID]",
  agg.system as "渠道商",
  pp.papp_name as "主游戏"
from agg
left join xh_osdata_manage.ad_channel ch on agg.ad_cch_id = ch.id
left join xh_osdata_manage.part_papp pp on agg.papp_id = pp.papp_id
```

### 4.2 留存分析

**`final/oversea-retention.sql`**（56 行）

```sql
with
agg as (
  select
    report_date,
    ad_cch_id,
    papp_id,
    tid,
    system,
    region,
  SUM(rt_device_num) as "新增进入",
  SUM(paid_num) as "1日付费数",
  SUM(rt_device_num_2) as "2日留存数",
  0::numeric as "2日付费留存数",
  0::numeric as "3日付费留存数",
  0::numeric as "4日付费留存数",
  0::numeric as "5日付费留存数",
  0::numeric as "6日付费留存数",
  0::numeric as "7日付费留存数",
  0::numeric as "14日付费留存数",
  0::numeric as "21日付费留存数",
  0::numeric as "30日付费留存数"
  from overseas_report_data.ad_operate_data_report
  where report_date >= 20240101
    and ad_cch_id not in (59, 64)
  group by report_date, ad_cch_id, papp_id, tid, system, region
)
select
  'oversea'::varchar as "平台",
  agg.region as "地区",
  agg.ad_cch_id as pad_id,
  agg.papp_id as papp_id,
  case when agg.report_date > 0
    and LENGTH(cast(agg.report_date as TEXT)) = 8
    then TO_DATE(cast(agg.report_date as TEXT), 'YYYYMMDD')::date
  end as "日期",
  COALESCE(agg."新增进入", 0) as "新增进入",
  COALESCE(agg."1日付费数", 0) as "1日付费数",
  COALESCE(agg."2日留存数", 0) as "2日留存数",
  COALESCE(agg."2日付费留存数", 0) as "2日付费留存数",
  COALESCE(agg."3日付费留存数", 0) as "3日付费留存数",
  COALESCE(agg."4日付费留存数", 0) as "4日付费留存数",
  COALESCE(agg."5日付费留存数", 0) as "5日付费留存数",
  COALESCE(agg."6日付费留存数", 0) as "6日付费留存数",
  COALESCE(agg."7日付费留存数", 0) as "7日付费留存数",
  COALESCE(agg."14日付费留存数", 0) as "14日付费留存数",
  COALESCE(agg."21日付费留存数", 0) as "21日付费留存数",
  COALESCE(agg."30日付费留存数", 0) as "30日付费留存数",
  CASE WHEN ch.ad_cch_name IS NULL THEN '未知'
    WHEN ch.ad_cch_name = 'Rastar自然量' THEN '自然量'
    ELSE ch.ad_cch_name END as "媒体",
  agg.system as "渠道商[ID]",
  agg.system as "渠道商",
  pp.papp_name as "主游戏"
from agg
left join xh_osdata_manage.ad_channel ch on agg.ad_cch_id = ch.id
left join xh_osdata_manage.part_papp pp on agg.papp_id = pp.papp_id
```

### 4.3 LTV / ROI 分析

**`final/oversea-ltv-roi.sql`**（48 行）

```sql
with
agg as (
  select
    report_date,
    ad_cch_id,
    papp_id,
    tid,
    system,
    region,
  SUM(rt_device_num) as "新增进入",
  SUM(before_cost) * 7 / 10000.0 as "返点后消耗",
  SUM(paid_money) * 7 / 10000.0 as "1日充值",
  SUM(paid_money_3) * 7 / 10000.0 as "3日充值",
  SUM(paid_money_7) * 7 / 10000.0 as "7日充值",
  SUM(paid_money_14) * 7 / 10000.0 as "14日充值",
  SUM(paid_money_30) * 7 / 10000.0 as "30日充值",
  SUM(paid_money_total) * 7 / 10000.0 as "累计充值"
  from overseas_report_data.ad_operate_data_report
  where report_date >= 20240101
    and ad_cch_id not in (59, 64)
  group by report_date, ad_cch_id, papp_id, tid, system, region
)
select
  'oversea'::varchar as "平台",
  agg.region as "地区",
  agg.ad_cch_id as pad_id,
  agg.papp_id as papp_id,
  case when agg.report_date > 0
    and LENGTH(cast(agg.report_date as TEXT)) = 8
    then TO_DATE(cast(agg.report_date as TEXT), 'YYYYMMDD')::date
  end as "日期",
  COALESCE(agg."新增进入", 0) as "新增进入",
  COALESCE(agg."返点后消耗", 0) as "返点后消耗",
  COALESCE(agg."1日充值", 0) as "1日充值",
  COALESCE(agg."3日充值", 0) as "3日充值",
  COALESCE(agg."7日充值", 0) as "7日充值",
  COALESCE(agg."14日充值", 0) as "14日充值",
  COALESCE(agg."30日充值", 0) as "30日充值",
  COALESCE(agg."累计充值", 0) as "累计充值",
  CASE WHEN ch.ad_cch_name IS NULL THEN '未知'
    WHEN ch.ad_cch_name = 'Rastar自然量' THEN '自然量'
    ELSE ch.ad_cch_name END as "媒体",
  agg.system as "渠道商[ID]",
  agg.system as "渠道商",
  pp.papp_name as "主游戏"
from agg
left join xh_osdata_manage.ad_channel ch on agg.ad_cch_id = ch.id
left join xh_osdata_manage.part_papp pp on agg.papp_id = pp.papp_id
```

### 4.4 付费分析

**`final/oversea-payment.sql`**（69 行）

```sql
with
agg as (
  select
    report_date,
    ad_cch_id,
    papp_id,
    tid,
    system,
    region,
  SUM(rt_device_num) as "新增进入",
  SUM(paid_num) as "1日付费数",
  SUM(paid_num_total) as "累计付费数",
  SUM(paid_money_total) * 7 / 10000.0 as "累计充值"
  from overseas_report_data.ad_operate_data_report
  where report_date >= 20240101
    and ad_cch_id not in (59, 64)
  group by report_date, ad_cch_id, papp_id, tid, system, region
),
pay as (
  select
    TO_CHAR(TO_TIMESTAMP(paid_date_s), 'YYYYMMDD')::int as report_date,
    papp_id,
    ad_cch_id,
    case
      when cch_id = 101 then 'android'
      when cch_id = 102 then 'ios'
      else 'third'
    end as system,
    location_region as region,
    COUNT(distinct uid) as pay_users,
    SUM(paid_usd) * 7 / 10000.0 as total_paid
  from overseas_sdk_log.all_app_pay_log
  where paid_status = 1
    and paid_date_s >= 1704038400
    and corder_year >= 2024
  group by report_date, papp_id, ad_cch_id, system, region
)
select
  'oversea'::varchar as "平台",
  COALESCE(agg.region, pay.region) as "地区",
  COALESCE(agg.ad_cch_id, pay.ad_cch_id) as pad_id,
  COALESCE(agg.papp_id, pay.papp_id) as papp_id,
  case when COALESCE(agg.report_date, pay.report_date) > 0
    and LENGTH(cast(COALESCE(agg.report_date, pay.report_date) as TEXT)) = 8
    then TO_DATE(cast(COALESCE(agg.report_date, pay.report_date) as TEXT), 'YYYYMMDD')::date
  end as "日期",
  COALESCE(agg."新增进入", 0) as "新增进入",
  COALESCE(agg."1日付费数", 0) as "1日付费数",
  COALESCE(agg."累计付费数", 0) as "累计付费数",
  COALESCE(agg."累计充值", 0) as "累计充值",
  COALESCE(pay.total_paid, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(agg.report_date, pay.report_date), COALESCE(agg.papp_id, pay.papp_id), COALESCE(agg.ad_cch_id, pay.ad_cch_id), COALESCE(agg.system, pay.system), COALESCE(agg.region, pay.region)), 0) as "充值流水",
  COALESCE(pay.pay_users, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(agg.report_date, pay.report_date), COALESCE(agg.papp_id, pay.papp_id), COALESCE(agg.ad_cch_id, pay.ad_cch_id), COALESCE(agg.system, pay.system), COALESCE(agg.region, pay.region)), 0) as "活跃付费",
  CASE WHEN ch.ad_cch_name IS NULL THEN '未知'
    WHEN ch.ad_cch_name = 'Rastar自然量' THEN '自然量'
    ELSE ch.ad_cch_name END as "媒体",
  COALESCE(agg.system, pay.system) as "渠道商[ID]",
  COALESCE(agg.system, pay.system) as "渠道商",
  pp.papp_name as "主游戏"
from agg
full outer join pay on
  agg.report_date = pay.report_date
  and agg.papp_id = pay.papp_id
  and agg.ad_cch_id = pay.ad_cch_id
  and agg.system = pay.system
  and agg.region = pay.region
left join xh_osdata_manage.ad_channel ch
  on COALESCE(agg.ad_cch_id, pay.ad_cch_id) = ch.id
left join xh_osdata_manage.part_papp pp
  on COALESCE(agg.papp_id, pay.papp_id) = pp.papp_id
```

### 4.5 渠道 / 媒体分析

**`final/oversea-channel.sql`**（66 行）

```sql
with
agg as (
  select
    report_date,
    ad_cch_id,
    papp_id,
    tid,
    system,
    region,
  SUM(ad_menoy) * 7 / 10000.0 as "消耗",
  SUM(before_cost) * 7 / 10000.0 as "返点后消耗",
  SUM(rt_device_num) as "新增进入"
  from overseas_report_data.ad_operate_data_report
  where report_date >= 20240101
    and ad_cch_id not in (59, 64)
  group by report_date, ad_cch_id, papp_id, tid, system, region
),
pay as (
  select
    TO_CHAR(TO_TIMESTAMP(paid_date_s), 'YYYYMMDD')::int as report_date,
    papp_id,
    ad_cch_id,
    case
      when cch_id = 101 then 'android'
      when cch_id = 102 then 'ios'
      else 'third'
    end as system,
    location_region as region,
    COUNT(distinct uid) as pay_users,
    SUM(paid_usd) * 7 / 10000.0 as total_paid
  from overseas_sdk_log.all_app_pay_log
  where paid_status = 1
    and paid_date_s >= 1704038400
    and corder_year >= 2024
  group by report_date, papp_id, ad_cch_id, system, region
)
select
  'oversea'::varchar as "平台",
  COALESCE(agg.region, pay.region) as "地区",
  COALESCE(agg.ad_cch_id, pay.ad_cch_id) as pad_id,
  COALESCE(agg.papp_id, pay.papp_id) as papp_id,
  case when COALESCE(agg.report_date, pay.report_date) > 0
    and LENGTH(cast(COALESCE(agg.report_date, pay.report_date) as TEXT)) = 8
    then TO_DATE(cast(COALESCE(agg.report_date, pay.report_date) as TEXT), 'YYYYMMDD')::date
  end as "日期",
  COALESCE(agg."消耗", 0) as "消耗",
  COALESCE(agg."返点后消耗", 0) as "返点后消耗",
  COALESCE(agg."新增进入", 0) as "新增进入",
  COALESCE(pay.total_paid, 0) / NULLIF(COUNT(*) OVER (PARTITION BY COALESCE(agg.report_date, pay.report_date), COALESCE(agg.papp_id, pay.papp_id), COALESCE(agg.ad_cch_id, pay.ad_cch_id), COALESCE(agg.system, pay.system), COALESCE(agg.region, pay.region)), 0) as "充值流水",
  CASE WHEN ch.ad_cch_name IS NULL THEN '未知'
    WHEN ch.ad_cch_name = 'Rastar自然量' THEN '自然量'
    ELSE ch.ad_cch_name END as "媒体",
  COALESCE(agg.system, pay.system) as "渠道商[ID]",
  COALESCE(agg.system, pay.system) as "渠道商",
  pp.papp_name as "主游戏"
from agg
full outer join pay on
  agg.report_date = pay.report_date
  and agg.papp_id = pay.papp_id
  and agg.ad_cch_id = pay.ad_cch_id
  and agg.system = pay.system
  and agg.region = pay.region
left join xh_osdata_manage.ad_channel ch
  on COALESCE(agg.ad_cch_id, pay.ad_cch_id) = ch.id
left join xh_osdata_manage.part_papp pp
  on COALESCE(agg.papp_id, pay.papp_id) = pp.papp_id
```


---

## 5. 查询链路如何复用（前端逻辑不用改）

除方案 A 要切换数据集 id 外，`query.ts` / `useAnalysisData` / 联邦合并 / 缓存 / 快照 / 预热都不需要改：

- **KPI**：`SELECT SUM(<度量>) … FROM (专题 SQL) WHERE 日期 …`（比率指标仍由 BI 层拆 `__num/__den` 并在合并后重算）；
- **趋势**：`GROUP BY 日期 ORDER BY 日期`；
- **明细**：`GROUP BY <当前维度> ORDER BY <排序指标> DESC LIMIT 500`；
- **下钻**：`GROUP BY <维度>, 日期`，30 天回溯、8000 行上限。

以「成本分析 KPI」为例，改造后实际下发的 SQL 形态（与现网生成方式一致，只是子查询换成了精简 SQL）：

```sql
SELECT sum("消耗") AS "消耗", sum("返点后消耗") AS "返点后消耗", sum("新增进入") AS "新增进入",
       SUM("返点后消耗") AS cpa__num, SUM("新增进入") AS cpa__den,
       SUM("返点后消耗") AS cpp__num, SUM("1日付费数") AS cpp__den
FROM (
  -- 见 3.1 成本分析 SQL
) AS virtual_table
WHERE "日期" >= TO_DATE('2026-10-11', 'YYYY-MM-DD')
  AND "日期" <  TO_DATE('2026-11-09', 'YYYY-MM-DD')
LIMIT 1
```

配套查询的处理建议：

- **大厅总览（近 30 天 4 张卡片）**：需要的字段是 `消耗 / 返点后消耗 / 新增进入 / 充值流水`，与「渠道 / 媒体分析」的字段完全一致 → 直接指向渠道专题数据集，不需要再写一份 SQL。
- **filter-values（5 个筛选列）**：建议**继续使用数据集 26**，避免候选值集合发生变化；它只占首屏 5 个请求且有 5 分钟缓存，后续可单独做「维度字典」优化（不在本次范围）。
- **快照 / 预热**：逻辑不变；建议把快照 `version` 从 2 提到 3，使旧快照自动失效，避免用旧数据 seed 缓存。
- **`/bi/federated-datasets`**：后端按数据集 `extra.federated.enabled` 返回，新增数据集会自动纳入；前端 `config/federatedDatasets.ts` 里的硬编码集合需要确认是否要补 id。

---

## 6. 数字一致性校验（实施前置门槛）

**方法**：以现网 `/bi/chart/data` 同一时间窗的 KPI 返回值为基准（数据集 26 + 38 联邦结果），把精简 SQL 在两侧分别执行，再按联邦规则（同维度相加、比率按 `SUM(num)/SUM(den)` 重算）还原，逐指标比对。窗口：各专题默认「近 30 天」的当前期与对比期（含成熟窗口前移逻辑），共 **68 个「指标 × 窗口」组合**。

**结果：54 个完全一致，其余 14 个差异 ≤0.09%，且与「同一时刻重跑现网 dataset」的漂移逐位相同**（例：成本/渠道的 `返点后消耗` 在两边都 +0.0707%，`累计付费数` 两边都 +0.09%），属源库实时补数，不是口径变化。

| 专题 | 校验项 | 结论 |
|---|---|---|
| 成本 | 消耗/返点后消耗/新增进入/cpa/cpp（2 窗口共 10 项） | 6 项完全一致；4 项为实时补数漂移（≤0.07%） |
| 留存 | 新增进入/2日留存率/1日付费数/1日付费率/7日、30日付费留存率（12 项） | 全部完全一致 |
| LTV-ROI | ltv_1/3/7/14/30、roi_1/3/7/14/30、累计roi（22 项） | 20 项完全一致；累计roi 差 0.005% |
| 付费 | 充值流水/累计充值/1日付费数/1日付费率/活跃付费/累计付费数（12 项） | 8 项完全一致；累计类 4 项差 ≤0.09%（实时补数） |
| 渠道 | 消耗/返点后消耗/新增进入/cpa/充值流水/流水ROI（12 项） | 8 项完全一致；4 项为实时补数漂移（≤0.07%） |

> 说明：两个源库都在实时写入，同一 SQL 隔 30 分钟重跑，`返点后消耗 / 累计充值 / 累计付费数` 这类会被回补的字段有千分位级自然漂移，不属于口径差异。留存专题不再扫消耗分支，KPI / 趋势数值完全一致；明细里「只有消耗、没有任何充值/留存」的行会从结果中消失（这些行该专题指标全为 0）。

---

## 7. 性能采样（共享测试库，绝对值波动较大）

每项为「单侧、单次 SQL、多次采样的中位数（秒）」，均为现网 KPI 窗口、相同时间范围；「裁剪+日期下推」是 §8.2 的二期能力，不具备数据集形态，仅供参考。

| 专题 | 现状·大陆 | 裁剪后·大陆 | 裁剪+日期下推·大陆 | 现状·海外 | 裁剪后·海外 | 裁剪+日期下推·海外 |
|---|---|---|---|---|---|---|
| 成本分析 | 2.15 | 2.10 | 1.77 | 0.66 | 0.39 | 0.29 |
| 留存分析 | 1.68 | 0.53 | 0.41 | 0.62 | 0.35 | 0.28 |
| LTV / ROI 分析 | 2.06 | 1.65 | 1.44 | 0.73 | 0.36 | 0.33 |
| 付费分析 | 2.24 | 1.64 | 1.75 | 0.67 | 0.83 | 0.44 |
| 渠道 / 媒体分析 | 2.41 | 1.75 | 1.43 | 0.82 | 0.66 | 0.38 |

结论：

1. **留存专题收益最大**：不再扫描消耗分支，大陆 1.68s → 0.53s（-68%），海外 0.62s → 0.35s（-44%）；
2. **渠道 / LTV-ROI** 大陆 -20%～-27%，海外 -20%～-51%（裁剪后 0.35–0.66s）；
3. **成本**：大陆基本持平（2.15s → 2.10s，仍要扫两侧大表），海外 -41%（0.66s → 0.39s）；
4. **付费**：大陆 -27%；海外静态版反而变慢（0.67s → 0.83s，聚合计划/共享库波动），加日期下推后为 0.44s——该专题建议直接走日期下推；
5. 页面请求数不变（3 个 chart-data + 5 个 filter-values），首屏墙钟收益小于单 SQL 收益；若目标是首屏明显低于现状，建议选方案 B 或至少做 §8.2 的日期下推，并配合数据库侧索引/物化汇总。

---

## 8. 实施步骤与改动清单（确认后执行）

### 8.1 方案 A 落地步骤

1. **元数据**：新建 5 个大陆虚拟数据集 + 5 个海外 partner 数据集；
   - 列元数据与 26/38 同名同类型（SQL 里已按现网列名输出，不能改名）；
   - 每个专题只复制自己用到的 saved metrics（见 §2，合计约 27 个表达式，不必搬 52 个）；海外 partner 数据集只需要列元数据 + SQL，**不需要**复制 saved metrics（BI 层拆比率后下发的是 `SUM(分子)/SUM(分母)` 的 adhoc 表达式）；
   - `extra.federated` 按专题配置 `databases: [aliyun, aliyun-oversea]` 与 `partner_dataset_id`。
2. **前端 4 处**：`topics.tsx` 加专题→数据集 id 映射；`useAnalysisOverview.ts` 指向渠道数据集；`filterValues.ts` 维持 26（建议）；`config/federatedDatasets.ts` 确认是否补 id。
3. **快照**：`snapshot.ts` 的 `version` 提到 3，旧快照自动失效。
4. **回归**：5 个专题 ×（首屏 / 切换专题 / 5 个筛选 / 维度拆解 / 行下钻 / 周视图 / 刷新）；对比改造前后 KPI 与明细前 N 行；确认 filter-values 候选值不变；确认快照 read/write 正常。
5. **回滚**：保留数据集 26/38 不删，切回 id 即回滚。

### 8.2 可选二期：把页面时间窗下推进 SQL

现状：Superset 2.3 的虚拟数据集 Jinja 上下文**不含** `from_dttm/to_dttm`（已核实 `get_sqla_query` 的 `template_kwargs`），所以数据集 SQL 只能写死 `report_date >= 20250101`，每次查询都要扫全历史。

做法（方案 A 的增强）：在专题 SQL 的日期条件下加标记 `/*BI_DATE_FILTER*/`，由 BI 层在生成 primary/partner SQL 后按当前 QueryObject 的 `from_dttm/to_dttm` 替换为 `and report_date >= YYYYMMDD and report_date < YYYYMMDD`。

```sql
-- 静态：where report_date >= 20250101 and papp_id != 61
-- 下推：where report_date >= 20261011 and report_date < 20261109 and papp_id != 61
```

实测下推收益见 §7「裁剪+日期下推」列；另外大陆消耗视图里的归档分支（`ad_deplete`，约 206 万行）没有日期索引，下推也无法裁剪，若要进一步提速需要数据库侧加索引或物化日汇总表。

---

## 9. 口径与风险清单（精简 SQL 必须保持）

1. **金额单位**：大陆全部是「元」；海外是 USD×10000，`*7/10000.0` 后是人民币元（固定汇率 7.0），不要重复换算。
2. **`papp_id != 61`**：三国群英传-霸王之业，其归因累计充值恒 0、但 op 表有充值，含入会严重拉低 ROI，必须保留过滤。
3. **不要选 `md_id`**：消耗视图里 14.1% 的 `md_traceid` 非数字，任何触达 `md_id` 的查询会直接报错；本方案 SQL 未选该列。
4. **时间窗是左闭右开**：`近 N 天` 实际覆盖 N-1 个自然日（页面标签仍显示 N 天），下钻已 +1 天补偿；不要顺手改成闭区间。
5. **成熟窗口**：留存 / LTV-ROI 的 KPI 与明细使用「整体前移 30 天」的成熟窗口，趋势不过滤、靠前端留空；SQL 本身不含该逻辑。
6. **充值流水 / 活跃付费**：保留原 `COUNT(*) OVER` 均摊（大陆实测放大 5.85× / 5.93×，海外 1.109×），保证明细按媒体/游戏拆分后的分配与现网一致；若要改成「按消耗占比分摊」属于业务口径决策，需另行确认。
7. **海外映射与除法取整**：`渠道商` 实际是 `system`；`媒体` 里 `ad_cch_id=0` 显示「未知」、id=7「Rastar自然量」映射「自然量」；`活跃付费` 是按行 `COUNT(DISTINCT uid)`、再除以 `COUNT(*)` 均摊，bigint 整除会截断——海外 agg 因此仍保留 `tid` 分组，与现网行为逐位一致；跨行相加会重复计数（现网如此，未改）。
8. **海外支付流水**：必须 `paid_status = 1`（否则含 1178 万行 `paid_date_s=0` 的无效记录）；时区按 PRC 自然日。
9. **脏值**：大陆视图有 `report_date=0`、4/7/9 位日期、`20261110` 未来日等，现网既有 SQL 已按 8 位长度过滤；精简 SQL 保持同样过滤。
10. **静态 SQL 的限制**：方案 A 无法把页面时间窗下推（见 §8.2）；`ad_deplete` 归档分支无日期索引；海外支付表若继续用 `TO_CHAR(TO_TIMESTAMP(...))` 会全分区扫描——本方案已改用 epoch + `corder_year`。

---

## 10. 待确认的问题

1. **落地形态**：选方案 A（每专题一个数据集，改前端 4 处）还是方案 B（后端直接执行专题 SQL，可下推日期）？
2. **留存明细行集合**：可以接受「只有消耗、无充值/留存」的全零行从明细中消失吗（KPI 数值不变）？若要 100% 行集一致，留存 SQL 需保留消耗分支（可提供附注版本）。
3. **filter-values**：维持使用数据集 26（候选值完全不变）是否可接受？
4. **未用指标列**：是否同意把 60/90 日、曝光/点击/下载、DAU、团队、商户充值、`[ID]` 列彻底从专题数据集移除（本次方案默认移除）？
5. **性能目标**：首屏是否有明确目标？若要求明显低于现状，建议一并排期方案 B / 日期下推 / 数据库索引或物化汇总。

---

## 附录：文件与证据

| 文件 | 内容 |
|---|---|
| `final/mainland-*.sql` | 大陆侧 5 份精简 SQL（§3） |
| `final/oversea-*.sql` | 海外侧 5 份精简 SQL（§4） |
| `build_trimmed.py` | 上述 SQL 的生成脚本（字段/分支/日期占位统一维护） |
| `measure_trimmed.py`、`verify-report.json` | 数字一致性校验脚本与报告 |
| `bench.py`、`bench-run*.json` | 性能采样脚本与原始数据 |
| `capture_baseline.py`、`baseline/`、`sides/` | 现网查询与两侧生成的 SQL 快照 |
| `inventory.md` | 前端查询/字段清单（含每专题请求数矩阵） |
| `source-schema.md` | 源表结构、粒度、索引、单位、放大因子核验 |
