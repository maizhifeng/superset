#!/usr/bin/env python3
"""S15 草案生成器：把阶段一产物机械推导成「判断单草案 + 一页简报 + 候选联系表」。

    python3 draft.py <stage1-outdir>

产出 <stage1-outdir>/l-out/：
    BRIEF.md          唯一必读简报：事实 + 草案依据 + 待判断清单
    vision-group-*.jpg 候选图与所在页语境拼版
    asset-vision-groups.json 候选来源、位置与预算索引
    manifest.yaml / frontmatter.yaml / layout-controls.yaml / layouts.yaml / body.md
                                                        判断单与坐标事实，可直接进 package.py

草案里所有数值都来自 extract.json；凡是需要「像人一样看」才能定的，写成 `TODO:` 行
（package.py 见 TODO 即 FAIL），由 L 层改掉。
"""
import argparse
import copy
import glob
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from census import (  # noqa: E402
    ASSET_WARN_SINGLE,
    canvas_coverage,
    FULLSCREEN_COVERAGE,
    LUM_MID,
    REPEAT_MIN,
    SMALL_IMG_W_PCT,
)
from ooxml import OFFICE_DEFAULT_FONTS  # noqa: E402

OPAQUE_ENOUGH = 128    # 能当背景的最低不透明度：低于半透明就遮不住底下的东西，
                       # 那是叠加装饰不是背景
FILL_MANY = 5          # 「被大量当填充铺开」的次数下限，用于区分卡片底与偶发用色
BG_CONTENT_CAP = 5     # 内容页背景收几张：再多消费端也挑不过来，超出的写进 TODO 交人取舍
SHEET_BATCH = 12       # 每张联系表最多 12 个候选；候选不截断，超出就继续生成下一张
CONTEXT_BATCH = 8      # 每张整页语境表最多 8 页；同页只渲染一次
# 与 studio_server_faas 的批量 vision 图数预算保持一致。单页大组允许 1 张整页图 +
# 9 张候选；多个小页合组时，所有整页图和候选图合计最多 5 张。
SINGLE_PAGE_IMAGE_BUDGET = 10
MULTI_PAGE_IMAGE_BUDGET = 5
# Skill 侧的总输入上限：限制模型需要读取的拼版数量和总视觉图数，而不是偷偷截断
# 中间产物。首页、尾页优先；其余超限候选在 gaps 中显式说明。
VISUAL_PACK_CAP = 5
VISUAL_INPUT_CAP = 30
VISUAL_PREVIEW_MAX_EDGE = 1200
VISUAL_JPEG_QUALITY = 82

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL_ROOT = os.path.dirname(HERE)
SYS_FALLBACK = '"PingFang SC", "Microsoft YaHei", sans-serif'


# ---------------------------------------------------------------- 小工具
# 被名额截掉的东西统一记在这里，最后并进 gaps。截断本身是必要的（色板 40 个 token
# 消费端挑不过来），但**不说**就成了「悄悄少了东西而产物看起来正常」——消费端会以为
# 它拿到的就是全部。
_TRUNCATED = []


def note_truncation(kind, kept, total, advice="", where=""):
    """记一条「这里按名额截断了」。kept >= total 时什么都不记。

    按 kind 归并成一条 gap：同一类截断逐处各写一行会淹掉别的 gaps。
    """
    if total > kept:
        _TRUNCATED.append((kind, kept, total, advice, where))
    return kept


def hex2rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def lum(rgb):
    return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255.0


def satu(rgb):
    mx, mn = max(rgb), min(rgb)
    return 0.0 if mx == 0 else (mx - mn) / mx


def slide_no(part):
    m = re.search(r"slide(\d+)\.xml$", part)
    return int(m.group(1)) if m else 9999


def walk_sz(node, out):
    if isinstance(node, dict):
        if "sz_px" in node and isinstance(node["sz_px"], (int, float)):
            out.append(node["sz_px"])
        for v in node.values():
            walk_sz(v, out)
    elif isinstance(node, list):
        for v in node:
            walk_sz(v, out)


def shape_sz(s):
    out = []
    walk_sz(s.get("text") or {}, out)
    walk_sz(s.get("lstStyle") or {}, out)
    return max(out) if out else 0.0


def shape_text(s, limit=24):
    buf = []
    for p in (s.get("text") or {}).get("paragraphs", []):
        for r in p.get("runs", []):
            t = (r.get("text") or "").strip()
            if t:
                buf.append(t)
    txt = " ".join(buf).replace("\n", " ")
    return txt[:limit]


def q(v):
    """写进 YAML 的标量：需要引号的加引号。"""
    s = str(v)
    if s and (s[0] in '#{[&*!|>%@`"\'' or ": " in s or s.strip() != s):
        return '"%s"' % s.replace('"', '\\"')
    return s


# ---------------------------------------------------------------- 颜色
def bg_colors(d):
    """页面/版式/母版的 `background` 声明里出现的底色，按声明次数排序。

    「哪个色是底色」是直读事实（bgPr / bgRef），不用靠亮度猜：渐变里出现的浅色，
    亮度可能比真底色更像底色。
    """
    cnt = Counter()
    rows = (d.get("slides") or []) + (d.get("layouts") or []) \
        + ((d.get("masters") or {}).get("masters") or [])
    for row in rows:
        bg = row.get("background")
        if not isinstance(bg, dict):
            continue
        cols = []
        if isinstance(bg.get("color"), dict):
            cols.append(bg["color"])
        for st in (bg.get("stops") or []):
            if isinstance(st.get("color"), dict):
                cols.append(st["color"])
        for c in cols:
            h = (c.get("hex") or "").upper()
            if h:
                cnt[h] += 1
    return [h for h, _ in cnt.most_common()]


def _gap_cut(vals, lo, hi):
    """在排序后的值里找最大间隙，切点取间隙中点。

    不用中位数：中位数会正好落在某个样本自己身上，它归哪边就只取决于写 >= 还是 >，
    纯属任意。真正的分界在两族之间的空档里。夹在 [lo, hi] 内，避免整套同色的模板
    把界推到极端。
    """
    v = sorted(vals)
    if len(v) < 2:
        return (lo + hi) / 2.0
    _, mid = max((v[i + 1] - v[i], (v[i + 1] + v[i]) / 2.0) for i in range(len(v) - 1))
    return min(max(mid, lo), hi)


def palette_cuts(rows):
    """「有彩 vs 中性」「深 vs 浅」的分界，按本模板自己的色分布切。

    固定分界必然错一边：低饱和的莫兰迪配色整套都在低位，高饱和的品牌配色整套都在高位。
    """
    sat_cut = _gap_cut([r["sat"] for r in rows], 0.12, 0.45)
    lums = sorted(r["lum"] for r in rows) or [0.0]
    return sat_cut, lums[len(lums) // 2]


def draft_colors(d, cusage=None):
    """色板 token：名字按**实际用法**定，不只看亮度饱和度。

    只看 lum/sat 会把「主要用来填色的纯黑」命名成 ink（文字色）、把「只出现在渐变里的
    浅蓝」命名成 surface-alt。这里先看它在形状上主要干什么，再结合
    亮度定名；用量太少的直接不进色板。
    """
    cusage = cusage or {}
    pool = [c for c in d["color_freq"]
            if c.get("class") == "design" and abs((c.get("alpha") or 100) - 100) < 0.1]
    seen, rows = set(), []
    for c in pool:
        h = c["hex"].upper()
        if h in seen:
            continue
        seen.add(h)
        rgb = hex2rgb(h)
        u = cusage.get(h) or Counter()
        tot = sum(u.values())
        main = u.most_common(1)[0][0] if tot else None
        rows.append({"hex": h, "n": c["n"], "lum": lum(rgb), "sat": satu(rgb),
                     "use": u, "use_n": tot, "main": main})
    # 用量只用来**命名**，不作准入门槛——color_usage 只数形状级的填充/描边/文字，
    # 背景 p:bg 与主题色不在其中，拿它筛会把色板砍到只剩极少数几个。
    strong = sorted(rows, key=lambda r: -r["n"])

    SAT_CUT, LUM_CUT = palette_cuts(rows)

    tokens, used = [], set()

    def take(pred, names):
        for name in names:
            for r in strong:
                if r["hex"] in used or not pred(r):
                    continue
                used.add(r["hex"])
                tokens.append((name, r))
                break

    def kind(r):
        if r["main"] == "文字":
            return "text"
        if r["main"] in ("填充", "渐变", "描边"):
            return "paint"
        return "unknown"        # 形状层看不到用法，退回亮度/饱和度判断

    # 墨色：主要用来写字（或看不出用法但本身是深中性色），且不是彩色
    take(lambda r: r["sat"] < SAT_CUT and r["lum"] < min(LUM_CUT, LUM_MID)
         and (kind(r) == "text" or kind(r) == "unknown"), ["ink", "ink-muted"])
    # 底色：直接取页面 background 声明里的色，按声明次数排
    grounds = bg_colors(d)
    for name in ("surface", "surface-alt"):
        for h in grounds:
            r = next((x for x in strong if x["hex"] == h and x["hex"] not in used), None)
            if r:
                used.add(r["hex"])
                tokens.append((name, r))
                break

    # 卡片/面板底：页面底色之外，真被大量当填充铺开的浅色（≥5 处才算）
    take(lambda r: r["lum"] > max(LUM_CUT, 0.85) and r["sat"] < SAT_CUT
         and (r["use"].get("填充") or 0) >= FILL_MANY, ["surface-raised"])
    # 表达色：有彩度的按频次排
    take(lambda r: r["sat"] >= SAT_CUT, ["primary", "accent", "accent-2", "accent-3"])
    # 其余低饱和色一律 neutral-N——它到底是卡片底、分隔线还是描边，数据分不出来，
    # 就不要用名字去替消费方下结论；真实用法写在 Colors 表的用途列里。
    take(lambda r: r["sat"] < SAT_CUT, ["neutral", "neutral-2", "neutral-3"])
    spare = [r for r in rows if r["hex"] not in used]
    note_truncation("设计色", 6, len(spare), "色板只收主要色，其余在联系表里看")
    rest = spare[:6]
    return tokens, rest, rows



# ---------------------------------------------------------------- 字体
def parse_fallback_table():
    path = os.path.join(SKILL_ROOT, "font-fallback.yaml")
    if not os.path.exists(path):
        return []
    fams, cur = [], None
    for line in open(path, encoding="utf-8"):
        m = re.match(r"\s*-\s*family:\s*(.+)", line)
        if m:
            cur = {"family": m.group(1).strip(), "match": [], "fallback": [], "category": ""}
            fams.append(cur)
            continue
        if cur is None:
            continue
        m = re.match(r"\s*(match|fallback):\s*\[(.*)\]", line)
        if m:
            cur[m.group(1)] = [x.strip().strip('"\'') for x in m.group(2).split(",") if x.strip()]
        m = re.match(r"\s*category:\s*(.+)", line)
        if m:
            cur["category"] = m.group(1).strip()
    return fams


def norm(s):
    return re.sub(r"[\s\-_]", "", s or "").lower()


OFFICE_DEFAULT_FONTS_NORM = {norm(x) for x in OFFICE_DEFAULT_FONTS}


def cover_slot_colors(tokens, archetypes, rows, cusage):
    """slot CSS 里出现的每个色值都必须在色板里有名字。

    Hard Rules 写「颜色只用 colors 里的 token」，而 slot CSS 的 color 是从模板直读的，
    两者不对齐就等于产物自己违反自己的规则——slot 的色值直读自模板，未必都已进
    色板。这里把缺的补进色板，按用法归族命名。
    """
    have = {r["hex"].upper() for _, r in tokens}
    by_hex = {r["hex"].upper(): r for r in rows}
    sat_cut, lum_cut = palette_cuts(rows)      # 与 draft_colors 同一套切点，别各切各的
    used = [n for n, _ in tokens]

    def nxt(fam):
        if fam not in used:
            return fam
        i = 2
        while "%s-%d" % (fam, i) in used:
            i += 1
        return "%s-%d" % (fam, i)

    added = []
    for a in archetypes:
        for s in a["slots"]:
            h = (s.get("_color") or "").upper()
            if not h.startswith("#") or h in have:
                continue
            have.add(h)
            r = by_hex.get(h)
            if r is None:            # 普查里没有这个色（理论上不该发生），跳过不编造
                continue
            fam = ("ink" if r["sat"] < sat_cut and r["lum"] < min(lum_cut, LUM_MID)
                   else "accent" if r["sat"] >= sat_cut else "neutral")
            name = nxt(fam)
            used.append(name)
            tokens.append((name, r))
            added.append((name, h))
    return added


def draft_fonts(d):
    table = parse_fallback_table()
    groups = defaultdict(lambda: {"rendered": 0, "weights": set(), "names": set(), "bold": 0})
    for f in d["font_families"]:
        if not f.get("rendered_n"):
            continue
        key = f.get("alias_group") or f["family"]
        g = groups[key]
        g["rendered"] += f["rendered_n"]
        g["names"].add(f["family"])
        g["bold"] += f.get("bold_runs") or 0
        for v in f.get("variants", []):
            if v.get("weight"):
                g["weights"].add(v["weight"])
    ranked = sorted(groups.items(), key=lambda kv: -kv[1]["rendered"])

    def resolve(names):
        for n in names:
            for fam in table:
                for m in fam["match"]:
                    if norm(m) == norm(n) or norm(m) in norm(n) or norm(n) in norm(m):
                        return fam
        return None

    out = []
    note_truncation("字族", 4, len(ranked), "只报渲染量最大的几族")
    for key, g in ranked[:4]:
        fam = resolve(sorted(g["names"], key=len))
        stack = [sorted(g["names"], key=len)[0]]
        if fam:
            stack += [x for x in fam["fallback"] if x not in stack]
        out.append({
            "key": key, "rendered": g["rendered"], "names": sorted(g["names"]),
            "weights": sorted(g["weights"]) or ([600] if g["bold"] else [400]),
            "stack": stack, "mapped": fam["family"] if fam else None,
            "category": fam["category"] if fam else "",
        })
    return out


def font_css(stack):
    return ", ".join('"%s"' % s for s in stack) + ", " + SYS_FALLBACK


MIRROR = "https://miaoda.feishu.cn/fonts/css2"


def import_line(fonts):
    """降级链里用到的镜像字体拼成一行 @import（check_v1 硬要求）。"""
    webs = []
    for f in fonts[:2]:
        for name in f["stack"][1:]:
            if name not in webs:
                webs.append(name)
    if not webs:
        webs = ["Noto Sans SC"]
    fam = "&".join("family=%s:wght@400" % w.replace(" ", "+") for w in webs)
    return "@import url('%s?%s&display=swap');" % (MIRROR, fam), webs


def quant(hit, total):
    """覆盖率决定量词——不到一半就不许说「一律/每页」。"""
    if not total:
        return None
    r = hit / float(total)
    if r >= 0.9:
        return "一律"
    if r >= 0.5:
        return "多数"
    return None


def color_usage(shapes, d=None):
    """每个色值在形状上的真实用法计数：填充 / 渐变 / 描边 / 文字。

    用途列不能靠预设字典猜——同一个色在不同模板里的主用途完全不同。这里从 shapes
    直接数，数不到就如实说数不到。
    """
    def hx(c):
        return (c.get("hex") or "").upper() if isinstance(c, dict) else ""

    def walk_text_colors(node, out):
        """文本样式可能嵌在 lstStyle.lvlNpPr / defRPr / rPr 任一层——通用遍历，
        别逐层枚举（枚举漏过 lvl2pPr，导致主色被写成「用途待确认」）。"""
        if isinstance(node, dict):
            if isinstance(node.get("color"), dict) and hx(node["color"]):
                out.append(hx(node["color"]))
            for v in node.values():
                walk_text_colors(v, out)
        elif isinstance(node, list):
            for v in node:
                walk_text_colors(v, out)

    use = defaultdict(Counter)
    for s in shapes:
        f = s.get("fill") or {}
        if f.get("type") == "solid" and hx(f.get("color")):
            use[hx(f["color"])]["填充"] += 1
        for st in (f.get("stops") or []):
            if hx(st.get("color")):
                use[hx(st["color"])]["渐变"] += 1
        ln = s.get("line") or {}
        if hx(ln.get("color")):
            use[hx(ln["color"])]["描边"] += 1
        cols = []
        walk_text_colors(s.get("text") or {}, cols)
        for h in cols:
            use[h]["文字"] += 1
    for h in bg_colors(d or {}):
        use[h]["页面背景"] += 1
    # 主题 clrScheme：这类色常常只在主题里声明、页面上由 schemeClr 间接引用，
    # 不记上就会在用途列写「未落在形状上」，看着像没人用。
    for th in ((d or {}).get("themes") or []):
        if not th.get("picked"):
            continue
        for slot, hexv in (th.get("clrScheme") or {}).items():
            if isinstance(hexv, str) and hexv.startswith("#"):
                use[hexv.upper()]["主题 " + slot] += 1
    return use


def usage_phrase(counter):
    """把用法计数写成一句话；主用法占六成以上就直接点名，否则并列前三。"""
    if not counter:
        return "普查里有声明，但未落在形状/背景/主题色上——用途待确认"
    items = counter.most_common()
    tot = sum(counter.values())
    if items[0][1] >= tot * 0.6:
        return "主要作%s（%d/%d 处）" % (items[0][0], items[0][1], tot)
    return "、".join("%s %d 处" % (k, v) for k, v in items[:3])


def draft_anchors(d, tokens, fonts, roles, assets, archetypes):
    """anchors 只报测到的数，不下「这套风格是什么」的结论。

    这一段在 design.md 里读起来像「设计总纲」，消费端会照它建全局样式。脚本写进去的
    每一句解读都会被当成规则执行——实测把 1/8 覆盖率的 logo 描述成「跨页不动」，
    消费端就建了全局 CSS 类，12 页全铺了 logo。所以这里只给覆盖率和计数，
    「这是不是这套风格的特征」由看得到图的人判断。
    """
    A = []
    n_arch = len(archetypes) or 1

    # 1. 表达色：未取用的高频彩色要如实带上，不能说「其余全是中性」
    names = [x[0] for x in tokens]
    chroma = [n for n in names if n.startswith(("primary", "accent"))]
    if chroma:
        A.append((chroma[0] + "-led-palette", "token",
                  "有彩色 token 共 %d 个，用量最大的是 %s"
                  % (len(chroma), "、".join(chroma[:3]))))

    # 2. 圆角：按普查占比
    radii = d.get("radii_census") or []
    zero = next((r for r in radii if r["px"] == 0), None)
    tot_r = sum(r["n"] for r in radii) or 1
    if zero:
        q0 = quant(zero["n"], tot_r)
        if q0:
            A.append(("zero-radius", "token",
                      "圆角量为零的形状占 %d%%（普查 %d 个带圆角声明的形状）"
                      % (round(100.0 * zero["n"] / tot_r), tot_r)))

    # 3. 满屏底图：按有背景的页型占比
    with_bg = sum(1 for a in archetypes if a.get("bg"))
    qb = quant(with_bg, n_arch)
    if qb:
        A.append(("full-bleed-ground", "pattern",
                  "%d/%d 个页型声明了整幅铺满的底图" % (with_bg, n_arch)))

    # 4. 标识：位置是不是真的固定，看有几个不同的 box
    logo_slots = [s for a in archetypes for s in a["slots"]
                  if str(s.get("asset") or "").startswith(("logo", "slogan"))]
    logo_arch = sum(1 for a in archetypes
                    if any(str(s.get("asset") or "").startswith(("logo", "slogan"))
                           for s in a["slots"]))
    boxes = {tuple(s["box"]) for s in logo_slots}
    # anchors 是「这套风格的定义性特征」，消费端读它来建全局样式。只在少数页型出现的
    # 东西写进来，等于宣布它是全局元素——实测某模板 logo 只在 1/8 个页型上，anchor 仍
    # 写成「跨页不动」，消费端据此建了个全局 CSS 类，12 页全铺了 logo。
    # 所以这里和其他 anchor 用同一把尺：覆盖率不过半就不进 anchors。
    ql = quant(logo_arch, n_arch)
    if logo_arch and len(boxes) == 1 and ql:
        A.append(("corner-locked-logo", "component",
                  "品牌标识出现在 %d/%d 个页型上，这些页型里它的 box 完全一致"
                  % (logo_arch, n_arch)))
    elif len(boxes) > 1:
        A.append(("logo-moves-by-archetype", "component",
                  "品牌标识按页型换位换尺寸（共 %d 种摆法），必须按 layouts 里该页型的 box 放，"
                  "不能沿用上一页" % len(boxes)))

    # 5. 渐变：按普查计数
    if (d.get("geom_census") or {}).get("gradient_fills"):
        A.append(("gradient-accent", "pattern",
                  "全档共 %d 处渐变填充" % (d["geom_census"]["gradient_fills"])))

    # 6. 层级：字号跨度 + 字重是否单一（字重真单一才敢说「不靠字重」）
    disp, body = roles.get("display"), roles.get("body")
    if disp and body and disp["sz_px"] > body["sz_px"]:
        ws = {s.get("_font_weight") for a in archetypes for s in a["slots"]
              if s.get("_font_weight")}
        tail = ("，字重只用 %s 一档" % list(ws)[0]) if len(ws) == 1 else ""
        A.append(("size-driven-hierarchy", "pattern",
                  "最大字号档与正文档相差 %.1f 倍（见 typography）%s"
                  % (disp["sz_px"] / body["sz_px"], tail)))

    # 7. 阴影：只在描边极少时才敢说「不用描边分隔」
    eff = d.get("effects_census") or {}
    if eff.get("outerShdw"):
        A.append(("soft-shadow-card", "component",
                  "全档 %d 处 outerShdw 外阴影" % eff["outerShdw"]))

    # 8. 双字族：只陈述分工存在，不断言「同一行混排」（普查没采集混排）
    tot_r_font = sum(f["rendered"] for f in fonts) or 1
    if len(fonts) >= 2 and fonts[1]["rendered"]:
        A.append(("dual-family-typesetting", "token",
                  "用了两套字族：%s 渲染 %d 处、%s 渲染 %d 处"
                  % (fonts[0]["names"][0], fonts[0]["rendered"],
                     fonts[1]["names"][0], fonts[1]["rendered"])))

    # 9. 安全区：只在各页型正文左边界真的收敛时才写
    # 「多宽算正文槽」按本包自己的槽宽分布定：固定 px 门槛在窄版心模板上会一个都不剩
    widths = sorted(s["box"][2] for a in archetypes for s in a["slots"] if not s.get("asset"))
    w_cut = widths[len(widths) // 2] if widths else 0
    lefts = [s["box"][0] for a in archetypes for s in a["slots"]
             if not s.get("asset") and s["box"][2] >= w_cut]
    if len(lefts) >= 4:
        common = Counter(lefts).most_common(1)[0]
        qs = quant(common[1], len(lefts))
        if qs:
            A.append(("shared-left-margin", "token",
                      "%d/%d 个正文槽的左边界落在同一个 x 上（坐标见 layouts）"
                      % (common[1], len(lefts))))

    # 10. 双主题：直读事实
    themes = (d.get("theme_topology") or {}).get("themes") or []
    if len(themes) > 1:
        A.append(("dual-theme-masters", "token",
                  "模板声明了 %s 两套主题母版" % " / ".join(themes)))

    # 11. 画布：直读事实（兜底凑数也只用真事实）
    cv = d["canvas"]["px"]
    A.append(("fixed-canvas", "token",
              "画布 %d×%d，layouts 里的坐标都是这张画布上的绝对像素" % (cv[0], cv[1])))
    if len(archetypes) >= 3:
        A.append(("archetype-catalog", "pattern",
                  "归纳出 %d 种页型" % len(archetypes)))

    seen, out = set(), []
    for a in A:
        if a[0] in seen:
            continue
        seen.add(a[0])
        out.append(a)
    return out[:8]

def draft_scale(d, archetypes=()):
    ts = [t for t in d["text_scale"] if t["sz_px"] >= 10]
    ts.sort(key=lambda t: -t["sz_px"])
    if not ts:
        return {}
    by_px = {t["sz_px"]: t for t in ts}
    # display 优先取「真的当标题用过」的字号（archetype 首槽），而不是全局最大值
    title_sz = Counter(s["sz"] for a in archetypes for s in a["slots"] if s["type"] == "title")
    display = by_px.get(max(title_sz)) if title_sz else None
    big = [t for t in ts if t["n"] >= 2] or ts
    display = display or big[0]
    # 正文档 = 渲染次数最多的那一档。不设「多大算正文」的上限：大字号排版的模板
    # 正文本来就可能比别的模板的标题还大，预设上限会把它整档判错。
    body = max([t for t in ts if t is not display] or ts, key=lambda t: t["n"])
    heading_pool = [t for t in ts if body["sz_px"] * 1.3 <= t["sz_px"] < display["sz_px"]]
    heading = max(heading_pool, key=lambda t: t["n"]) if heading_pool else None
    small_pool = [t for t in ts if t["sz_px"] < body["sz_px"]]
    caption = max(small_pool, key=lambda t: t["n"]) if small_pool else None
    roles = {"display": display, "body": body}
    if heading:
        roles["heading"] = heading
    if caption:
        roles["caption"] = caption
    return roles


def lh_of(t):
    lhm = t.get("line_height_mult") or {}
    if not lhm:
        return None
    best = max(lhm.items(), key=lambda kv: kv[1])[0]
    try:
        v = float(best)
    except ValueError:
        return None
    return v if 0.9 <= v <= 2.2 else None


# ---------------------------------------------------------------- 资产
def probe_image(path):
    info = {
        "w": None,
        "h": None,
        "alpha_mean": None,
        "near_blank": False,
        "near_white_ratio": None,
    }
    try:
        from PIL import Image
    except Exception:
        return info
    try:
        im = Image.open(path)
        info["w"], info["h"] = im.size
        preview = im.convert("RGBA").resize((64, 64))
        pixels = (preview.get_flattened_data()
                  if hasattr(preview, "get_flattened_data") else preview.getdata())
        px = list(pixels)
        alpha = [item[3] for item in px]
        if im.mode in ("RGBA", "LA") or "transparency" in im.info:
            info["alpha_mean"] = sum(alpha) / len(alpha)
            info["near_blank"] = info["alpha_mean"] < 13  # <5% 不透明度
        visible = [item for item in px if item[3] >= 32]
        if visible:
            near_white = [item for item in visible
                          if item[0] >= 235 and item[1] >= 235 and item[2] >= 235]
            info["near_white_ratio"] = round(len(near_white) / float(len(visible)), 3)
    except Exception:
        pass
    return info


def needs_asset_judgment(candidate):
    """局部图和半透明满屏叠加层需要看图定性；不透明满屏图按背景处理。"""
    effective_alpha = candidate.get("effective_alpha_mean")
    if not candidate.get("fullscreen"):
        return True
    alpha = (effective_alpha if effective_alpha is not None
             else (candidate.get("probe") or {}).get("alpha_mean"))
    return alpha is not None and 13 <= alpha < OPAQUE_ENOUGH


def fullscreen_effective_alpha(data, outdir, shapes):
    """满屏图片的实际平均 alpha，包含图片文件 alpha 与 OOXML 形状透明度。"""
    media_out = {row.get("media"): row.get("out") for row in data.get("media") or []
                 if row.get("media") and row.get("out")}
    probed = {}
    effective = {}
    for shape in shapes:
        media = shape.get("media")
        if (shape.get("kind") != "pic" or not media
                or shape.get("w_pct", 0) < 95 or shape.get("h_pct", 0) < 95):
            continue
        if media not in probed:
            out = media_out.get(media)
            probe = probe_image(os.path.join(outdir, out)) if out else {}
            probed[media] = probe.get("alpha_mean")
        source_alpha = probed[media]
        if source_alpha is None:
            source_alpha = 255.0
        try:
            opacity = float(shape.get("opacity", 1.0))
        except (TypeError, ValueError):
            opacity = 1.0
        alpha = source_alpha * max(0.0, min(opacity, 1.0))
        effective[media] = min(effective.get(media, 255.0), alpha)
    return effective


def fullscreen_overlay_media(data, outdir, shapes):
    """需要模型判断的满屏叠加层媒体。"""
    return {
        media for media, alpha in fullscreen_effective_alpha(data, outdir, shapes).items()
        if 13 <= alpha < OPAQUE_ENOUGH
    }


def bg_busy_map(path, canvas, cells=12):
    """把背景图切成网格，报每格的**局部对比度**（该格内亮度极差）。

    「哪里不能压文字」的本质是「哪里花」。整幅渐变的底图各格对比度都低，说明没有
    视觉主体；有山峰、人物、产品图的底图会在主体处出现明显更高的对比度。这里只出
    客观数值和一个据此推出的草案，最终由看得到图的人定。
    """
    try:
        from PIL import Image
    except Exception:
        return None
    try:
        im = Image.open(path).convert("L").resize((cells * 8, cells * 8))
    except Exception:
        return None
    px = im.load()
    grid = []
    for gy in range(cells):
        row = []
        for gx in range(cells):
            vals = [px[gx * 8 + x, gy * 8 + y] for y in range(8) for x in range(8)]
            row.append(max(vals) - min(vals))
        grid.append(row)
    flat = sorted(v for row in grid for v in row)
    if not flat:
        return None
    med = flat[len(flat) // 2]
    hi = flat[int(len(flat) * 0.9)]
    # 主体 = 对比度显著高于全图中位数的连片格子。阈值取「中位数与九分位的中点」，
    # 由本图自己的分布定，不用固定值。
    cut = (med + hi) / 2.0
    cW, cH = canvas
    hot = [(gx, gy) for gy in range(cells) for gx in range(cells) if grid[gy][gx] > cut]
    if not hot:
        return {"busy": None, "median": med, "p90": hi, "why": "各处对比度一致，没有更花的区域"}
    xs = [g[0] for g in hot]
    ys = [g[1] for g in hot]
    span = ((max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)) / float(cells * cells)
    if span > 0.5:
        # 热格散落全图，外接矩形几乎覆盖整幅——圈出来等于没圈
        return {"busy": None, "median": med, "p90": hi, "why": "较花的格子散布全图，圈不出单一主体"}
    box = [round(min(xs) * cW / cells), round(min(ys) * cH / cells),
           round((max(xs) - min(xs) + 1) * cW / cells),
           round((max(ys) - min(ys) + 1) * cH / cells)]
    return {"busy": box, "median": med, "p90": hi, "span": round(span, 2)}


def copy_logo_candidates(outdir, logo_pool):
    if not logo_pool:
        return []
    dst_dir = os.path.join(outdir, "ref", "logo-candidates")
    os.makedirs(dst_dir, exist_ok=True)
    rows = []
    for rank, (score, c) in enumerate(sorted(logo_pool, key=lambda kv: (-kv[0], -kv[1]["n"])), 1):
        src = os.path.join(outdir, c.get("out") or "")
        if not os.path.exists(src):
            continue
        name = "%02d-score%s-%s" % (rank, score, c["file"])
        dst = os.path.join(dst_dir, name)
        shutil.copy2(src, dst)
        b = c.get("box") or {}
        rows.append({
            "rank": rank,
            "score": score,
            "file": c["file"],
            "copy": os.path.relpath(dst, outdir),
            "slides": c.get("slides") or [],
            "box": [round(b.get(k, 0)) for k in ("x", "y", "w", "h")],
            "used_n": c.get("n", 0),
        })
    if rows:
        with open(os.path.join(dst_dir, "index.json"), "w", encoding="utf-8") as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
            f.write("\n")
    return rows


def draft_assets(d, outdir, bg_needed=(), cover_media=None, bg_under=None,
                 effective_alpha=None):
    imgs = {i["media"]: i for i in d["images"]}
    cluster_of = {}
    for c in d.get("media_clusters", []):
        for m in c["members"]:
            cluster_of[m] = c["content_id"]

    cands = []
    for m in d["media"]:
        if not m.get("exported"):
            continue
        img = imgs.get(m["media"], {})
        out_rel = m.get("out") or ""
        probe = probe_image(os.path.join(outdir, out_rel)) if out_rel else {}
        boxes = img.get("boxes") or []
        top = max(boxes, key=lambda b: b.get("count", 0)) if boxes else {}
        parts = top.get("parts") or []
        placements, seen_placements = [], set()
        for cluster in boxes:
            box = cluster.get("box") or {}
            rounded = [round(box.get(key, 0)) for key in ("x", "y", "w", "h")]
            for part in cluster.get("parts") or []:
                if "/slides/" in part:
                    row = {"slide": slide_no(part), "box": rounded}
                elif "/slideLayouts/" in part:
                    row = {"layout": os.path.basename(part), "box": rounded}
                else:
                    continue
                key = (row.get("slide"), row.get("layout"), tuple(rounded))
                if key not in seen_placements:
                    seen_placements.add(key)
                    placements.append(row)
        placements.sort(key=lambda row: (
            row.get("slide", 9999), row.get("layout", ""), tuple(row["box"])))
        slides = sorted({row["slide"] for row in placements if row.get("slide")})
        cands.append({
            "media": m["media"], "file": os.path.basename(out_rel), "out": out_rel,
            "bytes": m.get("bytes"), "n": img.get("n", m.get("used_n", 0)),
            "has_compressed": bool(m.get("compressed_out")),
            "fullscreen": bool(img.get("fullscreen")), "w_pct": img.get("max_w_pct", 0),
            "box": top.get("box") or {}, "slides": slides,
            "placements": placements,
            "layer_only": bool(parts) and not slides,
            "repeat": bool(img.get("repeat_fixed")),
            "cluster": cluster_of.get(m["media"]),
            "effective_alpha_mean": (effective_alpha or {}).get(m["media"]),
            "probe": probe, "reasons": m.get("reasons", []),
        })

    # 同素材簇去重：留 n 最大的一张
    best_of = {}
    for c in cands:
        k = c["cluster"] or c["media"]
        if k not in best_of or c["n"] > best_of[k]["n"]:
            best_of[k] = c
    kept = sorted(best_of.values(), key=lambda c: (-c["n"], -(c["bytes"] or 0)))
    # 被同簇兄弟淘汰的 media 仍要能指到胜出者——封面底图常常是簇里 n 最小的那张
    alias = {}
    for c in cands:
        w = best_of.get(c["cluster"] or c["media"])
        if w and w["media"] != c["media"]:
            alias[c["media"]] = w["media"]
    cover_media = alias.get(cover_media, cover_media)
    bg_needed = {alias.get(m, m) for m in (bg_needed or ())}

    assets, rejected, todos = [], [], []
    over_cap_bgs = []
    logo_pool = []
    bg_under = bg_under or {}
    bg_i = 0
    canvas_w, canvas_h = d["canvas"]["px"]
    for c in kept:
        effective_am = c.get("effective_alpha_mean")
        if (c["fullscreen"] and (c["probe"].get("near_blank")
                                 or (effective_am is not None and effective_am < 13))):
            rejected.append((c, "近全透明（alpha 均值 %.0f/255），PPT 里看不见"
                             % (effective_am if effective_am is not None
                                else c["probe"]["alpha_mean"])))
            continue
        # 铺满 ≠ 能当背景。背景的定义性属性是**遮盖**：它得挡住底下的东西。一张大半透明
        # 的图铺满整页也遮不住任何像素，它在 PPT 里是叠在幻灯片底色上的一层装饰（顶部
        # 光晕之类），底色才是真背景。实测某模板一张 alpha 均值 30/255、72% 完全透明的
        # 顶部光晕被当成满屏背景收进包，消费端每页铺它，顶部就多出一条原稿没有的浓色带。
        am = effective_am if effective_am is not None else c["probe"].get("alpha_mean")
        if c["fullscreen"] and am is not None and am < OPAQUE_ENOUGH:
            rejected.append((c, "alpha 均值只有 %.0f/255，遮不住底下的东西——"
                             "它是叠在底色上的装饰层，不是背景" % am))
            continue
        if c["fullscreen"]:
            if c["media"] == cover_media:
                assets.append({"id": "bg-cover", "kind": "background", "role": "cover",
                               "src": c,
                               # 只有真出了压缩版才能带原图；否则 path/full 指向同一
                               # 文件，package.py 必 FAIL（封面不需要转码时就会踩到）
                               "use_full": c["has_compressed"]})
            elif c["media"] in bg_needed and bg_i < BG_CONTENT_CAP:
                bg_i += 1
                assets.append({"id": "bg-content-%d" % bg_i, "kind": "background",
                               "role": "content", "src": c, "use_full": False})
            elif c["media"] in bg_needed:
                over_cap_bgs.append(c)
                rejected.append((c, "有页型以它为主底，但内容页背景已收满 %d 张" % BG_CONTENT_CAP))
            else:
                rejected.append((c, "满屏图但没有页面以它为主底（只在版式层备用）"))
        elif c["w_pct"] < SMALL_IMG_W_PCT and c["n"] >= REPEAT_MIN:
            # 品牌标识的共性是「小、重复出现、贴角」。这里只按贴角程度排序给出首选，
            # 不设及格线——「多少分算 logo」没有客观依据，判断交 L 层，分项证据随 TODO 给出。
            b = c["box"]
            edge_x = min(b.get("x", 0), max(canvas_w - (b.get("x", 0) + (b.get("w") or 0)), 0))
            edge_y = min(b.get("y", 0), max(canvas_h - (b.get("y", 0) + (b.get("h") or 0)), 0))
            corner = (edge_x / canvas_w) + (edge_y / canvas_h)   # 越小越贴角
            logo_pool.append((corner, c))
        else:
            rejected.append((c, "内容区图片（占宽 %.0f%%，出现 %d 次）" % (c["w_pct"], c["n"])))

    def on_bg_of(c):
        """logo 压在浅底还是深底：直接采底图上它那块区域的亮度，不用人判。"""
        bg = bg_under.get(c["slides"][0]) if c["slides"] else None
        row = next((m for m in d["media"] if m["media"] == bg and m.get("out")), None)
        if not row:
            return None
        try:
            from PIL import Image
            im = Image.open(os.path.join(outdir, row["out"])).convert("RGB")
            b = c["box"]
            sx, sy = im.width / float(canvas_w), im.height / float(canvas_h)
            crop = im.crop((int(b.get("x", 0) * sx), int(b.get("y", 0) * sy),
                            max(int((b.get("x", 0) + b.get("w", 1)) * sx), 1),
                            max(int((b.get("y", 0) + b.get("h", 1)) * sy), 1))).resize((16, 16))
            raw = crop.tobytes()
            px = [raw[i:i + 3] for i in range(0, len(raw), 3)]
            return "light" if sum(lum(p) for p in px) / len(px) > LUM_MID else "dark"
        except Exception:
            return None

    # 贴角是品牌标识的定义性特征：离两边都超过画布 1/4 的重复小图，更可能是页内装饰。
    # 这不是「多少分算 logo」那种凑出来的分数线——它直接来自「贴角」这个判据本身。
    LOGO_CORNER_MAX = 0.5      # edge_x/W + edge_y/H，两边各 25% 即到上限
    logo_pool.sort(key=lambda kv: (kv[0], -kv[1]["n"]))
    if logo_pool and logo_pool[0][0] > LOGO_CORNER_MAX:
        todos.append("没有贴角的重复小图（最接近的一张离画布边 %.0f%%），本模板可能没有 logo；"
                     "确认后要么从联系表挑一张补进 manifest，要么在 gaps 写明模板无品牌标识"
                     % (logo_pool[0][0] * 50))
        logo_pool = []
    for i, (corner, c) in enumerate(logo_pool):
        b = c["box"]
        if i == 0:
            # 贴角、重复只能说明“像 logo”，不能替模型判定。比如一张产品功能角标也会
            # 同时满足这些结构特征；先作为候选保留在联系表与图片槽中，由模型定为 logo
            # 或 content，避免把内容图直接带进风格包。
            rejected.append((c, "贴角重复小图候选（%.0fx%.0f @ %.0f,%.0f，出现 %d 次，"
                                "离画布边 %.0f%%），结合样张判断 logo 或 content"
                                % (b.get("w", 0), b.get("h", 0), b.get("x", 0), b.get("y", 0),
                                   c["n"], corner * 50)))
        else:
            rejected.append((c, "重复小图（%.0fx%.0f @ %.0f,%.0f），贴角程度 %.0f%% 不如首选"
                             % (b.get("w", 0), b.get("h", 0), b.get("x", 0), b.get("y", 0),
                                corner * 50)))

    # 体量预算：包内资产总量超 20MB 直接 FAIL（V2-6）。`use_full` 的原图是唯一可能
    # 单张爆预算的东西（未压缩的封面级大图可以单张达到数十 MB），所以在草案期就先丢 full，
    # 不要留给 L 层去撞门禁再回修。
    PACK_BUDGET = 20 * 1024 * 1024
    est = sum(min(a["src"].get("bytes") or 0, ASSET_WARN_SINGLE) for a in assets)
    for a in sorted([x for x in assets if x["use_full"]],
                    key=lambda x: -(x["src"].get("bytes") or 0)):
        orig = a["src"].get("bytes") or 0
        if est + orig > PACK_BUDGET * 0.9:
            a["use_full"] = False
            todos.append("`%s` 的原图 %.1fMB 会把包撑过 20MB 上限，草案已只保留压缩版；"
                         "确实需要原图就改走 url 承载" % (a["id"], orig / 1024.0 / 1024))
        else:
            est += orig

    if over_cap_bgs:
        todos.append("模板有 %d 张内容页背景超出 %d 张上限（%s）；用到它们的页型在 layouts.md 里"
                     "不会有 background，需要就手工补进 manifest 并删掉不重要的那几张"
                     % (len(over_cap_bgs), BG_CONTENT_CAP,
                        "、".join(c["file"] for c in over_cap_bgs[:5])))
    if not any(a["role"] == "cover" for a in assets):
        todos.append("没定出封面底图——从联系表挑一张补进 manifest（role: cover），或在 gaps 写明模板无封面主视觉")
    copy_logo_candidates(outdir, logo_pool)
    return assets, rejected, todos, alias, {c["media"]: c for c in kept}


def cover_background_media(archetypes):
    """只从模板明确命名的 cover 页型读取封面背景。"""
    return next((archetype["bg_raw"] for archetype in archetypes
                 if archetype["name"] == "cover"), None)


def background_decor(background, canvas):
    """把可直接重放的 PPT 背景声明落到 layouts.md 的最底层装饰。

    图片背景继续走 `background:` 资产引用；纯色和线性渐变没有可复制的素材文件，
    但同样是页型视觉的一部分，必须随页型输出。path 渐变不能由 CSS 线性渐变准确表达，
    保留给图片/渲染链路而不伪造。
    """
    if not isinstance(background, dict):
        return None
    if background.get("type") not in ("solid", "gradient"):
        return None
    if background.get("path"):
        return None
    css = _load_query()._recipe_css(background, None, [], [])
    css = [re.sub(r"\s*\n\s*", " ", value).strip() for value in css if value]
    if not css:
        return None
    width, height = canvas
    return {"box": [0, 0, width, height], "geom": "rect", "css": "; ".join(css),
            "trace": "canvas-background"}


def background_identity(background):
    """返回可用于聚类和审计的稳定背景标识，不改变背景的原始表达。"""
    if isinstance(background, dict):
        return json.dumps(background, sort_keys=True, separators=(",", ":"))
    return background


# ---------------------------------------------------------------- 版式聚类
DECOR_MIN = 40.0

# 版式名 → role（模板自己按页型命名时直接用它，别再猜）。
# 英文词按整词匹配：裸子串会让短词吃掉长词——`end` 一度把 `agenda`、`Appendix`、
# `Trends Section` 全判成 closing，表里 `agenda -> section` 那条永远轮不到。
ROLE_BY_WORD = [("封面", "cover"), ("cover", "cover"), ("首页", "cover"),
                ("title slide", "cover"), ("标题幻灯片", "cover"),
                ("封底", "closing"), ("尾页", "closing"), ("结束", "closing"),
                ("致谢", "closing"), ("谢谢", "closing"), ("end", "closing"),
                ("thank you", "closing"), ("closing", "closing"),
                ("章节", "section"), ("目录", "section"), ("过渡", "section"),
                ("section", "section"), ("agenda", "section"),
                ("section header", "section"), ("节标题", "section"),
                ("金句", "quote"), ("问句", "quote"), ("引言", "quote"), ("quote", "quote"),
                ("空白", "blank"), ("blank", "blank")]
PH_TO_TYPE = {"title": "title", "ctrTitle": "title", "subTitle": "subtitle",
              "body": "body", "pic": "pic", "clipArt": "pic", "tbl": "table",
              "chart": "chart", "media": "media", "dgm": "pic",
              "sldNum": "slide-number", "ftr": "footer", "dt": "footer"}


def role_of_name(name):
    """版式名 → role。认不出返回 None，由调用方降置信度并留 TODO——不要静默当 content。

    词表只覆盖中英文；换一种语言命名的模板会整份认不出。那时全落 content 且机检照过，
    消费端拿到的是「每一页都是内容页」，封面/章节/结束页的语义整个丢掉且无处可查。
    """
    low = (name or "").lower()
    for word, role in ROLE_BY_WORD:
        if word.isascii():
            if re.search(r"(?<![a-z])%s(?![a-z])" % re.escape(word), low):
                return role
        elif word in low:
            return role
    return None


def clean_layout_name(name):
    """`1_内容-左右排版（无副标题）` → `内容-左右排版（无副标题）`。"""
    return re.sub(r"^\d+[_\-\s]*", "", (name or "").strip()) or "未命名版式"


def is_bleed(s):
    return (s.get("kind") == "pic" and (s.get("w_pct") or 0) >= 95
            and (s.get("h_pct") or 0) >= 95)


def top_bleed_media(shapes):
    """一串形状里最上层的满屏图。

    OOXML 的 spTree 是绘制序，靠后的画在上面。一个版式常叠两张满屏图——通用底纹在
    下、这一页的主视觉在上——所以看得见的是最后那张。取第一张会拿到底纹，实测让
    章节页的深蓝主视觉被换成了另一张鲜蓝底纹，成品与原稿完全不是一个颜色。
    """
    out = None
    for s in shapes:
        if is_bleed(s) and s.get("media"):
            out = s["media"]
    return out


def slot_overlaps(slots):
    """同一页型里坐标互相重叠的槽对。只报事实，不改坐标——坐标是从模板量的。"""
    out = []
    for i in range(len(slots)):
        for j in range(i + 1, len(slots)):
            a, b = slots[i].get("box"), slots[j].get("box")
            if not (a and b):
                continue
            ox = min(a[0] + a[2], b[0] + b[2]) - max(a[0], b[0])
            oy = min(a[1] + a[3], b[1] + b[3]) - max(a[1], b[1])
            if ox > 0 and oy > 0:
                out.append("%s×%s 叠 %dx%d" % (slots[i].get("role"), slots[j].get("role"),
                                               round(ox), round(oy)))
    return out


def css_number(value, digits=3):
    """CSS 数值稳定格式：整数不带小数，其余去掉无意义尾零。"""
    number = round(float(value), digits)
    if number == int(number):
        return str(int(number))
    return ("%.*f" % (digits, number)).rstrip("0").rstrip(".")


def slot_style(s):
    """占位符自带的排版样式，统一转成可直接写进 HTML style 的 CSS 声明串。

    样式可能在三层：lstStyle.lvl1pPr（版式占位符常用）、段落 defRPr（Mac Office
    导出把大量属性写在这一层）、段落 pPr（对齐）。逐层兜底，缺一层就往下取。

    `box` 是布局几何，继续由 slot 独立承载；其余渲染属性不再泄漏成 size / color /
    align / insets_px 等 PPTX 中间字段。下划线开头的键仅供 draft 内部统计，emit_layouts
    不会写进消费者产物。
    """
    txt = s.get("text") or {}
    inherited = dict((txt.get("lstStyle") or {}).get("lvl1pPr") or {})
    ls = {}
    # 四层逐级兜底，按 OOXML 的就近原则：run rPr → 段落 defRPr → 段落 pPr → lstStyle。
    # 只枚举前几层会整份漏掉——有的导出器把字号全写在 run rPr 上，lstStyle 一个都没有。
    for para in (txt.get("paragraphs") or []):
        srcs = [r for r in (para.get("runs") or [])]
        srcs.append(para.get("defRPr") or {})
        srcs.append({k: v for k, v in para.items() if k not in ("runs", "defRPr")})
        for src in srcs:
            for k, v in (src or {}).items():
                if v is not None:
                    ls.setdefault(k, v)
    for k, v in inherited.items():
        if v is not None:
            ls.setdefault(k, v)
    if not ls.get("sz_px"):
        # 仍无声明：退到整形状里出现过的最大字号（generic walk），仍是文件里的值
        anysz = shape_sz(s)
        if anysz:
            ls["sz_px"] = anysz
    body = txt.get("bodyPr") or {}
    css = []
    out = {}
    insets = body.get("insets_px") or {}
    if insets:
        css.append("box-sizing: border-box")
        css.append("padding: %spx %spx %spx %spx" % (
            css_number(insets.get("tIns", 0) or 0),
            css_number(insets.get("rIns", 0) or 0),
            css_number(insets.get("bIns", 0) or 0),
            css_number(insets.get("lIns", 0) or 0),
        ))
    if ls.get("sz_px"):
        # normAutofit 的 fontScale 是模板让大字装进小框的手段——不乘它，消费端拿到的是
        # 未缩放字号，字比框高，渐变裁切会把溢出的底部切成透明。缺省 1.0（无 autofit / 无缩放）。
        scale = body.get("font_scale")
        raw = ls["sz_px"] * scale if scale else ls["sz_px"]
        size = round(raw)
        css.append("font-size: %dpx" % size)
        out["_font_size"] = size
    typeface = ls.get("ea") or ls.get("latin") or ls.get("cs")
    if typeface:
        css.append("font-family: %s" % font_css([typeface]))
    weight = ls.get("weight") or (700 if ls.get("bold") else None)
    if weight:
        css.append("font-weight: %s" % weight)
        out["_font_weight"] = weight
    if ls.get("italic"):
        css.append("font-style: italic")
    decorations = []
    if ls.get("underline"):
        decorations.append("underline")
    if ls.get("strike"):
        decorations.append("line-through")
    if decorations:
        css.append("text-decoration: %s" % " ".join(decorations))
    if ls.get("spc_px") is not None:
        css.append("letter-spacing: %spx" % css_number(ls["spc_px"]))
    col = (ls.get("color") or {}).get("resolved")
    if col:
        css.append("color: %s" % col)
        out["_color"] = col
    else:
        # 占位符的字色也可以是 gradFill（章节页的大号序号常这么做）。解析层已经把
        # stops 和角度记全了，这里只取单色就会整条丢掉，消费端只能自己编一个平色。
        # 与 decor 同一约定：css 是可直接写进 style 的声明串。
        f = ls.get("fill") or {}
        if f.get("type") == "gradient":
            g = _load_query()._css_gradient(f)
            if g:
                css += ["background-image: %s" % g, "-webkit-background-clip: text",
                        "background-clip: text", "color: transparent"]
    align = ls.get("algn")
    if align:
        css.append("text-align: %s" % {
            "l": "left", "ctr": "center", "r": "right", "just": "justify",
        }.get(align, align))
    line_spacing = ls.get("lnSpc") or {}
    # normAutofit 的 lnSpcReduction 与 fontScale 同时把行距压缩，一起缩才装得进原框。
    reduction = body.get("ln_spc_reduction") or 0
    if line_spacing.get("mult"):
        mult = line_spacing["mult"] * 1.2 * (1 - reduction)
        css.append("line-height: %s" % css_number(mult))
    elif line_spacing.get("px"):
        css.append("line-height: %spx" % css_number(line_spacing["px"] * (1 - reduction)))
    anchor = body.get("anchor")
    if anchor in ("ctr", "b"):
        css += ["display: flex", "flex-direction: column",
                "justify-content: %s" % {"ctr": "center", "b": "flex-end"}[anchor]]
    if body.get("rot"):
        try:
            degrees = float(body["rot"]) / 60000.0
            css.append("rotate: %sdeg" % css_number(degrees))
        except (TypeError, ValueError):
            pass
    if css:
        out["css"] = "; ".join(css)
    return out


def instance_override(shapes, slide_part, slots, bgm, cW, cH, composites=None):
    """实例页覆盖版式：版式是骨架，实例页才是设计师最终摆定的样子。

    版式底图常是多个版式共用的通用底纹，实例页可能另铺主视觉大图；标题占位符的框高
    也常被实例页放大以容纳多行。只读版式的包会让消费端拿到错的底图和装不下字的框，
    只能自己缩字号。
    """
    ins = [s for s in shapes if s.get("part") == slide_part]
    if not ins:
        return slots, bgm
    bgm = (composites or {}).get(slide_part) or top_bleed_media(ins) or bgm
    texts = []
    for s in ins:
        b = s.get("box") or {}
        if not (b.get("w") and b.get("h")) or not shape_text(s):
            continue
        texts.append({"sz": shape_sz(s), "box": b, "style": slot_style(s)})
    texts.sort(key=lambda x: -x["sz"])
    # 按字号大小依次顶替版式的文字槽（版式槽已按 y 排过，字号序更贴合语义层级）
    tslots = [s for s in slots if s["type"] != "pic"]
    for slot, ins_t in zip(sorted(tslots, key=lambda s: -(s.get("sz") or 0)), texts):
        b = ins_t["box"]
        slot["box"] = [round(b.get("x", 0)), round(b.get("y", 0)),
                       round(b.get("w", 0)), round(b.get("h", 0))]
        slot["sz"] = ins_t["sz"]
        slot.update(ins_t["style"] or {})
    return slots, bgm


def layouts_from_template(d, shapes, cW, cH):
    """form=3：模板自己用 slideLayout 声明了页型，直接读版式层。

    拿样张聚类只能得到「样张数」个 archetype——模板往往只放 1-2 张样张，
    真正的页型全在版式里。模板常见只放个位数样张却声明几十个语义版式，按样张聚类
    只能得到「样张数」个 archetype，消费端搭页时大半无版式可抄，只能自己编。
    """
    by_part = defaultdict(list)
    for s in shapes:
        if (s.get("layer") == "layout" and s.get("kind") == "sp"
                and (s.get("box") or {}).get("w") and (s.get("ph") or shape_text(s))):
            by_part[s["part"]].append(s)
    bg_of_layout = {}
    composites = d.get("background_composites") or {}
    for s in shapes:
        if s.get("layer") == "layout" and is_bleed(s) and s.get("media"):
            bg_of_layout[s["part"]] = s["media"]     # 靠后者在上层，最后一张才是看得见的
    topo = d.get("theme_topology") or {}
    theme_of_master = {m["master"]: m.get("theme_label")
                       for m in (topo.get("per_master") or [])}
    master_of = (d.get("reference_graph") or {}).get("master_of_layout") or {}
    # 只在版式恰好被 1 张实例页使用时才拿实例覆盖：多张实例共用一个版式时，
    # 谁都不代表版式本身，硬挑一张会把别页的构图当成页型
    lay_of_slide = (d.get("reference_graph") or {}).get("layout_of_slide") or {}
    used_n = Counter(lay_of_slide.values())
    slide_of_layout = {lp: sp for sp, lp in lay_of_slide.items() if used_n[lp] == 1}
    sample_pages_of_layout = defaultdict(list)
    for slide_part, layout_part in lay_of_slide.items():
        sample_pages_of_layout[layout_part].append(slide_no(slide_part))
    default_theme = topo.get("default")
    multi = len(topo.get("themes") or []) > 1

    rows = []
    for l in d.get("layouts") or []:
        phs = [s for s in by_part.get(l["part"], []) if (s.get("box") or {}).get("w")]
        if not phs:
            continue
        theme = theme_of_master.get(master_of.get(l["part"]))
        phs.sort(key=lambda s: ((s["box"].get("y") or 0), (s["box"].get("x") or 0)))
        slots, seen_kind = [], set()
        for s in phs:
            t = PH_TO_TYPE.get((s.get("ph") or {}).get("type"), "body")
            if t in ("slide-number", "footer") and not shape_text(s):
                continue                      # 空 chrome 占位符不是实际元素
            b = s["box"]
            role = t if t in ("title", "subtitle", "footer", "slide-number") else "body"
            if t == "title" and "title" in seen_kind:
                role, t = "subtitle", "subtitle"
            seen_kind.add(t)
            row = {"role": role, "type": t, "sz": shape_sz(s),
                   "box": [round(b.get("x", 0)), round(b.get("y", 0)),
                           round(b.get("w", 0)), round(b.get("h", 0))],
                   "txt": shape_text(s) or (s.get("name") or "")[:24]}
            row.update(slot_style(s))
            if t == "body":
                ph = s.get("ph") or {}
                row.update({
                    "_needs_role": True,
                    "_source_layer": "layout",
                    "_placeholder": "%s/%s" % (
                        ph.get("type") or "-", ph.get("idx") or "-"),
                })
            slots.append(row)
        # 非满屏的图片元素（logo / 联名标 / 装饰）——它们逐版式换位置换尺寸，
        # 必须按版式落进 slots，压成一条全局「固定位」规则就会撞标题。
        bgm = composites.get(l["part"]) or bg_of_layout.get(l["part"])
        for s in shapes:
            if s["part"] != l["part"] or s.get("kind") != "pic" or not s.get("media"):
                continue
            if s["media"] == bgm or (s.get("w_pct", 0) >= 95 and s.get("h_pct", 0) >= 95):
                continue
            b = s.get("box") or {}
            if not b.get("w"):
                continue
            slots.append({"role": "logo", "type": "pic", "sz": 0, "txt": "",
                          "media": s["media"],
                          "box": [round(b.get("x", 0)), round(b.get("y", 0)),
                                  round(b.get("w", 0)), round(b.get("h", 0))]})
        if not slots:
            continue
        inst = slide_of_layout.get(l["part"])
        if inst:
            slots, bgm = instance_override(
                shapes, inst, slots, bgm, cW, cH, composites)
        taken = {tuple(s["box"]) for s in slots}
        decor = []
        inherited_background = l.get("background")
        direct_background = next(
            (slide.get("background") for slide in d.get("slides") or []
             if slide.get("part") == inst and slide.get("background")),
            None)
        background = direct_background or inherited_background
        background_layer = background_decor(background, (cW, cH))
        if background_layer:
            decor.append(background_layer)
        decor += collect_decor(shapes, inst or l["part"], taken, (cW, cH))
        named_role = role_of_name(l.get("name"))
        rows.append({"zh": clean_layout_name(l.get("name")),
                     "role": named_role or "content", "role_guessed": named_role is None,
                     "slots": slots, "decor": decor, "bg_raw": bgm,
                     "theme": theme, "part": l["part"],
                     "used": l.get("used_by_slides") or 0})

    # 同名版式在 dark/light 两套 master 下各有一份——按名字归一，优先默认主题那份
    best = {}
    for r in rows:
        k = r["zh"]
        cur = best.get(k)
        if cur is None or (r["theme"] == default_theme and cur["theme"] != default_theme) \
                or (r["used"] > cur["used"]):
            best[k] = r
    picked = sorted(best.values(), key=lambda r: (
        ["cover", "section", "quote", "content", "closing", "blank"].index(r["role"])
        if r["role"] in ("cover", "section", "quote", "content", "closing", "blank") else 9,
        -r["used"], r["part"]))

    used_key = Counter()
    arch = []
    for r in picked:
        used_key[r["role"]] += 1
        n = used_key[r["role"]]
        key = r["role"] if n == 1 else "%s-%d" % (r["role"], n)
        m_no = re.search(r"slideLayout(\d+)\.xml$", r["part"])
        arch.append({"name": key, "zh": r["zh"], "role": r["role"], "bg": None,
                     "role_guessed": r.get("role_guessed"),
                     "bg_raw": r["bg_raw"], "slots": r["slots"],
                     "decor": r.get("decor") or [], "pages": [],
                     "rep": None, "rep_layout": int(m_no.group(1)) if m_no else None,
                     # 版式名认不出 role 时不装作有把握：置信度降到 low，让 L 层看图定
                     "pic_n": 0, "confidence": "low" if r.get("role_guessed") else "high",
                     "theme": r["theme"] if multi else None,
                     "_layout_part": r["part"],
                     "_sample_pages": sorted(sample_pages_of_layout.get(r["part"]) or []),
                     "source": "layout:" + r["part"].split("/")[-1]})
    return arch


_QUERY = []


def _load_query():
    """复用 query.py 的 OOXML→CSS 渲染，不再写第二份。"""
    if not _QUERY:
        import importlib.util
        spec = importlib.util.spec_from_file_location("_q", os.path.join(HERE, "query.py"))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        _QUERY.append(mod)
    return _QUERY[0]


def collect_decor(shapes, part, taken_boxes, canvas, limit=10):
    """页面上撑起版式骨架、但不含文字的形状（圆形图标托、卡片、分隔线）。

    只给文字框的坐标，消费端看到的是「一段说明悬在半空、上方一片空白」，只能自己编
    容器，编出来的形状与模板无关。这些形状必须进包。
    """
    q = _load_query()
    cW, cH = canvas
    out = []
    for s in shapes:
        if s.get("part") != part or s.get("kind") != "sp":
            continue
        if any(r.get("text", "").strip()
               for para in ((s.get("text") or {}).get("paragraphs") or [])
               for r in (para.get("runs") or [])):
            continue                       # 有文字的已经作为 slot 出过
        b = s.get("box") or {}
        w, h = b.get("w") or 0, b.get("h") or 0
        if not (w or h):
            continue                       # 零尺寸形状渲染不出任何东西
        if canvas_coverage(b, cW, cH) >= FULLSCREEN_COVERAGE:
            continue                       # 满屏底，属 background
        box = [round(b.get("x", 0)), round(b.get("y", 0)), round(w), round(h)]
        if tuple(box) in taken_boxes:
            continue
        css = q._recipe_css(s.get("fill"), s.get("line"),
                            [s.get("radius_px")] if s.get("radius_px") else [], s.get("effects"))
        # 声明要落成单行：含换行的声明会被下游的行式解析器从换行处截断，
        # 且只记 PARSE-WARN 不 FAIL，整包照常出厂——带着半条渲染不出来的 CSS
        css = [re.sub(r"\s*\n\s*", " ", c.split("\x00")[0]).strip() for c in css if c]
        if not css:
            continue                       # 无填充无描边无阴影 = 看不见，不占篇幅
        out.append({"box": box, "geom": (s.get("geom") or {}).get("prst") or "rect",
                    "css": "; ".join(css), "area": max(w * h, w, h)})
    # 按面积降序取前 limit 条：撑起版式的结构性形状总在最前，零星噪点自然落在截断线外，
    # 不需要再设一个「多小算噪点」的尺寸门槛（那种门槛会误杀 1px 分隔线）。
    out.sort(key=lambda d: -d["area"])
    note_truncation("装饰形状", limit, len(out), "按面积降序保留，剩下的多是零星小件",
                    part.split("/")[-1])
    return out[:limit]                      # 同款不同位置都要留，位置本身是版式信息


def placeholder_key(shape):
    ph = shape.get("ph") or {}
    if not ph:
        return None
    return (ph.get("type") or "body", str(ph.get("idx") or ""))


def merge_dict(base, override):
    """把实例页的非空声明叠到版式声明上；空实例占位符继续继承版式事实。"""
    out = copy.deepcopy(base or {})
    for key, value in (override or {}).items():
        if value is None or value == []:
            continue
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = merge_dict(out[key], value)
        else:
            out[key] = copy.deepcopy(value)
    return out


def inherited_text_shapes(layout_shapes, slide_shapes):
    """返回实例页可用的文字形状，并补齐其引用版式中的占位符几何与样式。"""
    layout_text = []
    for shape in layout_shapes:
        if shape.get("kind") != "sp" or not (shape.get("box") or {}).get("w"):
            continue
        ph = shape.get("ph") or {}
        ph_type = ph.get("type")
        if shape_text(shape) or (ph and ph_type not in ("ftr", "dt", "sldNum")):
            layout_text.append(shape)
    by_placeholder = {placeholder_key(s): s for s in layout_text if placeholder_key(s)}
    used = set()
    out = []
    for shape in slide_shapes:
        if shape.get("kind") != "sp":
            continue
        key = placeholder_key(shape)
        base = by_placeholder.get(key)
        if base:
            merged = merge_dict(base, shape)
            merged["text"] = merge_dict(base.get("text"), shape.get("text"))
            if not shape_text(shape):
                merged["text"]["paragraphs"] = copy.deepcopy(
                    (base.get("text") or {}).get("paragraphs") or [])
            used.add(key)
            out.append((merged, "slide+layout"))
        elif (shape.get("box") or {}).get("w") and shape_text(shape):
            out.append((shape, "slide"))
    for shape in layout_text:
        key = placeholder_key(shape)
        if key not in used:
            out.append((shape, "layout"))
    return out


def slide_image_marks(data, included_fullscreen=()):
    """从图片普查补齐形状图片填充；它们没有独立 pic 节点，但仍有媒体与坐标。"""
    allowed_fullscreen = set(included_fullscreen)
    out = defaultdict(list)
    for image in data.get("images") or []:
        media = image.get("media")
        if not media or (image.get("fullscreen") and media not in allowed_fullscreen):
            continue
        for cluster in image.get("boxes") or []:
            box = cluster.get("box")
            if not box or not box.get("w"):
                continue
            for part in cluster.get("parts") or []:
                if "/slides/" not in part and "/slideLayouts/" not in part:
                    continue
                out[part].append({"media": media, "box": box})
    return out


def add_template_image_marks(archetypes, data, included_fullscreen=()):
    """把版式和实例页的图片填充补进 form=3 页型。"""
    marks_by_part = slide_image_marks(data, included_fullscreen)
    layout_of_slide = (data.get("reference_graph") or {}).get("layout_of_slide") or {}
    by_layout = {archetype.get("_layout_part"): archetype for archetype in archetypes}
    for part, marks in marks_by_part.items():
        layout_part = layout_of_slide.get(part, part)
        archetype = by_layout.get(layout_part)
        if not archetype:
            continue
        seen = {
            (slot.get("media"), tuple(slot.get("box") or ()))
            for slot in archetype.get("slots") or []
            if slot.get("media")
        }
        for mark in marks:
            box = mark["box"]
            rounded = [round(box.get(key, 0)) for key in ("x", "y", "w", "h")]
            key = (mark["media"], tuple(rounded))
            if key in seen:
                continue
            seen.add(key)
            archetype["slots"].append({
                "role": "logo",
                "type": "pic",
                "sz": 0,
                "txt": "",
                "media": mark["media"],
                "box": rounded,
            })


def preserve_image_bearing_groups(kept, ranked):
    """有图片实例的孤例保留自己的页型，避免把资产绑定到近似但错误的版式。"""
    return kept + [
        group for group in ranked
        if group not in kept and any(page.get("marks") for page in group[1])
    ]


def draft_layouts(d, outdir, effective_alpha=None):
    with open(os.path.join(outdir, "ref", "shapes.json"), encoding="utf-8") as stream:
        shapes = json.load(stream)["shapes"]
    cW, cH = d["canvas"]["px"]
    if effective_alpha is None:
        effective_alpha = fullscreen_effective_alpha(d, outdir, shapes)
    overlay_media = {
        media for media, alpha in effective_alpha.items()
        if 13 <= alpha < OPAQUE_ENOUGH
    }
    if (d.get("form_hint") or {}).get("form") == 3:
        arch = layouts_from_template(d, shapes, cW, cH)
        if len(arch) >= 3:
            add_template_image_marks(arch, d, overlay_media)
            return arch, [], []
    by_slide = defaultdict(list)
    by_layout = defaultdict(list)
    for s in shapes:
        if s.get("layer") == "slide":
            by_slide[s["part"]].append(s)
        elif s.get("layer") == "layout":
            by_layout[s["part"]].append(s)
    image_marks = slide_image_marks(d, overlay_media)

    bg_of_slide, layout_of_slide = {}, {}
    background_of_layout = {
        row["part"]: row.get("background") for row in d.get("layouts") or []
    }
    for s in d.get("slides", []):
        bg = s.get("background")
        bg_of_slide[s["part"]] = background_identity(bg)
        layout_of_slide[s["part"]] = s.get("layout")
    # 版式层的满屏底图（form=2 常态：底图挂在 layout 上）
    composites = d.get("background_composites") or {}
    bg_media_of_layout = {}
    for s in shapes:
        if s.get("layer") == "layout" and is_bleed(s) and s.get("media"):
            bg_media_of_layout[s["part"]] = s["media"]

    pages = []
    for part, sh in sorted(by_slide.items(), key=lambda kv: slide_no(kv[0])):
        layout_part = layout_of_slide.get(part)
        layout_shapes = by_layout.get(layout_part) or []
        bg_media = top_bleed_media(sh)
        if bg_media is None:
            bg_media = bg_media_of_layout.get(layout_part)
        rendered_bg = (composites.get(part)
                       or composites.get(layout_part)
                       or bg_media)
        texts = []
        for s, source_layer in inherited_text_shapes(layout_shapes, sh):
            txt = shape_text(s) or (s.get("name") or "")[:24]
            b = s.get("box") or {}
            if b.get("w", 0) < DECOR_MIN or b.get("h", 0) < 16:
                continue
            ph = s.get("ph") or {}
            ph_type = ph.get("type")
            direct_type = PH_TO_TYPE.get(ph_type, "body")
            texts.append({
                "sz": shape_sz(s),
                "box": b,
                "txt": txt,
                "style": slot_style(s),
                "direct_type": direct_type,
                "needs_role": direct_type == "body",
                "source_layer": source_layer,
                "placeholder": "%s/%s" % (ph_type or "-", ph.get("idx") or "-"),
            })
        texts.sort(key=lambda t: (-t["sz"], t["box"].get("y", 0)))
        visible_shapes = layout_shapes + sh
        pics = []
        for shape in visible_shapes:
            if shape.get("kind") != "pic":
                continue
            if shape.get("w_pct", 0) < 95 or shape.get("media") in overlay_media:
                pics.append(shape)
        # 小图元素（logo / 角标 / 装饰）逐页记位置，供 archetype 落 slots
        marks = [{"media": s["media"], "box": s["box"]} for s in pics
                 if s.get("media") and (s.get("box") or {}).get("w")]
        seen_marks = {
            (mark["media"], round(mark["box"].get("x", 0)), round(mark["box"].get("y", 0)))
            for mark in marks
        }
        for mark in image_marks.get(part) or []:
            key = (mark["media"], round(mark["box"].get("x", 0)),
                   round(mark["box"].get("y", 0)))
            if key not in seen_marks:
                seen_marks.add(key)
                marks.append(mark)
        background = next((s.get("background") for s in d.get("slides") or []
                           if s.get("part") == part and s.get("background")), None)
        background = background or background_of_layout.get(layout_part)
        pages.append({"part": part, "no": slide_no(part), "bg_media": bg_media,
                      "rendered_bg": rendered_bg,
                      "bg_color": bg_of_slide.get(part), "background": background,
                      "texts": texts, "pic_n": len(pics),
                      "marks": marks, "shape_n": len(visible_shapes), "layout": layout_part})

    # 页型的**角色**（封面 / 章节页 / 内容页……）不在这里判：那是看图才能下的结论，
    # 交给读得到重建图的模型。脚本只做客观归并——同一张底图 + 文字块数量相近的页
    # 归成一组，档位按本 deck 自己的分布切，不用「字号 ≥60 就是章节页」这类固定数。
    ns = sorted(len(p["texts"]) for p in pages) or [0]
    q1, q2 = ns[len(ns) // 3], ns[len(ns) * 2 // 3]

    def density_band(p):
        n = len(p["texts"])
        return 0 if n <= q1 else (1 if n <= q2 else 2)

    last_page_no = max((p["no"] for p in pages), default=None)
    groups = defaultdict(list)
    for p in pages:
        if p["no"] == 1:
            # 首页单独成组：它是 deck 唯一的入口页，版面通常和后面任何一页都不同，
            # 并进别的组就会被代表页顶掉、坐标全丢。这只是不合并，不代表它是封面。
            groups[("__first__", -1)] = [p]
            continue
        if p["no"] == last_page_no:
            # 末页也单独保留完整结构：它可能是封底，也可能只是最后一张内容页，脚本
            # 不替模型下结论。和首页一样，拆组只避免它被聚类代表页吞掉。
            groups[("__last__", -2)] = [p]
            continue
        background_key = background_identity(
            p.get("rendered_bg") or p.get("bg_media")
            or p.get("background") or p.get("bg_color")
        ) or "none"
        groups[(background_key, density_band(p))].append(p)

    ranked = sorted(groups.items(), key=lambda kv: (-len(kv[1]), kv[1][0]["no"]))
    # 首页所在的组一定收——deck 的第一页是模板的门面，孤例也不能被名额挤掉。
    # 这只保证它进包，它是不是封面由看图的人定。
    first = [g for g in ranked if g[0][0] == "__first__"]
    last = [g for g in ranked if g[0][0] == "__last__"]
    kept = first + last + [
        g for g in ranked
        if g not in first and g not in last and len(g[1]) >= 2
    ][:max(0, 8 - len(first) - len(last))]
    for g in ranked:                      # 名额没用满就把最大的孤例页也收进来
        if len(kept) >= 8:
            break
        if g not in kept:
            kept.append(g)
    # 图片用途必须与它实际所在的版式绑定。若把图片孤例并到“最接近”页型，装饰会被
    # 绑定到错误布局；是否为内容图、logo 墙或装饰由后续模型看图判断，不按图片数量猜。
    kept = preserve_image_bearing_groups(kept, ranked)
    leftover = sorted(p["no"] for g in ranked if g not in kept for p in g[1])

    archetypes = []
    for gi, ((_background_key, _band), ps) in enumerate(kept, 1):
        rep = max(ps, key=lambda p: len(p["texts"]))
        bg_raw = rep.get("rendered_bg") or rep.get("bg_media")
        name = "layout-%d" % gi
        # 标题按「位置 + 跨度」认，不按字号——big-number 类的巨号数值常比标题还大
        # 标题 = 该页最靠上的那批文本里最宽的一块。不按「画布前 28%」这类固定比例切：
        # 版心靠下的模板会整页认不出标题。以该页自身的文本框分布定「靠上」。
        ys = sorted(t["box"].get("y", 0) for t in rep["texts"])
        y_cut = ys[max(len(ys) // 4, 0)] if ys else 0
        band = [t for t in rep["texts"] if t["box"].get("y", 1e9) <= y_cut]
        title = max(band, key=lambda t: (t["box"].get("w", 0), t["sz"])) if band else (
            max(rep["texts"], key=lambda t: t["sz"]) if rep["texts"] else None)
        rest = [t for t in rep["texts"] if t is not title]
        rest.sort(key=lambda t: (t["box"].get("y", 0), t["box"].get("x", 0)))
        ordered = ([title] if title else []) + rest
        slots = []
        for i, t in enumerate(ordered):
            b = t["box"]
            if t.get("needs_role"):
                role = typ = "body"
            elif t.get("direct_type") in ("title", "subtitle", "footer", "slide-number"):
                role = typ = t["direct_type"]
            elif t is title:
                role = typ = "title"
            elif (title and i == 1
                  # 副标题 = 紧跟在标题下方、与标题左对齐的那一块。三个量都相对标题
                  # 自身：绝对 px 门槛在大字号排版的模板上会整片认不出来。
                  and abs(b.get("x", 0) - title["box"].get("x", 0)) <= title["box"].get("h", 0)
                  and 0 <= b.get("y", 0) - (title["box"].get("y", 0)
                                            + title["box"].get("h", 0))
                  <= title["box"].get("h", 0) * 2):
                role = typ = "subtitle"
            else:
                role = typ = "body"
            row = {"role": role, "box": [round(b.get("x", 0)), round(b.get("y", 0)),
                                        round(b.get("w", 0)), round(b.get("h", 0))],
                   "type": typ, "sz": t["sz"], "txt": t["txt"]}
            row.update(t.get("style") or {})
            if t.get("needs_role"):
                row.update({
                    "_needs_role": True,
                    "_source_layer": t.get("source_layer"),
                    "_placeholder": t.get("placeholder"),
                })
            slots.append(row)
        # 同组页面上的图片元素按素材+位置去重后落候选 slots。内容图去掉具体资产引用，
        # 保留通用图片槽；装饰图绑定资产，避免非代表页上的装饰没有进入 layouts。
        seen_mark = set()
        for page in ps:
            for mk in page.get("marks") or []:
                b = mk["box"]
                key = (mk["media"], round(b.get("x", 0)), round(b.get("y", 0)))
                if key in seen_mark:
                    continue
                seen_mark.add(key)
                slots.append({"role": "logo", "type": "pic", "sz": 0, "txt": "",
                              "media": mk["media"],
                              "box": [round(b.get("x", 0)), round(b.get("y", 0)),
                                      round(b.get("w", 0)), round(b.get("h", 0))]})
        taken = {tuple(s["box"]) for s in slots}
        decor = []
        background_layer = background_decor(rep.get("background"), (cW, cH))
        if background_layer:
            decor.append(background_layer)
        seen_decor = set()
        for source_part in (rep.get("layout"), rep["part"]):
            for item in collect_decor(shapes, source_part, taken, (cW, cH)):
                key = (tuple(item["box"]), item["geom"], item["css"])
                if key not in seen_decor:
                    seen_decor.add(key)
                    decor.append(item)
        archetypes.append({"name": name, "bg": None, "bg_raw": bg_raw, "slots": slots,
                           "decor": decor,
                           "pages": sorted(p["no"] for p in ps), "rep": rep["no"],
                           "pic_n": rep["pic_n"],
                           "_source_layouts": sorted({
                               p["layout"] for p in ps if p.get("layout")
                           }),
                           "_source_backgrounds": sorted({
                               background_identity(
                                   p.get("rendered_bg") or p.get("bg_media")
                                   or p.get("background") or p.get("bg_color")
                               )
                               for p in ps
                               if (p.get("rendered_bg") or p.get("bg_media")
                                   or p.get("background") or p.get("bg_color"))
                           }),
                           "_text_n": len(rep["texts"]),
                           "_last_page_candidate": rep["no"] == last_page_no,
                           "confidence": "high" if len(ps) >= 3 else
                                         ("medium" if len(ps) == 2 else "low")})
    return archetypes, pages, leftover


# ---------------------------------------------------------------- 联系表
def layout_sheet(outdir, archetypes, path):
    """把各 archetype 的代表页光栅出来拼成一张——版式命名得看得见页面。"""
    use_layout = all(a.get("rep") is None for a in archetypes)
    reps = [a.get("rep_layout") if use_layout else a.get("rep") for a in archetypes]
    reps = [x for x in reps if x is not None]
    if not reps:
        return None
    png_dir = os.path.join(outdir, "ref", "rebuild", "png")
    kind = "layout" if use_layout else "slide"
    missing = [no for no in reps
               if not os.path.exists(os.path.join(png_dir, "%s-%s.png" % (kind, no)))]
    if missing:
        import subprocess
        r = subprocess.run([sys.executable, os.path.join(HERE, "render_pages.py"), outdir,
                            "--pages", "layouts" if use_layout else "slides",
                            "--only", ",".join(map(str, missing)), "--no-html"],
                           capture_output=True, text=True)
        if r.returncode:
            return None
    if not os.path.isdir(png_dir):
        return None
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None
    cols = 2 if len(archetypes) > 1 else 1
    cw, ch, pad, lab = 480, 270, 16, 20
    rows = (len(archetypes) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * (cw + pad) + pad, rows * (ch + pad + lab) + pad),
                      (245, 245, 247))
    dr = ImageDraw.Draw(sheet)
    for i, a in enumerate(archetypes):
        x = pad + (i % cols) * (cw + pad)
        y = pad + (i // cols) * (ch + pad + lab)
        no = a.get("rep_layout") if use_layout else a.get("rep")
        f = os.path.join(png_dir, "%s-%s.png" % (kind, no))
        if os.path.exists(f):
            im = Image.open(f).convert("RGB")
            im.thumbnail((cw, ch))
            sheet.paste(im, (x, y))
        dr.rectangle([x, y, x + cw, y + ch], outline=(120, 120, 128))
        # 标注只写 ASCII——Pillow 默认字体没有 CJK 字形，中文会渲染成方框
        dr.text((x + 2, y + ch + 5), "[%s]  %s  bg=%s"
                % (a["name"],
                   ("layout %s" % a.get("rep_layout")) if use_layout
                   else ("slide %s x%d pages" % (a.get("rep"), len(a["pages"]))),
                   a.get("bg") or "-"),
                fill=(20, 20, 24))
    sheet.save(path, optimize=True)
    return path


def contact_sheet(outdir, cands, path, start_index=1):
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None
    cell, pad, cols = 220, 20, 4
    items = cands            # 上限由调用方定，编号与 BRIEF 表格一一对应
    if not items:
        return None
    rows = (len(items) + cols - 1) // cols
    W = cols * (cell + pad) + pad
    H = rows * (cell + pad + 18) + pad
    sheet = Image.new("RGB", (W, H), (245, 245, 247))
    dr = ImageDraw.Draw(sheet)
    for idx, c in enumerate(items):
        x = pad + (idx % cols) * (cell + pad)
        y = pad + (idx // cols) * (cell + pad + 18)
        # 棋盘格底，透明区看得见
        for gy in range(0, cell, 16):
            for gx in range(0, cell, 16):
                if (gx // 16 + gy // 16) % 2 == 0:
                    dr.rectangle([x + gx, y + gy, x + gx + 15, y + gy + 15], fill=(214, 214, 218))
        try:
            im = Image.open(os.path.join(outdir, c["out"])).convert("RGBA")
            im.thumbnail((cell, cell))
            sheet.paste(im, (x + (cell - im.width) // 2, y + (cell - im.height) // 2), im)
        except Exception:
            dr.text((x + 8, y + 8), "unreadable", fill=(200, 0, 0))
        dr.rectangle([x, y, x + cell, y + cell], outline=(120, 120, 128))
        dr.text((x + 2, y + cell + 4), "[%d] %s  %dx%d  used=%d"
                % (c.get("_candidate_index", start_index + idx), c["file"],
                   c["probe"].get("w") or 0,
                   c["probe"].get("h") or 0, c["n"]),
                fill=(20, 20, 24))
    sheet.save(path, optimize=True)
    return path


def contact_sheets(outdir, cands, ldir):
    paths = []
    legacy = os.path.join(ldir, "contact-sheet.png")
    if os.path.exists(legacy):
        os.remove(legacy)
    for start in range(0, len(cands), SHEET_BATCH):
        batch = cands[start:start + SHEET_BATCH]
        path = os.path.join(ldir, "contact-sheet-%d.png" % (start // SHEET_BATCH + 1))
        if contact_sheet(outdir, batch, path, start + 1):
            paths.append(path)
    if paths:
        shutil.copy2(paths[0], legacy)
    return paths


def asset_vision_contexts(candidates):
    """把同一素材的每个归纳页型实例放进对应语境，不只展示最早出现的页面。"""
    contexts = []
    for candidate in candidates:
        placements = candidate.get("placements") or []
        instance_placements = [row for row in placements if row.get("slide")]
        if not instance_placements:
            row = dict(candidate)
            row["source_placements"] = placements
            contexts.append(row)
            continue
        seen = set()
        id_counts = Counter()
        for placement in instance_placements:
            box = tuple(placement["box"])
            layout = placement.get("archetype")
            key = (layout, box) if layout else (placement["slide"], box)
            if key in seen:
                continue
            seen.add(key)
            row = dict(candidate)
            base_id = "%s-s%d" % (candidate["id"], placement["slide"])
            id_counts[base_id] += 1
            row["id"] = (base_id if id_counts[base_id] == 1
                         else "%s-%d" % (base_id, id_counts[base_id]))
            row["placements"] = [placement]
            row["slides"] = [placement["slide"]]
            row["layout"] = layout
            row["source_placements"] = placements
            contexts.append(row)
    return contexts


def _group_input_count(group):
    # 与 FaaS 一致：每页桶预留一张页面语境图；无实例页的版式候选也占一个图位。
    page_count = len([page for page in group["pages"] if page > 0]) or 1
    return len(group["candidates"]) + page_count


def build_asset_vision_groups(candidates):
    """按 FaaS 的 10/5 图数预算，把候选按所在页组合成视觉判断批次。"""
    buckets = defaultdict(list)
    for candidate in asset_vision_contexts(candidates):
        page = next((row["slide"] for row in candidate.get("placements") or []
                     if row.get("slide")), 0)
        buckets[page].append(candidate)

    groups, queued = [], []

    def flush_small_pages():
        if not queued:
            return
        current, current_pages, inputs = [], [], 0
        for page, page_candidates in queued:
            page_inputs = 1 + len(page_candidates)
            if current and inputs + page_inputs > MULTI_PAGE_IMAGE_BUDGET:
                groups.append({"pages": current_pages, "candidates": current})
                current, current_pages, inputs = [], [], 0
            current.extend(page_candidates)
            current_pages.append(page)
            inputs += page_inputs
        if current:
            groups.append({"pages": current_pages, "candidates": current})
        del queued[:]

    for page in sorted(buckets):
        page_candidates = buckets[page]
        page_inputs = 1 + len(page_candidates)
        if page_inputs > MULTI_PAGE_IMAGE_BUDGET:
            flush_small_pages()
            per_group = SINGLE_PAGE_IMAGE_BUDGET - 1
            for start in range(0, len(page_candidates), per_group):
                groups.append({
                    "pages": [page],
                    "candidates": page_candidates[start:start + per_group],
                })
            continue
        queued.append((page, page_candidates))
    flush_small_pages()

    for index, group in enumerate(groups, 1):
        group["id"] = "vision-%d" % index
        group["input_count"] = _group_input_count(group)
    return groups


def select_asset_vision_groups(groups, slide_count):
    """受总预算约束选择视觉批次：首页和尾页的所有可容纳分批优先于中间页。"""
    if not groups:
        return [], []
    first_page = 1
    last_page = slide_count or max(
        (page for group in groups for page in group["pages"] if page > 0), default=0)
    selected, selected_ids, inputs = [], set(), 0

    def add(group):
        nonlocal inputs
        if (group["id"] in selected_ids or len(selected) >= VISUAL_PACK_CAP
                or inputs + group["input_count"] > VISUAL_INPUT_CAP):
            return False
        selected.append(group)
        selected_ids.add(group["id"])
        inputs += group["input_count"]
        return True

    # 首尾页先于中间页保留全部可容纳分批。交错加入避免首页多批先占满总预算，尾页
    # 连首批都进不去；单页 deck 不重复扫描。
    priority_batches = [
        [group for group in groups if page in group["pages"]]
        for page in dict.fromkeys((first_page, last_page))
    ]
    for batch_index in range(max(map(len, priority_batches), default=0)):
        for batches in priority_batches:
            if batch_index < len(batches):
                add(batches[batch_index])

    # 首尾的第一个批次已经保证；剩余按页码保留前段内容，优先丢弃尾页之前的后段。
    remainder = sorted(
        (group for group in groups if group["id"] not in selected_ids),
        key=lambda group: (
            min((page for page in group["pages"] if page > 0), default=999999),
            group["id"],
        ),
    )
    for group in remainder:
        add(group)

    selected.sort(key=lambda group: (
        min((page for page in group["pages"] if page > 0), default=999999), group["id"]))
    omitted = [group for group in groups if group["id"] not in selected_ids]
    return selected, omitted


def _safe_remove(pattern):
    for path in glob.glob(pattern):
        try:
            os.remove(path)
        except OSError:
            pass


def _fit_image(image, width, height):
    copy = image.copy()
    copy.thumbnail((width, height))
    return copy


def _draw_checkerboard(draw, box, size=14):
    x, y, w, h = box
    for row in range(0, h, size):
        for col in range(0, w, size):
            if (row // size + col // size) % 2 == 0:
                draw.rectangle([x + col, y + row, x + col + size - 1, y + row + size - 1],
                               fill=(214, 214, 218))


def _candidate_is_visual_risk(candidate):
    probe = candidate.get("probe") or {}
    alpha = candidate.get("effective_alpha_mean")
    if alpha is None:
        alpha = probe.get("alpha_mean")
    return ((alpha is not None and alpha < 230)
            or (probe.get("near_white_ratio") or 0) >= 0.7)


def _paste_candidate_preview(sheet, draw, image, box, dark=False):
    x, y, w, h = box
    if dark:
        draw.rectangle([x, y, x + w, y + h], fill=(54, 54, 58))
    else:
        _draw_checkerboard(draw, box)
    preview = _fit_image(image.convert("RGBA"), w - 8, h - 8)
    px = x + (w - preview.width) // 2
    py = y + (h - preview.height) // 2
    sheet.paste(preview, (px, py), preview)


def _placement_text(candidate):
    rows = []
    for placement in candidate.get("placements") or []:
        box = placement["box"]
        if placement.get("slide"):
            rows.append("s%d@%d,%d,%d,%d" % (
                placement["slide"], box[0], box[1], box[2], box[3]))
        else:
            rows.append("%s@%d,%d,%d,%d" % (
                placement.get("layout") or "layout", box[0], box[1], box[2], box[3]))
    return ";".join(rows)


def _save_visual_sheet(sheet, path):
    if max(sheet.size) > VISUAL_PREVIEW_MAX_EDGE:
        ratio = VISUAL_PREVIEW_MAX_EDGE / float(max(sheet.size))
        sheet = sheet.resize((max(1, round(sheet.width * ratio)),
                              max(1, round(sheet.height * ratio))))
    sheet.save(path, "JPEG", quality=VISUAL_JPEG_QUALITY, optimize=True, progressive=True)


def render_asset_vision_pages(outdir, pages):
    """视觉判断必须有页面语境；截图失败时中止草案而非让模型盲判。"""
    if not pages:
        return None
    result = subprocess.run(
        [sys.executable, os.path.join(HERE, "render_pages.py"), outdir,
         "--pages", "slides", "--only", ",".join(map(str, pages)), "--no-html"],
        capture_output=True, text=True,
    )
    png_dir = os.path.join(outdir, "ref", "rebuild", "png")
    missing = [
        page for page in pages
        if not os.path.isfile(os.path.join(png_dir, "slide-%d.png" % page))
    ]
    if result.returncode or missing:
        detail = (result.stderr or result.stdout or "").strip().splitlines()
        raise RuntimeError(
            "视觉判断所需页面截图生成失败%s%s" % (
                "（缺第%s页）" % "、".join(map(str, missing)) if missing else "",
                "：" + detail[-1] if detail else "",
            )
        )
    return png_dir


class VisionContextError(RuntimeError):
    pass


def has_pillow():
    try:
        from PIL import Image  # noqa: F401
    except Exception:
        return False
    return True


def asset_vision_group_sheet(outdir, group, png_dir, path):
    """把一组整页语境和候选图做成可索引拼版；每张候选保持独立卡片。"""
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return None

    candidates = group["candidates"]
    page_count = len([page for page in group["pages"] if page > 0])
    page_w, page_h = 440, 248
    cell, pad, label_h = 220, 16, 42
    asset_cols = 3
    asset_rows = max(1, (len(candidates) + asset_cols - 1) // asset_cols)
    page_rows = max(1, (page_count + 1) // 2) if page_count else 0
    page_cols = min(2, page_count) if page_count else 0
    width = max(2 * (page_w + pad) + pad if page_cols else 0,
                asset_cols * (cell + pad) + pad)
    header_h = 28
    page_area_h = (page_rows * (page_h + label_h + pad) + pad) if page_rows else 0
    asset_top = header_h + page_area_h
    height = asset_top + asset_rows * (cell + label_h + pad) + pad
    sheet = Image.new("RGB", (width, height), (245, 245, 247))
    draw = ImageDraw.Draw(sheet)
    draw.text((pad, 7), "%s  inputs=%d  pages=%s" % (
        group["id"], group["input_count"],
        ",".join(map(str, group["pages"])) or "layout"), fill=(20, 20, 24))

    for index, page in enumerate([page for page in group["pages"] if page > 0]):
        x = pad + (index % 2) * (page_w + pad)
        y = header_h + (index // 2) * (page_h + label_h + pad)
        source = (os.path.join(png_dir, "slide-%d.png" % page)
                  if png_dir else None)
        if source and os.path.exists(source):
            try:
                image = Image.open(source).convert("RGB")
                image = _fit_image(image, page_w, page_h)
                sheet.paste(image, (x + (page_w - image.width) // 2,
                                    y + (page_h - image.height) // 2))
            except Exception as exc:
                raise VisionContextError("视觉判断所需页面截图不可读取：第%d页" % page) from exc
        else:
            raise VisionContextError("视觉判断所需页面截图缺失：第%d页" % page)
        draw.rectangle([x, y, x + page_w, y + page_h], outline=(120, 120, 128))
        draw.text((x + 2, y + page_h + 5), "[page %d] context for candidates below" % page,
                  fill=(20, 20, 24))

    for index, candidate in enumerate(candidates):
        x = pad + (index % asset_cols) * (cell + pad)
        y = asset_top + (index // asset_cols) * (cell + label_h + pad)
        image_path = os.path.join(outdir, candidate["out"])
        try:
            image = Image.open(image_path)
            if _candidate_is_visual_risk(candidate):
                half = (cell - 3) // 2
                _paste_candidate_preview(sheet, draw, image, (x, y, half, cell))
                _paste_candidate_preview(sheet, draw, image, (x + half + 3, y, cell - half - 3, cell),
                                         dark=True)
            else:
                _paste_candidate_preview(sheet, draw, image, (x, y, cell, cell))
        except Exception:
            draw.text((x + 8, y + 8), "unreadable", fill=(200, 0, 0))
        draw.rectangle([x, y, x + cell, y + cell], outline=(120, 120, 128))
        probe = candidate.get("probe") or {}
        alpha = candidate.get("effective_alpha_mean")
        if alpha is None:
            alpha = probe.get("alpha_mean")
        risk = (" a=%s w=%s" % (
            "?" if alpha is None else round(alpha),
            "?" if probe.get("near_white_ratio") is None
            else round(probe["near_white_ratio"] * 100),
        )) if _candidate_is_visual_risk(candidate) else ""
        draw.text((x + 2, y + cell + 3), "[%s] %s %dx%d%s" % (
            candidate["id"], candidate["file"], probe.get("w") or 0, probe.get("h") or 0, risk),
            fill=(20, 20, 24))
        first = (candidate.get("placements") or [{}])[0]
        total_placements = len(candidate.get("source_placements") or
                               candidate.get("placements") or [])
        if first.get("slide"):
            box = first["box"]
            draw.text((x + 2, y + cell + 18), "s%d @%d,%d %dx%d seen=%d" % (
                first["slide"], box[0], box[1], box[2], box[3],
                total_placements), fill=(20, 20, 24))
        else:
            draw.text((x + 2, y + cell + 18), "layout x%d" % len(candidate.get("placements") or []),
                      fill=(20, 20, 24))
    _save_visual_sheet(sheet, path)
    return path


def emit_asset_vision_groups(outdir, candidates, slide_count, ldir):
    """生成受预算约束的拼版和结构化索引，返回已选/未选组。"""
    groups = build_asset_vision_groups(candidates)
    selected, omitted = select_asset_vision_groups(groups, slide_count)
    _safe_remove(os.path.join(ldir, "vision-group-*.jpg"))
    _safe_remove(os.path.join(ldir, "contact-sheet-*.png"))
    _safe_remove(os.path.join(ldir, "contact-sheet.png"))
    _safe_remove(os.path.join(ldir, "asset-context-sheet-*.png"))

    paths = []
    if not has_pillow():
        omitted = groups
        selected = []
    else:
        pages = sorted({page for group in selected for page in group["pages"] if page > 0})
        png_dir = render_asset_vision_pages(outdir, pages)
        try:
            for index, group in enumerate(selected, 1):
                path = os.path.join(ldir, "vision-group-%d.jpg" % index)
                if asset_vision_group_sheet(outdir, group, png_dir, path):
                    paths.append(path)
                    group["sheet"] = os.path.basename(path)
            if selected and len(paths) != len(selected):
                raise RuntimeError("视觉判断拼版生成失败")
        except VisionContextError:
            raise
        except Exception:
            _safe_remove(os.path.join(ldir, "vision-group-*.jpg"))
            selected, omitted, paths = [], groups, []
    if paths:
        # 旧流程只认 contact-sheet.png；保留首个视觉组的 PNG 别名，新的 BRIEF 不再要求读它。
        try:
            from PIL import Image
            legacy = os.path.join(ldir, "contact-sheet-1.png")
            Image.open(paths[0]).convert("RGB").save(legacy, "PNG", optimize=True)
            shutil.copy2(legacy, os.path.join(ldir, "contact-sheet.png"))
        except Exception:
            pass

    def serialize(group):
        return {
            "id": group["id"],
            "sheet": group.get("sheet"),
            "pages": group["pages"],
            "input_count": group["input_count"],
            "candidates": [{
                "id": candidate["id"],
                "source_media": candidate["file"],
                "source_px": [candidate["probe"].get("w"), candidate["probe"].get("h")],
                "bytes": candidate.get("bytes"),
                "repeat_count": candidate.get("n"),
                "fullscreen": candidate.get("fullscreen"),
                "effective_alpha_mean": candidate.get("effective_alpha_mean"),
                "near_white_ratio": candidate["probe"].get("near_white_ratio"),
                "placements": candidate.get("placements") or [],
                "source_placements": candidate.get("source_placements") or
                                     candidate.get("placements") or [],
            } for candidate in group["candidates"]],
        }

    index = {
        "version": 2,
        "limits": {
            "single_page_image_budget": SINGLE_PAGE_IMAGE_BUDGET,
            "multi_page_image_budget": MULTI_PAGE_IMAGE_BUDGET,
            "pack_cap": VISUAL_PACK_CAP,
            "input_cap": VISUAL_INPUT_CAP,
        },
        "selected": [serialize(group) for group in selected],
        "omitted": [serialize(group) for group in omitted],
    }
    with open(os.path.join(ldir, "asset-vision-groups.json"), "w", encoding="utf-8") as stream:
        json.dump(index, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
    return selected, omitted, paths


def asset_context_sheets(outdir, cands, ldir):
    """按候选主所在页去重拼整页语境，供模型识别 logo 墙和装饰用途。"""
    reviewed = [c for c in cands if needs_asset_judgment(c)]
    pages = []
    seen = set()
    for c in reviewed:
        page = next((no for no in c.get("slides") or [] if no and no != 9999), None)
        if page is not None and page not in seen:
            seen.add(page)
            pages.append(page)
    if not pages:
        return []
    import subprocess
    result = subprocess.run(
        [sys.executable, os.path.join(HERE, "render_pages.py"), outdir,
         "--pages", "slides", "--only", ",".join(map(str, pages)), "--no-html"],
        capture_output=True, text=True,
    )
    png_dir = os.path.join(outdir, "ref", "rebuild", "png")
    if result.returncode or not os.path.isdir(png_dir):
        return []
    try:
        from PIL import Image, ImageDraw
    except Exception:
        return []
    paths = []
    candidate_ids = defaultdict(list)
    for index, c in enumerate(cands, 1):
        if not needs_asset_judgment(c):
            continue
        for page in c.get("slides") or []:
            if page in seen:
                candidate_ids[page].append(index)
    for start in range(0, len(pages), CONTEXT_BATCH):
        batch = pages[start:start + CONTEXT_BATCH]
        cols, cw, ch, pad, lab = 2, 480, 270, 16, 22
        rows = (len(batch) + cols - 1) // cols
        sheet = Image.new("RGB", (cols * (cw + pad) + pad,
                                  rows * (ch + pad + lab) + pad), (245, 245, 247))
        draw = ImageDraw.Draw(sheet)
        for offset, page in enumerate(batch):
            x = pad + (offset % cols) * (cw + pad)
            y = pad + (offset // cols) * (ch + pad + lab)
            source = os.path.join(png_dir, "slide-%d.png" % page)
            if os.path.exists(source):
                image = Image.open(source).convert("RGB")
                image.thumbnail((cw, ch))
                sheet.paste(image, (x, y))
            draw.rectangle([x, y, x + cw, y + ch], outline=(120, 120, 128))
            draw.text((x + 2, y + ch + 5), "slide %d  candidates=%s"
                      % (page, ",".join(map(str, candidate_ids[page]))),
                      fill=(20, 20, 24))
        path = os.path.join(ldir, "asset-context-sheet-%d.png"
                            % (start // CONTEXT_BATCH + 1))
        sheet.save(path, optimize=True)
        paths.append(path)
    return paths


# ---------------------------------------------------------------- 落盘
def write(p, s):
    with open(p, "w", encoding="utf-8") as f:
        f.write(s)


def bound_visual_candidates(candidates, archetypes):
    """只把最终有图片槽的候选交给判断单；其余仍留在联系表供视觉核对。"""
    bound_files = {
        s.get("source_media")
        for a in archetypes
        for s in a.get("slots") or []
        if s.get("source_media")
    }
    return [c for c in candidates if c.get("file") in bound_files]


def visual_slot_candidates(candidates, archetypes):
    """把候选绑定到最终槽位；页面截图只作该槽位的视觉语境。"""
    source_candidates = {
        candidate.get("file"): candidate
        for candidate in bound_visual_candidates(candidates, archetypes)
    }
    rows, seen = [], set()
    for archetype in archetypes:
        pages = set(archetype.get("pages") or archetype.get("_sample_pages") or [])
        for slot in archetype.get("slots") or []:
            source = slot.get("source_media")
            raw_box = slot.get("box")
            candidate = source_candidates.get(source)
            if not pages or not candidate or not raw_box or not needs_asset_judgment(candidate):
                continue
            box = [round(value) for value in raw_box]
            key = (source, archetype["name"], tuple(box))
            if key in seen:
                continue
            seen.add(key)
            source_placements = candidate.get("placements") or []
            matching = [
                placement for placement in source_placements
                if tuple(placement.get("box") or ()) == tuple(box)
                and placement.get("slide") in pages
            ]
            if not matching:
                continue
            slide = matching[0]["slide"]
            row = dict(candidate)
            row["placements"] = [{
                "slide": slide,
                "box": box,
                "archetype": archetype["name"],
            }]
            row["slides"] = [slide] if slide else []
            row["source_placements"] = source_placements
            rows.append(row)
    return rows


def emit_manifest(d, assets, vision_groups, ldir, archetypes=()):
    L = ["version: alpha",
         "name: TODO-style-name        # 英文 kebab，体现气质，不要用文件名",
         "name_zh: TODO中文名",
         "description: >",
         "  TODO: 一句话说清这套模板的视觉性格（底色 / 主色 / 字形 / 版面骨架），给消费模型定调。"]
    themes = d["theme_topology"].get("themes") or ["single"]
    if themes != ["single"] and len(themes) > 1:
        L += ["themes: [%s]" % ", ".join(themes), "default-theme: %s" % themes[0]]
    if assets:
        L.append("assets:")
        for a in assets:
            L.append("  - id: %s" % a["id"])
            L.append("    source_media: %s" % a["src"]["file"])
            L.append("    kind: %s" % a["kind"])
            if a["role"]:
                L.append("    role: %s" % a["role"])
            if a["kind"] in ("logo", "slogan"):
                L.append("    on-bg: %s" % (a.get("on_bg") or "light"))
            if a["use_full"]:
                L.append("    use_full: true")
    if vision_groups:
        L += [
            "asset_vision_groups:",
            "  # 每项对应拼版中的一个候选实例；同源图在不同页型/位置可分别定性。",
            "  # 取值与 FaaS 对齐：logo|slogan|background|texture|icon|decorative|illustration|photo|chart|screenshot|footer-copyright|page-number|watermark|content-image|unknown。",
        ]
        for group in vision_groups:
            for candidate in group["candidates"]:
                placement = (candidate.get("placements") or [{}])[0]
                L.append("  - id: %s" % candidate["id"])
                L.append("    source_media: %s" % q(candidate["file"]))
                if placement.get("box"):
                    L.append("    box: %s" % placement["box"])
                L.append("    visual_kind: TODO-visual-kind-%s   # %s；视觉组 %s"
                         % (candidate["id"], candidate["id"], group["id"]))
        L += [
            "asset_decisions:",
            "  # 仅在不在视觉预算内的图片、或需要覆盖已有判断时追加。",
            "  # 位置例外写 box；同图同坐标跨页型不同，再补 layout。",
            "  # - {source_media: example.png, visual_kind: chart}",
            "  # - {source_media: example.png, layout: layout-2, box: [0, 0, 100, 100], visual_kind: decorative}",
        ]
    if any(decor.get("trace") == "canvas-background"
           for archetype in archetypes
           for decor in archetype.get("decor") or []):
        canvas = d["canvas"]["px"]
        L += [
            "derived:",
            '  - value: "[0, 0, %d, %d]"' % (canvas[0], canvas[1]),
            '    reason: "PPT 背景铺满画布"',
        ]
    write(os.path.join(ldir, "manifest.yaml"), "\n".join(L) + "\n")


def emit_frontmatter(d, tokens, fonts, roles, anchors, gaps, ldir):
    L = ["colors:"]
    for name, r in tokens:
        L.append('  %s: "%s"' % (name, r["hex"]))
    body_font = fonts[1] if len(fonts) > 1 else (fonts[0] if fonts else None)
    disp_font = fonts[0] if fonts else None
    if disp_font:
        L.append("typography:")
        L.append("  fontFamily: '%s'" % font_css(disp_font["stack"]))
        if body_font and body_font is not disp_font:
            L.append("  bodyFontFamily: '%s'" % font_css(body_font["stack"]))
        for role, t in roles.items():
            lh = lh_of(t)
            L.append("  %s: {fontSize: %dpx%s}" % (
                role, round(t["sz_px"]), ", lineHeight: %s" % lh if lh else ""))
    sp = d.get("spacing_candidates") or {}
    pads = sp.get("paddings") or []
    edge = {}
    for p in pads:
        edge.setdefault(p["edge"], p["px"])
    # 四边都测出来才写 spacing / safe-area。缺一边就整段不写，并在 gaps 说明——
    # 拿另一套模板的边距当默认值，会让消费端按一个从没在本模板出现过的网格排版。
    edges_full = all(edge.get(k) is not None for k in ("top", "right", "bottom", "left"))
    if edges_full:
        L.append("spacing:")
        L.append("  page-padding: {top: %s, right: %s, bottom: %s, left: %s}"
                 % (edge["top"], edge["right"], edge["bottom"], edge["left"]))
    # rounded.card 是全局 token，只能表达全档共同的一档圆角。多个非零档位或零/非零
    # 混用时，圆角属于 layouts.md 里的局部形状事实，压成一个值会把直角容器也圆角化。
    radii = d.get("radii_census") or []
    if len(radii) == 1 and radii[0]["px"] >= 1:
        top = radii[0]
        L.append("rounded:")
        L.append("  card: %dpx" % round(top["px"]))
    if edges_full:
        L.append("safe-area:")
        L.append("  content: {top: %s, right: %s, bottom: %s, left: %s, applies-to: [content]}"
                 % (edge["top"], edge["right"], edge["bottom"], edge["left"]))
        L.append("  confidence: medium")
    else:
        gaps = list(gaps) + ["本模板没测出四边都稳定的页边距（普查到 %s），"
                             "因此不给 spacing / safe-area：按各页型 slot 的实际坐标排版，"
                             "不要自造统一边距。"
                             % ("、".join("%s=%s" % (k, edge[k]) for k in
                                          ("top", "right", "bottom", "left") if edge.get(k) is not None)
                                or "一边都没有")]
    L.append("anchors:")
    for aid, typ, desc in anchors:
        L.append('  - {id: %s, type: %s, desc: "%s"}' % (aid, typ, desc))
    L.append("gaps:")
    for g in gaps:
        L.append('  - "%s"' % g)
    write(os.path.join(ldir, "frontmatter.yaml"), "\n".join(L) + "\n")


def draft_flow(a, facts, canvas):
    """从结构事实推出「区带」草案：一页 = 若干竖直区带，高度由内容决定。

    绝对坐标只能表达「模板样张那份内容摆在哪」。真实内容长度不同，上面的区带一变高，
    下面的就该整体下移——这件事在一张坐标表里表达不出来，只能靠消费端自己算，而它
    算错的方向有两个：估小了压穿下一块，估大了留一片空。

    这里只出草案，最终用绝对还是流式由看得到重建图的人定。
    """
    cW, cH = canvas
    # 装饰件也算进来：很多模板的版式层只有几个占位符，真正撑起版面的是卡片容器
    # （在 decor 里）。只看 slots 会把一页的主体结构整个漏掉。
    slots = [s for s in a["slots"] if s.get("box")]
    fixed_roles = {"logo", "slide-number", "page-number", "header", "footer"}
    fixed = [s for s in slots if s.get("role") in fixed_roles]
    content_slots = [s for s in slots if s.get("role") not in fixed_roles]
    containers = [{"role": "container", "type": "decor", "box": dcr["box"],
                   "css": dcr.get("css")} for dcr in (a.get("decor") or [])]
    items = group_flow_cards(content_slots, containers)
    if len(items) < 2:
        return None
    items.sort(key=lambda s: (s["box"][1], s["box"][0]))
    gaps = [items[i + 1]["box"][1] - (items[i]["box"][1] + items[i]["box"][3])
            for i in range(len(items) - 1)]
    pos = [g for g in gaps if g > 0]
    if not pos:
        return None
    # 区带边界 = 间距分布里的最大空档。同一区带内部的间距（网格行距之类）总是明显
    # 小于区带之间的间距，用本页自己的分布切，不设固定阈值。
    cut = _gap_cut(pos, min(pos), max(pos)) if len(pos) > 1 else pos[0]
    regions, cur = [], [items[0]]
    for i, g in enumerate(gaps):
        if g >= cut:
            regions.append(cur)
            cur = []
        cur.append(items[i + 1])
    regions.append(cur)

    # 整页左右边距 = 所有内容的横向外包络，作为各区带的缺省。
    lefts = [s["box"][0] for s in items]
    rights = [s["box"][0] + s["box"][2] for s in items]
    page_margin = [min(lefts), cW - max(rights)]

    out = []
    for reg in regions:
        if not reg:
            continue
        # 同一区带里 y 接近的算一行；每行元素数一致且 >1 就是网格
        rows, cr = [], [reg[0]]
        for s in reg[1:]:
            if abs(s["box"][1] - cr[-1]["box"][1]) <= max(s["box"][3], 1) * 0.5:
                cr.append(s)
            else:
                rows.append(cr)
                cr = [s]
        rows.append(cr)
        widths = {len(r) for r in rows}
        if len(rows) >= 1 and widths == {len(rows[0])} and len(rows[0]) > 1:
            cols = len(rows[0])
            xs = sorted(s["box"][0] for s in rows[0])
            col_gap = round((xs[1] - xs[0]) - rows[0][0]["box"][2]) if cols > 1 else 0
            row_gap = 0
            if len(rows) > 1:
                row_gap = round(rows[1][0]["box"][1]
                                - (rows[0][0]["box"][1] + rows[0][0]["box"][3]))
            region = {"kind": "grid", "cols": cols, "gap": [max(col_gap, 0), max(row_gap, 0)],
                      "items": rows[0]}
            # 卡片组的横向范围常和整页不同（标题贴左、卡片居中）。整页边距是所有元素的
            # 外包络，直接套给居中卡片组会把它拉偏成左对齐。区带范围和整页明显不一致时，
            # 落这个区带自己的左右边距，消费端把网格放进它再填 1fr。按落盘的整数比较，
            # 亚像素噪声不触发多余的区带边距。
            reg_margin = [min(s["box"][0] for s in rows[0]),
                          cW - max(s["box"][0] + s["box"][2] for s in rows[0])]
            if [int(reg_margin[0]), int(reg_margin[1])] != [int(page_margin[0]), int(page_margin[1])]:
                region["margin"] = reg_margin
            out.append(region)
        elif len(rows) == len(reg):
            # 每行一个元素 = 真的竖着排
            inner = 0
            if len(reg) > 1:
                inner = round(reg[1]["box"][1] - (reg[0]["box"][1] + reg[0]["box"][3]))
            out.append({"kind": "stack", "gap": max(inner, 0), "items": reg})
        else:
            # 每行元素数不一致（比如左列两张、右列一张跨两行）。硬说成 stack 会让消费端
            # 以为它们是竖排的，比不给还糟。如实说这块推不出规整结构，按坐标摆。
            out.append({"kind": "free", "items": reg})
    if fixed:
        out.append({"kind": "free", "items": fixed})
    if len(out) < 2:
        return None
    return {"top": items[0]["box"][1], "margin": page_margin,
            "gap": round(cut), "regions": out}


def box_contains(outer, inner):
    return (outer[0] <= inner[0] and outer[1] <= inner[1]
            and outer[0] + outer[2] >= inner[0] + inner[2]
            and outer[1] + outer[3] >= inner[1] + inner[3])


def boxes_overlap(a, b):
    return (min(a[0] + a[2], b[0] + b[2]) > max(a[0], b[0])
            and min(a[1] + a[3], b[1] + b[3]) > max(a[1], b[1]))


def overlap_ratio(outer, inner):
    width = min(outer[0] + outer[2], inner[0] + inner[2]) - max(outer[0], inner[0])
    height = min(outer[1] + outer[3], inner[1] + inner[3]) - max(outer[1], inner[1])
    if width <= 0 or height <= 0 or inner[2] <= 0 or inner[3] <= 0:
        return 0
    return width * height / (inner[2] * inner[3])


def group_flow_cards(slots, containers):
    """把并列卡片容器及其文字组成一层 group，避免拍平成多列元素。"""
    candidates = []
    for container in containers:
        children = [slot for slot in slots if box_contains(container["box"], slot["box"])]
        if len(children) >= 2:
            candidates.append((container, children))
    selected = []
    for container, children in sorted(
            candidates, key=lambda pair: pair[0]["box"][2] * pair[0]["box"][3]):
        if not any(boxes_overlap(container["box"], other["box"]) for other, _ in selected):
            selected.append((container, children))
    if len(selected) < 2:
        return slots + containers

    grouped_slots = {id(slot) for _, children in selected for slot in children}
    nested_by_container = {}
    for container, _ in selected:
        nested_by_container[id(container)] = [
            other for other in containers
            if other is not container and overlap_ratio(container["box"], other["box"]) >= 0.9
        ]
    grouped_containers = {
        id(container)
        for container, _ in selected
        for container in [container] + nested_by_container[id(container)]
    }
    out = [slot for slot in slots if id(slot) not in grouped_slots]
    out += [container for container in containers if id(container) not in grouped_containers]
    for container, children in selected:
        children = children + nested_by_container[id(container)]
        children = sorted(children, key=lambda slot: (slot["box"][1], slot["box"][0]))
        gaps = [children[i + 1]["box"][1]
                - (children[i]["box"][1] + children[i]["box"][3])
                for i in range(len(children) - 1)]
        outer = container["box"]
        insets = [
            min(child["box"][1] - outer[1] for child in children),
            min(outer[0] + outer[2] - child["box"][0] - child["box"][2] for child in children),
            min(outer[1] + outer[3] - child["box"][1] - child["box"][3] for child in children),
            min(child["box"][0] - outer[0] for child in children),
        ]
        padding = max(0, round(min(insets)))
        css = container.get("css") or ""
        if padding:
            css = "; ".join(part for part in (
                css.rstrip("; "), "box-sizing: border-box", "padding: %dpx" % padding) if part)
        out.append({
            "role": "group",
            "type": "group",
            "box": outer,
            "css": css,
            "gap": max(0, round(min(gaps))) if gaps else 0,
            "items": children,
        })
    return out


def structure_facts(archetypes, d, shapes):
    """每个页型的**结构事实**：栅格、垂直间距序列、容器样式配方、样张里的实际字数。

    这些是判「该用绝对坐标还是流式」的依据，脚本只测不判：
    - 栅格拟合好不好，决定这页是不是一个规整的多列区带
    - 垂直间距序列里的突变点，就是区带的边界（网格内部 24、区带之间 110）
    - 样张字数说明这个框是按几行内容设计的——框高本身看不出这件事
    """
    q = _load_query()
    by_part = defaultdict(list)
    for s in shapes:
        by_part[s.get("part")].append(s)

    # 容器样式配方：跨全档聚类一次，记出现次数与跨页数，供判断「哪些是共性风格」
    groups = {}
    for s in shapes:
        fill, line, fx = s.get("fill"), s.get("line"), s.get("effects")
        if not fill and not line and not fx:
            continue
        if isinstance(fill, dict) and fill.get("type") == "image":
            continue
        k = q._sig(fill, line, fx)
        if k[0] == "none" and k[1] == "none" and not k[2]:
            continue
        g = groups.setdefault(k, {"n": 0, "parts": set(), "radii": [],
                                  "fill": fill, "line": line, "fx": fx, "shapes": set()})
        g["n"] += 1
        g["parts"].add(s.get("part"))
        g["radii"].append(s.get("radius_px") or 0)
        g["shapes"].add(id(s))
    ranked = sorted(groups.values(), key=lambda g: -g["n"])
    recipe_id = {}
    recipes = []
    for i, g in enumerate(ranked, 1):
        rid = "r%d" % i
        css = [re.sub(r"\s*\n\s*", " ", c.split("\x00")[0]).strip()
               for c in q._recipe_css(g["fill"], g["line"], g["radii"], g["fx"]) if c]
        recipes.append({"id": rid, "n": g["n"], "pages": len(g["parts"]),
                        "css": "; ".join(css)})
        for sid in g["shapes"]:
            recipe_id[sid] = rid

    grids = (d.get("spacing_candidates") or {}).get("grids") or []
    grid_by_part = defaultdict(list)
    for gd in grids:
        grid_by_part[gd.get("part")].append(gd)

    out = {}
    for a in archetypes:
        part = None
        if a.get("source", "").startswith("layout:"):
            part = "ppt/slideLayouts/" + a["source"].split(":", 1)[1]
        elif a.get("rep"):
            part = "ppt/slides/slide%d.xml" % a["rep"]
        boxes = [s["box"] for s in a["slots"]] + [x["box"] for x in (a.get("decor") or [])]
        boxes.sort(key=lambda b: b[1])
        gaps = [boxes[i + 1][1] - (boxes[i][1] + boxes[i][3]) for i in range(len(boxes) - 1)]
        chars = [(s["box"], len(s.get("txt") or "")) for s in a["slots"] if s.get("txt")]
        used = []
        for s in by_part.get(part, []):
            rid = recipe_id.get(id(s))
            if rid and rid not in used:
                used.append(rid)
        out[a["name"]] = {"grids": grid_by_part.get(part) or [], "gaps": gaps,
                          "chars": chars, "recipes": used}
    return out, recipes


LAYOUT_CONTROL_KEYS = {
    "names", "roles", "text_roles", "layout_modes", "bg_rules",
}


def emit_layout_controls(layout_lines, ldir, text_role_candidates, flow_archetypes):
    """从兼容用的 layouts.yaml 分出模型只需编辑的判断区。

    旧判断单把控制项和每个 slot 的坐标正文混在一起。模型为补一个角色读取整份文件，
    在版式很多的模板上会把时间耗在无须判断的数值上。仍保留旧文件给既有调用方；
    新文件只承载最终可覆盖它的五个顶层判断区。
    """
    blocks, current = {}, None
    for line in layout_lines:
        match = re.match(r"^([A-Za-z_][\w-]*):", line)
        if match:
            current = match.group(1)
            if current in LAYOUT_CONTROL_KEYS:
                blocks[current] = [line]
            continue
        if current in blocks:
            blocks[current].append(line)

    controls = [
        "# 版式判断控制区 —— 只读并编辑本文件；不要打开或修改 layouts.yaml。",
        "# package.py 会用本文件覆盖 layouts.yaml 的同名判断区，后者仅保留坐标事实与兼容输入。",
        "# 可编辑顶层键仅为 names / roles / text_roles / layout_modes / bg_rules。",
    ]
    for key in ("names", "roles"):
        if key in blocks:
            controls.extend([""] + blocks[key])
    if text_role_candidates:
        controls += [
            "",
            "text_roles:",
            "# 默认文字槽都是 body；仅把确认属于 title|subtitle|header|footer 的例外填为",
            "#   <id>: title（不要给普通正文补 body）。候选对应的原始槽位在下列注释中。",
        ]
        for role_id, slot in text_role_candidates:
            controls.append("# %s：%s" % (
                role_id, (slot.get("txt") or "（无样本文字）")[:60]))
    if flow_archetypes:
        controls += [
            "",
            "layout_modes:",
            "# 默认 slots。只有样张明确需要内容随高度重排时，取消注释并填 `<页型>: flow`。",
        ]
        controls.extend("# %s: flow" % archetype["name"] for archetype in flow_archetypes)
    if "bg_rules" in blocks:
        controls += [
            "",
            "# 只编辑本草案已列出的真实图片背景；它们都已被 layouts 中的 background: 引用。",
            "# 纯色、渐变、外框、几何装饰和透明叠层不新建 bg_rules；没有本段就保持没有。",
        ] + blocks["bg_rules"]
    write(os.path.join(ldir, "layout-controls.yaml"), "\n".join(controls) + "\n")


def emit_layouts(archetypes, ldir, busy_hints=None, facts=None, recipes=None):
    sampled_archetypes = {
        id(archetype) for archetype in archetypes
        if (archetype.get("rep") is not None
            or archetype.get("pages")
            or archetype.get("_sample_pages"))
    }
    prefilled = sum(1 for a in archetypes if a.get("zh"))
    L = ["# 判断单草案 —— package.py 读它产出 layouts.md，deck 的版式坐标从 layouts.md 读。",
         "# 只改 names / roles / text_roles / layout_modes / bg_rules 五段（都是扁平键值，"
         "改完 package.py 自动并回各页型）。",
         "# 下面 layouts 段是普查数值，一个字都不要动——改它容易连带删掉 slots/confidence。"]
    if prefilled:
        L.append("# names 已按模板自带的版式名填好 %d 条，读一遍确认表意即可，通常不用改。" % prefilled)
    if recipes:
        L.append("# 容器样式配方（按出现次数排；跨页数多 = 共性风格，只在一处出现的多半不是）：")
        for r in recipes[:8]:
            L.append("#   %s  出现 %d 次 / 跨 %d 处   %s" % (r["id"], r["n"], r["pages"], r["css"]))
    L.append("names:")
    for a in archetypes:
        if a.get("zh"):
            # 模板自己给版式起了名（form=3），直接用——比看图起名准，也省掉一轮判断
            L.append("  %s: %s" % (a["name"], q(a["zh"])))
        else:
            L.append("  %s: TODO中文名（代表页 %s，共 %d 页）"
                     % (a["name"], a["rep"], len(a["pages"])))
    # 角色（封面 / 章节页 / 内容页……）是看图才能下的结论，脚本不猜。模板自己按页型
    # 命名时用它的标注，否则连同客观事实一起摆出来，由看得到重建图的你来定。
    need_role = [a for a in archetypes if not a.get("role")]
    if need_role:
        L.append("roles:   # 取值 cover|section|content|quote|closing|blank|custom")
        for a in need_role:
            szs = sorted({round(s["sz"]) for s in a["slots"] if s.get("sz")}, reverse=True)
            L.append("  %s: TODO角色   # 代表页 %s，共 %d 页；文字块 %d 个，字号 %s；"
                     "图片 %d 张%s%s"
                     % (a["name"], a["rep"], len(a["pages"]),
                        len([s for s in a["slots"] if not s.get("asset")]),
                        "/".join(str(x) for x in szs[:5]) or "未声明",
                        a.get("pic_n") or 0, "；有满屏底图" if a.get("bg_raw") else "",
                        "；末页候选，结合样张判断 closing 或实际角色"
                        if a.get("_last_page_candidate") else ""))
    # 普通正文先保持 body：它是安全且可消费的默认值。标题/页眉/页脚的少量例外依然
    # 要由模型看样张后写入 text_roles；把每一个正文槽都做成 TODO 会迫使模型逐行复述
    # 近百个显然的 body，挤占真正的视觉判断时间。
    text_role_ids = {}
    for a in archetypes:
        index = 0
        for slot in a.get("slots") or []:
            if not slot.get("_needs_role"):
                continue
            index += 1
            text_role_ids[id(slot)] = "%s-text-%d" % (a["name"], index)
    if text_role_ids:
        L.append("# 文字槽默认均为 body。看样张后，只把确实属于 title|subtitle|header|footer 的"
                 "例外追加到 text_roles:；不要为普通正文逐条补 body。")
    flow_archetypes = [a for a in archetypes if a.get("flow")]
    if flow_archetypes:
        L.append("# 同时有 flow 与 slots 时默认保留 slots，保证固定构图可消费。"
                 "只有样张明确需要内容随高度重排时，才在 layout_modes: 中写 <页型>: flow。")
    # 禁放区是**背景图**的属性，不是页型的属性——按背景资产分组，页型再多也不涨
    bgs = []
    for a in archetypes:
        if a["bg"] and a["bg"] not in bgs:
            bgs.append(a["bg"])
    if bgs:
        L.append("bg_rules:")
        for bg in bgs:
            users = [a["name"] for a in archetypes if a["bg"] == bg]
            L.append("  %s:   # 用它的页型：%s" % (bg, ", ".join(users)))
            hint = (busy_hints or {}).get(bg)
            if hint:
                L.append("    # 图像局部对比度：中位 %s、九分位 %s；%s"
                         % (hint["median"], hint["p90"],
                            ("更花的一片在 %s" % hint["busy"]) if hint.get("busy")
                            else hint.get("why", "")))
            # text_safe 不是判断题：模板自己已经把文字放在哪儿写死了。取用这张背景的
            # 所有页型的槽与装饰件的外接并集即可——让人看图猜只会猜得更松，把模板从不
            # 放字的区域也划进安全区，这个字段就白设了。
            boxes = [s["box"] for a in archetypes if a["bg"] == bg for s in a["slots"]] + \
                    [dcr["box"] for a in archetypes if a["bg"] == bg for dcr in (a.get("decor") or [])]
            if boxes:
                x0 = min(b[0] for b in boxes)
                y0 = min(b[1] for b in boxes)
                x1 = max(b[0] + b[2] for b in boxes)
                y1 = max(b[1] + b[3] for b in boxes)
                L.append("    text_safe: [%d, %d, %d, %d]   # 由该背景各页型的槽位并集算出"
                         % (x0, y0, x1 - x0, y1 - y0))
            elif any(id(archetype) in sampled_archetypes
                     for archetype in archetypes if archetype["bg"] == bg):
                L.append("    text_safe: TODO安全文字区[x,y,w,h]（该背景下没有任何槽位可依据）")
            else:
                L.append("    text_safe: [0, 0, 0, 0]   # 未见对应样张，没有可依据的文字区")
            if any(id(archetype) in sampled_archetypes
                   for archetype in archetypes if archetype["bg"] == bg):
                L.append('    avoid: TODO禁放区列表；无禁放区写 []，有则写 [{box: [x,y,w,h], reason: "..."}]')
                L.append('    pairing_rule: "TODO这张背景上标题/正文/图表要避让哪些区域"')
            else:
                L.append("    avoid: []   # 未见对应样张，不额外推断禁放区")
                L.append('    pairing_rule: "未见对应样张；沿用该页型已有槽位"')
    L.append("layouts:")
    for a in archetypes:
        fx = (facts or {}).get(a["name"]) or {}
        if fx:
            # 结构事实：判「这页该用绝对坐标还是流式」的依据。脚本只测不判。
            for gd in (fx.get("grids") or [])[:2]:
                c, r = gd.get("cols") or {}, gd.get("rows") or {}
                L.append("  # 栅格：%s 列%s%s" % (
                    c.get("n"), " @%gpx 步距方差 %.2f" % (c.get("pitch") or 0, c.get("sd") or 0)
                    if c.get("regular") else "（列不规整）",
                    "，行 %s" % (("%d @%gpx" % (r.get("n") or 0, r.get("pitch") or 0))
                                if r.get("regular") else "不规整")))
            if fx.get("gaps"):
                L.append("  # 垂直间距：%s（突变处即区带边界）"
                         % "、".join(str(int(g)) for g in fx["gaps"][:10]))
            if fx.get("chars"):
                L.append("  # 样张字数：%s"
                         % "、".join("%s=%d字" % (b, n) for b, n in fx["chars"][:6]))
            if fx.get("recipes"):
                L.append("  # 命中配方：%s" % "、".join(fx["recipes"][:4]))
        # 槽与槽在坐标上重叠：PPT 里占位符互相压是常态（文字 valign 居中、样张只有一行，
        # 看不出来），照抄坐标做成 HTML 后内容一变长就撞。实测封面 title 框比 subtitle
        # 的顶还低 41px，两行标题直接压在副标题上。这里只报事实，怎么让开由你定。
        ov = slot_overlaps(a.get("slots") or [])
        if ov:
            L.append("  # 槽位重叠：%s（模板里靠文字居中不显形，内容变长会撞）"
                     % "、".join(ov[:3]))
        L.append("  %s:" % a["name"])
        if a.get("role"):
            L.append("    role: %s" % a["role"])
        if a["bg"]:
            L.append("    background: %s" % a["bg"])
        fl = a.get("flow")
        if fl:
            L.append("    flow:")
            L.append("      top: %d" % fl["top"])
            L.append("      margin: [%d, %d]" % tuple(fl["margin"]))
            L.append("      gap: %d" % fl["gap"])
            L.append("      regions:")
            for r in fl["regions"]:
                if r["kind"] == "grid":
                    L.append("        - kind: grid")
                    L.append("          cols: %d" % r["cols"])
                    L.append("          gap: [%d, %d]" % tuple(r["gap"]))
                    if r.get("margin"):
                        L.append("          margin: [%d, %d]  # 本区带自己的左右边距，"
                                 "和整页 margin 不同（居中卡片组不跟标题的左边距）"
                                 % tuple(r["margin"]))
                elif r["kind"] == "free":
                    L.append("        - kind: free   # 推不出规整结构，按 slots 的坐标摆")
                else:
                    L.append("        - kind: stack")
                    L.append("          gap: %d" % r["gap"])
                L.append("          items:")
                for s in r["items"]:
                    if s.get("type") == "group":
                        L.append("            - role: group")
                        L.append("              gap: %d" % s["gap"])
                        if s.get("css"):
                            L.append('              css: "%s"'
                                     % str(s["css"]).replace('"', "'"))
                        L.append("              items:")
                        for child in s["items"]:
                            role_id = text_role_ids.get(id(child))
                            if role_id:
                                L.append("                # text-role: %s" % role_id)
                            if child.get("type") == "decor":
                                L.append('                - {role: container, css: "%s"}'
                                         % str(child.get("css") or "").replace('"', "'"))
                                continue
                            extra = ""
                            if child.get("css") is not None:
                                extra += ', css: "%s"' % str(child["css"]).replace('"', "'")
                            if child.get("asset"):
                                extra += ", asset: %s" % child["asset"]
                            if child.get("source_media"):
                                extra += ", source_media: %s" % child["source_media"]
                                extra += ", source_box: %s" % child["box"]
                            L.append("                - {role: %s, type: %s%s}"
                                     % (child["role"], child["type"], extra))
                        continue
                    role_id = text_role_ids.get(id(s))
                    if role_id:
                        L.append("            # text-role: %s" % role_id)
                    # free 区带按坐标摆，而 slots 会被删掉，所以坐标必须写在这里
                    bx = ", box: %s" % s["box"] if r["kind"] == "free" else ""
                    if s.get("type") == "decor":
                        L.append('            - {role: container%s, css: "%s"}'
                                 % (bx, (s.get("css") or "").replace('"', "'")))
                        continue
                    extra = bx
                    if s.get("css") is not None:
                        # CSS 串一律加引号：里面的逗号/冒号在 flow map 里是分隔符
                        extra += ', css: "%s"' % str(s["css"]).replace('"', "'")
                    if s.get("asset"):
                        extra += ", asset: %s" % s["asset"]
                    if s.get("source_media"):
                        extra += ", source_media: %s" % s["source_media"]
                        if r["kind"] != "free":
                            extra += ", source_box: %s" % s["box"]
                    L.append("            - {role: %s, type: %s%s}" % (s["role"], s["type"], extra))
        L.append("    slots:")
        for s in a["slots"]:
            role_id = text_role_ids.get(id(s))
            if role_id:
                L.append("      # text-role: %s" % role_id)
            extra = ""
            if s.get("asset"):
                extra += ", asset: %s" % s["asset"]
            if s.get("source_media"):
                extra += ", source_media: %s" % s["source_media"]
            if s.get("css") is not None:
                extra += ', css: "%s"' % str(s["css"]).replace('"', "'")
            L.append("      - {role: %s, box: %s, type: %s%s}"
                     % (s["role"], s["box"], s["type"], extra))
        if a.get("decor"):
            L.append("    decor:")
            for dcr in a["decor"]:
                L.append('      - {box: %s, geom: %s, css: "%s"}'
                         % (dcr["box"], dcr["geom"], dcr["css"].replace('"', "'")))
        L.append("    confidence: %s" % a.get("confidence", "medium"))
    write(os.path.join(ldir, "layouts.yaml"), "\n".join(L) + "\n")
    emit_layout_controls(L, ldir, [
        (text_role_ids[id(slot)], slot)
        for archetype in archetypes
        for slot in archetype.get("slots") or []
        if id(archetype) in sampled_archetypes and id(slot) in text_role_ids
    ], [
        archetype for archetype in flow_archetypes
        if id(archetype) in sampled_archetypes
    ])


def emit_body(d, tokens, fonts, roles, assets, archetypes, exceptions, cusage, ldir,
              has_asset_candidates=False):
    """design.md 正文。

    每条规则只出现一次——同一条散在 Fast Path / Usage / Background Safety /
    Hard Rules 各写一遍时措辞必然漂移，消费端无法判断哪份权威。
    坐标、字号、色值、资产位置的权威都在 layouts.md；本文件只给色板、字体栈与纪律。
    """
    canvas = d["canvas"]["px"]
    cover = next((a for a in assets if a["id"] == "bg-cover"), None)
    imp, webs = import_line(fonts)
    sidecar = "`layouts.md`"

    L = ["## Overview", "",
         "TODO: 两三句话讲清这套模板的性格与适用场景——看过联系表和页面重建图之后再写。", ""]
    L.append(("模板自带 %d 种版式，页型、坐标和 CSS 样式都直读自版式层。"
              % len(archetypes)) if (d.get("form_hint") or {}).get("form") == 3 else
             ("%d 页样张归纳出 %d 种页型。" % (d["counts"]["slides"], len(archetypes))))
    L += ["", "## Usage", "",
          "**生成前必须完整阅读本 `design.md` 和 %s，确认全部页型后再开始搭页。**"
          "不能只看摘要、前几个页型或 `## Layouts` 清单；后续页型同样可能定义背景、"
          "安全区、资产和固定元素。" % sidecar,
          "",
          "搭一页 PPT 六步，中间四步的数据都在 %s：" % sidecar, ""]
    L += ["1. **定画布** —— 舞台按 `layouts.md` 的 `canvas` 设成 %d×%d，"
          "别套用默认尺寸：源模板的长宽比不一定是 16:9，套错了整页坐标全偏。"
          "舞台尺寸改不了时，整体等比缩放 `min(舞台宽/%d, 舞台高/%d)` 后居中留白——"
          "逐轴拉伸会把圆压成椭圆、把字挤扁。" % (canvas[0], canvas[1], canvas[0], canvas[1]),
          '2. **挑页型** —— 在 %s 里按用途选一个 archetype（清单见下面 Layouts 段）。'
          '页数多于页型时，挑最接近的一个原样套用它的 slot：用不到的槽删掉，'
          '内容比槽多就按同类槽的间距等距加，**坐标一律沿用该页型给的那套，不要自己另起网格**。'
          '每个生成页面的 `<section>` 都写 `data-pptx-layout="<页型名>"`，'
          '交付前据此核验该页型绑定的背景与图片资产均已使用，且没有跨页型误用。' % sidecar,
          "3. **按页型给的形态落元素** —— 页型给 `flow` 就用流式，给 `slots` 就用绝对，"
          "两者只会出现一个。"
          "**flow**：整块用一个纵向 flex 容器，`top` 是它的起始 y，`margin` 是整块的左右边距，"
          "`gap` 是区带之间的间距；`regions` 从上往下依次排，**每个区带的高度由它自己的"
          "内容决定，不要写死高度**——上面的区带内容变多时，下面的自然被推下去，这正是"
          "这套表达要解决的事。区带内部：`kind: grid` 用 `grid-template-columns: repeat(cols, 1fr)` "
          "配 `gap: [行间距, 列间距]`；`kind: stack` 用纵向 flex 配 `gap`；`kind: free` "
          "按 item 自带的 `box` 绝对定位。区带自带 `margin: [左, 右]` 时用它的、"
          "覆盖整块的 `margin`（模板里居中的卡片组和贴左的标题横向范围本就不同）；"
          "没带就用整块的 `margin`。`grid` 在自己这份左右边距里再 `repeat(cols, 1fr)`。"
          "`grid` 里的 `role: group` 是一张卡片："
          "group 的 `css` 用于外层容器，内部 `items` 按顺序纵向排布并使用 group 的 `gap`。"
          "每个 `role: container` 的项是容器，把它的 `css` 逐项原样写进 style，内容放进去；"
          "其中没有 `border-radius` 就按 `0`，不得自行补圆角。",
          '4. **按 slot 落元素（页型给的是 slots 时）** —— 每个 slot 渲染成一个绝对定位元素：`box` 是 '
          '`[x, y, w, h]`（%dx%d 画布上的绝对像素），机械展开成 `left/top/width/height`；'
          'slot 的 `css` 是模板排版属性已转译好的声明串，原样写进 style，不要另选字号、'
          '内边距、颜色或对齐。'
          '带 `asset` 的 slot 是固定图片实例：元素写 `data-pptx-asset="<asset id>"`，'
          '引用复制后的原资产，并把 `box` 直接写成 inline '
          '`position:absolute;left:<x>px;top:<y>px;width:<w>px;height:<h>px`。'
          '元素必须可见，不得省略或换图，也不得隐藏或只在 CSS 里伪装引用；'
          '这个页型没有 `asset` 槽，这一页就不出现该资产。'
          '页型的 `background` 是图片资产时遵循同一实例契约，`box` 使用全画布 '
          '`[0, 0, %d, %d]`。' % (canvas[0], canvas[1], canvas[0], canvas[1]),
          "5. **铺装饰几何** —— 页型的 `decor` 是这一页的图形骨架（图标托底的圆、"
          "卡片、分隔线）：每条渲染成一个绝对定位空元素，`box` 给位置，`css` 逐项原样写进 "
          "style；没有 `border-radius` 就按 `0`。只有 `geom: ellipse` 另加 "
          "`border-radius: 50%`。它们压在背景之上、slot 之下，"
          "落在 slot 上的图标正是靠它们托住。",
          "6. **落实全局设计** —— `design.md` frontmatter 的 `colors`、`typography`、"
          "`spacing`、`rounded`、`components` 是全局 token；用 CSS variables、类名或内联"
          "样式承载。局部 slot / decor 的 `css` 优先，不能再解释成另一套视觉系统。"
          "字体使用 Typography 的完整栈与降级，不在运行时安装字体或依赖。",
          "7. **保持标题结构** —— 有合适页型可参考时，沿用该页型已有的标题层级与局部 "
          "`css`；只渲染该页型已有的文字槽，背景中已经可见的固定标题不再创建文本，"
          "页型没有 `subtitle` 槽就不新增副标题。没有合适参考时，按本包整体视觉组织标题。"]
    if assets or has_asset_candidates:
        L += ["", "资产文件（背景由页型的 `background` 字段指定，"
              "图片资产的位置由该页型 `slots` 里带 `asset` 的槽给出）：", "",
              "{{ASSET_TABLE}}", "",
              "将包内 `assets/` 复制到项目内相对目录，再引用复制后的路径；最终 HTML 不引用"
              "抽取工作目录或本机绝对路径。附件只提供 `assetRoot` / `assetPaths` 时，把"
              "`assetRoot` 当作不透明前缀，只拼接清单中声明的相对路径。"]
    L += ["", "文字与容器的外接矩形落在该页型 `background` 对应的 `text_safe` 内，"
          "避开 `avoid` 列出的区域（两者都在 %s 的 `backgrounds` 段）。内容装不下时换页型或拆页。"
          % sidecar, "",
          "## Colors", "", "| token | 值 | 用途 |", "|---|---|---|"]
    for name, r in tokens:
        L.append("| `%s` | `%s` | %s |"
                 % (name, r["hex"], usage_phrase(cusage.get(r["hex"].upper()))))
    L += ["", "## Typography", ""]
    for f in fonts[:2]:
        L.append("- **%s** —— 栈 `%s`%s" % (
            f["names"][0], font_css(f["stack"]),
            "，源为商业/内部字体无 web 分发源，按气质降级到 %s" % f["stack"][1]
            if len(f["stack"]) > 1 else ""))
    L += ["", "字号轴：" + "、".join("%s %dpx" % (k, round(v["sz_px"])) for k, v in roles.items())
          + "。slot 自带 `css` 时以其中的 `font-size` 为准；没有 slot CSS 的新增层级，"
          "复用轴上最接近的一档。", "",
          "字体加载（**HARD REQUIREMENT：下面这行 @import 原样写入全局样式首行，禁止替换为 "
          "fonts.googleapis.com 或其他域**）：", "", "```", imp, "```", "",
          "镜像只保证 wght 400 一档，更粗的字重由浏览器合成，字重不能作为唯一区分手段；"
          "系统字体 PingFang SC / Microsoft YaHei 置于栈末保底，中文场景负字距清零。", "",
          "## Layouts", "", "页型清单如下，每个页型的 slots、background、"
          "禁放区都在 %s：" % sidecar, "", "{{LAYOUT_LIST}}",
          "", "## Hard Rules", ""]
    if cover:
        L.append("- 封面页铺满 `bg-cover`，整幅覆盖 %dx%d 画布。" % (canvas[0], canvas[1]))
    if any(a["role"] == "content" for a in assets):
        L.append("- 内容页的背景由该页型的 `background` 字段指定，整幅铺满。")
    L.append("{{LOGO_RULES}}")
    L += ["- 坐标、字号、色值、资产位置以 %s 为准；本文件的 Colors / Typography 是可用值的清单。"
          % sidecar,
          "- 强调色族以 Colors 和 %s 的 slot CSS 为主；必要时可以使用 Colors 之外的颜色，"
          "但不能形成与模板主色竞争的第二强调色。" % sidecar,
          "- 新增颜色应与模板整体的色相、明度和饱和度关系协调。允许新增中性色、低彩度辅助色"
          "或局部语义色表达正负、风险、警告、状态、图表序列，但保持辅助层级；"
          "只要新色通过高饱和、高对比、大面积或跨页重复获得主视觉权重，"
          "或被用于标题、关键数字、图表主序列、卡片底色或渐变，就属于新的强调色，改用模板"
          "强调色族的深浅、透明度，或改用线型、纹理、标签区分。",
          "- 交付前逐页检查：色板、字体、版式、背景、资产和本段规则均来自本风格包；"
          "页面无资源加载失败、内容溢出或画幅裁切。",
          "- 本包里的数值就是普查结果，照用即可，无需重新统计颜色、字体或版式。",
          "- 风格包以文本形式（zip 摘要等）到手时，直接用摘要里 design.md / layouts.md 的文本。",
          "", "## Exceptions", ""]
    if exceptions:
        L += ["- " + e for e in exceptions]
    else:
        L.append("- 无额外例外：所有页型都遵守上面的安全区与色板纪律。")
    L.append("")
    write(os.path.join(ldir, "body.md"), "\n".join(L) + "\n")


def emit_brief(d, ctx, ldir):
    (tokens, rest, fonts, roles, assets, rejected, todos, archetypes, cands, sheets,
     selected_vision_groups, omitted_vision_groups, leftover, lsheet) = ctx
    canvas = d["canvas"]["px"]
    def sample_pages(archetype):
        return archetype.get("pages") or archetype.get("_sample_pages") or []

    sampled_archetypes = [
        archetype for archetype in archetypes
        if archetype.get("rep") is not None or sample_pages(archetype)
    ]
    template_only_archetypes = [
        archetype for archetype in archetypes
        if archetype not in sampled_archetypes
    ]
    L = ["# 抽取简报（第 1/3 步产物；改完草案跑 package.py 出包）", "",
         "源：`%s`  画布 %dx%d  %d 页 / %d 版式  主题 %s  form=%s"
         % (d["source"]["filename"], canvas[0], canvas[1], d["counts"]["slides"],
            d["counts"]["layouts"], d["theme_topology"]["themes"],
            d["form_hint"]["form"]), "",
         "## 待判断（草案里已标 TODO，逐条改掉）", ""]
    # 待判断清单从草案实时扫 TODO 生成，不写死：写死的清单会和草案对不上——
    # 既漏掉后加的段（模型读到一半才发现还有活），又在草案已预填时还催人去填。
    HINT = {"manifest.yaml": "看两张图定气质",
            "layout-controls.yaml": "看 layout-sheet.png；只改这个控制区",
            "body.md": "Colors 用途列草案已填好，觉得不对再改"}
    for fn in ("manifest.yaml", "body.md", "layout-controls.yaml", "frontmatter.yaml"):
        path = os.path.join(ldir, fn)
        if not os.path.exists(path):
            continue
        keys = []
        for line in open(path, encoding="utf-8"):
            if "TODO" not in line:
                continue
            m = re.match(r"\s*[-#]?\s*([\w-]+):", line)
            keys.append(m.group(1) if m else line.strip()[:24])
        if not keys:
            continue
        seen, uniq = set(), []
        for k in keys:
            if k not in seen:
                seen.add(k)
                uniq.append(k)
        hint = HINT.get(fn)
        L.append("- `%s` %d 处：%s%s"
                 % (fn, len(keys), "、".join(uniq[:6]) + ("…" if len(uniq) > 6 else ""),
                    "（%s）" % hint if hint else ""))
    for t in todos:
        L.append("- " + t)
    L += ["", "## 资产判断（按视觉组一次看完）", "",
          ("视觉判断拼版：%s。每张都含候选独立卡与所在页截图；只读这些拼版，不逐张打开素材。"
           % "、".join("`l-out/%s`" % os.path.basename(path) for path in sheets))
          if sheets else "（未生成视觉拼版；不要给图片候选定性，已按内容图保留位置并在 gaps 说明。）",
          "`l-out/asset-vision-groups.json` 记录每张候选的原图尺寸、所有页内位置和尺寸；"
          "透明/近白候选在拼版中同时给棋盘格和深灰底预览。",
          "按每个候选实例填 `asset_vision_groups.visual_kind`；同源图在不同页型/位置可不同。"
          "第三方 logo 墙属于 `content-image`，不是 deck 的 `logo`。",
          "",
          "| ID | 文件 | 原图 | 出现 | 页 | 所有位置 |", "|---|---|---|---|---|---|"]
    decided = {a["src"]["file"]: a["id"] for a in assets}
    why = {c["file"]: r for c, r in rejected}
    selected_candidates = {
        candidate["file"]: candidate
        for group in selected_vision_groups
        for candidate in group["candidates"]
    }
    for c in selected_candidates.values():
        L.append("| `%s` | `%s` | %sx%s | %d | %s | `%s` |" % (
            c["id"], c["file"], c["probe"].get("w") or "?", c["probe"].get("h") or "?",
            c["n"], ",".join(map(str, c["slides"])) or "layout", _placement_text(c)))
    if omitted_vision_groups:
        omitted_pages = sorted({
            page for group in omitted_vision_groups for page in group["pages"] if page > 0
        })
        L.append("")
        L.append("未进视觉预算：%s；对应 slot 默认保留内容图片位置，不会自动升为风格资产。"
                 % ("第%s页" % "、".join(map(str, omitted_pages)) if omitted_pages else "版式候选"))
    L += ["", "## 颜色（草案 token 已写进 frontmatter.yaml）", "",
          "| token | hex | 出现 |", "|---|---|---|"]
    for name, r in tokens:
        L.append("| `%s` | %s | %d |" % (name, r["hex"], r["n"]))
    if rest:
        L.append("")
        L.append("未取用高频色：" + "、".join("%s(%d)" % (r["hex"], r["n"]) for r in rest))
    L += ["", "## 字体 / 字号", ""]
    for f in fonts:
        L.append("- `%s` 渲染 %d 处，字重 %s → 降级链 `%s`%s" % (
            f["names"][0], f["rendered"], f["weights"], " > ".join(f["stack"]),
            "（映射表命中 %s）" % f["mapped"] if f["mapped"] else "（映射表未命中，已留原名）"))
    L.append("")
    L.append("字号轴：" + "、".join("%s=%dpx(n=%d)" % (k, round(v["sz_px"]), v["n"])
                                 for k, v in roles.items()))
    L += ["", "## 版式聚类（判断项在 layout-controls.yaml，坐标事实在 layouts.yaml）", "",
          ("`l-out/layout-sheet.png` 是各页型代表页的重建图——**看它给页型起名**，"
           "不用再逐页查 shapes。" if sampled_archetypes else
           "`l-out/layout-sheet.png` 是模板版式层的重建图；用它看整体视觉即可，"
           "没有对应样张的版式已按模板名称预填，不逐项改名或判角色。")
          if lsheet else "（未生成版式图，按下面的 slot 原文命名）", "",
          "| archetype | 页数 | 代表页 | 背景 | slot 数 |", "|---|---|---|---|---|"]
    for a in sampled_archetypes:
        pages = sample_pages(a)
        representative = a.get("rep") or (pages[0] if pages else None)
        L.append("| `%s` | %d | %s | %s | %d |" % (
            a["name"], len(pages), representative, a["bg"] or "（无资产底图）", len(a["slots"])))
    if template_only_archetypes:
        L.append("")
        L.append("另有 %d 个模板声明版式没有对应样张：名称、角色和坐标已预填并会进入最终包；"
                 "除非当前样张直接证明不对，不需要逐项判断。"
                 % len(template_only_archetypes))
    sampled_pages = {
        page: archetype
        for archetype in sampled_archetypes
        for page in sample_pages(archetype)
    }
    first_page = 1
    last_page = d["counts"]["slides"]
    if first_page in sampled_pages:
        first_archetype = sampled_pages[first_page]
        L.append("")
        L.append("第 1 页实际使用页型：`%s`。若样张确为封面，只在 `roles.%s` 填 `cover`，"
                 "不要按页型名称猜。"
                 % (first_archetype["name"], first_archetype["name"]))
    if last_page != first_page and last_page in sampled_pages:
        last_archetype = sampled_pages[last_page]
        L.append("第 %d 页实际使用页型：`%s`。若样张确为封底，只在 `roles.%s` 填 `closing`，"
                 "不要按页型名称猜。"
                 % (last_page, last_archetype["name"], last_archetype["name"]))
    if leftover:
        L += ["", "未归入 archetype 的页：%s —— 都是单页孤例，需要就自己补一个 archetype。"
              % ", ".join(map(str, leftover))]
    L += ["", "有样张页型的 slot 原文（据此起中文页型名，并在 text_roles 判断文本角色）：", ""]
    for a in sampled_archetypes:
        pages = sample_pages(a)
        representative = a.get("rep") or (pages[0] if pages else None)
        L.append("- `%s`（第 %s 页，覆盖 %s）" % (a["name"], representative, pages))
        for s in a["slots"]:
            L.append("  - %s %spx 「%s」" % (s["role"], round(s["sz"]), s["txt"]))
    L += ["", "## 下一步", "",
          "1. 并行看全部 `vision-group-*.jpg` 和 `layout-sheet.png`；"
          "2. 先填 asset_vision_groups，再用少量 asset_decisions 写例外，最后一次批量改完其它 TODO；"
          "3. 只改 `layout-controls.yaml` 的版式判断项，再跑 `package.py`。"]
    write(os.path.join(ldir, "BRIEF.md"), "\n".join(L) + "\n")


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    a = ap.parse_args(argv)
    outdir = os.path.abspath(a.outdir)
    d = json.load(open(os.path.join(outdir, "extract.json"), encoding="utf-8"))
    ldir = os.path.join(outdir, "l-out")
    os.makedirs(ldir, exist_ok=True)

    all_shapes = json.load(open(os.path.join(outdir, "ref", "shapes.json"),
                                encoding="utf-8"))["shapes"]
    cusage = color_usage(all_shapes, d)
    tokens, rest, rows = draft_colors(d, cusage)
    fonts = draft_fonts(d)
    effective_alpha = fullscreen_effective_alpha(d, outdir, all_shapes)
    archetypes, pages, leftover = draft_layouts(d, outdir, effective_alpha)
    # 只有模板已声明 cover 页型时才能直读它的封面背景。首页和末页会单独保留样张，
    # 但它们的角色仍由模型看图判断，不能因为页码就自动升格为 cover / closing。
    cover_media = cover_background_media(archetypes)
    exported_media = {m["media"] for m in d.get("media", []) if m.get("exported")}
    bg_needed = {a["bg_raw"] for a in archetypes if a["bg_raw"] in exported_media}
    bg_under = {p["no"]: p.get("rendered_bg") or p["bg_media"] for p in pages}
    assets, rejected, todos, alias, pool = draft_assets(
        d, outdir, bg_needed, cover_media, bg_under, effective_alpha)
    media_to_asset = {a["src"]["media"]: a["id"] for a in assets}
    for m, w in (alias or {}).items():
        if w in media_to_asset:
            media_to_asset.setdefault(m, media_to_asset[w])

    cW, cH = d["canvas"]["px"]
    for a in archetypes:
        a["bg"] = media_to_asset.get(a["bg_raw"])
        # 版式自带的图片元素：映射到资产 id。映射不到时**保留槽位但不写 asset**——
        # 删掉整条槽，消费端看到的是一个没有图标的托底圆，和图标不进包是同一个失败模式，
        # 而且它连「这里本来有东西」都不知道。
        keep = []
        for s in a["slots"]:
            if s.get("media"):
                aid = media_to_asset.get(s["media"])
                if not aid:
                    c = pool.get(alias.get(s["media"], s["media"])) or pool.get(s["media"])
                    s["role"] = "asset-candidate"
                    if c:
                        s["source_media"] = c["file"]
                    s.pop("media", None)
                    keep.append(s)
                    continue
                s["asset"] = aid
                c = pool.get(alias.get(s["media"], s["media"])) or pool.get(s["media"])
                if c:
                    s["source_media"] = c["file"]
                # role 跟着资产走：图标槽写成 logo 会让消费端把它当品牌标识，每页都摆一个
                s["role"] = next((x["kind"] for x in assets if x["id"] == aid), s["role"])
            keep.append(s)
        a["slots"] = keep
    roles = draft_scale(d, archetypes)
    slot_added = cover_slot_colors(tokens, archetypes, rows, cusage)
    # 局部图和半透明满屏叠加层必须结合页面语境定性。候选在本阶段按图片槽过滤：
    # 没有最终槽位的媒体无需让模型判断；有槽位但超出视觉预算的则保留通用 pic 槽。
    decided_c = sorted([a["src"] for a in assets], key=lambda c: (-c["n"], c["file"]))
    other_c = sorted([c for c, _ in rejected], key=lambda c: (-c["n"], c["file"]))
    cands, seen_file = [], set()
    for c in decided_c + other_c:            # 同一张图可能有多条候选记录（不同位置各一条）
        if c["file"] not in seen_file:
            seen_file.add(c["file"])
            cands.append(c)
    review_candidates = []
    for candidate_index, candidate in enumerate(
            visual_slot_candidates(cands, archetypes), 1):
        row = dict(candidate)
        row["id"] = "asset-%d" % candidate_index
        review_candidates.append(row)
    selected_vision_groups, omitted_vision_groups, sheets = emit_asset_vision_groups(
        outdir, review_candidates, d["counts"]["slides"], ldir)
    lsheet = layout_sheet(outdir, archetypes, os.path.join(ldir, "layout-sheet.png"))

    anchors = draft_anchors(d, tokens, fonts, roles, assets, archetypes)
    gaps, exceptions = [], []
    if omitted_vision_groups:
        omitted_pages = sorted({
            page for group in omitted_vision_groups for page in group["pages"] if page > 0
        })
        if omitted_pages:
            gaps.append("视觉略过：%s页" % "/".join(map(str, omitted_pages)))
        else:
            gaps.append("视觉判断超预算，未覆盖版式候选")
    if review_candidates and not sheets:
        gaps.append("视觉拼版不可用，图片候选按内容图保留，未做风格定性。")
    for c, why in rejected:
        if "近全透明" in why:
            gaps.append("母版/版式里的 %s 是%s，不是设计资产，任何情况下不要当背景用。" % (c["file"], why))
        elif "不是背景" in why:
            gaps.append("%s 在模板里铺满整页，但%s；那几页的真实背景是幻灯片自身的底色，"
                        "需要时按 Colors 里的 surface 铺纯色。" % (c["file"], why))
    by_kind = {}
    for kind, kept, total, advice, where in _TRUNCATED:
        e = by_kind.setdefault(kind, {"kept": 0, "total": 0, "advice": advice, "where": []})
        e["kept"] += kept
        e["total"] += total
        if where:
            e["where"].append(where)
    for kind, e in by_kind.items():
        at = ("（%s）" % "、".join(e["where"][:6])) if e["where"] else ""
        gaps.append("%s%s按名额截断：普查到 %d 个，包内留了 %d 个%s。"
                    % (kind, at, e["total"], e["kept"],
                       "；" + e["advice"] if e["advice"] else ""))
    # 「没命中映射表」不等于「装不上」：降级目标本身（Noto Sans SC 之类）和 Office 出厂体
    # 都不在 match 列里，但它们本来就可用。真正危险的是**既没命中、又不是已知可用字体**的
    # 那种——design.md 的字体栈里留着一个消费端装不上的商业字体名，且没有任何降级说明。
    web_ok = {norm(x) for fam in parse_fallback_table() for x in fam["fallback"]}
    web_ok |= {norm(x.strip().strip('"')) for x in SYS_FALLBACK.split(",")}
    for f in fonts:
        if f.get("mapped"):
            gaps.append("源字体 %s 无 web 授权源，已按 font-fallback 表降级到 %s；字形细节与原稿有差异。"
                        % (f["names"][0], f["stack"][1]))
        elif norm(f["names"][0]) in OFFICE_DEFAULT_FONTS_NORM:
            gaps.append("%s 是 Office 出厂字体，多半是模板里没清干净的残留而非设计选型；"
                        "按正文/标题的实际气质挑替代体，不要照抄它。" % f["names"][0])
        elif norm(f["names"][0]) not in web_ok:
            gaps.append("源字体 %s 不在 font-fallback 表里，字体栈只有原名，消费端很可能装不上；"
                        "按气质挑一个有 web 分发源的近似体补进栈，不要照抄原名。" % f["names"][0])
    nosize = [(a["name"], s["box"]) for a in archetypes for s in a["slots"]
              if not s.get("asset") and not s.get("_font_size")]
    if nosize:
        gaps.append("这些文字槽在源文件任何层级都没有字号声明（都不是占位符，是普通文本框，"
                    "继承源是 presentation.xml 的 defaultTextStyle，本抽取按约定不解继承链）："
                    "%s。用 typography 里最接近的档位，不要自造新档。"
                    % "、".join("%s %s" % (n, b) for n, b in nosize[:6]))

    if leftover:
        exceptions.append("源 deck 第 %s 页是单页孤例，没有归纳成 archetype；需要类似构图时按最接近的页型改。"
                          % "、".join(map(str, leftover)))

    emit_manifest(d, assets, selected_vision_groups, ldir, archetypes)
    emit_frontmatter(d, tokens, fonts, roles, anchors, gaps, ldir)
    # 每张背景量一次局部对比度，作为「哪里不能压文字」的客观依据摆进判断单。
    # 只报测到的数，不替人填 avoid——哪块算主体、要不要避让，是看图才能定的。
    busy_hints = {}
    for a in assets:
        if a["kind"] != "background" or not a["src"].get("out"):
            continue
        r = bg_busy_map(os.path.join(outdir, a["src"]["out"]), (cW, cH))
        if r:
            busy_hints[a["id"]] = r
    facts, recipes = structure_facts(archetypes, d, all_shapes)
    for a in archetypes:
        a["flow"] = draft_flow(a, facts.get(a["name"]) or {}, (cW, cH))
    emit_layouts(archetypes, ldir, busy_hints, facts, recipes)
    emit_body(d, tokens, fonts, roles, assets, archetypes, exceptions, cusage, ldir,
              has_asset_candidates=any(needs_asset_judgment(c) for c in cands))
    emit_brief(d, (tokens, rest, fonts, roles, assets, rejected, todos, archetypes, cands, sheets,
                   selected_vision_groups, omitted_vision_groups, leftover, lsheet), ldir)

    # 这几行落在模型判断「skill 是不是做完了」的那一刻。只报数就会被读成「包已生成」，
    # 于是判断和打包整段被跳过，deck 拿不到任何版式坐标。所以这里报进度与下一条命令。
    print("第 1/3 步完成，判断单草案 -> %s" % ldir)
    print("  待你确认：资产 %d（%s）  版式 %d  色 %d  字体 %d"
          % (len(assets), ", ".join(x["id"] for x in assets), len(archetypes), len(tokens), len(fonts)))
    print("  第 2 步 读 l-out/BRIEF.md，并行看视觉组拼版与版式图；版式判断只改 layout-controls.yaml")
    print("  第 3 步 package.py 产出 design.md + layouts.md —— deck 的版式坐标只从这两份读")
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
