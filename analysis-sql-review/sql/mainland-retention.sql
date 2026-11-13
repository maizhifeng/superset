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
