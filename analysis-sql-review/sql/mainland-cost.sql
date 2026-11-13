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
