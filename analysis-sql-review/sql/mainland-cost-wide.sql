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
