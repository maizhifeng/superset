#!/usr/bin/env python3
"""S5 image census / S6 colour+font frequency / S7 layout inventory / S8 guides /
S13 theme topology, plus the derived text-scale, spacing, radii and effects censuses."""
import re
from collections import Counter, defaultdict, OrderedDict

from ooxml import (
    alias_group,
    family_of,
    local,
    luminance,
    NS,
    read_color,
    resolve_color,
)

# --- S5 epsilon split (方案 v0.2 §1 S5): position/repeat matching uses ±0.5% of the
# 1920px canvas; fullscreen detection has its own independent threshold.
EPS_PX = 0.005 * 1920            # 9.6 px
FULLSCREEN_MIN_PCT = 95.0        # 上不封顶（尺寸维度，兼容旧口径）
FULLSCREEN_COVERAGE = 0.95       # 画布覆盖率判据：溢出/略未贴边都算背景，偏移出画布的大图不算
REPEAT_MIN = 2                   # 出现 <2 次谈不上「重复位」

# 下面三个跨模块共用，import 处不要再抄一份字面量
SMALL_IMG_W_PCT = 25.0           # 占画布宽小于此值算小图（图标/角标/logo），不是内容配图
LUM_MID = 0.5                    # 深/浅分界，Rec.709 相对亮度
ASSET_WARN_SINGLE = 500 * 1024   # 单张压缩后体积的 WARN 线，对齐 v2-format-spec §5 V2-6


def canvas_coverage(box, cw, ch):
    """图片与画布交集面积 / 画布面积。溢出（bleed）交集封顶于画布，天然 ≤1。"""
    if not box:
        return 0.0
    x, y, w, h = box.get("x", 0), box.get("y", 0), box.get("w", 0), box.get("h", 0)
    iw = max(0.0, min(x + w, cw) - max(x, 0.0))
    ih = max(0.0, min(y + h, ch) - max(y, 0.0))
    return (iw * ih) / (cw * ch)


# ------------------------------------------------------------- S5 image census
def _key(box):
    return (box["x"], box["y"], box["w"], box["h"])


def _close(a, b, eps=EPS_PX):
    return all(abs(a[i] - b[i]) <= eps for i in range(4))


def _cluster(occs, eps=EPS_PX):
    """Greedy epsilon clustering over occurrence boxes."""
    clusters = []
    for o in occs:
        k = _key(o["box"])
        for c in clusters:
            if _close(k, c["rep"]):
                c["occs"].append(o)
                break
        else:
            clusters.append({"rep": k, "occs": [o]})
    return clusters


def image_census(shape_recs, bg_images, units):
    """Per-image (media, box, crop) occurrence inventory with the three logo signals."""
    occ = defaultdict(list)
    for r in shape_recs:
        media = r.get("media")
        if not media or not r.get("box"):
            continue
        occ[media].append({
            "part": r["part"], "layer": r["layer"], "via": "pic",
            "box": r["box"], "box_emu": r.get("box_emu"),
            "crop": r.get("crop"), "placement": r.get("placement"),
            "w_pct": r.get("w_pct"), "h_pct": r.get("h_pct"),
            "in_group": bool(r.get("group_path")), "svg": r.get("media_svg"),
            "visible_instance_blocked": r.get("visible_instance_blocked"),
        })
    for r in shape_recs:
        f = r.get("fill") or {}
        if f.get("type") == "image" and f.get("media") and r.get("box"):
            occ[f["media"]].append({
                "part": r["part"], "layer": r["layer"], "via": "shape-fill",
                "box": r["box"], "box_emu": r.get("box_emu"), "crop": f.get("crop"),
                "placement": r.get("placement"), "w_pct": r.get("w_pct"),
                "h_pct": r.get("h_pct"), "in_group": bool(r.get("group_path")),
            })
    for b in bg_images:
        occ[b["media"]].append(b)

    images = []
    for media, occs in occ.items():
        exact = Counter()
        for o in occs:
            exact[_key(o["box"])] += 1
        clusters = []
        for c in _cluster(occs):
            boxes = [_key(o["box"]) for o in c["occs"]]
            rep = Counter(boxes).most_common(1)[0][0]
            rep_occ = next(o for o in c["occs"] if _key(o["box"]) == rep)
            clusters.append({
                "box": {"x": rep[0], "y": rep[1], "w": rep[2], "h": rep[3]},
                "box_emu": rep_occ.get("box_emu"),
                "count": len(c["occs"]),
                "exact_count": exact[rep],
                "exact_variants": len(set(boxes)),
                "parts": sorted({o["part"] for o in c["occs"]}),
                "layers": sorted({o["layer"] for o in c["occs"]}),
                "crops": sorted({_crop_sig(o.get("crop")) for o in c["occs"]}),
                "w_pct": rep_occ.get("w_pct"), "h_pct": rep_occ.get("h_pct"),
                "placement": rep_occ.get("placement"),
                "bleed": rep_occ.get("placement") == "bleed",
                "in_group": any(o.get("in_group") for o in c["occs"]),
            })
        clusters.sort(key=lambda c: -c["count"])
        cw, ch = float(units.w), float(units.h)
        fs = [o for o in occs if canvas_coverage(o.get("box"), cw, ch) >= FULLSCREEN_COVERAGE]
        fs_clusters = [c for c in clusters
                       if canvas_coverage(c.get("box"), cw, ch) >= FULLSCREEN_COVERAGE]
        crop_sigs = {_crop_sig(o.get("crop")) for o in occs} - {""}
        images.append({
            "media": media,
            "n": len(occs),
            "boxes": clusters,
            "exact_boxes": [{"box": {"x": k[0], "y": k[1], "w": k[2], "h": k[3]}, "count": n}
                            for k, n in exact.most_common()],
            "fullscreen": bool(fs),
            "fullscreen_n": len(fs),
            "fullscreen_top_cluster_n": max((c["exact_count"] for c in fs_clusters), default=0),
            "repeat_fixed": [c["box"] for c in clusters if c["count"] >= REPEAT_MIN],
            "max_w_pct": max((o.get("w_pct") or 0) for o in occs),
            "bleed": any(o.get("placement") == "bleed" for o in occs),
            "crop_variants": sorted(crop_sigs),
            "stitch_candidate": len(crop_sigs) > 1,
            "svg_companion": next((o.get("svg") for o in occs if o.get("svg")), None),
            "visible_instance_blocked": any(
                o.get("visible_instance_blocked") for o in occs),
        })
    images.sort(key=lambda i: (-i["n"], i["media"]))

    # variant_group: different media occupying the same position (many-to-many).
    pos = []
    for img in images:
        for c in img["boxes"]:
            k = _key(c["box"])
            for p in pos:
                if _close(k, p["rep"]):
                    p["members"].append({"media": img["media"], "count": c["count"]})
                    break
            else:
                pos.append({"rep": k, "box": dict(c["box"]),
                            "members": [{"media": img["media"], "count": c["count"]}]})
    groups = []
    for i, p in enumerate(pos):
        if len({m["media"] for m in p["members"]}) < 2:
            continue
        gid = "vg%d" % (len(groups) + 1)
        groups.append({"id": gid, "box": p["box"],
                       "members": sorted(p["members"], key=lambda m: -m["count"])})
    by_media = defaultdict(list)
    for g in groups:
        for m in g["members"]:
            by_media[m["media"]].append(g["id"])
    for img in images:
        img["variant_group"] = by_media.get(img["media"], [])
    return images, groups


def _crop_sig(crop):
    if not crop:
        return ""
    return ",".join("%s=%s" % (k, crop[k]) for k in sorted(crop))


# ------------------------------------------ S5b media content clustering (素材聚类)
# Two levels: sha256 byte identity, then perceptual identity. The perceptual level
# is a dHash *prefilter* followed by a pixel confirmation, because dHash alone does
# not separate them on its own: distinct images can land at hamming distance 0
# while identical ones land several bits apart, so no single hamming threshold
# splits the two populations. The hash therefore only narrows the candidate set
# and the thumbnail pixel difference makes the call.
DHASH_PREFILTER_MAX = 10         # hamming distance over the 64-bit dHash
PIXDIFF_MAX = 5.0                # mean per-channel |Δ| over the 64x64 thumbnail
THUMB_PX = 64


def _composite_on_white(im):
    """Flatten alpha the way a slide renders it, so transparent padding cannot
    masquerade as image content."""
    from PIL import Image
    if im.mode in ("RGBA", "LA", "P"):
        im = im.convert("RGBA")
        return Image.alpha_composite(Image.new("RGBA", im.size, (255, 255, 255, 255)),
                                     im).convert("RGB")
    return im.convert("RGB")


def _dhash(rgb):
    """9x8 grayscale row-wise gradient hash -> 64 bits."""
    from PIL import Image
    g = rgb.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for r in range(8):
        for c in range(8):
            bits = (bits << 1) | (1 if px[r * 9 + c] > px[r * 9 + c + 1] else 0)
    return bits


def media_fingerprints(pkg, medias, pillow_ok):
    """sha256 (always) + dHash and thumbnails (Pillow only), per media part."""
    import hashlib
    out = {}
    for m in sorted(set(medias)):
        if not m or m not in pkg.names:
            continue
        raw = pkg.zip.read(m)
        rec = {"sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)}
        if pillow_ok and not m.lower().endswith(".svg"):
            try:
                import io

                from PIL import Image
                im = Image.open(io.BytesIO(raw))
                im.load()
                rec["px"] = list(im.size)
                rgb = _composite_on_white(im)
                rec["phash"] = "%016x" % _dhash(rgb)
                rec["_thumb_rgb"] = rgb.resize((THUMB_PX, THUMB_PX), Image.LANCZOS)
                rec["_thumb_rgba"] = im.convert("RGBA").resize(
                    (THUMB_PX, THUMB_PX), Image.LANCZOS)
            except Exception as exc:
                rec["fingerprint_error"] = "%s: %s" % (exc.__class__.__name__, exc)
        out[m] = rec
    return out


def _pixdiff(a, b):
    from PIL import ImageChops, ImageStat
    st = ImageStat.Stat(ImageChops.difference(a, b))
    return sum(st.mean) / 3.0


def content_clusters(images, fps):
    """Assign every image row a `content_id`, and merge same-content media.

    Returns the `media_clusters` table. Rows are mutated in place with
    `content_id` / `phash` only — every pre-existing field is left untouched,
    because verify_gates reads them.
    """
    medias = [i["media"] for i in images]
    parent = {m: m for m in medias}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    evidence = []
    for i, a in enumerate(medias):
        fa = fps.get(a) or {}
        for b in medias[i + 1:]:
            fb = fps.get(b) or {}
            if fa.get("sha256") and fa["sha256"] == fb.get("sha256"):
                union(a, b)
                evidence.append({"a": a, "b": b, "level": "sha256", "dhash_distance": 0,
                                 "pixel_diff": 0.0})
                continue
            if not fa.get("phash") or not fb.get("phash"):
                continue
            d = bin(int(fa["phash"], 16) ^ int(fb["phash"], 16)).count("1")
            if d > DHASH_PREFILTER_MAX:
                continue
            try:
                pd = _pixdiff(fa["_thumb_rgb"], fb["_thumb_rgb"])
            except Exception:
                continue
            if pd <= PIXDIFF_MAX:
                union(a, b)
                evidence.append({"a": a, "b": b, "level": "perceptual",
                                 "dhash_distance": d, "pixel_diff": round(pd, 2)})
            else:
                evidence.append({"a": a, "b": b, "level": "rejected",
                                 "dhash_distance": d, "pixel_diff": round(pd, 2)})

    by_root = defaultdict(list)
    for m in medias:
        by_root[find(m)].append(m)
    ids, clusters = {}, []
    by_media = {i["media"]: i for i in images}
    for root in sorted(by_root, key=lambda r: (-len(by_root[r]), r)):
        members = sorted(by_root[root])
        cid = "c%d" % (len(clusters) + 1)
        for m in members:
            ids[m] = cid
        # Cluster-level repeat detection: the whole point of the clustering is
        # that N pasted copies of one asset must count as N occurrences of one
        # asset, so the epsilon merge runs across member media, not within one.
        merged = []
        for m in members:
            for c in by_media[m]["boxes"]:
                k = _key(c["box"])
                for mc in merged:
                    if _close(k, mc["rep"]):
                        mc["count"] += c["count"]
                        mc["media"].add(m)
                        break
                else:
                    merged.append({"rep": k, "box": dict(c["box"]), "count": c["count"],
                                   "media": {m}})
        merged.sort(key=lambda c: -c["count"])
        clusters.append({
            "content_id": cid,
            "members": members,
            "member_n": len(members),
            "sha256_identical": len({(fps.get(m) or {}).get("sha256") for m in members}) == 1,
            "phash": (fps.get(members[0]) or {}).get("phash"),
            "n": sum(by_media[m]["n"] for m in members),
            "boxes": [{"box": c["box"], "count": c["count"],
                       "media": sorted(c["media"]), "cross_media": len(c["media"]) > 1}
                      for c in merged],
            "repeat_fixed": [c["box"] for c in merged if c["count"] >= REPEAT_MIN],
            "repeat_fixed_cross_media": [c["box"] for c in merged
                                         if c["count"] >= REPEAT_MIN and len(c["media"]) > 1],
            "fullscreen": any(by_media[m]["fullscreen"] for m in members),
        })
    for img in images:
        img["content_id"] = ids.get(img["media"])
        img["phash"] = (fps.get(img["media"]) or {}).get("phash")
    return clusters, evidence


# ------------------------------------------------------------ S14 image palette
PALETTE_TOP_N = 5
PALETTE_BUCKET_SHIFT = 4         # 16 levels per channel
PALETTE_ALPHA_MIN = 128


def image_palette(images, fps, exported):
    """Pixel-level dominant colours + whole-image luminance for exported assets.

    Sampled from the *original* bytes in the package, not the webp the transcoder
    writes, so the palette does not inherit quality-ladder artefacts. Pixels below
    PALETTE_ALPHA_MIN are dropped: a logo on a transparent bed would otherwise
    report its padding as the dominant colour.
    """
    from ooxml import _lin
    lut = [_lin(i) for i in range(256)]
    for img in images:
        if img["media"] not in exported:
            continue
        f = fps.get(img["media"]) or {}
        thumb = f.get("_thumb_rgba")
        if thumb is None:
            continue
        buckets, lum, n = defaultdict(lambda: [0, 0, 0, 0]), 0.0, 0
        for r, g, b, a in thumb.getdata():
            if a < PALETTE_ALPHA_MIN:
                continue
            n += 1
            lum += 0.2126 * lut[r] + 0.7152 * lut[g] + 0.0722 * lut[b]
            k = (r >> PALETTE_BUCKET_SHIFT, g >> PALETTE_BUCKET_SHIFT,
                 b >> PALETTE_BUCKET_SHIFT)
            acc = buckets[k]
            acc[0] += 1
            acc[1] += r
            acc[2] += g
            acc[3] += b
        if not n:
            img["dominant_colors"] = []
            img["luminance"] = None
            img["palette_note"] = "fully transparent above alpha %d" % PALETTE_ALPHA_MIN
            continue
        top = sorted(buckets.values(), key=lambda v: -v[0])[:PALETTE_TOP_N]
        img["dominant_colors"] = [
            {"hex": "#%02X%02X%02X" % (round(c[1] / c[0]), round(c[2] / c[0]),
                                       round(c[3] / c[0])),
             "pct": round(c[0] * 100.0 / n, 2)} for c in top]
        img["luminance"] = round(lum / n, 4)
        img["opaque_sample_px"] = n


# ------------------------------------------------- S6 colour frequency (resolved)
# Declared XPath range: colours counted only when reachable through one of these
# containers. `p15:clr` -> editor, `a:buClr` / styleRef -> aux, everything else design.
DESIGN_VIA = ("solidFill", "gs", "bgRef")
EDITOR_VIA = ("clr",)          # p15:clr (guides)
AUX_VIA = ("buClr", "fillRef", "lnRef", "effectRef", "fontRef")
COLOR_TAGS = {"srgbClr", "schemeClr", "sysClr", "prstClr", "scrgbClr", "hslClr"}


def _scan_colors(el, ctx_stack, sink):
    tag = local(el.tag)
    if tag in COLOR_TAGS:
        cls = None
        for anc in reversed(ctx_stack):
            if anc in EDITOR_VIA:
                cls = "editor"
                break
            if anc in AUX_VIA:
                cls = "aux"
                break
            if anc in DESIGN_VIA:
                cls = "design"
                break
        if cls:
            sink.append((el, cls))
        return
    ctx_stack.append(tag)
    for ch in el:
        _scan_colors(ch, ctx_stack, sink)
    ctx_stack.pop()


def color_census(pkg, part_ctxs):
    """Counts keyed on the *resolved* hex/rgba (schemeClr -> clrMap -> clrScheme)."""
    agg = OrderedDict()
    raw_rows = []
    for ctx in part_ctxs:
        sink = []
        _scan_colors(pkg.xml(ctx.part), [], sink)
        for el, cls in sink:
            raw = read_color(el)
            res = resolve_color(raw, ctx.clrmap, ctx.clrscheme)
            if not res:
                continue
            key = res.get("resolved") or ("UNRESOLVED:" + str(res.get("unresolved")))
            e = agg.setdefault(key, {"resolved": key, "hex": res.get("hex"),
                                     "alpha": res.get("alpha"), "n": 0,
                                     "class": cls, "layers": Counter(), "raw": Counter()})
            e["n"] += 1
            e["layers"][ctx.layer] += 1
            e["raw"][res["raw"]] += 1
            # design evidence wins over aux/editor if a colour appears in both roles
            if cls == "design":
                e["class"] = "design"
            raw_rows.append({"part": ctx.part, "layer": ctx.layer, "class": cls,
                             "raw": res["raw"], "resolved": key})
    out = []
    for e in agg.values():
        out.append({"resolved": e["resolved"], "hex": e["hex"], "alpha": e["alpha"],
                    "n": e["n"], "class": e["class"],
                    "layers": dict(e["layers"]),
                    "raw": [r for r, _ in e["raw"].most_common()],
                    "raw_counts": dict(e["raw"])})
    out.sort(key=lambda e: (-e["n"], e["resolved"]))
    return out, raw_rows


# ------------------------------------------------------------ S6 font clustering
FONT_REF_RE = re.compile(r"^\+(mj|mn)-(lt|ea|cs)$")
FONT_REF_KIND = {"mj": "majorFont", "mn": "minorFont"}
FONT_REF_SLOT = {"lt": "latin", "ea": "ea", "cs": "cs"}


def font_scheme_by_part(pkg, graph, theme_of_master):
    """part -> 该 part 所在母版链绑定 theme 的 fontScheme。

    `+mj-lt` 之类占位符要解析成实名就得知道「这个形状属于哪条母版链」，
    与 schemeClr 走 clrMap→clrScheme 是同一条依赖。
    """
    of_master = {mp: (theme_of_master.get(mp) or {}).get("fontScheme") or {}
                 for mp in graph["master_order"]}
    out = dict(of_master)
    for lp in pkg.layouts:
        out[lp] = of_master.get(graph["master_of_layout"].get(lp), {})
    for sp in pkg.slides:
        layout = graph["layout_of_slide"].get(sp)
        out[sp] = of_master.get(graph["master_of_layout"].get(layout), {})
    return out


def resolve_font_ref(raw, scheme):
    """`+mj-lt` → fontScheme 实名。返回 (face, ref, status)。

    与颜色一致：以解析后的实名计数。三种结局要分开，否则第三种会把非字体塞进字体表：
      plain      —— 不是占位符
      resolved   —— 解析到实名
      empty      —— 主题里该槽位显式为空串（`<a:cs typeface=""/>`，合法的「不指定」）
      unresolved —— 压根没有可用 fontScheme / 无该槽位，才保留占位符并标注
    """
    m = FONT_REF_RE.match(raw or "")
    if not m:
        return raw, None, "plain"
    kind = (scheme or {}).get(FONT_REF_KIND[m.group(1)])
    slot = FONT_REF_SLOT[m.group(2)]
    if not isinstance(kind, dict) or slot not in kind:
        return None, raw, "unresolved"
    face = kind[slot]
    return (face, raw, "resolved") if face else (None, raw, "empty")


def font_census(shape_recs, txstyles_by_master, themes, scheme_by_part=None):
    fams = {}
    theme_faces = set()
    for t in themes:
        for kind in ("majorFont", "minorFont"):
            for face in (t.get("fontScheme", {}).get(kind) or {}).values():
                if face:
                    theme_faces.add(face)

    def add(raw, layer, slot, source, scheme, bold=False):
        if not raw:
            return
        face, ref, status = resolve_font_ref(raw, scheme)
        if status == "empty":
            return          # 主题显式不指定该槽位，等同于没有声明过
        if status == "unresolved":
            # Keep the placeholder as its own family rather than dropping it, so
            # a broken theme binding is visible instead of silent.
            face = ref
        family, weight, italic = family_of(face)
        e = fams.setdefault(family, {"family": family, "n": 0, "rendered": 0,
                                     "variants": OrderedDict(), "positions": Counter(),
                                     "slots": Counter(), "sources": Counter(),
                                     "theme_refs": Counter(), "unresolved_ref": False,
                                     "italic": False, "bold_runs": 0})
        e["n"] += 1
        if source != "pPr_empty":
            e["rendered"] += 1
        e["positions"][layer] += 1
        e["slots"][slot] += 1
        e["sources"][source] += 1
        e["italic"] = e["italic"] or italic
        if ref:
            e["theme_refs"][ref] += 1
            if face == ref:
                e["unresolved_ref"] = True
        if bold:
            e["bold_runs"] += 1
        # weight comes from the font *name* only — it is the sole 字重 source; a b="1"
        # flag is a separate signal and is counted apart so L4 can tell them apart.
        v = e["variants"].setdefault(face, {"raw": face, "weight": weight, "n": 0,
                                            "bold_runs": 0, "truncated": len(face) == 31})
        v["n"] += 1
        if bold:
            v["bold_runs"] += 1

    def visit_rpr(d, layer, source, scheme, skip=()):
        bold = bool(d.get("bold"))
        for slot in ("latin", "ea", "cs"):
            if d.get(slot) and slot not in skip:
                add(d[slot], layer, slot, source, scheme, bold)

    for r in shape_recs:
        layer = r["layer"]
        scheme = (scheme_by_part or {}).get(r["part"], {})
        text = r.get("text") or {}
        for lvl in (text.get("lstStyle") or {}).values():
            visit_rpr(lvl, layer, "lstStyle", scheme)
        for p in text.get("paragraphs", []):
            runs = [run for run in p.get("runs", []) if not run.get("empty_para")]
            for run in p.get("runs", []):
                visit_rpr(run, layer, "run", scheme)
            # a:p/a:pPr/a:defRPr supplies this paragraph's run defaults, per slot:
            # a run declaring `latin` does not suppress the paragraph's `ea`.
            # A paragraph with no runs at all (only <a:endParaRPr/>) declares a
            # default that renders no glyph, so it is counted under its own source
            # and kept out of `rendered_n` — otherwise a face backing zero visible
            # text can outrank the deck's actual typeface.
            dr = p.get("defRPr") or {}
            if dr:
                covered = {slot for slot in ("latin", "ea", "cs")
                           if any(run.get(slot) for run in runs)}
                visit_rpr(dr, layer, "pPr" if runs else "pPr_empty", scheme, skip=covered)
    for master, ts in (txstyles_by_master or {}).items():
        scheme = (scheme_by_part or {}).get(master, {})
        for lvls in (ts or {}).values():
            for lvl in lvls.values():
                visit_rpr(lvl, "master", "txStyles", scheme)

    out = []
    for e in fams.values():
        variants = sorted(e["variants"].values(), key=lambda v: -v["n"])
        weights = sorted({v["weight"] for v in variants if v["weight"]})
        row = {"family": e["family"], "n": e["n"], "rendered_n": e["rendered"],
               "variants": variants, "weights": weights,
               "bold_runs": e["bold_runs"],
               "positions": dict(e["positions"]), "slots": dict(e["slots"]),
               "sources": dict(e["sources"]), "italic": e["italic"],
               "alias_group": alias_group(e["family"]),
               "in_theme": any(v["raw"] in theme_faces for v in variants)}
        if e["theme_refs"]:
            row["theme_refs"] = dict(e["theme_refs"])
        if e["unresolved_ref"]:
            row["unresolved_theme_ref"] = True
        if not e["rendered"]:
            row["renders_no_text"] = True
        out.append(row)
    # rendered_n leads the sort so a face declared only on empty paragraphs cannot
    # outrank one that actually sets type. For families without such declarations
    # rendered_n == n, so the existing order is unchanged.
    out.sort(key=lambda e: (-e["rendered_n"], -e["n"], e["family"]))
    return out


# --------------------------------------------------------- S7 layout inventory
def _ph_signature(shapes, part):
    sig = []
    for r in shapes:
        if r["part"] != part or not r.get("ph"):
            continue
        b = r.get("box")
        sig.append((r["ph"]["type"],
                    tuple(round((b or {}).get(k, -1) / 5.0) for k in ("x", "y", "w", "h"))))
    return tuple(sorted(sig))


def layout_inventory(pkg, graph, shapes, bg_by_part):
    rows = []
    for lp in pkg.layouts:
        root = pkg.xml(lp)
        cSld = root.find("p:cSld", NS)
        master = graph["master_of_layout"].get(lp)
        background = bg_by_part.get(lp) or bg_by_part.get(master)
        phs = Counter()
        for r in shapes:
            if r["part"] == lp and r.get("ph"):
                phs[r["ph"]["type"]] += 1
        rows.append({
            "part": lp,
            "name": cSld.get("name") if cSld is not None else None,
            "type_attr": root.get("type", "cust"),
            "master": master,
            "used_by_slides": graph["slides_per_layout"].get(lp, 0),
            "placeholders": dict(phs),
            "shape_n": sum(1 for r in shapes if r["part"] == lp),
            "background": background,
            "background_source": lp if bg_by_part.get(lp) else master,
            "ph_signature": _ph_signature(shapes, lp),
            "guides": [],
        })
    return rows


def detect_twins(rows):
    """跨母版孪生检测 (S7, runs before master triage): name match first, geometry fallback."""
    pairs, by_name = [], defaultdict(list)
    for r in rows:
        by_name[(r["name"] or "").strip()].append(r)
    for name, group in by_name.items():
        if not name or len(group) < 2:
            continue
        masters = {r["master"] for r in group}
        if len(masters) < 2:
            continue
        base = group[0]
        for other in group[1:]:
            if other["master"] == base["master"]:
                continue
            pairs.append({"a": base["part"], "b": other["part"], "name": name,
                          "match": "name",
                          "geometry_match": base["ph_signature"] == other["ph_signature"]})
    if not pairs:
        by_sig = defaultdict(list)
        for r in rows:
            if r["ph_signature"]:
                by_sig[r["ph_signature"]].append(r)
        for sig, group in by_sig.items():
            masters = {r["master"] for r in group}
            if len(group) < 2 or len(masters) < 2:
                continue
            base = group[0]
            for other in group[1:]:
                if other["master"] != base["master"]:
                    pairs.append({"a": base["part"], "b": other["part"],
                                  "name": base["name"], "match": "geometry",
                                  "geometry_match": True})
    paired = {p["a"] for p in pairs} | {p["b"] for p in pairs}
    return pairs, sorted(r["part"] for r in rows if r["part"] not in paired)


# ------------------------------------------------------------------- S8 guides
def read_guides(pkg, units, parts):
    """p:extLst/p15:sldGuideLst on presentation.xml and each slideLayout.
    pos is 1/8 pt. Master level is checked too, purely to evidence that it is empty."""
    out = []
    for part in parts:
        if part not in pkg.names:
            continue
        root = pkg.xml(part)
        for g in root.iter("{%s}guide" % NS["p15"]):
            rec = {"part": part, "orient": g.get("orient", "vert"),
                   "pos_eighth_pt": int(g.get("pos", 0)),
                   "px": units.eighth_pt(g.get("pos", 0))}
            clr = g.find("p15:clr", NS)
            if clr is not None:
                for ch in clr:
                    c = resolve_color(read_color(ch))
                    if c:
                        rec["color"] = c.get("hex")
                        break
            out.append(rec)
    return out


# --------------------------------------------------------- S13 theme topology
def theme_topology(graph, triage, themes_by_part, clrmap_by_master, bg_by_part, twin_pairs):
    masters = [m["part"] for m in triage["masters"] if m["picked"]]
    labels, detail = OrderedDict(), []
    for mp in masters:
        cm = clrmap_by_master.get(mp, {})
        theme = themes_by_part.get(graph["theme_of_master"].get(mp), {})
        scheme = theme.get("clrScheme", {})
        bg = bg_by_part.get(mp) or {}
        bg_hex = ((bg.get("color") or {}).get("hex")
                  or scheme.get(cm.get("bg1", "lt1")))
        lum = luminance(bg_hex) if bg_hex else None
        label = ("dark" if lum is not None and lum < 0.5 else "light") if bg_hex else None
        detail.append({"master": mp, "clrMap": cm, "bg_hex": bg_hex,
                       "bg_luminance": round(lum, 4) if lum is not None else None,
                       "theme_label": label,
                       "bg1_slot": cm.get("bg1"), "tx1_slot": cm.get("tx1")})
        if label:
            labels.setdefault(label, mp)

    inversion = []
    for i, a in enumerate(detail):
        for b in detail[i + 1:]:
            ca, cb = a["clrMap"], b["clrMap"]
            if not ca or not cb:
                continue
            swapped = [k for k in ("bg1", "tx1", "bg2", "tx2")
                       if ca.get(k) and cb.get(k) and ca.get(k) != cb.get(k)]
            pairwise = (ca.get("bg1") == cb.get("tx1") and ca.get("tx1") == cb.get("bg1"))
            if swapped and pairwise:
                inversion.append({"a": a["master"], "b": b["master"], "swapped_slots": swapped})

    if inversion:
        mechanism = "clrmap-inversion"
    elif twin_pairs and len(labels) > 1:
        mechanism = "twin-layouts"
    else:
        mechanism = "single"
    theme_list = list(labels.keys()) if len(labels) > 1 else ["single"]
    if mechanism == "single":
        theme_list = ["single"]
    return {
        "themes": theme_list,
        "mechanism": mechanism,
        "default": (list(labels.items())[0][0] if len(labels) > 1 else "single"),
        "clrmap_by_master": {m: clrmap_by_master.get(m, {}) for m in masters},
        "per_master": detail,
        "inversion_pairs": inversion,
        "twin_pair_n": len(twin_pairs),
    }


# ------------------------------------- derived censuses (text/spacing/radii/fx)
def text_scale(shape_recs, txstyles_by_master):
    agg = {}

    def add(sz, layer, source, d):
        if not sz:
            return
        e = agg.setdefault(sz, {"sz_px": sz, "n": 0, "layers": Counter(),
                                "sources": Counter(), "weights": Counter(),
                                "bold": 0, "lnSpc": Counter()})
        e["n"] += 1
        e["layers"][layer] += 1
        e["sources"][source] += 1
        if d.get("weight"):
            e["weights"][d["weight"]] += 1
        if d.get("bold"):
            e["bold"] += 1

    for r in shape_recs:
        layer = r["layer"]
        text = r.get("text") or {}
        for lvl in (text.get("lstStyle") or {}).values():
            add(lvl.get("sz_px"), layer, "lstStyle", lvl)
            if lvl.get("sz_px") and lvl.get("lnSpc", {}).get("mult"):
                agg[lvl["sz_px"]]["lnSpc"][lvl["lnSpc"]["mult"]] += 1
        for p in text.get("paragraphs", []):
            mult = (p.get("lnSpc") or {}).get("mult")
            runs = [r for r in p.get("runs", []) if not r.get("empty_para")]
            sized = 0
            for run in runs:
                add(run.get("sz_px"), layer, "run", run)
                if run.get("sz_px"):
                    sized += 1
                    if mult:
                        agg[run["sz_px"]]["lnSpc"][mult] += 1
            # a:p/a:pPr/a:defRPr is the default for this paragraph's runs, so it
            # only takes effect where no run overrides it. Counting it alongside
            # an explicit run size would double-count one piece of text.
            dr = p.get("defRPr") or {}
            if runs and not sized and dr.get("sz_px"):
                add(dr["sz_px"], layer, "pPr", dr)
                if mult:
                    agg[dr["sz_px"]]["lnSpc"][mult] += 1
    for ts in (txstyles_by_master or {}).values():
        for lvls in (ts or {}).values():
            for lvl in lvls.values():
                add(lvl.get("sz_px"), "master", "txStyles", lvl)

    out = [{"sz_px": e["sz_px"], "n": e["n"], "layers": dict(e["layers"]),
            "sources": dict(e["sources"]), "weights": dict(e["weights"]),
            "bold_runs": e["bold"],
            "line_height_mult": dict(e["lnSpc"].most_common())}
           for e in agg.values()]
    out.sort(key=lambda e: -e["sz_px"])
    return out


def spacing_candidates(shape_recs, units, top=40):
    W, H = units.w, units.h
    pads = Counter()
    gaps = Counter()
    by_part = defaultdict(list)
    for r in shape_recs:
        b = r.get("box")
        if not b or r.get("placement") not in ("inside", "bleed"):
            continue
        if (r.get("w_pct") or 0) >= FULLSCREEN_MIN_PCT and (r.get("h_pct") or 0) >= FULLSCREEN_MIN_PCT:
            continue
        if r.get("depth"):
            continue
        by_part[r["part"]].append(b)
        for name, v, span in (("left", b["x"], W), ("top", b["y"], H),
                              ("right", W - (b["x"] + b["w"]), W),
                              ("bottom", H - (b["y"] + b["h"]), H)):
            if 0 <= v <= span * 0.4:
                pads[(name, int(round(v)))] += 1
    for boxes in by_part.values():
        for axis, pos, size, cross, cross_size in (("v", "y", "h", "x", "w"),
                                                   ("h", "x", "w", "y", "h")):
            ordered = sorted(boxes, key=lambda b: b[pos])
            for a, b2 in zip(ordered, ordered[1:]):
                if a[cross] + a[cross_size] <= b2[cross] or b2[cross] + b2[cross_size] <= a[cross]:
                    continue
                g = b2[pos] - (a[pos] + a[size])
                if 0 < g <= 400:
                    gaps[(axis, int(round(g)))] += 1
    return {
        "paddings": [{"edge": k[0], "px": k[1], "n": n}
                     for k, n in pads.most_common() if n >= 2][:top],
        "gaps": [{"axis": k[0], "px": k[1], "n": n}
                 for k, n in gaps.most_common() if n >= 2][:top],
        "grids": fit_grids(shape_recs),
    }


# ------------------------------------------------------- 重复网格拟合（栅格）
GRID_MIN_CELLS = 3               # 少于 3 格谈不上"栅格"
GRID_TOL_PX = 6.0                # 中心归并容差：同列的元素中心允许这点抖动
GRID_PITCH_STDEV_MAX = 2.0       # 步距标准差超过它就不算规整


def _cluster_1d(vals, tol=GRID_TOL_PX):
    """一维贪心聚类，返回按值排序的簇。"""
    out = []
    for v in sorted(vals):
        if out and v - out[-1][-1] <= tol:
            out[-1].append(v)
        else:
            out.append([v])
    return out


def _axis_fit(centers, edges):
    """一轴的列/行拟合。centers 决定分档，edges 给出该档的起始边（供 slot 用）。"""
    groups = _cluster_1d(centers)
    if len(groups) < 2:
        return None
    idx, cur = {}, 0
    for g in groups:
        for v in g:
            idx[v] = cur
        cur += 1
    means = [sum(g) / len(g) for g in groups]
    diffs = [b - a for a, b in zip(means, means[1:])]
    pitch = sum(diffs) / len(diffs)
    var = sum((d - pitch) ** 2 for d in diffs) / len(diffs)
    sd = var ** 0.5
    starts = [None] * len(groups)
    for c, e in zip(centers, edges):
        i = idx[c]
        starts[i] = e if starts[i] is None else min(starts[i], e)
    # 只有 2 档时全轴只有 1 个步距，方差恒为 0——这种"规整"是算法产物不是事实，
    # 至少 3 档（2 个步距）才谈得上验证步距一致性。
    return {"n": len(groups), "centers": [round(m, 1) for m in means],
            "starts": [round(s, 1) for s in starts],
            "pitch": round(pitch, 1), "pitch_stdev": round(sd, 2),
            "regular": sd <= GRID_PITCH_STDEV_MAX and len(groups) >= 3}


def fit_grids(shape_recs):
    """逐页把同类形状拟合成栅格：列数/列起点/列步距 + 行数/行步距。

    按**中心**分档而不是按左上角——一排 logo 尺寸各不相同却居中对齐于等宽格，
    用左上角看不出列。
    因此这里也不要求同尺寸，只要求同页同 kind 同层级。
    """
    buckets = defaultdict(list)
    for r in shape_recs:
        b = r.get("box")
        if not b or r.get("placement") not in ("inside", "bleed"):
            continue
        if not b.get("w") or not b.get("h"):
            continue
        # 满屏底图不参与栅格（与 spacing_candidates 同口径）：它和页面上的小图标
        # 同属 pic、同页，会被凑成一个「2 列」的假栅格。
        if ((r.get("w_pct") or 0) >= FULLSCREEN_MIN_PCT
                and (r.get("h_pct") or 0) >= FULLSCREEN_MIN_PCT):
            continue
        buckets[(r["part"], r["kind"], r.get("depth", 0))].append(b)
    out = []
    for (part, kind, depth), boxes in buckets.items():
        if len(boxes) < GRID_MIN_CELLS:
            continue
        cx = [b["x"] + b["w"] / 2.0 for b in boxes]
        cy = [b["y"] + b["h"] / 2.0 for b in boxes]
        cols = _axis_fit(cx, [b["x"] for b in boxes])
        rows = _axis_fit(cy, [b["y"] for b in boxes])
        keep = [a for a in (cols, rows) if a and a["regular"]]
        if not keep:
            continue
        # 至少一轴规整，且格子数够，才算拟合成功
        if (cols["n"] if cols else 1) * (rows["n"] if rows else 1) < GRID_MIN_CELLS:
            continue
        e = {"part": part, "kind": kind, "depth": depth, "n": len(boxes)}
        if cols:
            e["cols"] = cols
        if rows:
            e["rows"] = rows
        if cols and rows:
            e["cells"] = cols["n"] * rows["n"]
            e["filled"] = len(boxes)
        w = [b["w"] for b in boxes]
        h = [b["h"] for b in boxes]
        e["item_w"] = [round(min(w), 1), round(max(w), 1)]
        e["item_h"] = [round(min(h), 1), round(max(h), 1)]
        out.append(e)
    out.sort(key=lambda e: (-e["n"], e["part"]))
    return out


NEGATIVE_EVIDENCE_EFFECTS = ("outerShdw", "innerShdw", "glow", "reflection", "softEdge", "blur")


def radii_effects_census(shape_recs):
    radii = Counter()
    prst = Counter()
    fx = Counter()
    grads = 0
    alphas = Counter()
    for r in shape_recs:
        if r.get("radius_px") is not None:
            radii[r["radius_px"]] += 1
        if r.get("geom"):
            prst[r["geom"]["prst"]] += 1
        for e in (r.get("effects") or []):
            fx[e["type"]] += 1
        f = r.get("fill") or {}
        if f.get("type") == "gradient":
            grads += 1
        col = f.get("color") or {}
        if col.get("alpha") is not None and col["alpha"] < 100:
            alphas[col["alpha"]] += 1
    effects = {k: fx.get(k, 0) for k in NEGATIVE_EVIDENCE_EFFECTS}
    for k, v in fx.items():
        effects.setdefault(k, v)
    return (
        [{"px": px, "n": n} for px, n in sorted(radii.items(), key=lambda kv: -kv[1])],
        {"prst_geom": dict(prst.most_common()), "gradient_fills": grads,
         "translucent_fills": {str(k): v for k, v in alphas.most_common()}},
        effects,
    )
