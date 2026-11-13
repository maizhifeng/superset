"""Deeper look at pre-anchor activity: lead-in windows, media mix, data quality."""

import json
from datetime import date

import pandas as pd
from sqlalchemy import text

from superset.app import create_app

OUT = "/tmp/anchor_pre_analysis2.json"


def load(engine, sql):
    return pd.read_sql_query(text(sql), con=engine)


def main():
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.models.core import Database

        db.session.query(Database).filter_by(
            database_name="aliyun"
        ).one().get_sqla_engine().__enter__()
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
        anchors_raw = load(
            db.engine,
            'select region, papp_id, papp_name, "上线时间", "首测起始时间", '
            '"二测起始时间", "三测起始时间" from config.profit_sharing',
        )
        mainland_names = load(
            aliyun, "select papp_id, papp_name from sj_platform.part_papp"
        )
        oversea_names = load(
            oversea, "select papp_id, papp_name from xh_osdata_manage.part_papp"
        )
        facts_main = load(
            aliyun,
            """
            with raw as (
              select report_date, papp_id, cost as ad_cost, 0::numeric as n_unum,
                     0::numeric as paid
              from sj_report_data.ad_deplete_view
              where report_date >= 20230101 and papp_id != 61
              union all
              select report_date, papp_id, 0::numeric, coalesce(n_unum, na_devnum),
                     rt_paid_money_1
              from sj_report_data.ad_data_sum_report
              where report_date >= 20230101 and papp_id != 61
              union all
              select report_date, papp_id, cost, 0::numeric, 0::numeric
              from sj_report_data.wxh5_ad_deplete_view
              where report_date >= 20230101 and papp_id != 61
              union all
              select report_date, papp_id, 0::numeric, act_num, rt_paid_money_1
              from sj_report_data.wxh5_data_sum_report
              where report_date >= 20230101 and papp_id != 61
            )
            select papp_id,
                   to_char(to_date(cast(report_date as text), 'YYYYMMDD'), 'YYYY-MM-DD') as day,
                   sum(ad_cost) as cost, sum(n_unum) as new_users, sum(paid) as revenue
            from raw group by papp_id, report_date
            having sum(ad_cost) <> 0 or sum(n_unum) <> 0 or sum(paid) <> 0
            """,
        )
        facts_oversea = load(
            oversea,
            """
            select papp_id,
                   to_char(to_date(cast(report_date as text), 'YYYYMMDD'), 'YYYY-MM-DD') as day,
                   sum(ad_menoy) * 7 / 10000.0 as cost,
                   sum(rt_device_num) as new_users,
                   sum(paid_money) * 7 / 10000.0 as revenue
            from overseas_report_data.ad_operate_data_report
            where report_date >= 20230101 and ad_cch_id not in (59, 64)
            group by papp_id, report_date
            having sum(ad_menoy) <> 0 or sum(rt_device_num) <> 0 or sum(paid_money) <> 0
            """,
        )
        launch_ids = sorted(
            {
                int(row["papp_id"])
                for row in anchors_raw.to_dict("records")
                if str(row.get("region") or "") == "domestic"
                and str(row.get("上线时间") or "").strip()
            }
        )
        launch_ids_os = sorted(
            {
                int(row["papp_id"])
                for row in anchors_raw.to_dict("records")
                if str(row.get("region") or "") == "oversea"
                and str(row.get("上线时间") or "").strip()
            }
        )
        media_main = None
        media_os = None
        if launch_ids:
            media_main = load(
                aliyun,
                f"""
                with raw as (
                  select report_date, papp_id, pad_id, cost as ad_cost
                  from sj_report_data.ad_deplete_view
                  where report_date >= 20230101 and papp_id != 61
                    and papp_id in ({",".join(map(str, launch_ids))})
                  union all
                  select report_date, papp_id, pad_id, cost
                  from sj_report_data.wxh5_ad_deplete_view
                  where report_date >= 20230101 and papp_id != 61
                    and papp_id in ({",".join(map(str, launch_ids))})
                )
                select raw.papp_id as papp_id,
                       to_char(to_date(cast(raw.report_date as text), 'YYYYMMDD'), 'YYYY-MM-DD') as day,
                       case when raw.pad_id = 0 then '自然量'
                            else ch.channel_name end as media,
                       sum(raw.ad_cost) as cost
                from raw left join ad_manager.ad_channel ch on raw.pad_id = ch.channel_id
                group by raw.papp_id, raw.report_date,
                         case when raw.pad_id = 0 then '自然量'
                              else ch.channel_name end
                """,
            )
        if launch_ids_os:
            media_os = load(
                oversea,
                f"""
                select papp_id,
                       to_char(to_date(cast(report_date as text), 'YYYYMMDD'), 'YYYY-MM-DD') as day,
                       coalesce(ch.ad_cch_name, '未知') as media,
                       sum(ad_menoy) * 7 / 10000.0 as cost
                from overseas_report_data.ad_operate_data_report t
                left join xh_osdata_manage.ad_channel ch on t.ad_cch_id = ch.id
                where report_date >= 20230101 and ad_cch_id not in (59, 64)
                  and papp_id in ({",".join(map(str, launch_ids_os))})
                group by papp_id, report_date, coalesce(ch.ad_cch_name, '未知')
                """,
            )

    def parse_day(value):
        raw = str(value or "").strip()
        if not raw:
            return None
        parsed = pd.to_datetime(raw, errors="coerce")
        return None if pd.isna(parsed) else parsed.date()

    launches = {}
    first_tests = {}
    for row in anchors_raw.to_dict("records"):
        region = str(row.get("region") or "")
        pid = int(row["papp_id"])
        launch = parse_day(row.get("上线时间"))
        first_test = parse_day(row.get("首测起始时间"))
        if launch:
            key = (region, pid)
            if key not in launches or launch < launches[key]:
                launches[key] = launch
        if first_test:
            key = (region, pid)
            if key not in first_tests or first_test < first_tests[key]:
                first_tests[key] = first_test

    facts = {"domestic": facts_main, "oversea": facts_oversea}
    for side, df in facts.items():
        df["day"] = pd.to_datetime(df["day"])
        for column in ("cost", "new_users", "revenue"):
            df[column] = pd.to_numeric(df[column], errors="coerce").fillna(0.0)

    today = pd.Timestamp(date.today())
    names = {
        "domestic": {
            int(r["papp_id"]): str(r["papp_name"] or "")
            for r in mainland_names.to_dict("records")
        },
        "oversea": {
            int(r["papp_id"]): str(r["papp_name"] or "")
            for r in oversea_names.to_dict("records")
        },
    }

    lead_ins = [7, 14, 30, 60, 90]
    lead_totals = {n: {"cost": 0.0, "new_users": 0.0, "projects": 0} for n in lead_ins}
    launch_rows = []
    for (side, pid), launch in launches.items():
        if side not in facts:
            continue
        df = facts[side]
        proj = df[df["papp_id"] == pid]
        if proj.empty:
            continue
        anchor = pd.Timestamp(launch)
        post = proj[
            (proj["day"] >= anchor) & (proj["day"] < anchor + pd.Timedelta(days=30))
        ]
        complete = anchor <= today - pd.Timedelta(days=60)
        entry = {
            "side": side,
            "papp_id": pid,
            "project": names[side].get(pid, ""),
            "launch": launch.isoformat(),
            "complete_post_window": bool(complete),
            "first_fact": proj["day"].min().date().isoformat(),
            "pre": {},
            "post30_cost": round(float(post["cost"].sum()), 2),
            "post30_new": int(post["new_users"].sum()),
        }
        for n in lead_ins:
            window = proj[
                (proj["day"] >= anchor - pd.Timedelta(days=n)) & (proj["day"] < anchor)
            ]
            entry["pre"][f"{n}d"] = {
                "cost": round(float(window["cost"].sum()), 2),
                "new_users": int(window["new_users"].sum()),
                "revenue": round(float(window["revenue"].sum()), 2),
                "days": int(window["day"].nunique()),
            }
            lead_totals[n]["cost"] += float(window["cost"].sum())
            lead_totals[n]["new_users"] += float(window["new_users"].sum())
            if float(window["cost"].sum()) > 0:
                lead_totals[n]["projects"] += 1
        # spend-only pre rows (cost but no installs / no revenue)
        pre = proj[proj["day"] < anchor]
        entry["pre_spend_only_cost"] = round(
            float(pre[(pre["new_users"] <= 0) & (pre["revenue"] <= 0)]["cost"].sum()), 2
        )
        entry["pre_with_installs_cost"] = round(
            float(pre[(pre["new_users"] > 0)]["cost"].sum()), 2
        )
        launch_rows.append(entry)

    # media mix of pre-launch spend
    def media_summary(media_df, side):
        if media_df is None or media_df.empty:
            return {}
        media_df["day"] = pd.to_datetime(media_df["day"])
        media_df["cost"] = pd.to_numeric(media_df["cost"], errors="coerce").fillna(0.0)
        rows = []
        for row in media_df.to_dict("records"):
            pid = int(row["papp_id"])
            anchor = launches.get((side, pid))
            if anchor is None:
                continue
            if pd.Timestamp(row["day"]) >= pd.Timestamp(anchor):
                continue
            rows.append((str(row["media"] or "").strip(), float(row["cost"])))
        frame = pd.DataFrame(rows, columns=["media", "cost"])
        total = float(frame["cost"].sum())
        grouped = (
            frame.groupby("media")["cost"].sum().sort_values(ascending=False).head(8)
        )
        return {
            "total": round(total, 2),
            "top": [
                {
                    "media": media,
                    "cost": round(float(cost), 2),
                    "share": round(float(cost) / total, 4) if total else 0,
                }
                for media, cost in grouped.items()
            ],
        }

    summary = {
        "lead_in_capture": {
            f"{n}d": {
                "projects_with_pre_cost": lead_totals[n]["projects"],
                "pre_cost": round(lead_totals[n]["cost"], 2),
                "pre_new_users": int(lead_totals[n]["new_users"]),
            }
            for n in lead_ins
        },
        "pre_launch_media": {
            "mainland": media_summary(media_main, "domestic"),
            "oversea": media_summary(media_os, "oversea"),
        },
        "launch_projects": sorted(
            launch_rows,
            key=lambda row: (row["side"], -row["pre"]["30d"]["cost"]),
        ),
        "complete_window_stats": {},
    }

    complete = [row for row in launch_rows if row["complete_post_window"]]
    if complete:
        shares = [
            row["pre"]["30d"]["cost"] / (row["pre"]["30d"]["cost"] + row["post30_cost"])
            for row in complete
            if row["pre"]["30d"]["cost"] + row["post30_cost"] > 0
        ]
        summary["complete_window_stats"] = {
            "projects": len(complete),
            "pre30_cost": round(sum(row["pre"]["30d"]["cost"] for row in complete), 2),
            "post30_cost": round(sum(row["post30_cost"] for row in complete), 2),
            "pre30_share": round(
                sum(row["pre"]["30d"]["cost"] for row in complete)
                / (
                    sum(row["pre"]["30d"]["cost"] for row in complete)
                    + sum(row["post30_cost"] for row in complete)
                ),
                4,
            )
            if complete
            else 0,
            "avg_project_share": round(sum(shares) / len(shares), 4) if shares else 0,
            "share_p50": round(sorted(shares)[len(shares) // 2], 4) if shares else 0,
            "spend_only_pre_cost": round(
                sum(row["pre_spend_only_cost"] for row in complete), 2
            ),
            "pre_with_installs_cost": round(
                sum(row["pre_with_installs_cost"] for row in complete), 2
            ),
        }

    # pre-first-test activity (pre-registration before the earliest configured round)
    first_test_rows = []
    for (side, pid), first_test in first_tests.items():
        if side not in facts:
            continue
        df = facts[side]
        proj = df[df["papp_id"] == pid]
        if proj.empty:
            continue
        anchor = pd.Timestamp(first_test)
        pre = proj[proj["day"] < anchor]
        first_test_rows.append(
            {
                "side": side,
                "papp_id": pid,
                "project": names[side].get(pid, ""),
                "first_test": first_test.isoformat(),
                "pre10_cost": round(
                    float(
                        pre[pre["day"] >= anchor - pd.Timedelta(days=10)]["cost"].sum()
                    ),
                    2,
                ),
                "pre30_cost": round(
                    float(
                        pre[pre["day"] >= anchor - pd.Timedelta(days=30)]["cost"].sum()
                    ),
                    2,
                ),
                "pre_cost": round(float(pre["cost"].sum()), 2),
                "pre_new_users": int(pre["new_users"].sum()),
            }
        )
    summary["first_test_projects"] = sorted(
        first_test_rows, key=lambda row: -row["pre_cost"]
    )

    with open(OUT, "w") as fp:
        json.dump(summary, fp, ensure_ascii=False, indent=1, default=str)
    print(json.dumps(summary["lead_in_capture"], ensure_ascii=False, default=str))
    print(
        "COMPLETE",
        json.dumps(summary["complete_window_stats"], ensure_ascii=False, default=str),
    )
    print(
        "MEDIA_MAIN",
        json.dumps(
            summary["pre_launch_media"]["mainland"], ensure_ascii=False, default=str
        ),
    )
    print(
        "MEDIA_OS",
        json.dumps(
            summary["pre_launch_media"]["oversea"], ensure_ascii=False, default=str
        ),
    )
    print(
        "FIRST_TEST",
        json.dumps(summary["first_test_projects"], ensure_ascii=False, default=str),
    )


main()
