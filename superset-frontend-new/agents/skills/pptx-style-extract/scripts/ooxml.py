#!/usr/bin/env python3
"""OOXML parsing primitives for stage-1 extraction (S3 color resolution + S4 shape facts).

All length quantities are normalised to px @1920-wide canvas with a single factor
(`Units.f` = 1920 / sldSz_cx), so coordinates, font sizes, letter spacing, line
spacing, insets and radii are directly comparable across samples with different
EMU canvases (方案 v0.2 §1 S4 归一化统一声明).
"""
import posixpath

NS = {
    "a": "http://schemas.openxmlformats.org/drawingml/2006/main",
    "p": "http://schemas.openxmlformats.org/presentationml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "rel": "http://schemas.openxmlformats.org/package/2006/relationships",
    "ct": "http://schemas.openxmlformats.org/package/2006/content-types",
    "p15": "http://schemas.microsoft.com/office/powerpoint/2012/main",
    "asvg": "http://schemas.microsoft.com/office/drawing/2016/SVG/main",
}
R_EMBED = "{%s}embed" % NS["r"]
R_LINK = "{%s}link" % NS["r"]
R_ID = "{%s}id" % NS["r"]

EMU_PER_PT = 12700.0
CANVAS_W_PX = 1920

# clrScheme slot names vs the p:clrMap "map name" keys that point at them.
SCHEME_SLOTS = ("dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3",
                "accent4", "accent5", "accent6", "hlink", "folHlink")
OFFICE_DEFAULT_ACCENTS = {"4472C4", "ED7D31", "A5A5A5", "FFC000", "5B9BD5", "70AD47"}
OFFICE_DEFAULT_FONTS = {"Calibri", "Calibri Light", "Cambria", "Aptos", "Aptos Display"}

# Weight tokens carried in font names. Keys are lowercased and space/hyphen-stripped.
# Includes the 31-char-truncation artefacts seen in real files (SemiBol / DemiBol).
WEIGHT_TOKENS = {
    "thin": 100, "hairline": 100,
    "extralight": 200, "ultralight": 200, "extralight": 200,
    "light": 300,
    "regular": 400, "normal": 400, "book": 400, "roman": 400,
    "medium": 500,
    "semibold": 600, "semibol": 600, "demibold": 600, "demibol": 600, "demi": 600,
    "bold": 700,
    "extrabold": 800, "ultrabold": 800,
    "black": 900, "heavy": 900,
}
ITALIC_TOKENS = {"italic", "oblique", "it"}

# Deterministic latin<->CJK alias hints. Emitted as a separate `alias_group` field,
# never merged into counts, so the audit trail stays intact.
FONT_ALIAS_GROUPS = {
    "fzlantinghei": ("方正兰亭黑", "fzlantingheipro", "fzlthpro", "fzlthpros"),
    "bytesans": ("字节跳动", "bytesans"),
}


def local(tag):
    return tag.rsplit("}", 1)[-1]


def resolve_part(part, target):
    """rels target (possibly '../media/x.png') -> package-absolute part name."""
    if target.startswith("/"):
        return target.lstrip("/")
    return posixpath.normpath(posixpath.join(posixpath.dirname(part), target))


class Units:
    """Single normalisation factor shared by every length quantity."""

    def __init__(self, cx, cy):
        self.cx, self.cy = cx, cy
        self.f = CANVAS_W_PX / float(cx)
        self.w = CANVAS_W_PX
        self.h = round(cy * self.f)
        self.emu_per_px = cx / float(CANVAS_W_PX)

    def px(self, emu, nd=1):
        if emu is None:
            return None
        return round(int(emu) * self.f, nd)

    def pt100(self, v, nd=1):
        """sz / spc / spcPts style values (1/100 pt) -> px."""
        if v is None:
            return None
        return round(float(v) / 100.0 * EMU_PER_PT * self.f, nd)

    def eighth_pt(self, v, nd=1):
        """p15:guide pos (1/8 pt) -> px."""
        if v is None:
            return None
        return round(float(v) / 8.0 * EMU_PER_PT * self.f, nd)


# --------------------------------------------------------------------- colour
def _lin(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _srgb(c):
    c = max(0.0, min(1.0, c))
    v = c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return max(0, min(255, int(round(v * 255))))


def _rgb_to_hsl(r, g, b):
    r, g, b = r / 255.0, g / 255.0, b / 255.0
    mx, mn = max(r, g, b), min(r, g, b)
    l = (mx + mn) / 2
    if mx == mn:
        return 0.0, 0.0, l
    d = mx - mn
    s = d / (2 - mx - mn) if l > 0.5 else d / (mx + mn)
    if mx == r:
        h = ((g - b) / d) % 6
    elif mx == g:
        h = (b - r) / d + 2
    else:
        h = (r - g) / d + 4
    return h / 6, s, l


def _hue(p, q, t):
    t = t % 1.0
    if t < 1 / 6:
        return p + (q - p) * 6 * t
    if t < 1 / 2:
        return q
    if t < 2 / 3:
        return p + (q - p) * (2 / 3 - t) * 6
    return p


def _hsl_to_rgb(h, s, l):
    if s == 0:
        v = int(round(l * 255))
        return v, v, v
    q = l * (1 + s) if l < 0.5 else l + s - l * s
    p = 2 * l - q
    return (int(round(_hue(p, q, h + 1 / 3) * 255)),
            int(round(_hue(p, q, h) * 255)),
            int(round(_hue(p, q, h - 1 / 3) * 255)))


COLOR_TAGS = ("srgbClr", "schemeClr", "sysClr", "prstClr", "scrgbClr", "hslClr")
PRST_CLR = {"black": "000000", "white": "FFFFFF", "red": "FF0000", "green": "008000",
            "blue": "0000FF", "gray": "808080", "grey": "808080", "yellow": "FFFF00"}


def read_color(el):
    """Parse one colour element into a raw, unresolved descriptor."""
    if el is None:
        return None
    tag = local(el.tag)
    if tag not in COLOR_TAGS:
        return None
    raw = {"type": tag}
    if tag == "sysClr":
        raw["val"] = el.get("lastClr")
        raw["sys"] = el.get("val")
    elif tag == "scrgbClr":
        # r/g/b are linear-space percentages in 1/1000 % units.
        raw["val"] = "%02X%02X%02X" % tuple(
            _srgb(int(el.get(k, 0)) / 100000.0) for k in ("r", "g", "b"))
    elif tag == "hslClr":
        r, g, b = _hsl_to_rgb(int(el.get("hue", 0)) / 21600000.0,
                              int(el.get("sat", 0)) / 100000.0,
                              int(el.get("lum", 0)) / 100000.0)
        raw["val"] = "%02X%02X%02X" % (r, g, b)
    elif tag == "prstClr":
        raw["val"] = PRST_CLR.get(el.get("val", ""), None)
        raw["prst"] = el.get("val")
    else:
        raw["val"] = el.get("val")
    mods = []
    for m in el:
        mods.append((local(m.tag), m.get("val")))
    if mods:
        raw["mods"] = mods
    return raw


def raw_token(raw):
    """Stable audit key, e.g. 'schemeClr:bg1(lumMod=60000)'."""
    if not raw:
        return None
    t = "%s:%s" % ("schemeClr" if raw["type"] == "schemeClr" else raw["type"], raw.get("val"))
    if raw.get("mods"):
        t += "(" + ",".join("%s=%s" % (k, v) for k, v in raw["mods"]) + ")"
    return t


def resolve_color(raw, clrmap=None, clrscheme=None, phclr=None):
    """raw descriptor + master clrMap + theme clrScheme -> {hex, alpha, resolved}.

    This is the schemeClr -> clrMap -> clrScheme indirection the PRD's
    "do not resolve inheritance" rule does NOT cover (方案 v0.2 §3 难点 3).
    """
    if not raw:
        return None
    hexv, unresolved = None, None
    if raw["type"] == "schemeClr":
        name = raw.get("val")
        if name == "phClr":
            hexv = phclr
            if hexv is None:
                unresolved = "phClr"
        else:
            slot = (clrmap or {}).get(name, name)
            ent = (clrscheme or {}).get(slot)
            if ent is None:
                unresolved = "no-scheme:%s" % name
            else:
                hexv = ent
    else:
        hexv = raw.get("val")
        if hexv is None:
            unresolved = "unknown:%s" % raw["type"]
    out = {"raw": raw_token(raw), "alpha": 100.0}
    if unresolved or not hexv:
        out["unresolved"] = unresolved or "empty"
        return out
    hexv = hexv.lstrip("#").upper()
    try:
        r, g, b = int(hexv[0:2], 16), int(hexv[2:4], 16), int(hexv[4:6], 16)
    except (ValueError, IndexError):
        out["unresolved"] = "bad-hex:%s" % hexv
        return out
    alpha = 100.0
    for name, val in raw.get("mods", []):
        if val is None:
            continue
        v = int(val)
        if name == "alpha":
            alpha = v / 1000.0
        elif name == "lumMod":
            h, s, l = _rgb_to_hsl(r, g, b)
            r, g, b = _hsl_to_rgb(h, s, l * v / 100000.0)
        elif name == "lumOff":
            h, s, l = _rgb_to_hsl(r, g, b)
            r, g, b = _hsl_to_rgb(h, s, min(1.0, l + v / 100000.0))
        elif name == "satMod":
            h, s, l = _rgb_to_hsl(r, g, b)
            r, g, b = _hsl_to_rgb(h, min(1.0, s * v / 100000.0), l)
        elif name == "satOff":
            h, s, l = _rgb_to_hsl(r, g, b)
            r, g, b = _hsl_to_rgb(h, min(1.0, max(0.0, s + v / 100000.0)), l)
        elif name == "shade":
            f = v / 100000.0
            r, g, b = (_srgb(_lin(r) * f), _srgb(_lin(g) * f), _srgb(_lin(b) * f))
        elif name == "tint":
            f = v / 100000.0
            r, g, b = (_srgb(_lin(r) * f + (1 - f)), _srgb(_lin(g) * f + (1 - f)),
                       _srgb(_lin(b) * f + (1 - f)))
    out["hex"] = "#%02X%02X%02X" % (r, g, b)
    out["alpha"] = round(alpha, 1)
    out["resolved"] = out["hex"] if alpha >= 100 else "rgba(%d,%d,%d,%.3g)" % (r, g, b, alpha / 100.0)
    return out


def luminance(hexv):
    hexv = hexv.lstrip("#")
    r, g, b = int(hexv[0:2], 16), int(hexv[2:4], 16), int(hexv[4:6], 16)
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


# ------------------------------------------------------------------ fill/line
def describe_fill(container, ctx):
    """solidFill / gradFill / blipFill / pattFill / noFill descriptor."""
    if container is None:
        return None
    sf = container.find("a:solidFill", NS)
    if sf is not None:
        for ch in sf:
            c = resolve_color(read_color(ch), ctx.clrmap, ctx.clrscheme)
            if c:
                return {"type": "solid", "color": c}
        return {"type": "solid"}
    gf = container.find("a:gradFill", NS)
    if gf is not None:
        stops = []
        for gs in gf.findall("a:gsLst/a:gs", NS):
            c = None
            for ch in gs:
                c = resolve_color(read_color(ch), ctx.clrmap, ctx.clrscheme)
                if c:
                    break
            stops.append({"pos": round(int(gs.get("pos", 0)) / 1000.0, 2), "color": c})
        d = {"type": "gradient", "stops": stops}
        lin = gf.find("a:lin", NS)
        if lin is not None:
            d["angle_deg"] = round(int(lin.get("ang", 0)) / 60000.0, 2)
            d["scaled"] = lin.get("scaled") == "1"
        path = gf.find("a:path", NS)
        if path is not None:
            d["path"] = path.get("path")
        return d
    bf = container.find("a:blipFill", NS)
    if bf is not None:
        blip = bf.find("a:blip", NS)
        rid = blip.get(R_EMBED) if blip is not None else None
        d = {"type": "image", "media": ctx.media_of(rid)}
        sr = bf.find("a:srcRect", NS)
        if sr is not None and sr.attrib:
            d["crop"] = {k: round(int(v) / 1000.0, 2) for k, v in sr.attrib.items()}
        if bf.find("a:tile", NS) is not None:
            d["tile"] = True
        return d
    pf = container.find("a:pattFill", NS)
    if pf is not None:
        return {"type": "pattern", "preset": pf.get("prst")}
    if container.find("a:noFill", NS) is not None:
        return {"type": "none"}
    return None


def describe_line(spPr, ctx):
    ln = spPr.find("a:ln", NS) if spPr is not None else None
    if ln is None:
        return None
    d = {}
    if ln.get("w"):
        d["w_px"] = ctx.units.px(ln.get("w"), 2)
    if ln.find("a:noFill", NS) is not None:
        d["none"] = True
    f = describe_fill(ln, ctx)
    if f and f.get("type") == "solid":
        d["color"] = f.get("color")
    elif f and f.get("type") == "gradient":
        d["gradient"] = f
    dash = ln.find("a:prstDash", NS)
    if dash is not None:
        d["dash"] = dash.get("val")
    for tag in ("headEnd", "tailEnd"):
        e = ln.find("a:%s" % tag, NS)
        if e is not None and e.get("type") not in (None, "none"):
            d[tag] = e.get("type")
    return d or None


EFFECT_LEN_ATTRS = ("blurRad", "dist", "sx", "sy", "rad")


def describe_effects(spPr, ctx):
    if spPr is None:
        return None
    lst = spPr.find("a:effectLst", NS)
    out = []
    if lst is not None:
        for e in lst:
            d = {"type": local(e.tag)}
            for k, v in e.attrib.items():
                if k in ("blurRad", "dist", "rad"):
                    d[k + "_px"] = ctx.units.px(v, 2)
                elif k == "dir":
                    d["dir_deg"] = round(int(v) / 60000.0, 1)
                else:
                    d[k] = v
            for ch in e:
                c = resolve_color(read_color(ch), ctx.clrmap, ctx.clrscheme)
                if c:
                    d["color"] = c
                    break
            out.append(d)
    if spPr.find("a:effectDag", NS) is not None:
        out.append({"type": "effectDag"})
    scene = spPr.find("a:scene3d", NS)
    if scene is not None:
        out.append({"type": "scene3d"})
    return out or None


def describe_geom(spPr, ctx, w_px=None, h_px=None):
    if spPr is None:
        return None, None
    pg = spPr.find("a:prstGeom", NS)
    if pg is None:
        if spPr.find("a:custGeom", NS) is not None:
            return {"prst": "custGeom"}, None
        return None, None
    d = {"prst": pg.get("prst")}
    adj = {}
    for gd in pg.findall("a:avLst/a:gd", NS):
        adj[gd.get("name")] = gd.get("fmla")
    if adj:
        d["adj"] = adj
    radius = None
    if d["prst"] in ("roundRect", "round1Rect", "round2SameRect", "round2DiagRect",
                     "snipRoundRect") and w_px and h_px:
        fmla = adj.get("adj") or adj.get("adj1") or "val 16667"
        try:
            val = float(str(fmla).split()[-1])
        except (ValueError, IndexError):
            val = 16667.0
        radius = round(val / 100000.0 * min(w_px, h_px), 1)
    return d, radius


# ------------------------------------------------------------------ text runs
def _lnspc(pPr, ctx):
    if pPr is None:
        return None
    pct = pPr.find("a:lnSpc/a:spcPct", NS)
    if pct is not None:
        return {"mult": round(int(pct.get("val")) / 100000.0, 3)}
    pts = pPr.find("a:lnSpc/a:spcPts", NS)
    if pts is not None:
        return {"px": ctx.units.pt100(pts.get("val"))}
    return None


def _spc_before_after(pPr, ctx, tag):
    if pPr is None:
        return None
    pct = pPr.find("a:%s/a:spcPct" % tag, NS)
    if pct is not None:
        return {"pct": round(int(pct.get("val")) / 1000.0, 2)}
    pts = pPr.find("a:%s/a:spcPts" % tag, NS)
    if pts is not None:
        return {"px": ctx.units.pt100(pts.get("val"))}
    return None


def font_weight(raw_name):
    """Weight carried by the font *name*. `b="1"` is tracked separately (see
    read_rpr's `bold`) because the name is the only source that distinguishes
    Medium/SemiBold/DemiBold — collapsing both into one field loses the axis."""
    return family_of(raw_name)[1] if raw_name else None


def family_of(raw):
    """raw typeface -> (family, weight, italic). Weight is kept; only the
    *family key* is stripped, so counting merges while 字重 stays readable."""
    if not raw:
        return None, None, False
    name = raw.strip()
    weight, italic = None, False
    parts = name.replace("_", " _").split(" ")
    while len(parts) > 1:
        tail = parts[-1].strip().lower().replace("-", "")
        if tail in ITALIC_TOKENS:
            italic = True
            parts.pop()
            continue
        if tail in WEIGHT_TOKENS:
            weight = WEIGHT_TOKENS[tail]
            parts.pop()
            continue
        break
    family = " ".join(parts).replace(" _", "_").strip(" -")
    return (family or name), weight, italic


def alias_group(family):
    key = "".join(ch for ch in family.lower() if ch.isalnum())
    for grp, needles in FONT_ALIAS_GROUPS.items():
        for n in needles:
            nk = "".join(ch for ch in n.lower() if ch.isalnum())
            if nk and nk in key:
                return grp
    return None


def read_rpr(rPr, ctx):
    d = {}
    if rPr is None:
        return d
    if rPr.get("sz"):
        d["sz_px"] = ctx.units.pt100(rPr.get("sz"))
    if rPr.get("b") == "1":
        d["bold"] = True
    if rPr.get("i") == "1":
        d["italic"] = True
    if rPr.get("u") and rPr.get("u") != "none":
        d["underline"] = rPr.get("u")
    if rPr.get("strike") and rPr.get("strike") != "noStrike":
        d["strike"] = rPr.get("strike")
    if rPr.get("spc"):
        d["spc_px"] = ctx.units.pt100(rPr.get("spc"), 2)
    if rPr.get("cap") and rPr.get("cap") != "none":
        d["cap"] = rPr.get("cap")
    if rPr.get("baseline") and rPr.get("baseline") != "0":
        d["baseline"] = int(rPr.get("baseline")) / 1000.0
    for tag in ("latin", "ea", "cs"):
        e = rPr.find("a:%s" % tag, NS)
        if e is not None and e.get("typeface"):
            d[tag] = e.get("typeface")
    f = describe_fill(rPr, ctx)
    if f:
        if f.get("type") == "solid":
            d["color"] = f.get("color")
        else:
            d["fill"] = f
    ln = rPr.find("a:ln", NS)
    if ln is not None:
        d["outline"] = True
    w = font_weight(d.get("latin") or d.get("ea"))
    if w:
        d["weight"] = w
    return d


def read_txbody(tx, ctx, kind="txBody"):
    """Paragraphs with per-run facts + the part-local lstStyle type scale."""
    if tx is None:
        return None
    out = {}
    bp = tx.find("a:bodyPr", NS)
    if bp is not None:
        b = {}
        for k in ("anchor", "anchorCtr", "vert", "wrap", "rot"):
            if bp.get(k):
                b[k] = bp.get(k)
        ins = {}
        for k in ("lIns", "tIns", "rIns", "bIns"):
            if bp.get(k) is not None:
                ins[k] = ctx.units.px(bp.get(k))
        if ins:
            b["insets_px"] = ins
        na = bp.find("a:normAutofit", NS)
        if na is not None:
            b["autofit"] = "norm"
            # normAutofit 用 fontScale / lnSpcReduction（单位 1/1000 %）把大字缩进小框——
            # 章节大号数字就靠它让 160px 的字装进 144px 的框。只记 autofit 存在、丢掉
            # fontScale，消费端就拿到未缩放字号 + 原始框高，字比框高，渐变裁切把溢出的
            # 底部切成透明。缺省即 100%（无缩放）。
            fs = na.get("fontScale")
            if fs is not None:
                try:
                    b["font_scale"] = round(int(fs) / 100000.0, 4)
                except (TypeError, ValueError):
                    pass
            lsr = na.get("lnSpcReduction")
            if lsr is not None:
                try:
                    b["ln_spc_reduction"] = round(int(lsr) / 100000.0, 4)
                except (TypeError, ValueError):
                    pass
        elif bp.find("a:spAutoFit", NS) is not None:
            b["autofit"] = "shape"
        if b:
            out["bodyPr"] = b
    ls = tx.find("a:lstStyle", NS)
    if ls is not None and len(ls):
        lvls = {}
        for lvl in ls:
            p = read_lvl(lvl, ctx)
            if p:
                lvls[local(lvl.tag)] = p
        if lvls:
            out["lstStyle"] = lvls
    paras = []
    for p in tx.findall("a:p", NS):
        pPr = p.find("a:pPr", NS)
        info = {}
        if pPr is not None:
            for k in ("algn", "lvl", "rtl"):
                if pPr.get(k):
                    info[k] = pPr.get(k)
            for k in ("marL", "marR", "indent"):
                if pPr.get(k) is not None:
                    info[k + "_px"] = ctx.units.px(pPr.get(k))
            v = _lnspc(pPr, ctx)
            if v:
                info["lnSpc"] = v
            for tag in ("spcBef", "spcAft"):
                v = _spc_before_after(pPr, ctx, tag)
                if v:
                    info[tag] = v
            if pPr.find("a:buNone", NS) is not None:
                info["bullet"] = "none"
            bc = pPr.find("a:buChar", NS)
            if bc is not None:
                info["bullet"] = bc.get("char")
            ba = pPr.find("a:buAutoNum", NS)
            if ba is not None:
                info["bullet"] = "auto:%s" % ba.get("type", "")
            # Paragraph-level run defaults. Mac Office / Keynote exports put the
            # size here rather than on a:rPr, so skipping it loses the majority
            # of the declared type scale on those decks.
            dr = pPr.find("a:defRPr", NS)
            if dr is not None:
                facts = read_rpr(dr, ctx)
                if facts:
                    info["defRPr"] = facts
        runs = []
        for r in list(p.findall("a:r", NS)) + list(p.findall("a:fld", NS)):
            t = r.find("a:t", NS)
            rec = read_rpr(r.find("a:rPr", NS), ctx)
            rec["text"] = (t.text or "") if t is not None else ""
            if local(r.tag) == "fld":
                rec["field"] = r.get("type")
            runs.append(rec)
        if not runs:
            ep = p.find("a:endParaRPr", NS)
            if ep is not None:
                rec = read_rpr(ep, ctx)
                if rec:
                    rec["text"] = ""
                    rec["empty_para"] = True
                    runs.append(rec)
        info["runs"] = runs
        paras.append(info)
    out["paragraphs"] = paras
    return out


def read_lvl(lvl, ctx):
    """lvlNpPr / titleStyle level -> declared paragraph+run defaults (direct read,
    no inheritance resolution)."""
    d = {}
    for k in ("algn",):
        if lvl.get(k):
            d[k] = lvl.get(k)
    for k in ("marL", "indent", "defTabSz"):
        if lvl.get(k) is not None:
            d[k + "_px"] = ctx.units.px(lvl.get(k))
    v = _lnspc(lvl, ctx)
    if v:
        d["lnSpc"] = v
    for tag in ("spcBef", "spcAft"):
        v = _spc_before_after(lvl, ctx, tag)
        if v:
            d[tag] = v
    dr = lvl.find("a:defRPr", NS)
    if dr is not None:
        d.update(read_rpr(dr, ctx))
    bc = lvl.find("a:buChar", NS)
    if bc is not None:
        d["bullet"] = bc.get("char")
    if lvl.find("a:buNone", NS) is not None:
        d["bullet"] = "none"
    return d


# --------------------------------------------------------------------- shapes
def group_transform(grpSp):
    """(sx, sy, dx, dy) in EMU mapping a group's child coords into parent coords."""
    x = grpSp.find("p:grpSpPr/a:xfrm", NS)
    if x is None:
        return 1.0, 1.0, 0.0, 0.0
    off, ext = x.find("a:off", NS), x.find("a:ext", NS)
    cOff, cExt = x.find("a:chOff", NS), x.find("a:chExt", NS)
    if off is None or ext is None or cOff is None or cExt is None:
        return 1.0, 1.0, 0.0, 0.0
    ox, oy = int(off.get("x")), int(off.get("y"))
    cx, cy = int(ext.get("cx")), int(ext.get("cy"))
    kx, ky = int(cOff.get("x")), int(cOff.get("y"))
    ex, ey = int(cExt.get("cx")), int(cExt.get("cy"))
    sx = cx / float(ex) if ex else 1.0
    sy = cy / float(ey) if ey else 1.0
    return sx, sy, ox - kx * sx, oy - ky * sy


XFRM_PATHS = {
    "sp": "p:spPr/a:xfrm", "pic": "p:spPr/a:xfrm", "cxnSp": "p:spPr/a:xfrm",
    "grpSp": "p:grpSpPr/a:xfrm", "graphicFrame": "p:xfrm",
}


def read_xfrm(el, tag):
    x = el.find(XFRM_PATHS.get(tag, "p:spPr/a:xfrm"), NS)
    if x is None:
        return None
    off, ext = x.find("a:off", NS), x.find("a:ext", NS)
    if off is None or ext is None:
        return None
    return {
        "x": int(off.get("x")), "y": int(off.get("y")),
        "cx": int(ext.get("cx")), "cy": int(ext.get("cy")),
        "rot": int(x.get("rot", 0)) / 60000.0,
        "flipH": x.get("flipH") == "1", "flipV": x.get("flipV") == "1",
    }


def rotated_bbox(x, y, w, h, rot_deg):
    """Axis-aligned bounding box of a box rotated about its centre."""
    import math
    if not rot_deg:
        return x, y, w, h
    a = math.radians(rot_deg)
    c, s = abs(math.cos(a)), abs(math.sin(a))
    nw, nh = w * c + h * s, w * s + h * c
    return x + (w - nw) / 2.0, y + (h - nh) / 2.0, nw, nh


BLEED_TOL = 0.05


def classify_box(x, y, w, h, W, H):
    """完全出界 -> drop / 出血 <=5% -> bleed / >5% -> clamp + gap (方案 v0.2 §3 难点 9).

    Emptiness is an actual rectangle intersection, not a `w <= 0` test: rules and
    connectors are legitimately zero-extent on one axis (a horizontal divider has
    h = 0) and must stay in as design evidence.
    """
    if w < 0 or h < 0:
        return "outside", None, None
    if max(x, 0.0) > min(x + w, float(W)) or max(y, 0.0) > min(y + h, float(H)):
        return "outside", None, None
    over = {
        "left": max(0.0, -x) / W, "right": max(0.0, x + w - W) / W,
        "top": max(0.0, -y) / H, "bottom": max(0.0, y + h - H) / H,
    }
    worst = max(over.values())
    if worst <= 0:
        return "inside", None, None
    detail = {k: round(v * 100, 2) for k, v in over.items() if v > 0}
    if worst <= BLEED_TOL:
        return "bleed", detail, None
    cx0, cy0 = max(0.0, x), max(0.0, y)
    cx1, cy1 = min(float(W), x + w), min(float(H), y + h)
    return "clamped", detail, (round(cx0, 1), round(cy0, 1),
                               round(cx1 - cx0, 1), round(cy1 - cy0, 1))
