#!/usr/bin/env python3
"""页面光栅器：把 shape-facts 重放成页面图（PNG）／绝对定位 HTML。

draft.py 用它渲染各 archetype 的代表页，拼成 layout-sheet.png——版式命名要看得见页面。

用法: render_pages.py <extract 输出目录> [--pages all|slides|layouts] [--only 1,3,9] [--no-html]

读 <outdir>/extract.json + <outdir>/ref/shapes.json（旧产物回退读
extract.json 的 shapes 键），写 <outdir>/ref/rebuild/：
  index.html          全部页面纵向排列（缩放到 960 宽便于通览）
  slide-<n>.html      每张实例页一个 1920x1080 精确视口文件（供截图对比原图）
  layout-<n>.html     每个版式一个，同上

页面 = master 形状 → layout 形状 → slide 形状 三层叠加（PowerPoint 的渲染顺序）；
版式页只叠 master → layout。图片 src 指 media-out 相对路径；extract 未导出的
媒体（内容图不属于风格资产）画虚线占位框并标注原始文件名。

占位符继承按 PowerPoint 语义处理：实例页填了某个 ph 槽位时，压掉版式里同槽位的
提示文字；实例页 ph 自身无 xfrm（extract 记 placement=inherited）时，从版式同槽位
借几何与 lstStyle。缺省文字色取 master clrMap 解析出的 tx1（深色母版=白，浅色=黑）。

纯脚本重建，不调用任何模型。LLM 只参与「看重建图 vs 看原图」的对比判断。
"""
import argparse
import html as html_lib
import json
import os
import re
import sys

LAYER_ORDER = {"master": 0, "layout": 1, "slide": 2}
ALIGN = {"l": "left", "ctr": "center", "r": "right", "just": "justify"}
VANCHOR = {"t": "flex-start", "ctr": "center", "b": "flex-end"}
# 源字族本地多半装不上（商业中文字体 / 品牌字体），按类目兜底——
# 不分类目会让衬线标题渲染成无衬线，对比环节就会误报「字体抽错了」
CJK_STACK = "'Noto Sans SC','PingFang SC','Microsoft YaHei',sans-serif"
SERIF_STACK = "'Noto Serif SC',Georgia,'Songti SC',serif"
MONO_STACK = "'IBM Plex Mono',ui-monospace,Menlo,monospace"
SERIF_HINT = ("serif", "georgia", "times", "song", "ming", "garamond", "baskerville")
MONO_HINT = ("mono", "consol", "courier", "code")


def fallback_stack(family):
    low = family.lower()
    if any(hint in low for hint in MONO_HINT):
        return MONO_STACK
    if any(hint in low for hint in SERIF_HINT) and "sans" not in low:
        return SERIF_STACK
    return CJK_STACK


def esc(text):
    return html_lib.escape(str(text), quote=False)


def attr(value):
    return html_lib.escape(str(value), quote=True)


def style_attr(styles):
    return attr(";".join(styles))


def css_color(color):
    """{raw, hex, alpha, resolved} → CSS 颜色串；extract 已算好 resolved，直接用。"""
    if not color:
        return None
    if color.get("resolved"):
        return color["resolved"]
    if color.get("hex"):
        return color["hex"]
    return None


def css_gradient(grad):
    """OOXML gradFill → CSS linear-gradient。ang 是自 +x 轴顺时针度数，CSS 是自 12 点顺时针，故 +90。"""
    stops = sorted(grad.get("stops") or [], key=lambda s: s.get("pos", 0))
    if not stops:
        return None
    parts = []
    for stop in stops:
        color = css_color(stop.get("color")) or "transparent"
        parts.append("%s %.1f%%" % (color, stop.get("pos", 0)))
    angle = (grad.get("angle_deg") or 0) + 90
    return "linear-gradient(%.1fdeg, %s)" % (angle, ", ".join(parts))


def background_css(bg):
    """页底 <p:bg> 描述符 → CSS background 值。解析不出返回 None，交上层回退到下一层底色。

    bgPr solid / bgRef 都带 `color`；线性 gradient 与形状渐变共用 css_gradient；
    path 渐变和背景图不重建，按无底色处理，不能伪装成线性渐变。
    """
    if not bg:
        return None
    kind = bg.get("type")
    if kind == "gradient":
        if bg.get("path"):
            return None
        return css_gradient(bg)
    if kind in ("image", "none", "pattern"):
        return None
    return css_color(bg.get("color"))


def fill_style(fill):
    """形状填充 → CSS 声明列表。"""
    if not fill:
        return []
    kind = fill.get("type")
    if kind == "solid":
        color = css_color(fill.get("color"))
        return ["background:%s" % color] if color else []
    if kind == "gradient":
        grad = css_gradient(fill)
        return ["background-image:%s" % grad] if grad else []
    return []


def line_style(line):
    """描边 → CSS。渐变描边走 border-image（源模板的卡片边框就是这个）。"""
    if not line or line.get("none"):
        return []
    width = max(1, round(line.get("w_px") or 1))
    if line.get("gradient"):
        grad = css_gradient(line["gradient"])
        if grad:
            return ["border:%dpx solid transparent" % width,
                    "border-image:%s 1" % grad]
    color = css_color(line.get("color"))
    if color:
        dash = "dashed" if (line.get("dash") or "").startswith("dash") else "solid"
        return ["border:%dpx %s %s" % (width, dash, color)]
    return []


def crop_style(crop, url):
    """srcRect 裁切用 background-position/size 模拟。
    background-position 的百分比是相对 (容器 - 图) 的溢出量解析的，
    所以偏移分数是 l/(l+r)，不是 l/可见宽。"""
    left, right = crop.get("l", 0) or 0, crop.get("r", 0) or 0
    top, bottom = crop.get("t", 0) or 0, crop.get("b", 0) or 0
    vis_w, vis_h = 100 - left - right, 100 - top - bottom
    if vis_w <= 0 or vis_h <= 0:
        vis_w, vis_h = 100, 100
    return ["background-image:url(%s)" % url,
            "background-size:%.3f%% %.3f%%" % (100 / vis_w * 100, 100 / vis_h * 100),
            "background-position:%.3f%% %.3f%%" % (
                left / (left + right) * 100 if (left + right) else 0,
                top / (top + bottom) * 100 if (top + bottom) else 0),
            "background-repeat:no-repeat"]


def run_props(lvl1, para, run):
    """有效文本属性 = lstStyle.lvl1pPr ← 段落 defRPr ← 段属性 ← run 覆写。

    段落的 a:pPr/a:defRPr 是「该段 run 的默认值」，位置在 lstStyle 与 run 之间；
    Mac Office 导出的 deck 把字号写在这一层，漏掉它整页标题就没有 font-size。
    """
    props = dict(lvl1 or {})
    props.update((para or {}).get("defRPr") or {})
    for src in (para or {}), (run or {}):
        for key, val in src.items():
            if key not in ("runs", "text", "defRPr") and val is not None:
                props[key] = val
    return props


def run_css(props):
    styles = []
    size = props.get("sz_px")
    if size:
        styles.append("font-size:%.1fpx" % size)
    family = props.get("latin") or props.get("ea")
    if family:
        styles.append("font-family:'%s',%s" % (family.replace("'", ""),
                                               fallback_stack(family)))
    weight = props.get("weight") or (700 if props.get("bold") else None)
    if weight:
        styles.append("font-weight:%d" % weight)
    if props.get("italic"):
        styles.append("font-style:italic")
    spc = props.get("spc_px")
    if spc:
        styles.append("letter-spacing:%.2fpx" % spc)
    if props.get("underline"):
        styles.append("text-decoration:underline")
    fill = props.get("fill")
    if isinstance(fill, dict) and fill.get("type") == "gradient":
        # 渐变填字：本模板的强调机制。重建里必须显式还原，否则看不出漏抽
        grad = css_gradient(fill)
        if grad:
            styles += ["background-image:%s" % grad,
                       "-webkit-background-clip:text", "background-clip:text",
                       "color:transparent"]
    else:
        color = None
        if isinstance(fill, dict) and fill.get("type") == "solid":
            color = css_color(fill.get("color"))
        color = color or css_color(props.get("color"))
        if color:
            styles.append("color:%s" % color)
    return styles


def para_css(para, lvl1):
    styles = []
    align = para.get("algn") or (lvl1 or {}).get("algn") or "l"
    styles.append("text-align:%s" % ALIGN.get(align, "left"))
    lnspc = para.get("lnSpc") or (lvl1 or {}).get("lnSpc") or {}
    if lnspc.get("mult"):
        # OOXML spcPct 是「单倍行距」的百分比，单倍 ≈ 1.2em
        styles.append("line-height:%.3f" % (lnspc["mult"] * 1.2))
    return styles


def render_text(text_obj):
    lvl1 = ((text_obj.get("lstStyle") or {}).get("lvl1pPr")) or {}
    paras = text_obj.get("paragraphs")
    if not isinstance(paras, list):
        return ""
    html = ""
    for para in paras:
        if not isinstance(para, dict):
            continue
        html += '<p style="%s">' % style_attr(para_css(para, lvl1))
        runs = para.get("runs") or []
        if not runs:
            html += "<br>"
        for run in runs:
            props = run_props(lvl1, para, run)
            html += '<span style="%s">%s</span>' % (
                style_attr(run_css(props)), esc(run.get("text") or ""))
        html += "</p>"
    return html


def render_shape(shape, media_url, stats):
    if shape["kind"] == "grpSp":
        return ""                                # 组合本身无视觉，子形状已带绝对坐标
    box = shape.get("box")
    if not box:
        stats["no_box"] += 1
        return ""
    styles = ["left:%.1fpx" % box["x"], "top:%.1fpx" % box["y"],
              "width:%.1fpx" % box["w"], "height:%.1fpx" % box["h"]]
    if (shape.get("degenerate_axis") or "") == "w" or box["w"] == 0:
        styles[2] = "width:1px"                  # 竖直连接符：0 宽渲染不出来
    if (shape.get("degenerate_axis") or "") == "h" or box["h"] == 0:
        styles[3] = "height:1px"
    radius = shape.get("radius_px")
    if radius:
        styles.append("border-radius:%.1fpx" % radius)
    styles += fill_style(shape.get("fill"))
    styles += line_style(shape.get("line"))
    inner = ""
    media = shape.get("media_svg") or shape.get("media")
    if media:
        url = media_url.get(media)
        if url:
            styles += crop_style(shape.get("crop") or {}, url)
            stats["img_ok"] += 1
        else:
            styles += ["outline:2px dashed rgba(255,0,128,.7)", "outline-offset:-2px"]
            inner = ('<span class="ph">%s</span>' % esc(os.path.basename(media)))
            stats["img_missing"] += 1
    text_obj = shape.get("text")
    if text_obj:
        body = text_obj.get("bodyPr") or {}
        ins = body.get("insets_px") or {}
        styles.append("padding:%.1fpx %.1fpx %.1fpx %.1fpx" % (
            ins.get("tIns", 0) or 0, ins.get("rIns", 0) or 0,
            ins.get("bIns", 0) or 0, ins.get("lIns", 0) or 0))
        styles += ["display:flex", "flex-direction:column",
                   "justify-content:%s" % VANCHOR.get(body.get("anchor", "t"), "flex-start")]
        inner += render_text(text_obj)
        stats["text"] += 1
    stats["shapes"] += 1
    return '<div class="sp" style="%s">%s</div>' % (style_attr(styles), inner)


HEAD = """<style>
body{margin:0;background:#2b2b2b;font-family:%s}
.page{position:relative;width:%dpx;height:%dpx;overflow:hidden}
.sp{position:absolute;box-sizing:border-box}
.sp p{margin:0}
.ph{position:absolute;left:6px;top:4px;font:16px/1.2 monospace;color:#ff2b88;background:#fff9;padding:1px 4px}
</style>
"""

# 缩略框跟着画布比例走，缩放比也一起算——写死 16:9 会把非 16:9 模板的页面裁掉一截
INDEX_EXTRA = """<style>
.wrap{width:%dpx;margin:0 auto;padding:16px 0}
.lbl{color:#eee;font:13px/1.6 monospace;margin:14px 0 4px}
.box{width:%dpx;height:%dpx;overflow:hidden;margin-bottom:6px}
.box .page{transform:scale(%g);transform-origin:top left}
</style>
"""


def ph_key(shape):
    ph = shape.get("ph")
    if not ph:
        return None
    return (ph.get("type"), ph.get("idx"))


def resolve_inheritance(layout_shapes, slide_shapes):
    """实例页填了的 ph 槽位压掉版式提示文字；实例页缺 xfrm 的 ph 从版式借几何 + lstStyle。"""
    layout_by_ph = {}
    for shape in layout_shapes:
        key = ph_key(shape)
        if key and key not in layout_by_ph:
            layout_by_ph[key] = shape
    filled = {ph_key(s) for s in slide_shapes if ph_key(s)}
    kept_layout = [s for s in layout_shapes if ph_key(s) not in filled]
    resolved_slide = []
    for shape in slide_shapes:
        key = ph_key(shape)
        donor = layout_by_ph.get(key)
        if donor and (shape.get("placement") == "inherited" or not shape.get("box")):
            merged = dict(donor)
            merged.update({k: v for k, v in shape.items() if k != "text"})
            merged["box"] = donor.get("box")
            donor_text = donor.get("text") or {}
            own_text = shape.get("text") or {}
            merged["text"] = {"bodyPr": own_text.get("bodyPr") or donor_text.get("bodyPr"),
                              "lstStyle": own_text.get("lstStyle") or donor_text.get("lstStyle"),
                              "paragraphs": own_text.get("paragraphs")
                              or donor_text.get("paragraphs")}
            resolved_slide.append(merged)
        else:
            resolved_slide.append(shape)
    return kept_layout, resolved_slide


def page_html(parts_shapes, default_color, page_bg, media_url, stats):
    body = ['<div class="page" style="%s">' % style_attr([
        "color:%s" % default_color,
        "background:%s" % page_bg,
    ])]
    for shapes in parts_shapes:
        for shape in shapes:
            body.append(render_shape(shape, media_url, stats))
    body.append("</div>")
    return "\n".join(b for b in body if b)


def load_shapes(outdir, data):
    """S4 shape-facts, sidecar first.

    `ref/shapes.json` is where the extractor writes them; the extract.json
    fallback keeps older output directories (which carried a `shapes` key)
    replayable without re-running extraction.
    """
    sidecar = os.path.join(outdir, "ref", "shapes.json")
    if os.path.exists(sidecar):
        with open(sidecar, encoding="utf-8") as f:
            return json.load(f)["shapes"], "ref/shapes.json"
    if "shapes" in data:
        return data["shapes"], "extract.json (legacy)"
    raise SystemExit('no shape facts: neither %s nor extract.json["shapes"]' % sidecar)



# ---------------------------------------------------------------- PNG 光栅（无浏览器成像）
FONT_CANDIDATES = [
    "/System/Library/Fonts/PingFang.ttc",
    "/System/Library/Fonts/Hiragino Sans GB.ttc",
    "/System/Library/Fonts/STHeiti Light.ttc",
    "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
    "/usr/share/fonts/noto-cjk/NotoSansCJK-Regular.ttc",
]

_CSS_RGBA = re.compile(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([0-9.]+))?\s*\)")
_CSS_GRAD = re.compile(r"linear-gradient\((?:([0-9.+-]+)deg\s*,)?(.*)\)\s*$")
_GRAD_STOP = re.compile(r"(#[0-9A-Fa-f]{6}|rgba?\([^)]*\)|transparent)\s*([0-9.]+)%")


def _rgba(css, default=None):
    if not css:
        return default
    css = css.strip()
    if css == "transparent":
        return (0, 0, 0, 0)
    if css.startswith("#") and len(css) >= 7:
        return (int(css[1:3], 16), int(css[3:5], 16), int(css[5:7], 16), 255)
    m = _CSS_RGBA.match(css)
    if m:
        a = float(m.group(4)) if m.group(4) is not None else 1.0
        return (int(m.group(1)), int(m.group(2)), int(m.group(3)), int(round(a * 255)))
    return default


def _grad_stops(css):
    """解析 css_gradient 自产的 linear-gradient 串 → (angle, [(pos01, rgba)])；解析不了返回 None。"""
    m = _CSS_GRAD.search(css or "")
    if not m:
        return None
    angle = float(m.group(1)) if m.group(1) else 180.0
    stops = [( float(p) / 100.0, _rgba(c, (0, 0, 0, 0)) )
             for c, p in _GRAD_STOP.findall(m.group(2))]
    return (angle, stops) if stops else None


def _grad_image(Image, w, h, angle, stops):
    """按角度投影的线性渐变位图。t = 像素在渐变轴上的归一化位置。"""
    import math
    w, h = max(int(w), 1), max(int(h), 1)
    rad = math.radians((angle or 180) - 90)      # CSS 角 → 数学向量
    vx, vy = math.cos(rad), math.sin(rad)
    img = Image.new("RGBA", (w, h))
    px = img.load()
    span = abs(w * vx) + abs(h * vy) or 1.0
    x0 = 0 if vx >= 0 else w
    y0 = 0 if vy >= 0 else h
    stops = sorted(stops)
    for y in range(h):
        for x in range(0, w, max(1, w // 256)):
            t = ((x - x0) * vx + (y - y0) * vy) / span
            t = min(max(t, 0.0), 1.0)
            lo = stops[0]
            hi = stops[-1]
            for i in range(len(stops) - 1):
                if stops[i][0] <= t <= stops[i + 1][0]:
                    lo, hi = stops[i], stops[i + 1]
                    break
            f = 0.0 if hi[0] == lo[0] else (t - lo[0]) / (hi[0] - lo[0])
            col = tuple(int(lo[1][k] + (hi[1][k] - lo[1][k]) * f) for k in range(4))
            for xx in range(x, min(x + max(1, w // 256), w)):
                px[xx, y] = col
    return img


class _Fonts:
    def __init__(self, ImageFont):
        self.ImageFont = ImageFont
        self.path = next((p for p in FONT_CANDIDATES if os.path.exists(p)), None)
        self.cache = {}

    def get(self, size):
        size = max(int(size), 6)
        if size not in self.cache:
            try:
                self.cache[size] = self.ImageFont.truetype(self.path, size) if self.path \
                    else self.ImageFont.load_default()
            except Exception:
                self.cache[size] = self.ImageFont.load_default()
        return self.cache[size]


def _run_color(props, default_color):
    fill = props.get("fill")
    if isinstance(fill, dict):
        if fill.get("type") == "gradient":
            g = _grad_stops(css_gradient(fill) or "")
            if g and g[1]:
                mid = g[1][len(g[1]) // 2][1]
                return mid
        if fill.get("type") == "solid":
            c = _rgba(css_color(fill.get("color")))
            if c:
                return c
    return _rgba(css_color(props.get("color"))) or _rgba(default_color, (0, 0, 0, 255))


def _draw_text(draw, fonts, text_obj, box, scale, default_color):
    lvl1 = ((text_obj.get("lstStyle") or {}).get("lvl1pPr")) or {}
    paras = text_obj.get("paragraphs")
    if not isinstance(paras, list):
        return
    bx, by, bw = box["x"] * scale, box["y"] * scale, box["w"] * scale
    lines = []                                    # (runs[(text, size, color)], align, line_h)
    for para in paras:
        if not isinstance(para, dict):
            continue
        runs = para.get("runs") or []
        algn = para.get("algn") or lvl1.get("algn") or "l"
        lnspc = (para.get("lnSpc") or lvl1.get("lnSpc") or {})
        mult = lnspc.get("mult") or 1.0
        items, maxsz = [], 12
        for run in runs:
            props = run_props(lvl1, para, run)
            size = (props.get("sz_px") or 18) * scale
            maxsz = max(maxsz, size)
            items.append((run.get("text") or "", size, _run_color(props, default_color)))
        lines.append((items, algn, maxsz * 1.2 * mult))
    total_h = sum(l[2] for l in lines)
    anchor = ((text_obj.get("bodyPr") or {}).get("anchor")) or "t"
    y = by + {"t": 0, "ctr": (box["h"] * scale - total_h) / 2,
              "b": box["h"] * scale - total_h}.get(anchor, 0)
    for items, algn, line_h in lines:
        width = sum(draw.textlength(t, font=fonts.get(s)) for t, s, _ in items if t)
        x = bx + {"l": 0, "ctr": (bw - width) / 2, "r": bw - width}.get(algn, 0)
        for t, s, col in items:
            if t:
                draw.text((x, y), t, font=fonts.get(s), fill=col)
                x += draw.textlength(t, font=fonts.get(s))
        y += line_h


def render_pages_png(pages, outdir, data, scale=0.5):
    try:
        from PIL import Image, ImageDraw, ImageFont
    except Exception:
        print("png: Pillow 缺失，跳过（extract 已降级，产物记 gaps）")
        return None
    fonts = _Fonts(ImageFont)
    media_local = {m["media"]: os.path.join(outdir, m["out"])
                   for m in data.get("media") or [] if m.get("exported") and m.get("out")}
    png_dir = os.path.join(outdir, "ref", "rebuild", "png")
    os.makedirs(png_dir, exist_ok=True)
    cpx = ((data.get("canvas") or {}).get("px") or [1920, 1080])
    W, H = int(cpx[0] * scale), int(cpx[1] * scale)
    for kind, n, label, layers, default_color, page_bg in pages:
        canvas = Image.new("RGBA", (W, H), _rgba(page_bg) or (136, 136, 136, 255))
        g = _grad_stops(page_bg or "")
        if g:
            canvas.alpha_composite(_grad_image(Image, W, H, g[0], g[1]))
        draw = ImageDraw.Draw(canvas, "RGBA")
        for shapes in layers:
            for sp in shapes:
                if sp.get("kind") == "grpSp":
                    continue
                box = sp.get("box")
                if not box:
                    continue
                x, y = box["x"] * scale, box["y"] * scale
                w, h = max(box["w"] * scale, 1), max(box["h"] * scale, 1)
                rect = [x, y, x + w, y + h]
                media = sp.get("media_svg") or sp.get("media")
                if media:
                    p = media_local.get(media)
                    drawn = False
                    if p and os.path.exists(p) and not p.endswith(".svg"):
                        try:
                            im = Image.open(p).convert("RGBA").resize((int(w), int(h)))
                            canvas.alpha_composite(im, (int(x), int(y)))
                            drawn = True
                        except Exception:
                            pass
                    if not drawn:
                        draw.rectangle(rect, outline=(255, 43, 136, 255), width=1)
                        draw.text((x + 3, y + 2), os.path.basename(media),
                                  font=fonts.get(11), fill=(255, 43, 136, 255))
                fill = sp.get("fill") or {}
                if fill.get("type") == "solid":
                    col = _rgba(css_color(fill.get("color")))
                    if col:
                        a = fill.get("color", {}).get("alpha")
                        if a is not None and a < 100:
                            col = col[:3] + (int(a / 100 * 255),)
                        layer = Image.new("RGBA", (W, H))
                        ImageDraw.Draw(layer).rectangle(rect, fill=col)
                        canvas.alpha_composite(layer)
                elif fill.get("type") == "gradient":
                    gg = _grad_stops(css_gradient(fill) or "")
                    if gg:
                        canvas.alpha_composite(
                            _grad_image(Image, w, h, gg[0], gg[1]), (int(x), int(y)))
                line = sp.get("line") or {}
                if line and not line.get("none"):
                    lc = _rgba(css_color(line.get("color")))
                    if not lc and line.get("gradient"):
                        gg = _grad_stops(css_gradient(line["gradient"]) or "")
                        lc = gg[1][-1][1] if gg else None
                    if lc:
                        draw.rectangle(rect, outline=lc,
                                       width=max(1, int((line.get("w_px") or 1) * scale)))
                if sp.get("text"):
                    _draw_text(draw, fonts, sp["text"], box, scale, default_color)
        out = os.path.join(png_dir, "%s-%d.png" % (kind, n))
        canvas.convert("RGB").save(out)
    return png_dir

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("outdir")
    ap.add_argument("--pages", choices=("all", "slides", "layouts"), default="all")
    ap.add_argument("--no-png", action="store_true", help="跳过 PNG 光栅（默认渲染，供 Read 工具直接看图）")
    ap.add_argument("--only", default=None, help="只渲染这些实例页，逗号分隔页号（draft.py 取代表页用）")
    ap.add_argument("--no-html", action="store_true", help="只出 PNG，不写 HTML")
    args = ap.parse_args()
    only = {int(x) for x in args.only.split(",") if x.strip()} if args.only else None

    outdir = os.path.abspath(args.outdir)
    with open(os.path.join(outdir, "extract.json"), encoding="utf-8") as f:
        data = json.load(f)
    rebuild = os.path.join(outdir, "ref", "rebuild")
    os.makedirs(rebuild, exist_ok=True)

    shapes, shapes_from = load_shapes(outdir, data)
    # media-out/ sits at the output root, two levels up from ref/rebuild/.
    media_url = {m["media"]: "../../" + m["out"]
                 for m in data.get("media") or [] if m.get("exported") and m.get("out")}
    by_part = {}
    for shape in shapes:
        by_part.setdefault(shape["part"], []).append(shape)
    graph = data.get("reference_graph") or {}
    layout_of = graph.get("layout_of_slide") or {}
    master_of = graph.get("master_of_layout") or {}
    layout_name = {l["part"]: l.get("name") or "" for l in data.get("layouts") or []}

    # 缺省文字色 = master clrMap 的 tx1 → theme clrScheme（PowerPoint 的实际缺省）
    theme_scheme = {t["part"]: t.get("clrScheme") or {} for t in data.get("themes") or []}
    theme_of_master = (graph.get("theme_of_master") or {})
    tx1_of_master = {}
    for entry in ((data.get("theme_topology") or {}).get("per_master") or []):
        scheme = theme_scheme.get(theme_of_master.get(entry["master"]), {})
        tx1_of_master[entry["master"]] = scheme.get(entry.get("tx1_slot") or "dk1", "#000000")

    def num(part):
        m = re.search(r"(\d+)\.xml$", part)
        return int(m.group(1)) if m else 0

    # 页底色两层：实例页自己的 <p:bg> 优先，没有才退版式底色。PptxGenJS 那类 deck
    # 每页自设纯色底，只看版式层会把整叠页渲染成同一个底色（反白页就变成白底白字）。
    layout_bg = {}
    for layout in data.get("layouts") or []:
        layout_bg[layout["part"]] = background_css(layout.get("background")) or "#888"
    slide_bg = {}
    for slide in data.get("slides") or []:
        css = background_css(slide.get("background"))
        if css:
            slide_bg[slide["part"]] = css

    pages = []                                   # (kind, n, label, [层形状], 缺省色, 底色)
    if args.pages in ("all", "slides"):
        for part in sorted((p for p in by_part if "/slides/" in p), key=num):
            layout = layout_of.get(part)
            master = master_of.get(layout) if layout else None
            kept_layout, slide_shapes = resolve_inheritance(
                by_part.get(layout, []), by_part.get(part, []))
            pages.append(("slide", num(part),
                          "SLIDE %d  ←  %s" % (num(part), layout_name.get(layout, layout or "-")),
                          [by_part.get(master, []), kept_layout, slide_shapes],
                          tx1_of_master.get(master, "#000000"),
                          slide_bg.get(part) or layout_bg.get(layout, "#888")))
    if args.pages in ("all", "layouts"):
        for part in sorted((l["part"] for l in data.get("layouts") or []), key=num):
            master = master_of.get(part)
            pages.append(("layout", num(part),
                          "LAYOUT %d  %s" % (num(part), layout_name.get(part, "")),
                          [by_part.get(master, []), by_part.get(part, [])],
                          tx1_of_master.get(master, "#000000"),
                          layout_bg.get(part, "#888")))

    if only is not None:      # 对样张和版式一律生效（form=3 的代表页是版式，不是样张）
        pages = [p for p in pages if p[1] in only]

    stats = {"shapes": 0, "text": 0, "img_ok": 0, "img_missing": 0, "no_box": 0}
    cw, ch = ((data.get("canvas") or {}).get("px") or [1920, 1080])[:2]
    head = HEAD % (CJK_STACK, cw, ch)   # 视口跟画布走，非 16:9 模板不能按 1920x1080 裁
    thumb_scale = 960.0 / cw
    index = [head, INDEX_EXTRA % (960, 960, round(ch * thumb_scale), thumb_scale),
             '<div class="wrap">']
    for kind, n, label, layers, default_color, page_bg in (() if args.no_html else pages):
        html = page_html(layers, default_color, page_bg, media_url, stats)
        with open(os.path.join(rebuild, "%s-%d.html" % (kind, n)), "w", encoding="utf-8") as f:
            f.write(head + html)
        index += ['<div class="lbl">%s</div>' % esc(label),
                  '<div class="box">%s</div>' % html]
    index.append("</div>")
    with open(os.path.join(rebuild, "index.html"), "w", encoding="utf-8") as f:
        f.write("\n".join(index))

    total = sum(os.path.getsize(os.path.join(rebuild, f))
                for f in os.listdir(rebuild) if f.endswith(".html"))
    n_slides = sum(1 for p in pages if p[0] == "slide")
    n_layouts = sum(1 for p in pages if p[0] == "layout")
    if not args.no_png:
        png_dir = render_pages_png(pages, outdir, data)
        if png_dir:
            print("png     -> %s  (%d pages)" % (os.path.relpath(png_dir, outdir), len(pages)))

    print("rebuild → %s  (shape facts from %s)" % (rebuild, shapes_from))
    print("pages: %d (slides %d + layouts %d), files %d, html %.1f KB"
          % (len(pages), n_slides, n_layouts, len(pages) + 1, total / 1024))
    print("shapes drawn %d (text %d), images ok %d / placeholder %d, skipped no-box %d"
          % (stats["shapes"], stats["text"], stats["img_ok"], stats["img_missing"],
             stats["no_box"]))
    return 0


if __name__ == "__main__":
    sys.exit(main())
