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
