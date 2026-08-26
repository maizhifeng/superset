#!/usr/bin/env python3
"""L 层查询入口：按需从阶段一产物里捞数，避免整读 extract.json / shapes.json。

    python3 query.py <stage1-outdir> <子命令> [选项]

      shapes   --part slide7.xml [--kind text|pic|shape|table|group] [--ph] [--limit N]
      colors   [--top N] [--class design|editor|aux]
      fonts    [--all]                     默认只列 rendered_n>0 的族
      text-scale [--top N]
      images   [--fullscreen] [--repeat] [--top N]
      clusters [--multi]                   --multi 只看跨文件同素材簇
      media    [--candidate]
      summary                               阶段一体检：form/themes/UNRESOLVED/降级信号
      get <点路径>                          取 extract.json 任意字段（如 get canvas）
      slides                                每页背景 + 版式
      layouts                               版式清单

输出是给 agent 读的紧凑表格：定宽列 + 表头，数值直接可抄进产物。
`shapes` 读 ref/shapes.json（体量大，务必带 --part 过滤），其余读 extract.json。
"""
import argparse
import json
import math
import os
import sys
from collections import Counter


def load(outdir, name):
    p = os.path.join(outdir, name)
    if not os.path.exists(p):
        raise SystemExit("query.py: 找不到 %s" % p)
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def short(part):
    return part.rsplit("/", 1)[-1] if part else "-"


def trunc(s, n):
    s = "" if s is None else str(s).replace("\n", " ")
    return s if len(s) <= n else s[:n - 1] + "…"


def table(rows, headers, aligns=None):
    if not rows:
        print("（无匹配）")
        return
    cols = len(headers)
    w = [len(str(h)) for h in headers]
    for r in rows:
        for i in range(cols):
            w[i] = max(w[i], len(str(r[i])))
    aligns = aligns or ["<"] * cols
    fmt = "  ".join("{:%s%d}" % (aligns[i], w[i]) for i in range(cols))
    print(fmt.format(*headers))
    print("  ".join("-" * w[i] for i in range(cols)))
    for r in rows:
        print(fmt.format(*[("" if x is None else x) for x in r]))


# ------------------------------------------------------------------- 子命令
KIND_GROUPS = {"text": None, "pic": ("pic",), "shape": ("sp", "cxnSp"),
               "table": ("table",), "group": ("grpSp",)}


def cmd_shapes(a, outdir):
    data = load(outdir, os.path.join("ref", "shapes.json"))
    shapes = data["shapes"] if isinstance(data, dict) else data
    if a.part:
        want = a.part
        shapes = [s for s in shapes if short(s["part"]) == want or s["part"] == want]
        if not shapes:
            parts = sorted({short(s["part"]) for s in (data["shapes"] if isinstance(data, dict) else data)})
            raise SystemExit("query.py: 没有 part=%s。可选: %s" % (want, ", ".join(parts[:12]) + " …"))
    if a.kind:
        if a.kind == "text":
            shapes = [s for s in shapes if (s.get("text") or {}).get("paragraphs")]
        else:
            keep = KIND_GROUPS[a.kind]
            shapes = [s for s in shapes if s.get("kind") in keep]
    if a.ph:
        shapes = [s for s in shapes if s.get("ph")]
    rows = []
    for s in shapes[:a.limit]:
        b = s.get("box") or {}
        txt = ""
        for p in (s.get("text") or {}).get("paragraphs", []):
            txt += "".join(r.get("text") or "" for r in p.get("runs", []))
            if len(txt) > 40:
                break
        # 有效字号按 OOXML 优先级找第一个有声明的层：run > 段落 defRPr > 本形状 lstStyle
        text = s.get("text") or {}
        sz = next((r.get("sz_px") for p in text.get("paragraphs", [])
                   for r in p.get("runs", []) if r.get("sz_px")), None)
        if sz is None:
            sz = next((p["defRPr"]["sz_px"] for p in text.get("paragraphs", [])
                       if (p.get("defRPr") or {}).get("sz_px")), None)
        if sz is None:
            sz = next((lvl.get("sz_px") for lvl in (text.get("lstStyle") or {}).values()
                       if lvl.get("sz_px")), None)
        fill = (s.get("fill") or {}).get("type")
        col = ((s.get("fill") or {}).get("color") or {}).get("resolved")
        rows.append([s.get("kind"), s.get("id"), trunc(s.get("name"), 22),
                     "%s/%s" % (s["ph"]["type"], s["ph"].get("idx")) if s.get("ph") else "-",
                     b.get("x"), b.get("y"), b.get("w"), b.get("h"),
                     sz or "-", (fill or "-") + (("=" + col) if col else ""),
                     trunc(txt, 34)])
    table(rows, ["kind", "id", "name", "ph", "x", "y", "w", "h", "sz", "fill", "text"],
          ["<", ">", "<", "<", ">", ">", ">", ">", ">", "<", "<"])
    print("\n%d 个形状%s" % (len(shapes), "（截断到 %d）" % a.limit if len(shapes) > a.limit else ""))


def cmd_colors(a, outdir):
    d = load(outdir, "extract.json")
    freq = d["color_freq"]
    if a.klass:
        freq = [c for c in freq if c["class"] == a.klass]
    rows = [[c.get("resolved"), c["n"], c["class"],
             trunc(",".join(c.get("raw") or []), 40),
             trunc(",".join("%s:%s" % kv for kv in (c.get("layers") or {}).items()), 26)]
            for c in freq[:a.top]]
    table(rows, ["resolved", "n", "class", "raw tokens", "layers"],
          ["<", ">", "<", "<", "<"])
    print("\n共 %d 支色（design %d / editor %d / aux %d）"
          % (len(d["color_freq"]),
             sum(1 for c in d["color_freq"] if c["class"] == "design"),
             sum(1 for c in d["color_freq"] if c["class"] == "editor"),
             sum(1 for c in d["color_freq"] if c["class"] == "aux")))


def cmd_fonts(a, outdir):
    d = load(outdir, "extract.json")
    fams = d["font_families"]
    if not a.all:
        fams = [f for f in fams if f.get("rendered_n", f["n"])]
    rows = [[f["family"], f["n"], f.get("rendered_n", f["n"]),
             ",".join(str(w) for w in f.get("weights") or []) or "-",
             f.get("bold_runs", 0),
             trunc(",".join("%s:%s" % kv for kv in (f.get("sources") or {}).items()), 34),
             "Y" if f.get("in_theme") else "",
             "renders_no_text" if f.get("renders_no_text") else ""]
            for f in fams]
    table(rows, ["family", "n", "rendered", "weights", "bold", "sources", "theme", "flag"],
          ["<", ">", ">", "<", ">", "<", "<", "<"])
    print("\n提示：判「在用」看 rendered —— n 含空段落声明（不渲染文字）。"
          " 全部族用 --all。")


def cmd_text_scale(a, outdir):
    d = load(outdir, "extract.json")
    rows = [[e["sz_px"], e["n"],
             trunc(",".join("%s:%s" % kv for kv in (e.get("sources") or {}).items()), 34),
             trunc(",".join("%s:%s" % kv for kv in (e.get("layers") or {}).items()), 24),
             ",".join(str(w) for w in (e.get("weights") or {})) or "-",
             trunc(",".join(str(k) for k in (e.get("line_height_mult") or {})), 18)]
            for e in d["text_scale"][:a.top]]
    table(rows, ["sz_px", "n", "sources", "layers", "weights", "lnSpc"],
          [">", ">", "<", "<", "<", "<"])
    print("\n共 %d 档字号。sources=pPr 是段落级 defRPr（Mac Office 常用）。"
          % len(d["text_scale"]))


def cmd_images(a, outdir):
    d = load(outdir, "extract.json")
    imgs = d["images"]
    if a.fullscreen:
        imgs = [i for i in imgs if i.get("fullscreen")]
    if a.repeat:
        imgs = [i for i in imgs if i.get("repeat_fixed")]
    rows = []
    for i in imgs[:a.top]:
        b = (i.get("boxes") or [{}])[0].get("box") or {}
        dom = " ".join("%s" % c["hex"] for c in (i.get("dominant_colors") or [])[:3])
        rows.append([short(i["media"]), i["n"], len(i.get("boxes") or []),
                     b.get("x"), b.get("y"), b.get("w"), b.get("h"),
                     "Y" if i.get("fullscreen") else "",
                     len(i.get("repeat_fixed") or []),
                     ",".join(i.get("variant_group") or []) or "-",
                     i.get("content_id") or "-",
                     i.get("luminance") if i.get("luminance") is not None else "-", dom])
    table(rows, ["media", "n", "clus", "x", "y", "w", "h", "full", "rep",
                 "vgroup", "cid", "lum", "dominant"],
          ["<", ">", ">", ">", ">", ">", ">", "<", ">", "<", "<", ">", "<"])
    print("\n共 %d 张被引用素材（满屏 %d / 有固定重复位 %d）"
          % (len(d["images"]), sum(1 for i in d["images"] if i.get("fullscreen")),
             sum(1 for i in d["images"] if i.get("repeat_fixed"))))


# ----------------------------------------------------- L11 配方（现成 CSS）
def _css_color(c):
    """{resolved} 已是 #HEX 或 rgba(...)，直接用。"""
    if not isinstance(c, dict):
        return None
    return c.get("resolved") or c.get("hex")


def _css_gradient(g):
    """OOXML gradFill → CSS linear-gradient。ang 自 +x 轴顺时针，CSS 自 12 点，故 +90。"""
    stops = sorted(g.get("stops") or [], key=lambda s: s.get("pos", 0))
    if not stops:
        return None
    parts = ["%s %g%%" % (_css_color(s.get("color")) or "transparent", s.get("pos", 0))
             for s in stops]
    return "linear-gradient(%gdeg, %s)" % ((g.get("angle_deg") or 0) + 90, ", ".join(parts))


def _fill_css(f):
    if not isinstance(f, dict):
        return None, None
    t = f.get("type")
    if t == "solid":
        c = _css_color(f.get("color"))
        return ("background: %s" % c, c) if c else (None, None)
    if t == "gradient":
        g = _css_gradient(f)
        return ("background-image: %s" % g, g) if g else (None, None)
    if t == "image":
        return "background-image: url(%s)" % (f.get("media") or "").rsplit("/", 1)[-1], None
    if t == "none":
        return "background: transparent", "transparent"
    return None, None


def _recipe_css(fill, line, radii, effects):
    """一组形状 → 可直接粘贴的 CSS 声明块。"""
    out = []
    fill_decl, fill_val = _fill_css(fill)
    line_grad = _css_gradient(line["gradient"]) if (line or {}).get("gradient") else None
    w = int(round((line or {}).get("w_px") or 0)) if line and not (line or {}).get("none") else 0
    if line_grad and w:
        # 渐变描边只能用双背景实现：内层填充走 padding-box，描边渐变走 border-box
        base = fill_val if fill_val and fill_val.startswith("linear-gradient") else \
            "linear-gradient(%s, %s)" % (fill_val or "transparent", fill_val or "transparent")
        out.append("border: %dpx solid transparent" % w)
        out.append("background: %s padding-box,\n            %s border-box"
                   % (base, line_grad))
    else:
        if fill_decl:
            out.append(fill_decl)
        if w:
            lc = _css_color((line or {}).get("color")) or "currentColor"
            dash = (line or {}).get("dash")
            style = "dashed" if dash and "dash" in dash else "solid"
            out.append("border: %dpx %s %s" % (w, style, lc))
    if radii and all(r >= 1 for r in radii):
        lo, hi = min(radii), max(radii)
        if abs(hi - lo) <= 0.5:
            out.append("border-radius: %gpx" % round(lo, 1))
    for e in effects or []:
        if e.get("type") == "outerShdw":
            col = _css_color(e.get("color")) or "rgba(0,0,0,0.25)"
            blur = e.get("blurRad_px") or 0
            dist = e.get("dist_px") or 0
            ang = e.get("dir_deg") or 0
            dx = dist * math.cos(math.radians(ang))
            dy = dist * math.sin(math.radians(ang))
            out.append("box-shadow: %.1fpx %.1fpx %.1fpx %s" % (dx, dy, blur, col))
    return out


def _sig(fill, line, effects):
    """分组键 = 填充 + 描边 + 效果。**不含圆角**——OOXML 圆角是 min(w,h) 的百分比，
    同一配方在不同尺寸的卡上绝对 px 必然不同，把它计入键会把一个配方拆成多组；
    只有组内每个形状都明确共享同一绝对半径时才输出组级圆角，否则留给逐形状 CSS。"""
    f = "none"
    if isinstance(fill, dict):
        if fill.get("type") == "solid":
            f = "solid:%s" % _css_color(fill.get("color"))
        elif fill.get("type") == "gradient":
            f = "grad:%s" % _css_gradient(fill)
        else:
            f = fill.get("type") or "none"
    ln = "none"
    if isinstance(line, dict) and not line.get("none"):
        if line.get("gradient"):
            ln = "grad:%g:%s" % (line.get("w_px") or 0, _css_gradient(line["gradient"]))
        elif line.get("color"):
            ln = "%g:%s:%s" % (line.get("w_px") or 0, _css_color(line["color"]),
                               line.get("dash") or "")
    fx = ",".join(sorted(e.get("type", "") for e in effects or []))
    return (f, ln, fx)


def cmd_recipes(a, outdir):
    data = load(outdir, os.path.join("ref", "shapes.json"))
    shapes = data["shapes"] if isinstance(data, dict) else data
    groups = {}
    for s in shapes:
        fill, line = s.get("fill"), s.get("line")
        fx = s.get("effects")
        radius = s.get("radius_px")
        if not fill and not line and not fx:
            continue
        if isinstance(fill, dict) and fill.get("type") == "image" and not a.all:
            continue                        # 图片填充是素材不是配方
        k = _sig(fill, line, fx)
        if k[0] == "none" and k[1] == "none" and not k[2]:
            continue
        g = groups.setdefault(k, {"n": 0, "parts": Counter(), "sizes": [], "radii": [],
                                  "fill": fill, "line": line, "fx": fx})
        g["n"] += 1
        g["radii"].append(radius or 0)
        g["parts"][short(s["part"])] += 1
        b = s.get("box") or {}
        if b.get("w"):
            g["sizes"].append((b["w"], b["h"]))
    rows = sorted(groups.values(), key=lambda g: -g["n"])
    rows = [g for g in rows if g["n"] >= a.min]
    if not rows:
        print("（无满足 --min %d 的配方组）" % a.min)
        return
    for i, g in enumerate(rows[:a.top], 1):
        css = _recipe_css(g["fill"], g["line"], g["radii"], g["fx"])
        pages = ", ".join("%s×%d" % (p, n) if n > 1 else p
                          for p, n in g["parts"].most_common(6))
        if len(g["parts"]) > 6:
            pages += " …共 %d 处" % len(g["parts"])
        sz = ""
        if g["sizes"]:
            ws = sorted(set(round(w) for w, _ in g["sizes"]))
            hs = sorted(set(round(h) for _, h in g["sizes"]))
            sz = "  尺寸 w%s h%s" % (ws[0] if len(ws) == 1 else "%d~%d" % (ws[0], ws[-1]),
                                    hs[0] if len(hs) == 1 else "%d~%d" % (hs[0], hs[-1]))
        print("[r%d] 出现 %d 次%s" % (i, g["n"], sz))
        print("     页: %s" % pages)
        for decl in css:
            sub = decl.split("\n")
            for j, ln in enumerate(sub):
                if j == len(sub) - 1:
                    head, _, note = ln.partition("\x00")
                    print("     %s;%s" % (head, ("  " + note) if note else ""))
                else:
                    print("     %s" % ln)
        print()
    print("共 %d 组配方（出现 ≥%d 次）。命名与取舍由 L11 判断，CSS 已可直接粘贴。"
          % (len(rows), a.min))


def cmd_grids(a, outdir):
    d = load(outdir, "extract.json")
    grids = (d.get("spacing_candidates") or {}).get("grids") or []
    rows = []
    for g in grids:
        c, r = g.get("cols"), g.get("rows")
        fmt = lambda x: ("%d @%gpx" % (x["n"], x["pitch"]) if x["regular"]
                         else "(%d @%gpx 不规整)" % (x["n"], x["pitch"])) if x else "-"
        rows.append([short(g["part"]), g["kind"], g["n"],
                     fmt(c), c["pitch_stdev"] if c else "-",
                     fmt(r), r["pitch_stdev"] if r else "-",
                     "%s/%s" % (g.get("filled", "-"), g.get("cells", "-")),
                     "%g~%g" % tuple(g["item_w"]), "%g~%g" % tuple(g["item_h"])])
    table(rows, ["part", "kind", "n", "cols", "c-sd", "rows", "r-sd",
                 "filled/cells", "item w", "item h"],
          ["<", "<", ">", "<", ">", "<", ">", "<", "<", "<"])
    if a.part:
        for g in grids:
            if short(g["part"]) != a.part:
                continue
            print("\n%s %s 详情:" % (short(g["part"]), g["kind"]))
            for ax in ("cols", "rows"):
                if ax in g:
                    x = g[ax]
                    print("  %s n=%d pitch=%g stdev=%g regular=%s"
                          % (ax, x["n"], x["pitch"], x["pitch_stdev"], x["regular"]))
                    print("     中心 %s" % x["centers"])
                    print("     起点 %s" % x["starts"])
    print("\n%d 组栅格。中心分档（非左上角）——同格内元素尺寸可不同仍算同列。"
          "带「不规整」的轴步距方差超阈值，只作参考不要照抄。" % len(grids))


def cmd_clusters(a, outdir):
    d = load(outdir, "extract.json")
    cl = d.get("media_clusters") or []
    if a.multi:
        cl = [c for c in cl if c["member_n"] > 1]
    rows = []
    for c in cl:
        b = (c.get("boxes") or [{}])[0]
        rows.append([c["content_id"], c["member_n"], c["n"],
                     "Y" if c.get("sha256_identical") else "",
                     len(c.get("repeat_fixed") or []),
                     len(c.get("repeat_fixed_cross_media") or []),
                     trunc(",".join(short(m) for m in c["members"]), 52)])
    table(rows, ["cid", "files", "n", "sha=", "rep", "xrep", "members"],
          ["<", ">", ">", "<", ">", ">", "<"])
    print("\n%d 簇（跨文件同素材 %d 簇）。xrep>0 = 同素材散成多文件却占同一位置。"
          % (len(d.get("media_clusters") or []),
             sum(1 for c in (d.get("media_clusters") or []) if c["member_n"] > 1)))


def cmd_media(a, outdir):
    d = load(outdir, "extract.json")
    rows = []
    for m in d["media"]:
        if a.candidate and not m.get("candidate"):
            continue
        rows.append([short(m["media"]), m["ext"], m["bytes"],
                     "Y" if m.get("candidate") else "", m.get("used_n", 0),
                     short(m.get("out")) if m.get("exported") else "-",
                     short(m.get("compressed_out")) or "-",
                     m.get("compressed_bytes") or "-",
                     trunc(",".join(m.get("reasons") or []), 34)])
    table(rows, ["media", "ext", "bytes", "cand", "used", "out", "compressed",
                 "comp_bytes", "reasons"],
          ["<", "<", ">", "<", ">", "<", "<", ">", "<"])
    print("\n%d 个 media，导出 %d，转码 %d。压缩图 = compressed 列那份，原图 = out 列。"
          % (len(d["media"]), d["counts"].get("media_exported", 0),
             d["counts"].get("media_transcoded", 0)))


def cmd_slides(a, outdir):
    d = load(outdir, "extract.json")
    rows = []
    for s in d.get("slides") or []:
        bg = s.get("background") or {}
        col = (bg.get("color") or {}).get("resolved")
        rows.append([short(s["part"]), short(s.get("layout")),
                     bg.get("type") or (bg.get("source") or "-"),
                     col or "-",
                     len(bg.get("stops") or []) or "-"])
    table(rows, ["slide", "layout", "bg type", "bg color", "stops"])
    print("\n%d 页实例页" % len(d.get("slides") or []))


def cmd_layouts(a, outdir):
    d = load(outdir, "extract.json")
    rows = []
    for l in d["layouts"]:
        bg = l.get("background") or {}
        rows.append([short(l["part"]), trunc(l.get("name"), 26), l.get("type_attr"),
                     short(l.get("master")), l.get("used_by_slides"), l.get("shape_n"),
                     trunc(",".join("%s:%s" % kv for kv in (l.get("placeholders") or {}).items()), 30),
                     (bg.get("color") or {}).get("resolved") or bg.get("type") or "-"])
    table(rows, ["layout", "name", "type", "master", "used", "shapes", "placeholders", "bg"],
          ["<", "<", "<", "<", ">", ">", "<", "<"])
    print("\n%d 个版式；form_hint=%s（%s）"
          % (len(d["layouts"]), d["form_hint"]["form"], d["form_hint"]["note"]))



def cmd_summary(a, outdir):
    d = load(outdir, "extract.json")
    fh = d.get("form_hint") or {}
    tt = d.get("theme_topology") or {}
    counts = d.get("counts") or {}
    cv = d.get("canvas") or {}
    print("canvas    : %s px   源 %s EMU" % (cv.get("px"), (cv.get("source") or {}).get("cx")))
    print("form      : %s  (%s)" % (fh.get("form"), trunc(fh.get("note"), 72)))
    print("themes    : %s  mechanism=%s" % (tt.get("themes"), tt.get("mechanism")))
    print("slides    : %s   layouts %s / masters %s" % (
        counts.get("slides"), counts.get("layouts"), counts.get("masters")))
    print("colors    : %s 条   fonts %s 族   images %s" % (
        len(d.get("color_freq") or []), len(d.get("font_families") or []),
        len(d.get("images") or [])))
    multi = [c for c in d.get("media_clusters") or [] if len(c.get("members") or []) > 1]
    if multi:
        print("clusters  : %d 个跨文件同素材簇（query.py clusters --multi 细看）" % len(multi))
    warn = 0
    unresolved = sum(c.get("n", 0) for c in d.get("color_freq") or []
                     if "UNRESOLVED" in str(c.get("resolved", "")))
    if unresolved:
        warn += 1
        print("⚠ UNRESOLVED 色 %d 次——schemeClr 解析有残留，查 ref/ 定位，不能带进语义层" % unresolved)
    if not d.get("pillow_available", True):
        warn += 1
        print("⚠ Pillow 不可用——聚类/取色/转码已降级（%s），产物记 gaps" % d.get("content_cluster_mode"))
    if d.get("scheme_fallback"):
        print("note: scheme_fallback 触发 %d 次（rels 断链回退，详见 extract.json）" % len(d["scheme_fallback"]))
    if not warn:
        print("OK: 无阻塞信号，可进语义层")
    return 0



def cmd_get(a, outdir):
    """按点路径取 extract.json 任意字段，如 get canvas / get theme_topology.mechanism"""
    d = load(outdir, "extract.json")
    cur = d
    for seg in a.path.split("."):
        if isinstance(cur, list):
            cur = cur[int(seg)]
        elif isinstance(cur, dict):
            if seg not in cur:
                raise SystemExit("get: 无字段 %s（同级键: %s）" % (seg, ", ".join(sorted(cur)[:20])))
            cur = cur[seg]
        else:
            raise SystemExit("get: %s 已是标量" % seg)
    print(json.dumps(cur, ensure_ascii=False, indent=1)[:20000])


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("outdir")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("shapes")
    p.add_argument("--part")
    p.add_argument("--kind", choices=sorted(KIND_GROUPS))
    p.add_argument("--ph", action="store_true")
    p.add_argument("--limit", type=int, default=200)
    p.set_defaults(fn=cmd_shapes)

    p = sub.add_parser("colors")
    p.add_argument("--top", type=int, default=40)
    p.add_argument("--class", dest="klass", choices=("design", "editor", "aux"))
    p.set_defaults(fn=cmd_colors)

    p = sub.add_parser("fonts")
    p.add_argument("--all", action="store_true")
    p.set_defaults(fn=cmd_fonts)

    p = sub.add_parser("text-scale")
    p.add_argument("--top", type=int, default=60)
    p.set_defaults(fn=cmd_text_scale)

    p = sub.add_parser("images")
    p.add_argument("--fullscreen", action="store_true")
    p.add_argument("--repeat", action="store_true")
    p.add_argument("--top", type=int, default=60)
    p.set_defaults(fn=cmd_images)

    p = sub.add_parser("clusters")
    p.add_argument("--multi", action="store_true")
    p.set_defaults(fn=cmd_clusters)

    p = sub.add_parser("media")
    p.add_argument("--candidate", action="store_true")
    p.set_defaults(fn=cmd_media)

    sub.add_parser("summary").set_defaults(fn=cmd_summary)

    p = sub.add_parser("get")
    p.add_argument("path")
    p.set_defaults(fn=cmd_get)
    p = sub.add_parser("recipes")
    p.add_argument("--min", type=int, default=2)
    p.add_argument("--top", type=int, default=20)
    p.add_argument("--all", action="store_true")
    p.set_defaults(fn=cmd_recipes)

    p = sub.add_parser("grids")
    p.add_argument("--part")
    p.set_defaults(fn=cmd_grids)

    sub.add_parser("slides").set_defaults(fn=cmd_slides)
    sub.add_parser("layouts").set_defaults(fn=cmd_layouts)

    a = ap.parse_args(argv)
    a.fn(a, os.path.abspath(a.outdir))
    return 0


if __name__ == "__main__":
    sys.exit(main())
