#!/usr/bin/env python3
"""S1 unpack / S2 reference graph + master triage / S3 theme+clrMap / S4 shape facts."""
import os
import re
import zipfile
from collections import Counter
from xml.etree import ElementTree as ET

from ooxml import (
    classify_box,
    describe_effects,
    describe_fill,
    describe_geom,
    describe_line,
    group_transform,
    local,
    NS,
    OFFICE_DEFAULT_ACCENTS,
    OFFICE_DEFAULT_FONTS,
    R_EMBED,
    R_ID,
    R_LINK,
    read_color,
    read_lvl,
    read_txbody,
    read_xfrm,
    resolve_color,
    resolve_part,
    rotated_bbox,
)

SLIDE_RE = re.compile(r"ppt/slides/slide\d+\.xml$")
LAYOUT_RE = re.compile(r"ppt/slideLayouts/slideLayout\d+\.xml$")
MASTER_RE = re.compile(r"ppt/slideMasters/slideMaster\d+\.xml$")
THEME_RE = re.compile(r"ppt/theme/theme\d+\.xml$")


def _num(part):
    m = re.search(r"(\d+)\.xml$", part)
    return int(m.group(1)) if m else 0


class Package:
    """S1: the opened container + part inventory + content-type discrimination."""

    def __init__(self, path):
        self.path = path
        self.zip = zipfile.ZipFile(path)
        self.names = set(self.zip.namelist())
        self._cache = {}
        ct = self.zip.read("[Content_Types].xml").decode("utf-8", "replace")
        m = re.search(r"presentationml\.(presentation|template|slideshow)\.main", ct)
        self.kind = m.group(1) if m else "unknown"
        self.slides = sorted((n for n in self.names if SLIDE_RE.match(n)), key=_num)
        self.layouts = sorted((n for n in self.names if LAYOUT_RE.match(n)), key=_num)
        self.masters = sorted((n for n in self.names if MASTER_RE.match(n)), key=_num)
        self.themes, self.theme_discovery = self._find_themes(ct)
        # zip directory entries ('ppt/media/') must not be counted as assets —
        # they inflate media totals by one.
        self.media = sorted(n for n in self.names
                            if n.startswith("ppt/media/") and not n.endswith("/"))

    def _find_themes(self, ct):
        """Theme parts come from [Content_Types].xml, not from a path pattern.

        Compressors relocate them — some rewrite them under
        ppt/slideMasters/theme/ — and a `ppt/theme/` regex then finds
        nothing to bind the masters to, so every schemeClr resolves to
        UNRESOLVED:no-scheme. The path regex stays as the fallback for packages
        whose content types are unreadable.
        """
        try:
            root = ET.fromstring(ct.encode("utf-8"))
            found = [o.get("PartName", "").lstrip("/") for o in root.findall("ct:Override", NS)
                     if (o.get("ContentType") or "").endswith("theme+xml")]
            found = sorted((n for n in found if n in self.names), key=_num)
        except ET.ParseError:
            found = []
        if found:
            return found, "content-types"
        return sorted((n for n in self.names if THEME_RE.match(n)), key=_num), "path-regex"

    def xml(self, part):
        if part not in self._cache:
            self._cache[part] = ET.fromstring(self.zip.read(part))
        return self._cache[part]

    def rels(self, part):
        d, f = os.path.split(part)
        rp = "%s/_rels/%s.rels" % (d, f)
        out = {}
        if rp in self.names:
            for r in self.xml(rp).findall("rel:Relationship", NS):
                out[r.get("Id")] = {"type": r.get("Type").rsplit("/", 1)[-1],
                                    "target": r.get("Target"),
                                    "external": r.get("TargetMode") == "External"}
        return out

    def size_of(self, part):
        return self.zip.getinfo(part).file_size if part in self.names else 0


class PartCtx:
    """Per-part resolution context: units + the master's clrMap + its theme's clrScheme."""

    def __init__(self, pkg, part, layer, units, clrmap, clrscheme, master=None, theme=None):
        self.pkg, self.part, self.layer = pkg, part, layer
        self.units, self.clrmap, self.clrscheme = units, clrmap, clrscheme
        self.master, self.theme = master, theme
        self._rels = pkg.rels(part)

    def media_of(self, rid):
        if not rid:
            return None
        rel = self._rels.get(rid)
        if not rel or rel["external"]:
            return None
        return resolve_part(self.part, rel["target"])

    def rel_target(self, rid):
        rel = self._rels.get(rid)
        return resolve_part(self.part, rel["target"]) if rel and not rel["external"] else None


# ------------------------------------------------------------------ S3 theme
def read_theme(pkg, part):
    root = pkg.xml(part)
    cs = root.find(".//a:clrScheme", NS)
    scheme, scheme_raw = {}, {}
    if cs is not None:
        for slot in cs:
            tag = local(slot.tag)
            for ch in slot:
                raw = read_color(ch)
                if raw:
                    scheme_raw[tag] = raw
                    r = resolve_color(raw)
                    scheme[tag] = (r or {}).get("hex")
                    break
    fonts = {}
    fs = root.find(".//a:fontScheme", NS)
    if fs is not None:
        for kind in ("majorFont", "minorFont"):
            k = fs.find("a:%s" % kind, NS)
            if k is None:
                continue
            d = {}
            for sc in k:
                tag = local(sc.tag)
                if tag in ("latin", "ea", "cs") and sc.get("typeface") is not None:
                    d[tag] = sc.get("typeface")
            fonts[kind] = d
    accents = [scheme.get("accent%d" % i, "") or "" for i in range(1, 7)]
    factory_colors = bool(accents) and all(
        a.lstrip("#").upper() in OFFICE_DEFAULT_ACCENTS for a in accents if a)
    latins = {fonts.get(k, {}).get("latin") for k in ("majorFont", "minorFont")}
    factory_fonts = bool(latins - {None}) and all(
        f in OFFICE_DEFAULT_FONTS for f in latins if f)
    bg_styles = len(root.findall(".//a:bgFillStyleLst/*", NS))
    return {
        "part": part,
        "name": root.get("name"),
        "scheme_name": cs.get("name") if cs is not None else None,
        "clrScheme": scheme,
        "clrScheme_raw": {k: v.get("type") + ":" + str(v.get("val")) for k, v in scheme_raw.items()},
        "fontScheme": fonts,
        "factory_colors": factory_colors,
        "factory_fonts": factory_fonts,
        "bg_fill_styles": bg_styles,
    }


def read_clrmap(pkg, master_part):
    cm = pkg.xml(master_part).find("p:clrMap", NS)
    return dict(cm.attrib) if cm is not None else {}


# ------------------------------------------------------------------- S2 graph
def build_graph(pkg):
    """slide -> layout -> master -> theme, plus master -> layouts ownership."""
    pres = pkg.xml("ppt/presentation.xml")
    prels = pkg.rels("ppt/presentation.xml")
    master_order = []
    for m in pres.findall("p:sldMasterIdLst/p:sldMasterId", NS):
        t = prels.get(m.get(R_ID))
        if t:
            master_order.append(resolve_part("ppt/presentation.xml", t["target"]))
    for m in pkg.masters:
        if m not in master_order:
            master_order.append(m)

    theme_of_master, layouts_of_master = {}, {}
    for mp in master_order:
        mrels = pkg.rels(mp)
        for rel in mrels.values():
            if rel["type"] == "theme":
                theme_of_master[mp] = resolve_part(mp, rel["target"])
        lids = []
        for l in pkg.xml(mp).findall("p:sldLayoutIdLst/p:sldLayoutId", NS):
            rel = mrels.get(l.get(R_ID))
            if rel:
                lids.append(resolve_part(mp, rel["target"]))
        layouts_of_master[mp] = lids

    master_of_layout = {}
    for mp, lids in layouts_of_master.items():
        for lp in lids:
            master_of_layout.setdefault(lp, mp)
    for lp in pkg.layouts:
        if lp in master_of_layout:
            continue
        for rel in pkg.rels(lp).values():
            if rel["type"] == "slideMaster":
                master_of_layout[lp] = resolve_part(lp, rel["target"])

    layout_of_slide = {}
    for sp in pkg.slides:
        for rel in pkg.rels(sp).values():
            if rel["type"] == "slideLayout":
                layout_of_slide[sp] = resolve_part(sp, rel["target"])

    slides_per_layout = Counter(layout_of_slide.values())
    slides_per_master = Counter(
        master_of_layout.get(layout_of_slide[sp]) for sp in pkg.slides if sp in layout_of_slide)
    used_themes = {theme_of_master[m] for m in master_order if m in theme_of_master}
    return {
        "master_order": master_order,
        "theme_of_master": theme_of_master,
        "layouts_of_master": layouts_of_master,
        "master_of_layout": master_of_layout,
        "layout_of_slide": layout_of_slide,
        "slides_per_layout": dict(slides_per_layout),
        "slides_per_master": dict(slides_per_master),
        "used_themes": sorted(used_themes),
        "orphan_themes": sorted(set(pkg.themes) - used_themes),
    }


def triage_masters(pkg, graph, twin_pairs):
    """S2 母版三分规则: ① 主母版仅用于冲突裁决 ② 模板态保全链 ③ 引用 0 且不孪生 -> dropped."""
    order = graph["master_order"]
    used = graph["slides_per_master"]
    layout_used = graph["slides_per_layout"]
    n_layouts = len(pkg.layouts)
    unused_layouts = sum(1 for lp in pkg.layouts if layout_used.get(lp, 0) == 0)
    unused_ratio = (unused_layouts / n_layouts) if n_layouts else 0.0
    template_mode = pkg.kind == "template" or unused_ratio >= 0.8

    twinned = set()
    for a, b in twin_pairs:
        twinned.add(graph["master_of_layout"].get(a))
        twinned.add(graph["master_of_layout"].get(b))

    primary = max(order, key=lambda m: (used.get(m, 0), -order.index(m))) if order else None
    entries = []
    for mp in order:
        refs = used.get(mp, 0)
        reasons = []
        if refs:
            reasons.append("referenced-by-%d-slides" % refs)
        if template_mode:
            reasons.append("template-mode")
        if mp in twinned:
            reasons.append("twinned-with-main-chain")
        picked = bool(reasons)
        entries.append({
            "part": mp, "theme": graph["theme_of_master"].get(mp),
            "layouts": len(graph["layouts_of_master"].get(mp, [])),
            "slide_refs": refs, "picked": picked,
            "reasons": reasons or ["zero-refs-and-not-twinned"],
            "is_primary": mp == primary,
        })
    return {
        "primary": primary,
        "primary_role": "conflict-arbitration-only",
        "template_mode": template_mode,
        "template_mode_evidence": {"content_type": pkg.kind,
                                   "layouts_unused": unused_layouts,
                                   "layouts_total": n_layouts,
                                   "unused_ratio": round(unused_ratio, 3)},
        "masters": entries,
        "dropped": [e["part"] for e in entries if not e["picked"]],
    }


# ------------------------------------------------------------- S4 shape facts
def _bg_descriptor(root, ctx):
    bg = root.find("p:cSld/p:bg", NS)
    if bg is None:
        return None
    pr = bg.find("p:bgPr", NS)
    if pr is not None:
        d = describe_fill(pr, ctx) or {}
        return {"source": "bgPr", **d}
    ref = bg.find("p:bgRef", NS)
    if ref is not None:
        col = None
        for ch in ref:
            col = resolve_color(read_color(ch), ctx.clrmap, ctx.clrscheme)
            if col:
                break
        # bgFillStyleLst[idx-1000] is not expanded; the phClr carries the actual hue.
        return {"source": "bgRef", "idx": ref.get("idx"), "color": col,
                "note": "theme bgFillStyleLst pattern not expanded"}
    return None


def _ph(nv):
    ph = nv.find("p:nvPr/p:ph", NS) if nv is not None else None
    if ph is None:
        return None
    return {"type": ph.get("type", "body"), "idx": ph.get("idx")}


NV_TAGS = {"sp": "p:nvSpPr", "pic": "p:nvPicPr", "grpSp": "p:nvGrpSpPr",
           "cxnSp": "p:nvCxnSpPr", "graphicFrame": "p:nvGraphicFramePr"}


def blip_opacity(blip):
    """Combine the alpha modulation transforms attached to one local picture."""
    opacity = 1.0
    found = False
    for effect in blip:
        if local(effect.tag) not in ("alphaMod", "alphaModFix"):
            continue
        try:
            amount = int(effect.get("amt"))
        except (TypeError, ValueError):
            continue
        opacity *= max(0.0, min(amount / 100000.0, 1.0))
        found = True
    return round(opacity, 6) if found else None


def walk_tree(el, ctx, out, path=(), xf=(1.0, 1.0, 0.0, 0.0), depth=0):
    sx, sy, dx, dy = xf
    U, W, H = ctx.units, ctx.units.w, ctx.units.h
    for sp in el:
        tag = local(sp.tag)
        if tag not in NV_TAGS:
            continue
        nv = sp.find(NV_TAGS[tag], NS)
        cNv = nv.find("p:cNvPr", NS) if nv is not None else None
        name = cNv.get("name") if cNv is not None else None
        rec = {"part": ctx.part, "layer": ctx.layer, "kind": tag,
               "id": cNv.get("id") if cNv is not None else None, "name": name,
               "depth": depth}
        if path:
            rec["group_path"] = list(path)
        ph = _ph(nv)
        if ph:
            rec["ph"] = ph
        if cNv is not None and cNv.get("hidden") == "1":
            rec["hidden"] = True

        raw = read_xfrm(sp, tag)
        if raw:
            ax = raw["x"] * sx + dx
            ay = raw["y"] * sy + dy
            aw, ah = raw["cx"] * sx, raw["cy"] * sy
            rec["box_emu"] = {"x": round(ax), "y": round(ay), "cx": round(aw), "cy": round(ah)}
            bx, by, bw, bh = U.px(ax), U.px(ay), U.px(aw), U.px(ah)
            rec["box_unrotated"] = {"x": bx, "y": by, "w": bw, "h": bh}
            if raw["rot"]:
                rec["rot"] = round(raw["rot"], 2)
                rx, ry, rw, rh = rotated_bbox(bx, by, bw, bh, raw["rot"])
                box = {"x": round(rx, 1), "y": round(ry, 1), "w": round(rw, 1), "h": round(rh, 1)}
            else:
                box = dict(rec["box_unrotated"])
            if raw["flipH"]:
                rec["flipH"] = True
            if raw["flipV"]:
                rec["flipV"] = True
            verdict, over, clamp = classify_box(box["x"], box["y"], box["w"], box["h"], W, H)
            rec["placement"] = verdict
            if over:
                rec["overflow_pct"] = over
            if verdict == "bleed":
                rec["bleed"] = True
            elif verdict == "clamped":
                rec["box_before_clamp"] = dict(box)
                box = {"x": clamp[0], "y": clamp[1], "w": clamp[2], "h": clamp[3]}
                rec["clamped"] = True
            rec["box"] = box
            rec["w_pct"] = round(box["w"] / W * 100, 2)
            rec["h_pct"] = round(box["h"] / H * 100, 2)
            if box["w"] == 0 or box["h"] == 0:
                rec["degenerate_axis"] = "w" if box["w"] == 0 else "h"
        else:
            rec["placement"] = "inherited"

        spPr = sp.find("p:spPr", NS)
        bw = rec.get("box", {}).get("w")
        bh = rec.get("box", {}).get("h")
        geom, radius = describe_geom(spPr, ctx, bw, bh)
        if geom:
            rec["geom"] = geom
        if radius is not None:
            rec["radius_px"] = radius
        f = describe_fill(spPr, ctx)
        if f:
            rec["fill"] = f
        ln = describe_line(spPr, ctx)
        if ln:
            rec["line"] = ln
        ef = describe_effects(spPr, ctx)
        if ef:
            rec["effects"] = ef
        style = sp.find("p:style", NS)
        if style is not None:
            st = {}
            for refname in ("fillRef", "lnRef", "effectRef", "fontRef"):
                e = style.find("a:%s" % refname, NS)
                if e is None:
                    continue
                col = None
                for ch in e:
                    col = resolve_color(read_color(ch), ctx.clrmap, ctx.clrscheme)
                    if col:
                        break
                st[refname] = {"idx": e.get("idx"), "color": col}
            if st:
                rec["styleRef"] = st

        if tag == "pic":
            blip = sp.find("p:blipFill/a:blip", NS)
            if blip is not None:
                rec["media"] = ctx.media_of(blip.get(R_EMBED)) or ctx.media_of(blip.get(R_LINK))
                opacity = blip_opacity(blip)
                if opacity is not None:
                    rec["opacity"] = opacity
                svg = blip.find("a:extLst//asvg:svgBlip", NS)
                if svg is not None:
                    rec["media_svg"] = ctx.media_of(svg.get(R_EMBED))
            sr = sp.find("p:blipFill/a:srcRect", NS)
            if sr is not None and sr.attrib:
                rec["crop"] = {k: round(int(v) / 1000.0, 2) for k, v in sr.attrib.items()}
            stretch = sp.find("p:blipFill/a:stretch", NS)
            if stretch is None and sp.find("p:blipFill/a:tile", NS) is not None:
                rec["tile"] = True
        elif tag == "graphicFrame":
            gd = sp.find("a:graphic/a:graphicData", NS)
            uri = gd.get("uri") if gd is not None else None
            rec["graphic_uri"] = uri
            if gd is not None:
                if gd.find(".//a:tbl", NS) is not None:
                    rec["kind"] = "table"
                    tbl = gd.find(".//a:tbl", NS)
                    rec["table"] = {"rows": len(tbl.findall("a:tr", NS)),
                                    "cols": len(tbl.findall("a:tblGrid/a:gridCol", NS))}
                elif uri and "chart" in uri:
                    rec["kind"] = "chart"
                elif uri and "diagram" in uri:
                    rec["kind"] = "diagram"

        tx = sp.find("p:txBody", NS)
        if tx is None:
            tx = sp.find("a:txBody", NS)
        if tx is not None:
            body = read_txbody(tx, ctx)
            if body:
                rec["text"] = body
        out.append(rec)

        if tag == "grpSp":
            gsx, gsy, gdx, gdy = group_transform(sp)
            walk_tree(sp, ctx, out, path + (name,),
                      (sx * gsx, sy * gsy, dx + gdx * sx, dy + gdy * sy), depth + 1)


def read_part_shapes(pkg, part, layer, units, clrmap, clrscheme, master=None, theme=None):
    ctx = PartCtx(pkg, part, layer, units, clrmap, clrscheme, master, theme)
    root = pkg.xml(part)
    shapes = []
    tree = root.find("p:cSld/p:spTree", NS)
    if tree is not None:
        walk_tree(tree, ctx, shapes)
    return ctx, shapes, _bg_descriptor(root, ctx)


def read_txstyles(pkg, master_part, ctx):
    ts = pkg.xml(master_part).find("p:txStyles", NS)
    if ts is None:
        return None
    out = {}
    for which in ("titleStyle", "bodyStyle", "otherStyle"):
        el = ts.find("p:%s" % which, NS)
        if el is None:
            continue
        lvls = {}
        for lvl in el:
            d = read_lvl(lvl, ctx)
            if d:
                lvls[local(lvl.tag)] = d
        if lvls:
            out[which] = lvls
    return out or None
