"""Investigate fact rows that exist before each project's configured anchor dates."""

import json
from datetime import datetime

import pandas as pd
from sqlalchemy import text

from superset.app import create_app

OUT = "/tmp/anchor_pre_analysis.json"


def load(engine, sql):
    return pd.read_sql_query(text(sql), con=engine)


def main():
    app = create_app()
    with app.app_context():
        from superset import db
        from superset.models.core import Database

        meta = db.engine
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
            meta,
            "select region, papp_id, papp_name, channel_name, "
            '"上线时间", "首测起始时间", "二测起始时间", "三测起始时间" '
            "from config.profit_sharing",
        )
        anchors = {}
        for row in anchors_raw.to_dict("records"):
            key = (str(row["region"]), int(row["papp_id"]))
            entry = anchors.setdefault(
                key,
                {
                    "region": key[0],
                    "papp_id": key[1],
                    "papp_name": (row.get("papp_name") or "").strip(),
                    "anchors": {},
                },
            )
            if not entry["papp_name"] and row.get("papp_name"):
                entry["papp_name"] = str(row["papp_name"]).strip()
            for col, name in [
                ("上线时间", "launch"),
                ("首测起始时间", "first_test"),
                ("二测起始时间", "second_test"),
                ("三测起始时间", "third_test"),
            ]:
                raw = str(row.get(col) or "").strip()
                if not raw:
                    continue
                parsed = pd.to_datetime(raw, errors="coerce")
                if pd.isna(parsed):
                    continue
                day = parsed.date().isoformat()
                current = entry["anchors"].get(name)
                if current is None or day < current:
                    entry["anchors"][name] = day

        mainland_sql = """
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
               sum(ad_cost) as cost,
               sum(n_unum) as new_users,
               sum(paid) as revenue
        from raw
        group by papp_id, report_date
        having sum(ad_cost) <> 0 or sum(n_unum) <> 0 or sum(paid) <> 0
        """
        oversea_sql = """
        select papp_id,
               to_char(to_date(cast(report_date as text), 'YYYYMMDD'), 'YYYY-MM-DD') as day,
               sum(ad_menoy) * 7 / 10000.0 as cost,
               sum(rt_device_num) as new_users,
               sum(paid_money) * 7 / 10000.0 as revenue
        from overseas_report_data.ad_operate_data_report
        where report_date >= 20230101 and ad_cch_id not in (59, 64)
        group by papp_id, report_date
        having sum(ad_menoy) <> 0 or sum(rt_device_num) <> 0 or sum(paid_money) <> 0
        """
        mainland_names = load(
            aliyun, "select papp_id, papp_name from sj_platform.part_papp"
        )
        oversea_names = load(
            oversea, "select papp_id, papp_name from xh_osdata_manage.part_papp"
        )
        facts_main = load(aliyun, mainland_sql)
        facts_oversea = load(oversea, oversea_sql)

    def name_map(df):
        return {
            int(row["papp_id"]): str(row["papp_name"] or "").strip()
            for row in df.to_dict("records")
        }

    names = {"domestic": name_map(mainland_names), "oversea": name_map(oversea_names)}
    facts = {"domestic": facts_main, "oversea": facts_oversea}
    for side, df in facts.items():
        df["day"] = pd.to_datetime(df["day"])
        df["cost"] = pd.to_numeric(df["cost"], errors="coerce").fillna(0.0)
        df["new_users"] = pd.to_numeric(df["new_users"], errors="coerce").fillna(0.0)
        df["revenue"] = pd.to_numeric(df["revenue"], errors="coerce").fillna(0.0)

    anchor_names = [
        ("first_test", "首测"),
        ("second_test", "二测"),
        ("third_test", "三测"),
        ("launch", "上线"),
    ]
    stage_order = ["first_test", "second_test", "third_test", "launch"]

    summary = {
        "generated_at": datetime.now().isoformat(timespec="seconds"),
        "metadata": {
            "profit_sharing_rows": int(len(anchors_raw)),
            "projects": len(anchors),
            "with_anchor": {
                label: sum(1 for entry in anchors.values() if key in entry["anchors"])
                for key, label in anchor_names
            },
        },
        "facts": {
            "domestic_rows": int(len(facts_main)),
            "oversea_rows": int(len(facts_oversea)),
            "domestic_projects": int(facts_main["papp_id"].nunique()),
            "oversea_projects": int(facts_oversea["papp_id"].nunique()),
        },
        "anchors": {},
        "cases": {},
        "missing_anchor_projects": {},
    }

    per_project_rows = []

    for anchor_key, anchor_label in anchor_names:
        stats = {
            "projects_with_anchor": 0,
            "projects_with_any_data_before": 0,
            "projects_with_meaningful_data_before": 0,  # pre cost >= 1% of post30 cost
            "pre_cost_total": 0.0,
            "pre_cost_recent30_total": 0.0,
            "post30_cost_total": 0.0,
            "pre_new_users_total": 0.0,
            "post30_new_users_total": 0.0,
            "days_before_values": [],
            "pre_share_cost": [],
            "rows": [],
        }
        for (side, papp_id), entry in anchors.items():
            anchor = entry["anchors"].get(anchor_key)
            if not anchor:
                continue
            stats["projects_with_anchor"] += 1
            anchor_day = pd.Timestamp(anchor)
            df = facts[side]
            proj = df[df["papp_id"] == papp_id]
            if proj.empty:
                continue
            pre = proj[proj["day"] < anchor_day]
            post30 = proj[
                (proj["day"] >= anchor_day)
                & (proj["day"] < anchor_day + pd.Timedelta(days=30))
            ]
            pre_recent30 = pre[pre["day"] >= anchor_day - pd.Timedelta(days=30)]
            pre_cost = float(pre["cost"].sum())
            pre_new = float(pre["new_users"].sum())
            post_cost = float(post30["cost"].sum())
            post_new = float(post30["new_users"].sum())
            if pre.empty:
                continue
            stats["projects_with_any_data_before"] += 1
            stats["pre_cost_total"] += pre_cost
            stats["pre_cost_recent30_total"] += float(pre_recent30["cost"].sum())
            stats["post30_cost_total"] += post_cost
            stats["pre_new_users_total"] += pre_new
            stats["post30_new_users_total"] += post_new
            first_day = proj["day"].min()
            days_before = (anchor_day - first_day).days
            stats["days_before_values"].append(days_before)
            share = pre_cost / (pre_cost + post_cost) if (pre_cost + post_cost) else 0.0
            stats["pre_share_cost"].append(share)
            if post_cost > 0 and pre_cost >= post_cost * 0.01:
                stats["projects_with_meaningful_data_before"] += 1
            # split pre data: before the earliest configured stage vs between stages
            stages = sorted(
                (stage, day)
                for stage, day in entry["anchors"].items()
                if stage in stage_order
            )
            earliest_stage_day = pd.Timestamp(stages[0][1])
            before_all = pre[pre["day"] < earliest_stage_day]
            earlier_rounds = pre[pre["day"] >= earliest_stage_day]
            per_project_rows.append(
                {
                    "anchor": anchor_label,
                    "side": side,
                    "papp_id": int(papp_id),
                    "project": entry["papp_name"] or names[side].get(int(papp_id), ""),
                    "anchor_day": anchor,
                    "first_fact_day": first_day.date().isoformat(),
                    "days_before": days_before,
                    "pre_days": int(pre["day"].nunique()),
                    "pre_cost": round(pre_cost, 2),
                    "pre_cost_recent30": round(float(pre_recent30["cost"].sum()), 2),
                    "post30_cost": round(post_cost, 2),
                    "pre_cost_share": round(share, 4),
                    "pre_new_users": round(pre_new, 2),
                    "before_all_anchors_cost": round(
                        float(before_all["cost"].sum()), 2
                    ),
                    "earlier_rounds_cost": round(
                        float(earlier_rounds["cost"].sum()), 2
                    ),
                    "configured_stages": [stage for stage, _day in stages],
                }
            )
        days = stats.pop("days_before_values")
        shares = stats.pop("pre_share_cost")
        stats["days_before"] = {
            "max": max(days) if days else None,
            "median": sorted(days)[len(days) // 2] if days else None,
            "p90": sorted(days)[int(len(days) * 0.9) - 1] if days else None,
        }
        stats["pre_cost_share_of_total"] = (
            round(
                stats["pre_cost_total"]
                / (stats["pre_cost_total"] + stats["post30_cost_total"]),
                4,
            )
            if (stats["pre_cost_total"] + stats["post30_cost_total"])
            else 0.0
        )
        stats["avg_pre_share"] = round(sum(shares) / len(shares), 4) if shares else 0.0
        stats["pre_new_users_share"] = (
            round(
                stats["pre_new_users_total"]
                / (stats["pre_new_users_total"] + stats["post30_new_users_total"]),
                4,
            )
            if (stats["pre_new_users_total"] + stats["post30_new_users_total"])
            else 0.0
        )
        for key in [
            "pre_cost_total",
            "pre_cost_recent30_total",
            "post30_cost_total",
            "pre_new_users_total",
            "post30_new_users_total",
        ]:
            stats[key] = round(stats[key], 2)
        stats["top_projects"] = sorted(
            per_project_rows,
            key=lambda item: (item["anchor"] == anchor_label, -item["pre_cost"]),
        )[:10]
        summary["anchors"][anchor_label] = stats

    # Case A: pre data before the earliest configured stage (pre-registration)
    before_all = [
        row
        for row in per_project_rows
        if row["anchor"] == "上线" and row["before_all_anchors_cost"] > 0
    ]
    summary["cases"]["before_all_anchors"] = {
        "count": len(before_all),
        "cost": round(sum(row["before_all_anchors_cost"] for row in before_all), 2),
        "top": sorted(before_all, key=lambda row: -row["before_all_anchors_cost"])[:10],
    }
    # Case B: earlier-round data before launch (between first test and launch)
    earlier = [
        row
        for row in per_project_rows
        if row["anchor"] == "上线" and row["earlier_rounds_cost"] > 0
    ]
    summary["cases"]["earlier_rounds_before_launch"] = {
        "count": len(earlier),
        "cost": round(sum(row["earlier_rounds_cost"] for row in earlier), 2),
        "top": sorted(earlier, key=lambda row: -row["earlier_rounds_cost"])[:10],
    }
    # Case C: facts-only projects without any configured anchor
    for side in ("domestic", "oversea"):
        df = facts[side]
        anchored = {
            papp_id
            for (s, papp_id), entry in anchors.items()
            if s == side and entry["anchors"]
        }
        unknown = df[~df["papp_id"].isin(anchored)]
        if unknown.empty:
            summary["missing_anchor_projects"][side] = {"count": 0}
            continue
        last_day = df["day"].max()
        recent = unknown[unknown["day"] >= last_day - pd.Timedelta(days=90)]
        grouped = recent.groupby("papp_id")["cost"].sum().sort_values(ascending=False)
        summary["missing_anchor_projects"][side] = {
            "count": int(unknown["papp_id"].nunique()),
            "last90_cost": round(float(recent["cost"].sum()), 2),
            "top": [
                {
                    "papp_id": int(pid),
                    "project": names[side].get(int(pid), ""),
                    "last90_cost": round(float(cost), 2),
                }
                for pid, cost in grouped.head(10).items()
            ],
        }

    summary["projects"] = sorted(
        per_project_rows, key=lambda row: (row["anchor"], -row["pre_cost"])
    )
    with open(OUT, "w") as fp:
        json.dump(summary, fp, ensure_ascii=False, indent=1, default=str)
    print("rows", len(per_project_rows))
    print(
        json.dumps(
            {k: summary[k] for k in ("metadata", "facts", "cases")},
            ensure_ascii=False,
            default=str,
        )
    )
    for label, stats in summary["anchors"].items():
        print(
            label,
            json.dumps(
                {k: v for k, v in stats.items() if k not in ("rows", "top_projects")},
                ensure_ascii=False,
                default=str,
            ),
        )


main()
