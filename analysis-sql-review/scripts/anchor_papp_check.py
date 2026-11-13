import pandas as pd
from sqlalchemy import text

from superset.app import create_app

app = create_app()
with app.app_context():
    from superset import db
    from superset.models.core import Database

    aliyun = (
        (db.session.query(Database).filter_by(database_name="aliyun").one())
        .get_sqla_engine()
        .__enter__()
    )
    oversea = (
        (db.session.query(Database).filter_by(database_name="aliyun-oversea").one())
        .get_sqla_engine()
        .__enter__()
    )
    q = lambda eng, sql: pd.read_sql_query(text(sql), con=eng)

    main = q(
        aliyun,
        """
    with raw as (
      select report_date, papp_id, cost as c from sj_report_data.ad_deplete_view
      where report_date >= 20230101 and papp_id in (203,299,344,353,355,358,376,380)
      union all
      select report_date, papp_id, cost from sj_report_data.wxh5_ad_deplete_view
      where report_date >= 20230101 and papp_id in (203,299,344,353,355,358,376,380)
    )
    select papp_id, left(cast(report_date as text), 6) as ym, sum(c) as cost
    from raw group by papp_id, left(cast(report_date as text), 6)
    order by papp_id, ym
    """,
    )
    os_ = q(
        oversea,
        """
    select papp_id, left(cast(report_date as text), 6) as ym,
           sum(ad_menoy) * 7 / 10000.0 as cost
    from overseas_report_data.ad_operate_data_report
    where report_date >= 20230101 and ad_cch_id not in (59,64)
      and papp_id in (1441,1837,1801)
    group by papp_id, left(cast(report_date as text), 6)
    order by papp_id, ym
    """,
    )
print("=== mainland: months with spend >0 ===")
for pid, grp in main.groupby("papp_id"):
    active = grp[grp["cost"] > 0]
    if active.empty:
        print(pid, "no spend")
        continue
    print(
        pid,
        "active_months",
        len(active),
        "first",
        active["ym"].min(),
        "last",
        active["ym"].max(),
        "top_months",
        active.sort_values("cost", ascending=False)
        .head(3)[["ym", "cost"]]
        .values.tolist(),
    )
print("=== oversea ===")
for pid, grp in os_.groupby("papp_id"):
    active = grp[grp["cost"] > 0]
    print(
        pid,
        "active_months",
        len(active),
        "first",
        active["ym"].min(),
        "last",
        active["ym"].max(),
        "top_months",
        active.sort_values("cost", ascending=False)
        .head(3)[["ym", "cost"]]
        .values.tolist(),
    )
