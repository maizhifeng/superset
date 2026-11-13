"""Backend-side SQL execution for the /analysis topics (方案 B).

The analysis page does not use Superset datasets any more: each topic ships its
own trimmed SQL (mainland + oversea source) and the federated BI layer compiles
the chart query (dimensions / metrics / filters / order / limit) around it.
This keeps the dataset layer out of the read path while still reusing the
federated execution and ratio re-aggregation logic in ``api.py``.

The SQL statements carry ``/*BI_WINDOW:column:min:max*/`` markers.  The BI layer
replaces them with the window selected on the page, so a 30-day drill scans
30 days instead of the full history; branches that cannot intersect the window
are pruned with ``1 = 0``.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from dataclasses import dataclass, replace
from typing import Any

# ---------------------------------------------------------------------------
# Topic definitions
# ---------------------------------------------------------------------------

COST_MAINLAND_WIDE_SQL = r"""
with mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    SUM(ad_cost) as ad_cost,
    SUM(ad_real_cost) as ad_real_cost,
    SUM(coalesce(n_unum, na_devnum)) as n_unum,
    SUM(rt_paid_money_1) as rt_paid_money_1,
    SUM(paid_unum_1) as paid_unum_1
  from sj_report_data.report_sygame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id, pad_id
),
mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    SUM(ad_cost) as ad_cost,
    SUM(ad_real_cost) as ad_real_cost,
    SUM(act_num) as n_unum,
    SUM(rt_paid_money_1) as rt_paid_money_1,
    SUM(paid_unum_1) as paid_unum_1
  from sj_report_data.report_minigame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id, pad_id
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
  COALESCE(combined.ad_cost, 0) as "消耗",
  COALESCE(combined.ad_real_cost, 0) as "返点后消耗",
  COALESCE(combined.n_unum, 0) as "新增进入",
  COALESCE(combined.rt_paid_money_1, 0) as "1日充值",
  COALESCE(combined.paid_unum_1, 0) as "1日付费数"
from combined
left join ad_manager.ad_channel ch on combined.pad_id = ch.channel_id
left join sj_platform.part_channel pt on combined.cch_id = pt.cch_id
left join sj_platform.part_papp pp on combined.papp_id = pp.papp_id
"""

# Narrow sources used by the executed SQL.  These are the two branches the
# historical wide view unions internally (cost view + revenue table), so the
# result is identical while queries avoid expanding the 405-column view.
COST_MAINLAND_SQL = r"""
with raw as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    cost as ad_cost,
    real_cost as ad_real_cost,
    0::numeric as n_unum,
    0::numeric as rt_paid_money_1,
    0::numeric as paid_unum_1
  from sj_report_data.ad_deplete_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  union all
  select
    'mobile',
    report_date,
    cch_id,
    papp_id,
    pad_id,
    0::numeric,
    0::numeric,
    coalesce(n_unum, na_devnum),
    rt_paid_money_1,
    paid_unum_1
  from sj_report_data.ad_data_sum_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  union all
  select
    'mini_game',
    report_date,
    cch_id,
    papp_id,
    pad_id,
    cost,
    real_cost,
    0::numeric,
    0::numeric,
    0::numeric
  from sj_report_data.wxh5_ad_deplete_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  union all
  select
    'mini_game',
    report_date,
    cch_id,
    papp_id,
    pad_id,
    0::numeric,
    0::numeric,
    act_num,
    rt_paid_money_1,
    paid_unum_1
  from sj_report_data.wxh5_data_sum_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
),
combined as (
  select
    platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    sum(ad_cost) as ad_cost,
    sum(ad_real_cost) as ad_real_cost,
    sum(n_unum) as n_unum,
    sum(rt_paid_money_1) as rt_paid_money_1,
    sum(paid_unum_1) as paid_unum_1
  from raw
  group by platform, report_date, cch_id, papp_id, pad_id
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
  COALESCE(combined.ad_cost, 0) as "消耗",
  COALESCE(combined.ad_real_cost, 0) as "返点后消耗",
  COALESCE(combined.n_unum, 0) as "新增进入",
  COALESCE(combined.rt_paid_money_1, 0) as "1日充值",
  COALESCE(combined.paid_unum_1, 0) as "1日付费数"
from combined
left join ad_manager.ad_channel ch on combined.pad_id = ch.channel_id
left join sj_platform.part_channel pt on combined.cch_id = pt.cch_id
left join sj_platform.part_papp pp on combined.papp_id = pp.papp_id
"""

COST_OVERSEA_SQL = r"""with launch as (
  /*BI_LAUNCH_DATES*/
),
raw as (
  select
    -- 预约类投放（ad_type = 2）不按实际投放日记账：统一归到该游戏配置的上线首日，
    -- 这样任何从上线日开始的观察窗都会把预约成本计入首日。
    case when r.ad_type = 2 and launch.launch_day is not null
      then launch.launch_day
      else r.report_date end as report_date,
    r.ad_cch_id,
    r.papp_id,
    r.system,
    r.region,
    r.ad_menoy,
    r.before_cost,
    r.rt_device_num,
    r.paid_money,
    r.paid_num
  from overseas_report_data.ad_operate_data_report r
  left join launch on r.papp_id = launch.papp_id
  where r.report_date >= 20240101
    and r.ad_cch_id not in (59, 64)
    -- 预约行不受观察窗裁剪（它们的实际日期可能远早于窗口），普通行照常下推。
    and (
      r.ad_type = 2
      or (r.report_date >= 20240101 /*BI_WINDOW:report_date:20240101:99999999*/)
    )
),
agg as (
  select
    report_date,
    ad_cch_id,
    papp_id,
    system,
    region,
    SUM(ad_menoy) * 7 / 10000.0 as "消耗",
    SUM(before_cost) * 7 / 10000.0 as "返点后消耗",
    SUM(rt_device_num) as "新增进入",
    SUM(paid_money) * 7 / 10000.0 as "1日充值",
    SUM(paid_num) as "1日付费数"
  from raw
  group by report_date, ad_cch_id, papp_id, system, region
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
  COALESCE(agg."1日付费数", 0) as "1日付费数",
  CASE WHEN ch.ad_cch_name IS NULL THEN '未知'
    WHEN ch.ad_cch_name = 'Rastar自然量' then '自然量'
    ELSE ch.ad_cch_name END as "媒体",
  agg.system as "渠道商[ID]",
  agg.system as "渠道商",
  pp.papp_name as "主游戏"
from agg
left join xh_osdata_manage.ad_channel ch on agg.ad_cch_id = ch.id
left join xh_osdata_manage.part_papp pp on agg.papp_id = pp.papp_id"""


# ---------------------------------------------------------------------------
# 项目对比分析（project-compare）
# ---------------------------------------------------------------------------

# Historical wide-view counterpart of ``PROJECT_COMPARE_MAINLAND_SQL``.
# ``report_sygame_ad_data_view`` / ``report_minigame_ad_data_view`` already
# union the cost branch and the attribution branch, filling the columns a
# branch does not own with 0.  The narrow SQL below reads those two branches
# directly, so both variants must agree row by row (see analysis_consistency).
PROJECT_COMPARE_MAINLAND_WIDE_SQL = r"""
with mobile as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    SUM(ad_cost) as ad_cost,
    SUM(ad_real_cost) as ad_real_cost,
    SUM(coalesce(n_unum, na_devnum)) as n_unum,
    SUM(rt_paid_money_1) as rt_paid_money_1,
    SUM(paid_unum_1) as paid_unum_1,
    SUM(total_paid_money) as total_paid_money,
    SUM(total_paid_unum) as total_paid_unum,
    SUM(day2_dau) as day2_dau,
    SUM(day3_dau) as day3_dau,
    SUM(rt_paid_money_2) as rt_paid_money_2,
    SUM(rt_paid_money_3) as rt_paid_money_3,
    SUM(rt_paid_money_4) as rt_paid_money_4,
    SUM(rt_paid_money_5) as rt_paid_money_5,
    SUM(rt_paid_money_6) as rt_paid_money_6,
    SUM(rt_paid_money_7) as rt_paid_money_7,
    SUM(day7_dau) as day7_dau
  from sj_report_data.report_sygame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id, pad_id
),
mini_game as (
  select
    'mini_game' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    SUM(ad_cost) as ad_cost,
    SUM(ad_real_cost) as ad_real_cost,
    SUM(act_num) as n_unum,
    SUM(rt_paid_money_1) as rt_paid_money_1,
    SUM(paid_unum_1) as paid_unum_1,
    SUM(total_paid_money) as total_paid_money,
    SUM(total_paid_unum) as total_paid_unum,
    SUM(day2_dau) as day2_dau,
    SUM(day3_dau) as day3_dau,
    SUM(rt_paid_money_2) as rt_paid_money_2,
    SUM(rt_paid_money_3) as rt_paid_money_3,
    SUM(rt_paid_money_4) as rt_paid_money_4,
    SUM(rt_paid_money_5) as rt_paid_money_5,
    SUM(rt_paid_money_6) as rt_paid_money_6,
    SUM(rt_paid_money_7) as rt_paid_money_7,
    SUM(day7_dau) as day7_dau
  from sj_report_data.report_minigame_ad_data_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id, pad_id
),
combined as (
  select * from mobile
  union all
  select * from mini_game
),
operate as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    sum(p_money) as p_money,
    sum(switch_pay_amount) as merchant_paid
  from sj_report_data.opreate_data_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id
  union all
  select
    'mini_game',
    report_date,
    cch_id,
    papp_id,
    sum(p_money),
    sum(pos_p_money)
  from xh_report_data.wxh5_opreate_data_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id
),
joined as (
  select
    coalesce(c.platform, o.platform) as platform,
    coalesce(c.report_date, o.report_date) as report_date,
    coalesce(c.cch_id, o.cch_id) as cch_id,
    coalesce(c.papp_id, o.papp_id) as papp_id,
    coalesce(c.pad_id, 0) as pad_id,
    coalesce(c.ad_cost, 0) as ad_cost,
    coalesce(c.ad_real_cost, 0) as ad_real_cost,
    coalesce(c.n_unum, 0) as n_unum,
    coalesce(c.rt_paid_money_1, 0) as rt_paid_money_1,
    coalesce(c.paid_unum_1, 0) as paid_unum_1,
    coalesce(c.total_paid_money, 0) as total_paid_money,
    coalesce(c.total_paid_unum, 0) as total_paid_unum,
    coalesce(c.day2_dau, 0) as day2_dau,
    coalesce(c.day3_dau, 0) as day3_dau,
    coalesce(c.rt_paid_money_2, 0) as rt_paid_money_2,
    coalesce(c.rt_paid_money_3, 0) as rt_paid_money_3,
    coalesce(c.rt_paid_money_4, 0) as rt_paid_money_4,
    coalesce(c.rt_paid_money_5, 0) as rt_paid_money_5,
    coalesce(c.rt_paid_money_6, 0) as rt_paid_money_6,
    coalesce(c.rt_paid_money_7, 0) as rt_paid_money_7,
    coalesce(c.day7_dau, 0) as day7_dau,
    coalesce(o.p_money, 0) as op_money,
    coalesce(o.merchant_paid, 0) as op_merchant_paid,
    count(*) over (
      partition by coalesce(c.platform, o.platform),
                   coalesce(c.report_date, o.report_date),
                   coalesce(c.cch_id, o.cch_id),
                   coalesce(c.papp_id, o.papp_id)
    ) as rows_per_key
  from combined c
  full outer join operate o
    on c.platform = o.platform
   and c.report_date = o.report_date
   and c.cch_id = o.cch_id
   and c.papp_id = o.papp_id
),
distributed as (
  select
    platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ad_cost,
    ad_real_cost,
    n_unum,
    rt_paid_money_1,
    paid_unum_1,
    total_paid_money,
    total_paid_unum,
    day2_dau,
    day3_dau,
    rt_paid_money_2,
    rt_paid_money_3,
    rt_paid_money_4,
    rt_paid_money_5,
    rt_paid_money_6,
    rt_paid_money_7,
    day7_dau,
    op_money / nullif(rows_per_key, 0) as "充值流水",
    op_merchant_paid / nullif(rows_per_key, 0) as "商户充值"
  from joined
)
select
  case when distributed.report_date > 0
    and LENGTH(cast(distributed.report_date as TEXT)) = 8
    then TO_DATE(cast(distributed.report_date as TEXT), 'YYYYMMDD') end as "日期",
  distributed.platform as "平台",
  'mainland'::varchar as "地区",
  case when distributed.pad_id = 0 then '自然量' else ch.channel_name end as "媒体",
  pt.cch_name as "渠道商",
  pp.papp_name as "主游戏",
  COALESCE(distributed.ad_cost, 0) as "消耗",
  COALESCE(distributed.ad_real_cost, 0) as "返点后消耗",
  COALESCE(distributed.n_unum, 0) as "新增进入",
  COALESCE(distributed.day2_dau, 0) as "2日留存数",
  COALESCE(distributed.day3_dau, 0) as "3日留存数",
  COALESCE(distributed.rt_paid_money_2, 0) as "2日充值",
  COALESCE(distributed.rt_paid_money_3, 0) as "3日充值",
  COALESCE(distributed.rt_paid_money_4, 0) as "4日充值",
  COALESCE(distributed.rt_paid_money_5, 0) as "5日充值",
  COALESCE(distributed.rt_paid_money_6, 0) as "6日充值",
  COALESCE(distributed.rt_paid_money_7, 0) as "7日充值",
  COALESCE(distributed.day7_dau, 0) as "7日留存数",
  COALESCE(distributed."充值流水", 0) as "充值流水",
  COALESCE(distributed."商户充值", 0) as "商户充值",
  COALESCE(distributed.rt_paid_money_1, 0) as "1日充值",
  COALESCE(distributed.paid_unum_1, 0) as "1日付费数",
  COALESCE(distributed.total_paid_money, 0) as "累计充值",
  COALESCE(distributed.total_paid_unum, 0) as "累计付费数"
from distributed
left join ad_manager.ad_channel ch on distributed.pad_id = ch.channel_id
left join sj_platform.part_channel pt on distributed.cch_id = pt.cch_id
left join sj_platform.part_papp pp on distributed.papp_id = pp.papp_id
"""

# Executed mainland SQL for ``project-compare``: the two cost branches plus the
# cumulative payment columns the attribution branch owns (the cost branch fills
# them with 0).  The project-comparison view passes each project's aligned
# window as ``time_range``, so ``BI_WINDOW`` still prunes the branches.
PROJECT_COMPARE_MAINLAND_SQL = r"""
with raw as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    cost as ad_cost,
    real_cost as ad_real_cost,
    0::numeric as n_unum,
    0::numeric as rt_paid_money_1,
    0::numeric as paid_unum_1,
    0::numeric as total_paid_money,
    0::numeric as total_paid_unum,
    0::numeric as day2_dau,
    0::numeric as day3_dau,
    0::numeric as rt_paid_money_2,
    0::numeric as rt_paid_money_3,
    0::numeric as rt_paid_money_4,
    0::numeric as rt_paid_money_5,
    0::numeric as rt_paid_money_6,
    0::numeric as rt_paid_money_7,
    0::numeric as day7_dau
  from sj_report_data.ad_deplete_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  union all
  select
    'mobile',
    report_date,
    cch_id,
    papp_id,
    pad_id,
    0::numeric,
    0::numeric,
    coalesce(n_unum, na_devnum),
    rt_paid_money_1,
    paid_unum_1,
    total_paid_money,
    total_paid_unum,
    day2_dau,
    day3_dau,
    rt_paid_money_2,
    rt_paid_money_3,
    rt_paid_money_4,
    rt_paid_money_5,
    rt_paid_money_6,
    rt_paid_money_7,
    day7_dau
  from sj_report_data.ad_data_sum_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  union all
  select
    'mini_game',
    report_date,
    cch_id,
    papp_id,
    pad_id,
    cost,
    real_cost,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric,
    0::numeric
  from sj_report_data.wxh5_ad_deplete_view
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  union all
  select
    'mini_game',
    report_date,
    cch_id,
    papp_id,
    pad_id,
    0::numeric,
    0::numeric,
    act_num,
    rt_paid_money_1,
    paid_unum_1,
    total_paid_money,
    total_paid_unum,
    day2_dau,
    day3_dau,
    rt_paid_money_2,
    rt_paid_money_3,
    rt_paid_money_4,
    rt_paid_money_5,
    rt_paid_money_6,
    rt_paid_money_7,
    day7_dau
  from sj_report_data.wxh5_data_sum_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
),
combined as (
  select
    platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    sum(ad_cost) as ad_cost,
    sum(ad_real_cost) as ad_real_cost,
    sum(n_unum) as n_unum,
    sum(rt_paid_money_1) as rt_paid_money_1,
    sum(paid_unum_1) as paid_unum_1,
    sum(total_paid_money) as total_paid_money,
    sum(total_paid_unum) as total_paid_unum,
    sum(day2_dau) as day2_dau,
    sum(day3_dau) as day3_dau,
    sum(rt_paid_money_2) as rt_paid_money_2,
    sum(rt_paid_money_3) as rt_paid_money_3,
    sum(rt_paid_money_4) as rt_paid_money_4,
    sum(rt_paid_money_5) as rt_paid_money_5,
    sum(rt_paid_money_6) as rt_paid_money_6,
    sum(rt_paid_money_7) as rt_paid_money_7,
    sum(day7_dau) as day7_dau
  from raw
  group by platform, report_date, cch_id, papp_id, pad_id
),
-- 充值流水 / 商户充值 come from the operate tables, which are keyed by
-- (report_date, cch_id, papp_id) only.  Legacy dataset 26 spread those totals
-- over the ad rows of the key with a window COUNT; the same idea is kept here
-- so summing any media subset still recovers the exact operate total.
operate as (
  select
    'mobile' as platform,
    report_date,
    cch_id,
    papp_id,
    sum(p_money) as p_money,
    sum(switch_pay_amount) as merchant_paid
  from sj_report_data.opreate_data_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id
  union all
  select
    'mini_game',
    report_date,
    cch_id,
    papp_id,
    sum(p_money),
    sum(pos_p_money)
  from xh_report_data.wxh5_opreate_data_report
  where report_date >= 20250101 and papp_id != 61
    /*BI_WINDOW:report_date:20250101:99999999*/
  group by report_date, cch_id, papp_id
),
joined as (
  select
    coalesce(c.platform, o.platform) as platform,
    coalesce(c.report_date, o.report_date) as report_date,
    coalesce(c.cch_id, o.cch_id) as cch_id,
    coalesce(c.papp_id, o.papp_id) as papp_id,
    coalesce(c.pad_id, 0) as pad_id,
    coalesce(c.ad_cost, 0) as ad_cost,
    coalesce(c.ad_real_cost, 0) as ad_real_cost,
    coalesce(c.n_unum, 0) as n_unum,
    coalesce(c.rt_paid_money_1, 0) as rt_paid_money_1,
    coalesce(c.paid_unum_1, 0) as paid_unum_1,
    coalesce(c.total_paid_money, 0) as total_paid_money,
    coalesce(c.total_paid_unum, 0) as total_paid_unum,
    coalesce(c.day2_dau, 0) as day2_dau,
    coalesce(c.day3_dau, 0) as day3_dau,
    coalesce(c.rt_paid_money_2, 0) as rt_paid_money_2,
    coalesce(c.rt_paid_money_3, 0) as rt_paid_money_3,
    coalesce(c.rt_paid_money_4, 0) as rt_paid_money_4,
    coalesce(c.rt_paid_money_5, 0) as rt_paid_money_5,
    coalesce(c.rt_paid_money_6, 0) as rt_paid_money_6,
    coalesce(c.rt_paid_money_7, 0) as rt_paid_money_7,
    coalesce(c.day7_dau, 0) as day7_dau,
    coalesce(o.p_money, 0) as op_money,
    coalesce(o.merchant_paid, 0) as op_merchant_paid,
    count(*) over (
      partition by coalesce(c.platform, o.platform),
                   coalesce(c.report_date, o.report_date),
                   coalesce(c.cch_id, o.cch_id),
                   coalesce(c.papp_id, o.papp_id)
    ) as rows_per_key
  from combined c
  full outer join operate o
    on c.platform = o.platform
   and c.report_date = o.report_date
   and c.cch_id = o.cch_id
   and c.papp_id = o.papp_id
),
distributed as (
  select
    platform,
    report_date,
    cch_id,
    papp_id,
    pad_id,
    ad_cost,
    ad_real_cost,
    n_unum,
    rt_paid_money_1,
    paid_unum_1,
    total_paid_money,
    total_paid_unum,
    day2_dau,
    day3_dau,
    rt_paid_money_2,
    rt_paid_money_3,
    rt_paid_money_4,
    rt_paid_money_5,
    rt_paid_money_6,
    rt_paid_money_7,
    day7_dau,
    op_money / nullif(rows_per_key, 0) as "充值流水",
    op_merchant_paid / nullif(rows_per_key, 0) as "商户充值"
  from joined
)
select
  case when distributed.report_date > 0
    and LENGTH(cast(distributed.report_date as TEXT)) = 8
    then TO_DATE(cast(distributed.report_date as TEXT), 'YYYYMMDD') end as "日期",
  distributed.platform as "平台",
  'mainland'::varchar as "地区",
  case when distributed.pad_id = 0 then '自然量' else ch.channel_name end as "媒体",
  pt.cch_name as "渠道商",
  pp.papp_name as "主游戏",
  COALESCE(distributed.ad_cost, 0) as "消耗",
  COALESCE(distributed.ad_real_cost, 0) as "返点后消耗",
  COALESCE(distributed.n_unum, 0) as "新增进入",
  COALESCE(distributed.day2_dau, 0) as "2日留存数",
  COALESCE(distributed.day3_dau, 0) as "3日留存数",
  COALESCE(distributed.rt_paid_money_2, 0) as "2日充值",
  COALESCE(distributed.rt_paid_money_3, 0) as "3日充值",
  COALESCE(distributed.rt_paid_money_4, 0) as "4日充值",
  COALESCE(distributed.rt_paid_money_5, 0) as "5日充值",
  COALESCE(distributed.rt_paid_money_6, 0) as "6日充值",
  COALESCE(distributed.rt_paid_money_7, 0) as "7日充值",
  COALESCE(distributed.day7_dau, 0) as "7日留存数",
  COALESCE(distributed."充值流水", 0) as "充值流水",
  COALESCE(distributed."商户充值", 0) as "商户充值",
  COALESCE(distributed.rt_paid_money_1, 0) as "1日充值",
  COALESCE(distributed.paid_unum_1, 0) as "1日付费数",
  COALESCE(distributed.total_paid_money, 0) as "累计充值",
  COALESCE(distributed.total_paid_unum, 0) as "累计付费数"
from distributed
left join ad_manager.ad_channel ch on distributed.pad_id = ch.channel_id
left join sj_platform.part_channel pt on distributed.cch_id = pt.cch_id
left join sj_platform.part_papp pp on distributed.papp_id = pp.papp_id
"""

# Oversea side of ``project-compare``: ``COST_OVERSEA_SQL`` plus the cumulative
# payment columns (USD * 10000 converted to RMB with the fixed 7.0 rate).
PROJECT_COMPARE_OVERSEA_SQL = r"""with launch as (
  /*BI_LAUNCH_DATES*/
),
raw as (
  select
    -- ad_type = 2 是预约/品牌类投放，没有归因新增与充值；把它们统一记到该游戏
    -- 配置的上线首日，避免“预约成本”散落在上线前被观察窗裁掉。
    case when r.ad_type = 2 and launch.launch_day is not null
      then launch.launch_day
      else r.report_date end as report_date,
    r.ad_cch_id,
    r.papp_id,
    r.system,
    r.region,
    r.ad_menoy,
    r.before_cost,
    r.rt_device_num,
    r.rt_device_num_2,
    r.rt_device_num_3,
    r.rt_device_num_7,
    r.paid_money,
    r.paid_money_2,
    r.paid_money_3,
    r.paid_money_4,
    r.paid_money_5,
    r.paid_money_6,
    r.paid_money_7,
    r.paid_num,
    r.paid_money_total,
    r.paid_num_total
  from overseas_report_data.ad_operate_data_report r
  left join launch on r.papp_id = launch.papp_id
  where r.report_date >= 20240101
    and r.ad_cch_id not in (59, 64)
    and (
      r.ad_type = 2
      or (r.report_date >= 20240101 /*BI_WINDOW:report_date:20240101:99999999*/)
    )
),
agg as (
  select
    report_date,
    ad_cch_id,
    papp_id,
    system,
    region,
    SUM(ad_menoy) * 7 / 10000.0 as "消耗",
    SUM(before_cost) * 7 / 10000.0 as "返点后消耗",
    SUM(rt_device_num) as "新增进入",
    SUM(rt_device_num_2) as "2日留存数",
    SUM(rt_device_num_3) as "3日留存数",
    SUM(rt_device_num_7) as "7日留存数",
    SUM(paid_money) * 7 / 10000.0 as "1日充值",
    SUM(paid_money_2) * 7 / 10000.0 as "2日充值",
    SUM(paid_money_3) * 7 / 10000.0 as "3日充值",
    SUM(paid_money_4) * 7 / 10000.0 as "4日充值",
    SUM(paid_money_5) * 7 / 10000.0 as "5日充值",
    SUM(paid_money_6) * 7 / 10000.0 as "6日充值",
    SUM(paid_money_7) * 7 / 10000.0 as "7日充值",
    SUM(paid_num) as "1日付费数",
    SUM(paid_money_total) * 7 / 10000.0 as "累计充值",
    SUM(paid_num_total) as "累计付费数"
  from raw
  group by report_date, ad_cch_id, papp_id, system, region
),
-- 充值流水 / 商户充值: 按支付日期的实际到账（pay log），与旧 dataset 38 同一口径
-- （paid_status = 1；商户充值扣除 payment_id 19/20 的商店税）。
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
    SUM(paid_usd) * 7 / 10000.0 as total_paid,
    SUM(case when payment_id in (19, 20) then 0 else paid_tax_usd end)
      * 7 / 10000.0 as merchant_paid
  from overseas_sdk_log.all_app_pay_log
  where paid_status = 1
    and paid_date_s >= extract(epoch from timestamptz '2024-01-01 00:00:00+08') - 86400
    /*BI_EPOCH_WINDOW:paid_date_s*/
  group by report_date, papp_id, ad_cch_id, system, region
),
joined as (
  select
    coalesce(a.report_date, p.report_date) as report_date,
    coalesce(a.ad_cch_id, p.ad_cch_id) as ad_cch_id,
    coalesce(a.papp_id, p.papp_id) as papp_id,
    coalesce(a.system, p.system) as system,
    coalesce(a.region, p.region) as region,
    a."消耗",
    a."返点后消耗",
    a."新增进入",
    a."2日留存数",
    a."3日留存数",
    a."7日留存数",
    a."1日充值",
    a."2日充值",
    a."3日充值",
    a."4日充值",
    a."5日充值",
    a."6日充值",
    a."7日充值",
    a."1日付费数",
    a."累计充值",
    a."累计付费数",
    coalesce(p.total_paid, 0) as "充值流水",
    coalesce(p.merchant_paid, 0) as "商户充值"
  from agg a
  full outer join pay p
    on a.report_date = p.report_date
   and a.papp_id = p.papp_id
   and a.ad_cch_id = p.ad_cch_id
   and a.system = p.system
   and a.region = p.region
)
select
  'oversea'::varchar as "平台",
  joined.region as "地区",
  joined.ad_cch_id as pad_id,
  joined.papp_id as papp_id,
  case when joined.report_date > 0
    and LENGTH(cast(joined.report_date as TEXT)) = 8
    then TO_DATE(cast(joined.report_date as TEXT), 'YYYYMMDD')::date
  end as "日期",
  COALESCE(joined."消耗", 0) as "消耗",
  COALESCE(joined."返点后消耗", 0) as "返点后消耗",
  COALESCE(joined."新增进入", 0) as "新增进入",
  COALESCE(joined."2日留存数", 0) as "2日留存数",
  COALESCE(joined."3日留存数", 0) as "3日留存数",
  COALESCE(joined."7日留存数", 0) as "7日留存数",
  COALESCE(joined."2日充值", 0) as "2日充值",
  COALESCE(joined."3日充值", 0) as "3日充值",
  COALESCE(joined."4日充值", 0) as "4日充值",
  COALESCE(joined."5日充值", 0) as "5日充值",
  COALESCE(joined."6日充值", 0) as "6日充值",
  COALESCE(joined."7日充值", 0) as "7日充值",
  COALESCE(joined."充值流水", 0) as "充值流水",
  COALESCE(joined."商户充值", 0) as "商户充值",
  COALESCE(joined."1日充值", 0) as "1日充值",
  COALESCE(joined."1日付费数", 0) as "1日付费数",
  COALESCE(joined."累计充值", 0) as "累计充值",
  COALESCE(joined."累计付费数", 0) as "累计付费数",
  CASE WHEN ch.ad_cch_name IS NULL THEN '未知'
    WHEN ch.ad_cch_name = 'Rastar自然量' then '自然量'
    ELSE ch.ad_cch_name END as "媒体",
  joined.system as "渠道商[ID]",
  joined.system as "渠道商",
  pp.papp_name as "主游戏"
from joined
left join xh_osdata_manage.ad_channel ch on joined.ad_cch_id = ch.id
left join xh_osdata_manage.part_papp pp on joined.papp_id = pp.papp_id"""


@dataclass(frozen=True)
class TopicSource:
    """One federated side of a topic."""

    database: str
    catalog: str | None
    schema: str | None
    sql: str


@dataclass(frozen=True)
class AnalysisTopic:
    """A /analysis topic rendered from trimmed SQL instead of a dataset."""

    id: str
    title: str
    dimensions: tuple[str, ...]
    date_column: str
    # metric name -> aggregate expression over the topic SQL (``SUM(...)``
    # based; ratio metrics match ``_RATIO_METRIC_RE`` and are split into
    # numerator/denominator components before the cross-database merge).
    metrics: dict[str, str]
    mainland: TopicSource
    oversea: TopicSource


ANALYSIS_TOPICS: dict[str, AnalysisTopic] = {
    "cost": AnalysisTopic(
        id="cost",
        title="成本分析",
        dimensions=("日期", "平台", "地区", "媒体", "渠道商", "主游戏"),
        date_column="日期",
        metrics={
            "cpa": 'CAST(SUM("返点后消耗") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)',
            "cpp": 'CAST(SUM("返点后消耗") AS NUMERIC) / NULLIF(SUM("1日付费数"), 0)',
            "自然新增%": (
                'CAST(SUM(CASE WHEN "媒体" = \'自然量\' THEN "新增进入" ELSE 0 END)'
                ' AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'
            ),
            "ltv_1": 'CAST(SUM("1日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)',
            "roi_1": 'CAST(SUM("1日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)',
        },
        mainland=TopicSource(
            database="aliyun", catalog="sdk_data", schema=None, sql=COST_MAINLAND_SQL
        ),
        oversea=TopicSource(
            database="aliyun-oversea",
            catalog="overseas_sdk_data",
            schema="overseas_report_data",
            sql=COST_OVERSEA_SQL,
        ),
    ),
    "project-compare": AnalysisTopic(
        id="project-compare",
        title="项目对比分析",
        dimensions=("日期", "平台", "地区", "媒体", "渠道商", "主游戏"),
        date_column="日期",
        metrics={
            "cpa": 'CAST(SUM("返点后消耗") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)',
            "cpp": 'CAST(SUM("返点后消耗") AS NUMERIC) / NULLIF(SUM("1日付费数"), 0)',
            "自然新增%": (
                'CAST(SUM(CASE WHEN "媒体" = \'自然量\' THEN "新增进入" ELSE 0 END)'
                ' AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'
            ),
            "ltv_1": 'CAST(SUM("1日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)',
            "roi_1": 'CAST(SUM("1日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)',
            "ltv_cum": (
                'CAST(SUM("累计充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'
            ),
            "累计roi": (
                'CAST(SUM("累计充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'
            ),
            "流水ROI": (
                'CAST(SUM("充值流水") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'
            ),
            "1日付费率": (
                'CAST(SUM("1日付费数") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'
            ),
            "2日留存率": (
                'CAST(SUM("2日留存数") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'
            ),
            "7日留存率": (
                'CAST(SUM("7日留存数") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'
            ),
            "ltv_2": ('CAST(SUM("2日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'),
            "ltv_3": ('CAST(SUM("3日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'),
            "ltv_4": ('CAST(SUM("4日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'),
            "ltv_5": ('CAST(SUM("5日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'),
            "ltv_6": ('CAST(SUM("6日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'),
            "ltv_7": ('CAST(SUM("7日充值") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'),
            "roi_2": ('CAST(SUM("2日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'),
            "roi_3": ('CAST(SUM("3日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'),
            "roi_4": ('CAST(SUM("4日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'),
            "roi_5": ('CAST(SUM("5日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'),
            "roi_6": ('CAST(SUM("6日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'),
            "roi_7": ('CAST(SUM("7日充值") AS NUMERIC) / NULLIF(SUM("返点后消耗"), 0)'),
            "3日留存率": (
                'CAST(SUM("3日留存数") AS NUMERIC) / NULLIF(SUM("新增进入"), 0)'
            ),
        },
        mainland=TopicSource(
            database="aliyun",
            catalog="sdk_data",
            schema=None,
            sql=PROJECT_COMPARE_MAINLAND_SQL,
        ),
        oversea=TopicSource(
            database="aliyun-oversea",
            catalog="overseas_sdk_data",
            schema="overseas_report_data",
            sql=PROJECT_COMPARE_OVERSEA_SQL,
        ),
    ),
}


class AnalysisCompileError(ValueError):
    """Raised when a query cannot be compiled for a topic."""


# ---------------------------------------------------------------------------
# Date window markers
# ---------------------------------------------------------------------------

_WINDOW_MARKER_RE = re.compile(
    r"/\*BI_WINDOW:(?P<column>[A-Za-z_][A-Za-z0-9_]*):(?P<min_date>\d{8}):(?P<max_date>\d{8})\*/"
)
_DATE_RANGE_RE = re.compile(
    r"^\s*(?P<start>\d{4}-\d{2}-\d{2})\s*:\s*(?P<end>\d{4}-\d{2}-\d{2})\s*$"
)


def parse_time_range(time_range: Any) -> tuple[str, str] | None:
    """Parse ``"YYYY-MM-DD : YYYY-MM-DD"`` (end exclusive) into ISO dates."""
    if not isinstance(time_range, str):
        return None
    match = _DATE_RANGE_RE.match(time_range)
    if not match:
        return None
    return match.group("start"), match.group("end")


_EPOCH_WINDOW_MARKER_RE = re.compile(
    r"/\*BI_EPOCH_WINDOW:(?P<column>[A-Za-z_][A-Za-z0-9_]*)\*/"
)


def apply_epoch_window_markers(sql: str, window: tuple[str, str] | None) -> str:
    """Push the selected window into ``/*BI_EPOCH_WINDOW:col*/`` markers.

    Used by tables whose date column is an epoch-seconds value (the oversea pay
    log's ``paid_date_s``).  A one-day margin is applied so the filter is a safe
    superset under any DB session timezone; the outer ``日期`` predicate still
    enforces the exact window.  ``corder_year`` is added because it is the LIST
    partition key, which keeps the scan to the relevant partitions.
    """
    if not sql or "BI_EPOCH_WINDOW:" not in sql:
        return sql
    if window is None:
        return _EPOCH_WINDOW_MARKER_RE.sub("", sql)
    start, end = window
    start_year = int(start[:4]) - 1
    end_year = int(end[:4]) + 1

    def _replace(match: re.Match[str]) -> str:
        column = match.group("column")
        lower = f"extract(epoch from timestamptz '{start} 00:00:00+08')"
        upper = f"extract(epoch from timestamptz '{end} 00:00:00+08')"
        return (
            f" and {column} >= {lower} - 86400"
            f" and {column} < {upper} + 86400"
            f" and corder_year between {start_year} and {end_year}"
        )

    return _EPOCH_WINDOW_MARKER_RE.sub(_replace, sql)


def apply_window_markers(sql: str, window: tuple[str, str] | None) -> str:
    """Push the selected window into ``/*BI_WINDOW:col:min:max*/`` markers."""
    if not sql or "BI_WINDOW:" not in sql:
        return sql
    bounds = None
    if window is not None:
        bounds = (
            int(window[0].replace("-", "")),
            int(window[1].replace("-", "")),
        )

    def _replace(match: re.Match[str]) -> str:
        if bounds is None:
            return ""
        start, end = bounds
        column = match.group("column")
        branch_min = int(match.group("min_date"))
        branch_max = int(match.group("max_date"))
        if start > branch_max or end - 1 < branch_min:
            return " and 1 = 0"
        return f" and {column} >= {start} and {column} < {end}"

    return _WINDOW_MARKER_RE.sub(_replace, sql)


# ---------------------------------------------------------------------------
# Launch-date injection (oversea reservation spend)
# ---------------------------------------------------------------------------

# The oversea source records reservation/brand campaigns with ``ad_type = 2``.
# Those rows have no attributed installs or payments and may be dated weeks
# before launch, so the topic SQL re-dates them to the project's configured
# launch day.  Launch dates live in the Superset metadata DB, not in the data
# source, so they are injected into the ``/*BI_LAUNCH_DATES*/`` marker at
# compile time as a literal mapping (small, bounded by the number of projects).
_LAUNCH_DATES_MARKER = "/*BI_LAUNCH_DATES*/"


def launch_dates_sql(launch_dates: Mapping[int, int] | None) -> str:
    """Render the injected launch-date map as a table expression."""
    if not launch_dates:
        # Keep the SQL valid (and empty) when metadata has no launch dates.
        return "select null::bigint as papp_id, null::bigint as launch_day where 1 = 0"
    rows = ", ".join(
        f"({int(papp_id)}, {int(launch_day)})"
        for papp_id, launch_day in sorted(launch_dates.items())
    )
    # Only integer ids/dates from the metadata configuration are interpolated.
    return f"select * from (values {rows}) as t(papp_id, launch_day)"  # noqa: S608


def apply_launch_dates(sql: str, launch_dates: Mapping[int, int] | None) -> str:
    """Replace the launch-date marker with the compiled ``VALUES`` mapping."""
    if not sql or _LAUNCH_DATES_MARKER not in sql:
        return sql
    return sql.replace(_LAUNCH_DATES_MARKER, launch_dates_sql(launch_dates))


# ---------------------------------------------------------------------------
# Query compilation
# ---------------------------------------------------------------------------

_RATIO_METRIC_RE = re.compile(
    r"^CAST\(\s*SUM\((?P<num>.*)\)\s+AS\s+(?:NUMERIC|DOUBLE|DECIMAL(?:\s*\(\s*\d+\s*(?:,\s*\d+\s*)?\))?)\s*\)"
    r"\s*/\s*NULLIF\(\s*SUM\((?P<den>.*)\)\s*,\s*0\s*\)\s*$",
    re.IGNORECASE | re.DOTALL,
)


def _quote_identifier(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def _sql_literal(value: Any) -> str:
    if value is None:
        return "NULL"
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, (int, float)):
        return str(value)
    return "'" + str(value).replace("'", "''") + "'"


@dataclass
class CompiledAnalysisQuery:
    """One query compiled for both federated sides."""

    mainland_sql: str
    oversea_sql: str
    labels: list[str]
    dimensions: list[str]
    metric_labels: list[str]
    ratio_components: dict[str, tuple[str, str]]


def _split_metric(entry: Any, topic: AnalysisTopic) -> list[tuple[str, str]]:
    """Resolve one requested metric into ``(alias, select_expression)`` pairs."""
    if isinstance(entry, str):
        expression = topic.metrics.get(entry)
        if not expression:
            raise AnalysisCompileError(f"unknown metric: {entry}")
        ratio = _RATIO_METRIC_RE.match(expression)
        if ratio:
            return [
                (f"{entry}__num", f"SUM({ratio.group('num')})"),
                (f"{entry}__den", f"SUM({ratio.group('den')})"),
            ]
        return [(entry, expression)]
    if isinstance(entry, dict):
        expression_type = entry.get("expressionType")
        if expression_type == "SIMPLE":
            column = (entry.get("column") or {}).get("column_name")
            label = entry.get("label") or column
            aggregate = entry.get("aggregate") or "SUM"
            if not column or not label:
                raise AnalysisCompileError("ad-hoc SUM metric needs a column and label")
            if aggregate.upper() != "SUM":
                raise AnalysisCompileError(
                    f"unsupported aggregation for analysis metric: {aggregate}"
                )
            return [(label, f"SUM({_quote_identifier(column)})")]
        if expression_type == "SQL":
            sql_expression = entry.get("sqlExpression")
            label = entry.get("label")
            if not sql_expression or not label:
                raise AnalysisCompileError(
                    "ad-hoc SQL metric needs expression and label"
                )
            return [(label, f"SUM({sql_expression})")]
    raise AnalysisCompileError(f"unsupported metric entry: {entry!r}")


def _filter_predicate(filters: list[dict[str, Any]], topic: AnalysisTopic) -> list[str]:
    predicates: list[str] = []
    for item in filters or []:
        if not isinstance(item, dict):
            continue
        column = item.get("col")
        op = str(item.get("op") or "").upper()
        value = item.get("val")
        if column not in topic.dimensions or not op:
            continue
        if op in ("IN", "NOT IN"):
            values = value if isinstance(value, (list, tuple)) else [value]
            values = [v for v in values if v not in (None, "")]
            if not values:
                continue
            literals = ", ".join(_sql_literal(v) for v in values)
            operator = "IN" if op == "IN" else "NOT IN"
            predicates.append(f"{_quote_identifier(column)} {operator} ({literals})")
        elif op in ("=", "=="):
            predicates.append(f"{_quote_identifier(column)} = {_sql_literal(value)}")
        elif op in ("!=", "<>"):
            predicates.append(f"{_quote_identifier(column)} != {_sql_literal(value)}")
        elif op in ("IS NULL",):
            predicates.append(f"{_quote_identifier(column)} IS NULL")
        elif op in ("IS NOT NULL",):
            predicates.append(f"{_quote_identifier(column)} IS NOT NULL")
        else:
            raise AnalysisCompileError(f"unsupported filter operator: {op}")
    return predicates


def _order_by_clause(query: dict[str, Any], topic: AnalysisTopic) -> str:
    orderby = query.get("orderby") or []
    if not orderby:
        return ""
    entry = orderby[0]
    if not isinstance(entry, (list, tuple)) or not entry:
        return ""
    column = entry[0]
    if isinstance(column, list):
        column = column[0] if column else None
    ascending = bool(entry[1]) if len(entry) > 1 else True
    direction = "ASC" if ascending else "DESC"
    if not isinstance(column, str):
        return ""
    if column in topic.dimensions:
        return f" ORDER BY {_quote_identifier(column)} {direction}"
    expression = topic.metrics.get(column)
    if expression:
        ratio = _RATIO_METRIC_RE.match(expression)
        if ratio:
            return (
                " ORDER BY (SUM("
                + ratio.group("num")
                + ")) / NULLIF(SUM("
                + ratio.group("den")
                + f"), 0) {direction}"
            )
        return f" ORDER BY {expression} {direction}"
    # ad-hoc metric labels are plain columns ("返点后消耗", "充值流水", ...)
    if column in topic.dimensions:
        return f" ORDER BY {_quote_identifier(column)} {direction}"
    return f" ORDER BY {_quote_identifier(column)} {direction}"


def compile_query(  # noqa: C901
    topic: AnalysisTopic,
    query: dict[str, Any],
    launch_dates: Mapping[int, int] | None = None,
) -> CompiledAnalysisQuery:
    """Compile one analysis QueryObject into per-side SQL.

    ``launch_dates`` maps oversea project ids to their configured launch day
    (``YYYYMMDD``); it is injected into the topic SQL so reservation spend
    (``ad_type = 2``) is booked on the launch day instead of its original date.
    """
    if not isinstance(query, dict):
        raise AnalysisCompileError("query must be an object")
    # Deduplicate while preserving order: the date view's drill queries used to
    # send ("日期", "日期"), which made pandas groupby raise on duplicate labels.
    groupby = list(dict.fromkeys(str(item) for item in (query.get("groupby") or [])))
    unknown = [item for item in groupby if item not in topic.dimensions]
    if unknown:
        raise AnalysisCompileError(
            f"unsupported groupby column(s): {', '.join(unknown)}"
        )

    metrics = query.get("metrics") or []
    select_parts: list[str] = [_quote_identifier(name) for name in groupby]
    labels: list[str] = list(groupby)
    metric_labels: list[str] = []
    ratio_components: dict[str, tuple[str, str]] = {}
    for entry in metrics:
        pairs = _split_metric(entry, topic)
        for alias, expression in pairs:
            select_parts.append(f"{expression} AS {_quote_identifier(alias)}")
            labels.append(alias)
        if isinstance(entry, str):
            expression = topic.metrics.get(entry) or ""
            ratio = _RATIO_METRIC_RE.match(expression)
            if ratio:
                ratio_components[entry] = (
                    f"{entry}__num",
                    f"{entry}__den",
                )
                metric_labels.append(entry)
            else:
                metric_labels.append(entry)
        elif isinstance(entry, dict):
            metric_labels.append(str(entry.get("label") or ""))

    window = parse_time_range(query.get("time_range"))
    where: list[str] = []
    if window is not None:
        where.append(
            f"{_quote_identifier(topic.date_column)} >= DATE {_sql_literal(window[0])}"
        )
        where.append(
            f"{_quote_identifier(topic.date_column)} < DATE {_sql_literal(window[1])}"
        )
    where.extend(_filter_predicate(query.get("filters") or [], topic))

    def _build(source: TopicSource) -> str:
        base_sql = apply_window_markers(source.sql, window).strip()
        base_sql = apply_epoch_window_markers(base_sql, window)
        base_sql = apply_launch_dates(base_sql, launch_dates)
        sql = (
            "SELECT "
            + ", ".join(select_parts)
            + "\nFROM (\n"
            + base_sql
            + "\n) AS analysis_source"
        )
        if where:
            sql += "\nWHERE " + " AND ".join(where)
        if groupby:
            sql += "\nGROUP BY " + ", ".join(
                _quote_identifier(name) for name in groupby
            )
        sql += _order_by_clause(query, topic)
        row_limit = query.get("row_limit")
        if isinstance(row_limit, int) and row_limit > 0:
            # per-side limit: allow a recall margin for cross-database Top-N
            sql += f"\nLIMIT {min(row_limit * 5, 50000)}"
        return sql

    return CompiledAnalysisQuery(
        mainland_sql=_build(topic.mainland),
        oversea_sql=_build(topic.oversea),
        labels=labels,
        dimensions=groupby,
        metric_labels=metric_labels,
        ratio_components=ratio_components,
    )


def get_topic(topic_id: str | None) -> AnalysisTopic | None:
    return ANALYSIS_TOPICS.get(topic_id or "")


# Topics whose executed mainland SQL has a historical wide-view counterpart.
# The wide view is the object set the old dataset read; the consistency checker
# compiles the same query against both variants and compares them row by row.
_WIDE_MAINLAND_SQL: dict[str, str] = {
    "cost": COST_MAINLAND_WIDE_SQL,
    "project-compare": PROJECT_COMPARE_MAINLAND_WIDE_SQL,
}


def historical_topic(topic: AnalysisTopic) -> AnalysisTopic:
    """Same topic, but the mainland side uses the historical wide views.

    Used by the consistency checker and the "查看 SQL" dialog to compare the
    executed narrow SQL against the object set the old dataset used.  Topics
    without a wide-view counterpart are returned unchanged, and the oversea
    side always keeps the executed SQL.
    """
    wide_sql = _WIDE_MAINLAND_SQL.get(topic.id)
    if wide_sql is None:
        return topic
    return replace(
        topic,
        mainland=TopicSource(
            database=topic.mainland.database,
            catalog=topic.mainland.catalog,
            schema=topic.mainland.schema,
            sql=wide_sql,
        ),
    )
