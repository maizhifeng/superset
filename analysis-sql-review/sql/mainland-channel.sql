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
