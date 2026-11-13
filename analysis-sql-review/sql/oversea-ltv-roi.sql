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
