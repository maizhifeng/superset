#!/usr/bin/env python3
"""Stage-1 deterministic extractor for PPTX/POTX style packs.

    python3 extract.py <pptx> <outdir> [--export-all-media]

Writes <outdir>/extract.json + <outdir>/media-out/ + <outdir>/ref/.
`--export-all-media` also copies out the non-candidate media (for L1 eyeballing);
it changes nothing else — candidate judgement and transcoding are untouched.
Stdlib plus an optional Pillow. Oversized or non-web candidate assets are kept
as-is *and* re-encoded to a webp under ASSET_BUDGET_BYTES; without Pillow the
transcode falls back to darwin `sips`, and failing that the row records
transcode_blocked and extract.json records pillow_available: false.
"""
import hashlib
import io
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from census import (
    ASSET_WARN_SINGLE,
    color_census,
    content_clusters,
    detect_twins,
    DHASH_PREFILTER_MAX,
    EPS_PX,
    font_census,
    font_scheme_by_part,
    FULLSCREEN_MIN_PCT,
    image_census,
    image_palette,
    layout_inventory,
    media_fingerprints,
    PIXDIFF_MAX,
    radii_effects_census,
    read_guides,
    REPEAT_MIN,
    SMALL_IMG_W_PCT,
    spacing_candidates,
    text_scale,
    theme_topology,
)
from ooxml import NS, Units
from parts import (
    build_graph,
    Package,
    read_clrmap,
    read_part_shapes,
    read_theme,
    read_txstyles,
    triage_masters,
)

SCHEMA = "pptx-extract/stage1-v0.1"
WEB_FORMATS = {"png", "jpg", "jpeg", "gif", "webp", "svg"}
ASSET_BUDGET_BYTES = ASSET_WARN_SINGLE                # V2-6 单张 WARN 线
# Quality ladder first, then resolution — dropping pixels is the more visible
# loss, so it is only reached once the lowest quality still overshoots.
WEBP_QUALITY_LADDER = (85, 75, 65, 55, 45)
WEBP_SCALE_LADDER = (1.0, 0.75, 0.5, 0.35, 0.25)
WEBP_MAX_EDGE = 16383                                 # hard format limit


def bind_themes(graph, themes_by_part):
    """master -> theme, with a last-resort binding when the rels chain misses.

    Normal path is the master's own theme relationship. If that target is not a
    readable theme part and the package holds exactly one theme with a usable
    clrScheme, bind that one rather than emitting UNRESOLVED:no-scheme for every
    schemeClr in the file. Each departure is recorded in `scheme_fallback`.
    """
    usable = [t for t in themes_by_part.values() if t.get("clrScheme")]
    bound, trace = {}, []
    for mp in graph["master_order"]:
        want = graph["theme_of_master"].get(mp)
        theme = themes_by_part.get(want)
        if theme is not None:
            bound[mp] = theme
            continue
        if len(usable) == 1:
            bound[mp] = usable[0]
            trace.append({"master": mp, "wanted_theme": want, "bound_theme": usable[0]["part"],
                          "rule": "file-unique-theme"})
        else:
            bound[mp] = {}
            trace.append({"master": mp, "wanted_theme": want, "bound_theme": None,
                          "rule": "unbound", "usable_themes": len(usable)})
    return bound, trace


def probe_pillow():
    try:
        import PIL  # noqa: F401
        from PIL import Image  # noqa: F401
        return True, getattr(__import__("PIL"), "__version__", "unknown")
    except Exception as exc:
        return False, str(exc.__class__.__name__)


# ------------------------------------------------------------ S9 media export
def _webp_from_pillow(raw, dst, budget):
    """Re-encode `raw` to webp under `budget`, preserving alpha.

    Returns the row fields describing the result. The smallest encoding is kept
    even when nothing fits the budget, so an oversized asset still shrinks and
    the row says by how much it missed.
    """
    import io

    from PIL import Image

    im = Image.open(io.BytesIO(raw))
    im.load()
    has_alpha = im.mode in ("RGBA", "LA") or (im.mode == "P" and "transparency" in im.info)
    im = im.convert("RGBA" if has_alpha else "RGB")
    w0, h0 = im.size
    if max(w0, h0) > WEBP_MAX_EDGE:
        k = WEBP_MAX_EDGE / float(max(w0, h0))
        im = im.resize((max(1, int(w0 * k)), max(1, int(h0 * k))), Image.LANCZOS)
    best = None
    for scale in WEBP_SCALE_LADDER:
        work = im if scale == 1.0 else im.resize(
            (max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.LANCZOS)
        for q in WEBP_QUALITY_LADDER:
            buf = io.BytesIO()
            work.save(buf, "WEBP", quality=q, method=4)
            data = buf.getvalue()
            if best is None or len(data) < best[0]:
                best = (len(data), data, q, work.size)
            if len(data) <= budget:
                best = (len(data), data, q, work.size)
                break
        if best[0] <= budget:
            break
    size, data, q, dims = best
    with open(dst, "wb") as f:
        f.write(data)
    row = {"transcoded": True, "compressed_bytes": size, "compressed_via": "pillow",
           "compressed_quality": q, "compressed_px": list(dims),
           "compressed_alpha": has_alpha, "source_px": [w0, h0]}
    if size > budget:
        row["over_budget"] = True
    return row


def _webp_from_sips(part, raw, dst_base, budget):
    """darwin fallback when Pillow is missing: sips can only reach jpeg/png."""
    import shutil
    import subprocess
    import tempfile
    if sys.platform != "darwin" or not shutil.which("sips"):
        return None
    tmpdir = tempfile.mkdtemp()
    try:
        src = os.path.join(tmpdir, os.path.basename(part))
        with open(src, "wb") as f:
            f.write(raw)
        dst = dst_base + ".jpg"
        best = None
        for maxdim in (0, 2400, 1600, 1200, 800):
            cmd = ["sips", "-s", "format", "jpeg", "-s", "formatOptions", "70"]
            if maxdim:
                cmd += ["-Z", str(maxdim)]
            cmd += [src, "--out", dst]
            r = subprocess.run(cmd, capture_output=True)
            if r.returncode != 0 or not os.path.exists(dst):
                return None
            best = os.path.getsize(dst)
            if best <= budget:
                break
        row = {"transcoded": True, "compressed_bytes": best, "compressed_via": "sips",
               "compressed_out_ext": "jpg", "compressed_alpha": False}
        if best > budget:
            row["over_budget"] = True
        return row
    except OSError:
        return None
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)


def export_media(pkg, images, outdir, pillow_ok, export_all=False):
    media_dir = os.path.join(outdir, "media-out")
    os.makedirs(media_dir, exist_ok=True)
    written = {}
    by_media = {i["media"]: i for i in images}
    rows = []
    for part in pkg.media:
        ext = part.rsplit(".", 1)[-1].lower()
        size = pkg.size_of(part)
        info = by_media.get(part)
        reasons = []
        if info:
            if info["repeat_fixed"]:
                reasons.append("repeat_fixed")
            if info["fullscreen"]:
                reasons.append("fullscreen")
            if info["variant_group"]:
                reasons.append("variant_group")
            if info["stitch_candidate"]:
                reasons.append("crop_stitch")
            if info.get("visible_instance_blocked"):
                reasons.append("visible_instance_fallback")
            if 0 < (info.get("max_w_pct") or 0) < SMALL_IMG_W_PCT and not info["fullscreen"]:
                # 小图（页内图标、角标）。不导出的话 L 层只能看着装饰容器里的空洞
                # 自己编图形，编出来的与模板无关。
                reasons.append("icon_candidate")
        if ext in ("svg", "emf", "wmf"):
            reasons.append("vector")
        row = {"media": part, "ext": ext, "bytes": size,
               "used_n": (info or {}).get("n", 0), "reasons": reasons,
               "candidate": bool(reasons)}
        if not reasons and not export_all:
            row["exported"] = False
            rows.append(row)
            continue
        raw = pkg.zip.read(part)
        if ext == "svg":
            body = raw.decode("utf-8", "replace")
            row["embedded_raster"] = "data:image/" in body
        out_name = os.path.basename(part)
        dst_path = os.path.join(media_dir, out_name)
        if dst_path in written:
            # 两个 media part 落到同一个输出名。不覆盖——覆盖等于悄悄换掉一张图。
            row["export_name_conflict"] = written[dst_path]
            out_name = "%s~%d%s" % (os.path.splitext(out_name)[0], len(written),
                                    os.path.splitext(out_name)[1])
            dst_path = os.path.join(media_dir, out_name)
        written[dst_path] = part
        with open(dst_path, "wb") as f:
            f.write(raw)
        row.update({"exported": True, "out": "media-out/" + out_name,
                    "out_bytes": len(raw), "transcoded": False,
                    "exported_reason": "candidate" if reasons else "all-media"})
        if not reasons:
            # Exported for eyeballing only. Transcode stays a candidate-only
            # concern, so this row deliberately gets no needs_transcode.
            rows.append(row)
            continue
        needs = []
        if ext not in WEB_FORMATS:
            needs.append("non-web-format")
        if len(raw) > ASSET_BUDGET_BYTES:
            needs.append("over-%dKB" % (ASSET_BUDGET_BYTES // 1024))
        # svg is already web-native; its raster payload is checked above, and
        # rasterising it here would throw away the vector original.
        if needs and ext != "svg":
            row["needs_transcode"] = needs
            # 压缩产物必须用**完整原名**当前缀：只去掉扩展名的话，image4.png 的压缩版
            # 就叫 image4.webp —— 而 ppt/media/image4.webp 往往是另一张真实存在的图，
            # 两者抢同一个输出名，后写的覆盖先写的，且全程无人报错。实测某模板因此把
            # 一张 109x109 的小图标当成了整页背景。
            base = os.path.join(media_dir, out_name + "-min")
            done, why = None, "pillow-unavailable" if not pillow_ok else None
            if pillow_ok:
                try:
                    done = _webp_from_pillow(raw, base + ".webp", ASSET_BUDGET_BYTES)
                    done["compressed_out"] = ("media-out/"
                                              + os.path.basename(base) + ".webp")
                except Exception as exc:
                    why = "pillow-error: %s: %s" % (exc.__class__.__name__, exc)
            if done is None:
                done = _webp_from_sips(part, raw, base, ASSET_BUDGET_BYTES)
                if done is not None:
                    done["compressed_out"] = ("media-out/" + os.path.basename(base)
                                              + "." + done["compressed_out_ext"])
                    done["transcode_fallback_from"] = why
            row.update(done if done is not None else {"transcode_blocked": why})
        elif needs:
            row["needs_transcode"] = needs
        rows.append(row)
    rows.sort(key=lambda r: (not r["candidate"], -r["bytes"]))
    return rows


# ---------------------------------------------------- rendered backgrounds
def _is_full_canvas_picture(shape):
    return (shape.get("kind") == "pic" and shape.get("media")
            and not shape.get("hidden")
            and (shape.get("w_pct") or 0) >= 95
            and (shape.get("h_pct") or 0) >= 95)


def _shape_has_visible_text(shape):
    text = shape.get("text") or {}
    for paragraph in text.get("paragraphs") or []:
        for run in paragraph.get("runs") or []:
            if str(run.get("text") or "").strip():
                return True
    return False


def _is_full_canvas_fill_overlay(shape):
    fill = shape.get("fill") or {}
    geometry = shape.get("geom") or {}
    line = shape.get("line") or {}
    return (shape.get("kind") == "sp" and not shape.get("hidden")
            and fill.get("type") in ("solid", "gradient")
            and not fill.get("path")
            and geometry.get("prst") == "rect"
            and not shape.get("rot")
            and not line.get("color") and not line.get("gradient")
            and not _shape_has_visible_text(shape)
            and (shape.get("w_pct") or 0) >= 95
            and (shape.get("h_pct") or 0) >= 95)


def _picture_has_appearance(shape):
    return bool(shape.get("flipH") or shape.get("flipV") or shape.get("rot")
                or shape.get("crop")
                or (shape.get("opacity") is not None and shape.get("opacity") != 1.0))


def _effective_background(parts, bg_by_part):
    background = None
    for part in parts:
        if bg_by_part.get(part):
            background = bg_by_part[part]
    return background


def _draw_picture(canvas, shape, pkg, image_cache=None):
    """Replay one p:pic's crop, flip, rotation and blip opacity with Pillow."""
    from PIL import Image, ImageEnhance, ImageOps

    media = shape.get("media")
    if media not in pkg.names:
        return False
    image_cache = image_cache if image_cache is not None else {}
    box = shape.get("box_unrotated") or shape.get("box") or {}
    if media not in image_cache:
        try:
            source = Image.open(io.BytesIO(pkg.zip.read(media))).convert("RGBA")
            source.load()
            image_cache[media] = source
        except Exception:
            return False
    picture = image_cache[media].copy()

    crop = shape.get("crop") or {}
    left = max(0.0, min(float(crop.get("l", 0) or 0), 100.0))
    top = max(0.0, min(float(crop.get("t", 0) or 0), 100.0))
    right = max(0.0, min(float(crop.get("r", 0) or 0), 100.0))
    bottom = max(0.0, min(float(crop.get("b", 0) or 0), 100.0))
    bounds = (
        int(round(picture.width * left / 100.0)),
        int(round(picture.height * top / 100.0)),
        int(round(picture.width * (1.0 - right / 100.0))),
        int(round(picture.height * (1.0 - bottom / 100.0))),
    )
    if bounds[2] > bounds[0] and bounds[3] > bounds[1]:
        picture = picture.crop(bounds)

    width = max(1, int(round(box.get("w") or 0)))
    height = max(1, int(round(box.get("h") or 0)))
    resampling = getattr(Image, "Resampling", Image)
    picture = picture.resize((width, height), resampling.LANCZOS)
    if shape.get("flipH"):
        picture = ImageOps.mirror(picture)
    if shape.get("flipV"):
        picture = ImageOps.flip(picture)
    opacity = shape.get("opacity")
    if opacity is not None:
        picture.putalpha(ImageEnhance.Brightness(picture.getchannel("A")).enhance(
            max(0.0, min(float(opacity), 1.0))))

    rotation = float(shape.get("rot") or 0)
    if rotation:
        picture = picture.rotate(-rotation, resample=resampling.BICUBIC, expand=True)
    center_x = float(box.get("x") or 0) + width / 2.0
    center_y = float(box.get("y") or 0) + height / 2.0
    x = int(round(center_x - picture.width / 2.0))
    y = int(round(center_y - picture.height / 2.0))
    layer = Image.new("RGBA", canvas.size)
    layer.alpha_composite(picture, (x, y))
    canvas.alpha_composite(layer)
    return True


def _visible_picture_instance(shape, pkg, image_cache=None):
    """Render one non-background picture exactly as its PPT instance appears."""
    from PIL import Image

    bounds = shape.get("box") or {}
    source_box = shape.get("box_unrotated") or bounds
    width = max(1, int(round(bounds.get("w") or 0)))
    height = max(1, int(round(bounds.get("h") or 0)))
    if not source_box.get("w") or not source_box.get("h"):
        return None
    local = dict(shape)
    local["box_unrotated"] = {
        "x": float(source_box.get("x") or 0) - float(bounds.get("x") or 0),
        "y": float(source_box.get("y") or 0) - float(bounds.get("y") or 0),
        "w": source_box["w"],
        "h": source_box["h"],
    }
    canvas = Image.new("RGBA", (width, height))
    if not _draw_picture(canvas, local, pkg, image_cache):
        return None
    return canvas if canvas.getchannel("A").getbbox() else None


def _save_picture_instance_webp(canvas, path):
    """Keep the instance alpha and shrink only after lossless output exceeds budget."""
    def write(options):
        temporary = path + ".tmp"
        try:
            canvas.save(temporary, "WEBP", **options)
            size = os.path.getsize(temporary)
            os.replace(temporary, path)
            return size
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    try:
        size = write({"lossless": True, "method": 0})
    except Exception as exc:
        return "pillow-error: %s: %s" % (exc.__class__.__name__, exc)
    if size <= ASSET_BUDGET_BYTES:
        return None
    for quality in (95, 90, 85, 75):
        try:
            size = write({"quality": quality, "method": 6})
        except Exception:
            return None
        if size <= ASSET_BUDGET_BYTES:
            return None
    return None


def export_visible_picture_instances(pkg, shapes, outdir, pillow_ok, blocked=None):
    """Replace transformed local pictures with rendered media consumers can reuse.

    A raw media file cannot reproduce an instance-level crop, rotation, flip, or
    opacity. Flattening only those non-fullscreen instances keeps the downstream
    contract simple: every asset still resolves through ordinary ``source_media``.
    """
    if not pillow_ok:
        return []
    try:
        from PIL import Image  # noqa: F401
    except Exception:
        return []

    media_dir = os.path.join(outdir, "media-out")
    os.makedirs(media_dir, exist_ok=True)
    blocked = blocked if blocked is not None else {}
    rows_by_media, rendered_specs, image_cache = {}, {}, {}
    for shape in shapes:
        if (shape.get("kind") != "pic" or shape.get("hidden")
                or not shape.get("media") or shape.get("media") not in pkg.names
                or _is_full_canvas_picture(shape) or not _picture_has_appearance(shape)):
            continue
        source = shape["media"]
        source_box = shape.get("box_unrotated") or shape.get("box") or {}
        visible_box = shape.get("box") or {}
        spec = json.dumps({
            "source": source,
            "source_size": [source_box.get("w"), source_box.get("h")],
            "visible_size": [visible_box.get("w"), visible_box.get("h")],
            "crop": shape.get("crop") or {},
            "flipH": bool(shape.get("flipH")),
            "flipV": bool(shape.get("flipV")),
            "rot": shape.get("rot") or 0,
            "opacity": shape.get("opacity", 1.0),
        }, ensure_ascii=False, sort_keys=True)
        media = rendered_specs.get(spec)
        if media is None:
            canvas = _visible_picture_instance(shape, pkg, image_cache)
            if canvas is None:
                continue
            digest = hashlib.sha256(spec.encode("utf-8")).hexdigest()[:16]
            media = "generated/instance/picture-%s.webp" % digest
            out = "media-out/" + os.path.basename(media)
            path = os.path.join(outdir, out)
            if not os.path.exists(path):
                reason = _save_picture_instance_webp(canvas, path)
                if reason:
                    row = blocked.setdefault(source, {
                        "reason": reason, "attempted_specs": 0, "part_refs": [],
                    })
                    row["attempted_specs"] += 1
                    row["part_refs"].append(shape.get("part"))
                    shape["visible_instance_blocked"] = reason
                    rendered_specs[spec] = False
                    continue
            rendered_specs[spec] = media
            rows_by_media[media] = {
                "media": media,
                "ext": "webp",
                "bytes": os.path.getsize(path),
                "used_n": 0,
                "reasons": ["visible_picture_instance"],
                "candidate": True,
                "exported": True,
                "out": out,
                "out_bytes": os.path.getsize(path),
                "transcoded": False,
                "generated": True,
                "rendered_from": source,
                "rendered_with": {
                    key: shape[key] for key in ("crop", "flipH", "flipV", "rot", "opacity")
                    if shape.get(key) not in (None, False, {}, 0, 1.0)
                },
                "part_refs": [],
            }
        elif media is False:
            blocked[source]["part_refs"].append(shape.get("part"))
            shape["visible_instance_blocked"] = blocked[source]["reason"]
            continue
        row = rows_by_media[media]
        row["used_n"] += 1
        row["part_refs"].append(shape.get("part"))
        shape["media"] = media
        shape.pop("media_svg", None)
        shape["rendered_from"] = source
    return list(rows_by_media.values())


def _draw_background(canvas, background, pkg, image_cache=None):
    """Draw the effective p:bg underneath picture layers."""
    from PIL import Image
    from render_pages import _grad_image, _grad_stops, _rgba, background_css

    css = background_css(background)
    canvas.paste(_rgba(css, (255, 255, 255, 255)),
                 (0, 0, canvas.width, canvas.height))
    gradient = _grad_stops(css or "")
    if gradient:
        canvas.alpha_composite(
            _grad_image(Image, canvas.width, canvas.height, gradient[0], gradient[1]))
    if background and background.get("type") == "image" and background.get("media"):
        _draw_picture(canvas, {
            "media": background["media"],
            "box_unrotated": {"x": 0, "y": 0, "w": canvas.width, "h": canvas.height},
            "crop": background.get("crop") or {},
        }, pkg, image_cache)


def _draw_background_fill_overlay(canvas, shape):
    """Draw one full-canvas fill shape that visually modifies a background image."""
    from PIL import Image
    from render_pages import _grad_image, _grad_stops, _rgba, css_color, css_gradient

    fill = shape.get("fill") or {}
    box = shape.get("box_unrotated") or shape.get("box") or {}
    width = max(1, int(round(box.get("w") or 0)))
    height = max(1, int(round(box.get("h") or 0)))
    x = int(round(box.get("x") or 0))
    y = int(round(box.get("y") or 0))
    if fill.get("type") == "solid":
        color = _rgba(css_color(fill.get("color")))
        if color is None:
            return False
        overlay = Image.new("RGBA", (width, height), color)
    elif fill.get("type") == "gradient":
        gradient = _grad_stops(css_gradient(fill) or "")
        if not gradient:
            return False
        overlay = _grad_image(Image, width, height, gradient[0], gradient[1])
    else:
        return False
    canvas.alpha_composite(overlay, (x, y))
    return True


def _background_layer_source(shape):
    if shape.get("kind") == "pic":
        return {
            "part": shape["part"], "kind": "picture", "media": shape["media"],
            "crop": shape.get("crop"), "flipH": bool(shape.get("flipH")),
            "flipV": bool(shape.get("flipV")), "rot": shape.get("rot") or 0,
            "opacity": shape.get("opacity", 1.0),
        }
    return {
        "part": shape["part"], "kind": "fill_overlay",
        "box": shape.get("box_unrotated") or shape.get("box"),
        "fill": shape.get("fill"),
    }


def _save_background_webp(canvas, path):
    """Prefer lossless output; fall back to a quality ladder when oversized."""
    canvas.convert("RGB").save(path, "WEBP", lossless=True, method=0)
    if os.path.getsize(path) <= ASSET_BUDGET_BYTES:
        return
    rgb = canvas.convert("RGB")
    for quality in (95, 90, 85, 75):
        rgb.save(path, "WEBP", quality=quality, method=6)
        if os.path.getsize(path) <= ASSET_BUDGET_BYTES:
            return


def compose_backgrounds(pkg, graph, shapes, bg_by_part, units, outdir, pillow_ok):
    """Flatten non-trivial full-canvas picture stacks into one web-safe asset."""
    if not pillow_ok:
        return {}, [], []
    try:
        from PIL import Image
    except Exception:
        return {}, [], []

    by_part = defaultdict(list)
    for shape in shapes:
        by_part[shape["part"]].append(shape)

    chains = {}
    for layout in pkg.layouts:
        master = graph["master_of_layout"].get(layout)
        show_master = pkg.xml(layout).get("showMasterSp", "1") != "0"
        chains[layout] = [part for part in ((master if show_master else None), layout) if part]
    for slide in pkg.slides:
        layout = graph["layout_of_slide"].get(slide)
        master = graph["master_of_layout"].get(layout)
        show_master = pkg.xml(slide).get("showMasterSp", "1") != "0"
        if layout:
            show_master = show_master and pkg.xml(layout).get("showMasterSp", "1") != "0"
        chains[slide] = [part for part in (
            (master if show_master else None), layout, slide) if part]

    media_dir = os.path.join(outdir, "media-out")
    os.makedirs(media_dir, exist_ok=True)
    part_map, rows_by_media, images_by_media, rendered_specs = {}, {}, {}, {}
    image_cache = {}
    for target, chain in chains.items():
        layers = [shape for part in chain for shape in by_part.get(part, [])
                  if _is_full_canvas_picture(shape) or _is_full_canvas_fill_overlay(shape)]
        pictures = [shape for shape in layers if shape.get("kind") == "pic"]
        if not pictures or (len(pictures) == 1 and not _picture_has_appearance(pictures[0])
                            and len(layers) == 1):
            continue
        source_layers = [_background_layer_source(shape) for shape in layers]
        spec = json.dumps({
            "background": _effective_background(chain, bg_by_part),
            "layers": [{k: v for k, v in layer.items() if k != "part"}
                       for layer in source_layers],
        }, ensure_ascii=False, sort_keys=True)
        media = rendered_specs.get(spec)
        if media is None:
            canvas = Image.new("RGBA", (units.w, units.h))
            _draw_background(
                canvas, _effective_background(chain, bg_by_part), pkg, image_cache)
            drawn = [
                shape for shape in layers
                if (_draw_picture(canvas, shape, pkg, image_cache)
                    if shape.get("kind") == "pic"
                    else _draw_background_fill_overlay(canvas, shape))
            ]
            if len(drawn) != len(layers):
                continue
            digest = hashlib.sha256(canvas.tobytes()).hexdigest()[:16]
            media = "generated/background/bg-composite-%s.webp" % digest
            out = "media-out/" + os.path.basename(media)
            path = os.path.join(outdir, out)
            if not os.path.exists(path):
                _save_background_webp(canvas, path)
            rendered_specs[spec] = media
        else:
            out = rows_by_media[media]["out"]
            path = os.path.join(outdir, out)
        part_map[target] = media
        row = rows_by_media.setdefault(media, {
            "media": media, "ext": "webp", "bytes": os.path.getsize(path),
            "used_n": 0, "reasons": ["background_composite"], "candidate": True,
            "exported": True, "out": out, "out_bytes": os.path.getsize(path),
            "transcoded": False, "generated": True, "composited_from": source_layers,
            "part_refs": [],
        })
        row["used_n"] += 1
        row["part_refs"].append(target)
        image = images_by_media.setdefault(media, {
            "media": media, "n": 0, "boxes": [], "exact_boxes": [],
            "fullscreen": True, "fullscreen_n": 0, "fullscreen_top_cluster_n": 0,
            "repeat_fixed": [], "max_w_pct": 100.0, "bleed": False,
            "crop_variants": [], "stitch_candidate": False,
            "svg_companion": None, "variant_group": [],
        })
        image["n"] += 1
        image["fullscreen_n"] += 1
        image["fullscreen_top_cluster_n"] += 1
        image["boxes"].append({
            "box": {"x": 0, "y": 0, "w": units.w, "h": units.h},
            "box_emu": {"x": 0, "y": 0, "cx": units.cx, "cy": units.cy},
            "count": 1, "exact_count": 1, "exact_variants": 1,
            "w_pct": 100.0, "h_pct": 100.0, "parts": [target],
            "layers": ["composite"],
        })
    return part_map, list(rows_by_media.values()), list(images_by_media.values())


# ---------------------------------------------------------------- form hint
# PowerPoint 出厂版式名（中英两套）。设计师起的名字是「这一页干什么用」，
# 出厂名只是「这个占位符组合叫什么」——后者不算模板声明了页型。
STOCK_LAYOUT_NAMES = {
    "default", "blank", "custom layout", "title slide", "title and content",
    "section header", "two content", "comparison", "title only",
    "content with caption", "picture with caption", "title and vertical text",
    "vertical title and text", "name card", "quote with caption", "true or false",
    "空白", "自定义版式", "标题幻灯片", "标题和内容", "节标题", "两栏内容", "比较",
    "仅标题", "内容与标题", "图片与标题", "标题和竖排文字", "竖排标题与文本",
}
_NUM_PREFIX = re.compile(r"^\s*\d+[\s._-]*")


def is_semantic_layout_name(name):
    """版式名是不是设计师起的「页型名」，而不是出厂名或纯编号。

    不能按字符数判断——中文页型名两个字就说清了（「封面」「目录」），任何长度门槛
    都会把整套 CJK 命名的模板判成没有语义版式，进而走错 form 分支。
    """
    n = _NUM_PREFIX.sub("", (name or "").strip())
    if not n or n.strip("0123456789 ._-") == "":
        return False
    return n.lower() not in STOCK_LAYOUT_NAMES


def form_hint(pkg, graph, layouts):
    slides_with_ph = 0
    for sp in pkg.slides:
        if pkg.xml(sp).findall(".//p:ph", NS):
            slides_with_ph += 1
    names = [(l["name"] or "") for l in layouts]
    semantic = sum(1 for n in names if is_semantic_layout_name(n))
    ev = {"slides_using_placeholders": "%d/%d" % (slides_with_ph, len(pkg.slides)),
          "layouts": len(pkg.layouts), "masters": len(pkg.masters),
          "semantic_layout_names": semantic}
    # 「模板自带页型声明」的判据是**比例**不是个数：一套只有 4 个版式但全部起了页型名的
    # 精简模板，和一套 30 个版式里 5 个有名字的模板，前者才是真的按页型组织的。
    semantic_ratio = semantic / float(len(pkg.layouts) or 1)
    ev["semantic_layout_ratio"] = round(semantic_ratio, 3)
    if slides_with_ph and semantic >= 2 and semantic_ratio >= 0.5:
        form = 3
    elif len(pkg.layouts) > 1 and not slides_with_ph:
        form = 2
    elif len(pkg.layouts) <= 1:
        form = 1
    else:
        form = 0
    ev["form"] = form
    ev["note"] = {1: "good deck as template: layouts carry no page semantics, "
                     "L5 must fall back to per-page slot tables",
                  2: "layouts exist only as background carriers",
                  3: "proper template: read page types straight from layouts",
                  0: "ambiguous"}[form]
    return ev


def confidence_seed(themes_picked, guides, layouts, form, spacing):
    non_factory = any(not t["factory_colors"] for t in themes_picked)
    return {
        "_rule": "direct read = high / single-signal inference = medium / "
                 "clustering or visual judgement = low",
        "canvas": "high",
        "theme_topology": "high",
        "colors": "high" if non_factory else "medium",
        "typography_family": "high",
        "typography_scale": "medium",
        "layouts": "high" if form == 3 else ("medium" if form == 2 else "low"),
        "assets": "low",
        "safe_area": "medium" if guides else "low",
        "spacing": "medium" if spacing["paddings"] else "low",
        "components": "low",
    }


# ------------------------------------------------------------- S12 ref writer
def fmt_color(c):
    if not c:
        return "-"
    if c.get("unresolved"):
        return "?%s" % c["unresolved"]
    return c.get("resolved") or c.get("hex") or "-"


def fmt_fill(f):
    if not f:
        return None
    t = f.get("type")
    if t == "solid":
        return fmt_color(f.get("color"))
    if t == "gradient":
        return "grad[%s]@%s" % (" | ".join("%s%%=%s" % (s["pos"], fmt_color(s["color"]))
                                           for s in f["stops"]), f.get("angle_deg"))
    if t == "image":
        return "image(%s%s)" % (f.get("media"), " crop" if f.get("crop") else "")
    if t == "none":
        return "noFill"
    return t


def render_shapes_txt(units, parts_ordered, shapes, bg_by_part):
    L = ["CANVAS %dx%d px  (sldSz %d x %d EMU, 1 px = %.1f EMU)"
         % (units.w, units.h, units.cx, units.cy, units.emu_per_px), ""]
    by_part = defaultdict(list)
    for r in shapes:
        by_part[r["part"]].append(r)
    for part in parts_ordered:
        recs = by_part.get(part, [])
        L.append("=" * 100)
        L.append("%s   bg=%s   shapes=%d" % (part, fmt_fill(bg_by_part.get(part)), len(recs)))
        L.append("=" * 100)
        for r in recs:
            ind = "  " * (r.get("depth", 0) + 1)
            b = r.get("box") or {}
            head = "%s[%s]" % (ind, r["kind"])
            if r.get("name"):
                head += " %r" % r["name"]
            if r.get("ph"):
                head += " ph=%s/%s" % (r["ph"]["type"], r["ph"].get("idx"))
            if b:
                head += " box=(%s,%s %sx%s)" % (b.get("x"), b.get("y"), b.get("w"), b.get("h"))
            else:
                head += " box=inherited"
            for k, label in (("rot", "rot"), ("flipH", "flipH"), ("flipV", "flipV"),
                             ("placement", "place"), ("radius_px", "r")):
                if r.get(k) not in (None, False):
                    head += " %s=%s" % (label, r[k])
            if r.get("geom"):
                head += " geom=%s" % r["geom"]["prst"]
                if r["geom"].get("adj"):
                    head += "(%s)" % ",".join("%s=%s" % kv for kv in r["geom"]["adj"].items())
            if r.get("fill"):
                head += " fill=%s" % fmt_fill(r["fill"])
            if r.get("line"):
                ln = r["line"]
                head += " line=%s/%spx" % (fmt_color(ln.get("color")), ln.get("w_px"))
            if r.get("effects"):
                head += " fx=%s" % ",".join(e["type"] for e in r["effects"])
            if r.get("media"):
                head += " media=%s" % r["media"]
            if r.get("crop"):
                head += " crop=%s" % r["crop"]
            L.append(head)
            text = r.get("text") or {}
            if text.get("bodyPr"):
                L.append("%s    bodyPr=%s" % (ind, text["bodyPr"]))
            for lvl, d in (text.get("lstStyle") or {}).items():
                L.append("%s    TYPE %s: %s" % (ind, lvl, d))
            for p in text.get("paragraphs", []):
                meta = {k: v for k, v in p.items() if k != "runs"}
                txt = "".join(run.get("text") or "" for run in p.get("runs", []))
                styles = []
                for run in p.get("runs", []):
                    st = {k: (fmt_color(v) if k == "color" else v)
                          for k, v in run.items() if k != "text"}
                    if st and st not in styles:
                        styles.append(st)
                if not txt and not styles:
                    continue
                L.append("%s    p%s: %r" % (ind, (" " + str(meta)) if meta else "", txt))
                for st in styles:
                    L.append("%s      run %s" % (ind, st))
        L.append("")
    return "\n".join(L)


REF_NOTES = """# ref/ 审计层说明（S12）

本目录是确定性脚本层的审计产物，随包可剥离。所有数值的唯一来源是 extract.json；
本目录补充「原始 token / 取舍理由 / 逐条溯源」，供人工与 check 复核。

| 文件 | 内容 |
|---|---|
| shapes.txt | S4 shape-facts 全量 dump（人类可读） |
| shapes.json | S4 shape-facts 机器版（extract.json 的 `shapes_ref` 指向这里；按 `part` 过滤取用，不整读） |
| color-freq-raw.json | S6 频次原表：逐条 (part, layer, class, raw token, resolved) |
| font-clusters.json | S6 字体聚类表：family -> variants(raw/weight/是否 31 字符截断) |
| masters-triage.json | S2 母版三分裁决：picked/dropped/理由/主母版（仅冲突裁决用） |
| layout-trace.json | S7 版式清单 + 跨母版孪生对 + 占位符几何签名 |
| s5-acceptance.json | S5 验收对照：每图 EMU 原值 + px 归一值 + 精确/epsilon 两种计数 |
| guides.json | S8 参考线（含按 part 分布，用于证明 master 级不存在） |
| perf.json | 各模块耗时（不进 extract.json 正文） |

## 已知近似与口径（实现与方案 v0.2 的偏差都记在这里）

1. **颜色变换**：lumMod/lumOff/satMod/satOff 在 HSL 空间计算；shade/tint 在线性 RGB
   空间计算（`C' = C*f` / `C' = C*f + (1-f)`）。ECMA-376 未给逐位算法，此为通行近似。
2. **bgRef 未展开**：`p:bgRef idx=1001` 指向 theme 的 bgFillStyleLst，脚本不展开该
   图案，只解析其内联 schemeClr（即 phClr）作为背景有效色，并在字段里标注 note。
3. **不解样式继承**：占位符/lstStyle/txStyles 的继承链不解（PRD 约束）。只直读各层
   自己声明的值；schemeClr→clrMap→clrScheme 的*引用解析*照做（不做则 P0 无输出）。
4. **S6 XPath 口径**（写死并逐项声明）：design = `a:solidFill//` 下的颜色 + 渐变
   `a:gs` 的直接子颜色 + `p:bgRef` 的直接子颜色；editor = `p15:clr`（参考线）；
   aux = `a:buClr` 与 `p:style/a:*Ref`。effectLst 内的阴影色不计入频次。
5. **S5 计数双口径**：`exact_boxes` 是坐标完全一致的计数（可与逐形状人工点数对齐）；
   `boxes[]` 是 ±0.5%（{eps:.1f}px）epsilon 聚类计数，会把微偏移的同位实例并进同一簇。
   两者都落盘，差异即「容差带来的合并」。
6. **满屏判定独立阈值**：w ≥ {fs}% 且 h ≥ {fs}%，上不封顶；出血图（>100%）同样计入满屏。
7. **画布外三分类**：完全出界 → 从 `ref/shapes.json` 剔除（计数留 counts）；
   出血 ≤5% → 保留并标 `bleed`；>5% → clamp 到边界并记 `box_before_clamp`。
   **图片普查（S5）不做剔除**，出界实例带 `placement` 标记仍计入，以免漏掉证据。
8. **字体跨文字系统别名不自动合并**：中文名与拉丁名（方正兰亭黑Pro ↔ FZLanTingHeiPro）
   保持为两个 family，只给 `alias_group` 提示，合并交阶段二 L4 判断。
9. **段落级 `a:pPr/a:defRPr` 的采集与去重**：它是「该段 run 的默认值」，Mac Office /
   Keynote 导出的 deck 把字号字体写在这一层。计数时段内 run 已显式声明的就不重复计
   （字号整段判定，字体按 latin/ea/cs 分槽判定），`sources` 里单列 `pPr` 类别。
10. **空段落声明：`text_scale` 与 `font_families` 口径不同，是有意为之。**
    只有 `<a:endParaRPr/>`、零 `a:r` 的段落渲染不出任何字形。
    - `text_scale` **直接跳过**这类段落：字号轴服务排版消费，渲染不出的字号进轴只会污染
      L9 的档位归纳。
    - `font_families` **收进来但单列** `sources.pPr_empty`，且不计入 `rendered_n`；
      只有空段声明的 family 打 `renders_no_text`，排序按 `rendered_n` 降权。
      目的是既保留审计可见性（脚手架字体确实被声明过），又不让一个不承载任何可见文字的
      字体在频次上压过真正在排版的字体。
    **消费侧规则：判"这个字体/字号有没有在用"一律看 `rendered_n`，不要看 `n`。**
11. **主题字体占位符按实名计数**：`+mj-lt` / `+mn-ea` 等沿母版链绑定 theme 的 fontScheme
    解析成实名后计数（与 schemeClr 同哲学），来源占位符记在 `theme_refs`。
    主题槽位显式为空串（`<a:cs typeface=""/>`）视为「不指定」而丢弃，**不是**解析失败；
    只有压根没有可用 fontScheme 才保留占位符并标 `unresolved_theme_ref`。
"""


def dump_source(pkg, outdir):
    """把 PPTX 解压后的原文原样落到 ref/source/。

    普查是有损的：它按既定口径抽数，抽不到的、口径外的东西就没了。遇到判断不了的
    情况（这个形状为什么这么摆、某个字段是什么意思），能直接翻原始 XML 比对着二手
    数据猜可靠得多。只进中间产物，交付包里没有。
    """
    dst = os.path.abspath(os.path.join(outdir, "ref", "source"))
    n = 0
    for name in pkg.zip.namelist():
        if name.endswith("/"):
            continue
        p = os.path.abspath(os.path.join(dst, *name.split("/")))
        # zip 条目名是文件里写什么就是什么，带 ../ 就能写到 ref/source 外面去
        # （pptx 是用户上传的，当不可信输入处理）。落在目录外的条目一律不落盘。
        if not p.startswith(dst + os.sep):
            continue
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "wb") as f:
            f.write(pkg.zip.read(name))
        n += 1
    return n


def write_ref(outdir, payload, ref_data, units, parts_ordered, shapes, bg_by_part):
    ref = os.path.join(outdir, "ref")
    os.makedirs(ref, exist_ok=True)

    def dump(name, obj):
        with open(os.path.join(ref, name), "w") as f:
            json.dump(obj, f, ensure_ascii=False, indent=1)

    with open(os.path.join(ref, "shapes.txt"), "w") as f:
        f.write(render_shapes_txt(units, parts_ordered, shapes, bg_by_part))
    # Machine-readable twin of shapes.txt, and the sidecar extract.json points at.
    dump("shapes.json", {"schema": payload["schema"], "canvas": payload["canvas"],
                         "counts": {k: v for k, v in payload["counts"].items()
                                    if k.startswith("shapes")},
                         "shapes": ref_data["kept_shapes"]})
    dump("color-freq-raw.json", {"rows": ref_data["color_rows"],
                                 "aggregated": payload["color_freq"]})
    dump("font-clusters.json", payload["font_families"])
    dump("masters-triage.json", payload["masters"])
    dump("layout-trace.json", {"layouts": ref_data["layout_rows"],
                               "twin_pairs": payload["layout_twins"]["pairs"],
                               "unpaired": payload["layout_twins"]["unpaired"]})
    dump("s5-acceptance.json", ref_data["s5"])
    dump("content-clusters.json", ref_data["content_clusters"])
    dump("guides.json", ref_data["guides_detail"])
    dump("perf.json", ref_data["perf"])
    with open(os.path.join(ref, "notes.md"), "w") as f:
        f.write(REF_NOTES.format(eps=EPS_PX, fs=FULLSCREEN_MIN_PCT))


# --------------------------------------------------------------------- driver
def extract(pptx, outdir, export_all=False):
    t0 = time.time()
    perf = {}

    def mark(name, since):
        perf[name] = round(time.time() - since, 3)
        return time.time()

    os.makedirs(outdir, exist_ok=True)
    pillow_ok, pillow_note = probe_pillow()

    t = time.time()
    pkg = Package(pptx)                                                    # S1
    pres = pkg.xml("ppt/presentation.xml")
    sz = pres.find("p:sldSz", NS)
    cx, cy = int(sz.get("cx")), int(sz.get("cy"))
    units = Units(cx, cy)
    t = mark("S1_unpack", t)

    graph = build_graph(pkg)                                               # S2
    t = mark("S2_refs", t)

    themes_by_part = {tp: read_theme(pkg, tp) for tp in pkg.themes}        # S3
    clrmap_by_master = {mp: read_clrmap(pkg, mp) for mp in graph["master_order"]}
    theme_of, scheme_fallback = bind_themes(graph, themes_by_part)
    t = mark("S3_theme_clrmap", t)

    # S4: every shape of every master / layout / slide, in one px@1920 domain.
    shapes, bg_by_part, part_ctxs, txstyles = [], {}, [], {}
    parts_ordered = []
    for mp in graph["master_order"]:
        theme = theme_of.get(mp, {})
        ctx, recs, bg = read_part_shapes(pkg, mp, "master", units,
                                         clrmap_by_master.get(mp, {}),
                                         theme.get("clrScheme", {}), mp,
                                         graph["theme_of_master"].get(mp))
        shapes += recs
        bg_by_part[mp] = bg
        part_ctxs.append(ctx)
        parts_ordered.append(mp)
        txstyles[mp] = read_txstyles(pkg, mp, ctx)
    for lp in pkg.layouts:
        mp = graph["master_of_layout"].get(lp)
        theme = theme_of.get(mp, {})
        ctx, recs, bg = read_part_shapes(pkg, lp, "layout", units,
                                         clrmap_by_master.get(mp, {}),
                                         theme.get("clrScheme", {}), mp,
                                         graph["theme_of_master"].get(mp))
        shapes += recs
        bg_by_part[lp] = bg
        part_ctxs.append(ctx)
        parts_ordered.append(lp)
    for sp in pkg.slides:
        lp = graph["layout_of_slide"].get(sp)
        mp = graph["master_of_layout"].get(lp)
        theme = theme_of.get(mp, {})
        ctx, recs, bg = read_part_shapes(pkg, sp, "slide", units,
                                         clrmap_by_master.get(mp, {}),
                                         theme.get("clrScheme", {}), mp,
                                         graph["theme_of_master"].get(mp))
        shapes += recs
        bg_by_part[sp] = bg
        part_ctxs.append(ctx)
        parts_ordered.append(sp)
    t = mark("S4_shape_facts", t)

    layout_rows = layout_inventory(pkg, graph, shapes, bg_by_part)         # S7
    twin_pairs, unpaired = detect_twins(layout_rows)
    t = mark("S7_layouts_twins", t)

    triage = triage_masters(pkg, graph,                                    # S2 三分规则
                            [(p["a"], p["b"]) for p in twin_pairs])
    t = mark("S2_master_triage", t)

    topology = theme_topology(graph, triage, themes_by_part, clrmap_by_master,  # S13
                              bg_by_part, twin_pairs)
    t = mark("S13_topology", t)

    bg_images = []
    for part, bg in bg_by_part.items():
        if bg and bg.get("type") == "image" and bg.get("media"):
            layer = ("master" if part in graph["master_order"]
                     else "layout" if part in pkg.layouts else "slide")
            bg_images.append({"part": part, "layer": layer, "via": "bg",
                              "box": {"x": 0, "y": 0, "w": units.w, "h": units.h},
                              "box_emu": {"x": 0, "y": 0, "cx": cx, "cy": cy},
                              "crop": bg.get("crop"), "placement": "inside",
                              "w_pct": 100.0, "h_pct": 100.0, "in_group": False})
    instance_blocked = {}
    instance_media = export_visible_picture_instances(
        pkg, shapes, outdir, pillow_ok, instance_blocked)
    images, variant_groups = image_census(shapes, bg_images, units)        # S5
    t = mark("S5_image_census", t)

    color_freq, color_rows = color_census(pkg, part_ctxs)                  # S6
    fonts = font_census(shapes, txstyles, list(themes_by_part.values()),
                        font_scheme_by_part(pkg, graph, theme_of))
    t = mark("S6_color_font", t)

    guides = read_guides(pkg, units, ["ppt/presentation.xml"] + pkg.layouts
                         + graph["master_order"] + pkg.slides)             # S8
    guide_parts = Counter(g["part"].rsplit("/", 2)[-2] for g in guides)
    t = mark("S8_guides", t)

    scale = text_scale(shapes, txstyles)
    spacing = spacing_candidates(shapes, units)
    radii, geom_census, effects = radii_effects_census(shapes)
    t = mark("derived_censuses", t)

    media_rows = export_media(pkg, images, outdir, pillow_ok, export_all)  # S9
    for row in media_rows:
        if row["media"] in instance_blocked:
            row["visible_instance_blocked"] = instance_blocked[row["media"]]
    media_rows += instance_media
    background_composites, composite_media, composite_images = compose_backgrounds(
        pkg, graph, shapes, bg_by_part, units, outdir, pillow_ok)
    media_rows += composite_media
    images += composite_images
    t = mark("S9_media_export", t)

    # S5b + S14 run after S9 because the palette only covers exported assets.
    source_images = [i for i in images if i["media"] in pkg.names]
    fps = media_fingerprints(pkg, [i["media"] for i in source_images], pillow_ok)
    clusters, cluster_evidence = content_clusters(source_images, fps)
    exported = {m["media"] for m in media_rows if m.get("exported")}
    image_palette(images, fps, exported)
    t = mark("S5b_S14_content_palette", t)

    themes_picked = [themes_by_part[tp] for tp in graph["used_themes"] if tp in themes_by_part]
    form = form_hint(pkg, graph, layout_rows)
    dropped_shapes = [r for r in shapes if r.get("placement") == "outside"]
    kept_shapes = [r for r in shapes if r.get("placement") != "outside"]

    payload = {
        "schema": SCHEMA,
        "source": {
            "filename": os.path.basename(pptx),
            "bytes": os.path.getsize(pptx),
            "content_type_kind": pkg.kind,
            "is_template": pkg.kind == "template",
            "extracted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "pillow_available": pillow_ok,
        "pillow_note": ("transcode enabled" if pillow_ok else
                        "export-only degradation: %s" % pillow_note),
        "canvas": {
            "px": [units.w, units.h],
            "source": {"cx": cx, "cy": cy, "unit": "EMU"},
            "emu_per_px": round(units.emu_per_px, 4),
            "ratio": round(cx / float(cy), 3),
            "is_16_9": abs(cx / float(cy) - 16 / 9.0) < 0.01,
        },
        "form_hint": form,
        "theme_topology": topology,
        "themes": [dict(t, picked=(t["part"] in graph["used_themes"]))
                   for t in themes_by_part.values()],
        "theme_discovery": pkg.theme_discovery,
        "scheme_fallback": scheme_fallback,
        "masters": triage,
        "reference_graph": {
            "layout_of_slide": graph["layout_of_slide"],
            "master_of_layout": graph["master_of_layout"],
            "theme_of_master": graph["theme_of_master"],
            "slides_per_layout": graph["slides_per_layout"],
            "slides_per_master": graph["slides_per_master"],
            "orphan_themes": graph["orphan_themes"],
        },
        "layouts": [{k: v for k, v in r.items() if k != "ph_signature"} for r in layout_rows],
        # Instance pages carry their own p:bg; without this the only backgrounds
        # on record are the layouts', and per-page overrides vanish.
        "slides": [{"part": sp, "layout": graph["layout_of_slide"].get(sp),
                    "background": bg_by_part.get(sp)} for sp in pkg.slides],
        "layout_twins": {"pairs": twin_pairs, "unpaired": unpaired,
                         "pair_n": len(twin_pairs)},
        "guides": guides,
        "guides_by_layer": dict(guide_parts),
        "color_freq": color_freq,
        "font_families": fonts,
        "text_scale": scale,
        "spacing_candidates": spacing,
        "radii_census": radii,
        "geom_census": geom_census,
        "effects_census": effects,
        "images": images,
        "variant_groups": variant_groups,
        "media_clusters": clusters,
        "content_cluster_mode": ("sha256+dhash+pixel-confirm" if pillow_ok
                                 else "sha256-only"),
        "content_cluster_note": (
            "dHash(9x8) hamming <= %d prefilters candidates; a pair only merges when "
            "the 64x64 composited thumbnails also differ by <= %.1f mean channel value"
            % (DHASH_PREFILTER_MAX, PIXDIFF_MAX) if pillow_ok else
            "Pillow unavailable: byte-identical media only, no perceptual merging"),
        "palette_available": pillow_ok,
        "media": media_rows,
        "background_composites": background_composites,
        # S4 shape-facts dominate this file (roughly half its bytes) and stage 2 reads
        # them only when a derived statistic needs backing evidence, so they live in
        # a sidecar and extract.json keeps just the pointer plus the derived censuses.
        "shapes_ref": "ref/shapes.json",
        "confidence_seed": confidence_seed(themes_picked, guides, layout_rows,
                                           form["form"], spacing),
        "counts": {
            "slides": len(pkg.slides), "layouts": len(pkg.layouts),
            "masters": len(pkg.masters), "themes": len(pkg.themes),
            "media": len(pkg.media),
            "background_composites": len(composite_media),
            "shapes_total": len(shapes),
            "shapes_kept": len(kept_shapes),
            "shapes_dropped_off_canvas": len(dropped_shapes),
            "shapes_bleed": sum(1 for r in shapes if r.get("bleed")),
            "shapes_clamped": sum(1 for r in shapes if r.get("clamped")),
            "shapes_inherited_box": sum(1 for r in shapes
                                        if r.get("placement") == "inherited"),
            "content_clusters": len(clusters),
            "content_clusters_multi_media": sum(1 for c in clusters if c["member_n"] > 1),
            "media_exported": sum(1 for m in media_rows
                                  if m.get("exported") and not m.get("generated")),
            "media_instances": len(instance_media),
            "media_instance_blocked": len(instance_blocked),
            "media_transcoded": sum(1 for m in media_rows
                                    if m.get("transcoded") and not m.get("generated")),
            "media_transcode_blocked": sum(1 for m in media_rows
                                           if m.get("transcode_blocked")),
            "media_over_budget": sum(1 for m in media_rows if m.get("over_budget")),
            "guides": len(guides),
        },
    }

    ref_data = {
        "kept_shapes": kept_shapes,
        "color_rows": color_rows,
        "layout_rows": [dict(r, ph_signature=[list(s) for s in r["ph_signature"]])
                        for r in layout_rows],
        "guides_detail": {"by_part": dict(Counter(g["part"] for g in guides)),
                          "master_level_guides": sum(
                              1 for g in guides if "slideMaster" in g["part"]),
                          "guides": guides},
        "s5": {
            "canvas": {"px": [units.w, units.h], "emu": [cx, cy],
                       "emu_per_px": units.emu_per_px},
            "thresholds": {"epsilon_px": EPS_PX, "fullscreen_min_pct": FULLSCREEN_MIN_PCT,
                           "repeat_min": REPEAT_MIN},
            "images": [{
                "media": i["media"], "n": i["n"],
                "exact_boxes": i["exact_boxes"],
                "epsilon_clusters": [{"box": c["box"], "box_emu": c["box_emu"],
                                      "count": c["count"], "exact_count": c["exact_count"],
                                      "exact_variants": c["exact_variants"],
                                      "w_pct": c["w_pct"], "h_pct": c["h_pct"]}
                                     for c in i["boxes"]],
                "fullscreen_n": i["fullscreen_n"],
                "fullscreen_top_cluster_n": i["fullscreen_top_cluster_n"],
                "max_w_pct": i["max_w_pct"], "bleed": i["bleed"],
                "crop_variants": i["crop_variants"],
                "variant_group": i["variant_group"],
            } for i in images],
            "variant_groups": variant_groups,
        },
        "content_clusters": {
            "mode": payload["content_cluster_mode"],
            "thresholds": {"dhash_prefilter_max": DHASH_PREFILTER_MAX,
                           "pixel_diff_max": PIXDIFF_MAX},
            "clusters": clusters,
            # Every pair the prefilter admitted, merged or not — the rejections are
            # the evidence that near-miss assets stayed apart.
            "pair_evidence": sorted(cluster_evidence,
                                    key=lambda e: (e["level"], e["dhash_distance"])),
            "fingerprints": {m: {k: v for k, v in f.items() if not k.startswith("_")}
                             for m, f in fps.items()},
        },
        "perf": perf,
    }

    out_json = os.path.join(outdir, "extract.json")
    with open(out_json, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=1)
    write_ref(outdir, payload, ref_data, units, parts_ordered, shapes, bg_by_part)
    src_n = dump_source(pkg, outdir)
    perf["total"] = round(time.time() - t0, 3)
    with open(os.path.join(outdir, "ref", "perf.json"), "w") as f:
        json.dump(perf, f, ensure_ascii=False, indent=1)

    print("%s -> %s" % (os.path.basename(pptx), outdir))
    print("  canvas %dx%d px (sldSz %d x %d EMU)  form=%d  themes=%s (%s)"
          % (units.w, units.h, cx, cy, form["form"],
             topology["themes"], topology["mechanism"]))
    print("  shapes %d kept / %d dropped off-canvas / %d bleed / %d clamped"
          % (payload["counts"]["shapes_kept"], payload["counts"]["shapes_dropped_off_canvas"],
             payload["counts"]["shapes_bleed"], payload["counts"]["shapes_clamped"]))
    print("  colors %d  fonts %d  images %d  media exported %d/%d + %d composites  guides %d"
          % (len(color_freq), len(fonts), len(images),
             payload["counts"]["media_exported"], len(pkg.media),
             len(composite_media), len(guides)))
    print("  ref/source/ 原文 %d 个部件（判断不了时可直接翻）" % src_n)
    print("  extract.json %.1f KB  total %.2fs"
          % (os.path.getsize(out_json) / 1024.0, perf["total"]))
    return payload


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    flags = {a for a in argv[1:] if a.startswith("--")}
    unknown = flags - {"--export-all-media", "--no-draft"}
    if len(args) != 2 or unknown:
        if unknown:
            print("unknown option(s): %s" % " ".join(sorted(unknown)))
        print(__doc__)
        return 2
    if not os.path.isfile(args[0]):
        # 猜附件文件名是高频错误起手式，报错要把「去哪儿看真名」直接说清楚
        print("找不到 %s" % args[0])
        print("不要猜附件文件名。先列出真实文件：ls -la .agent/<conversation_id>/attachments/")
        print("目录里没有 .pptx / .potx 时，说明这次上传没有落成沙箱本地文件——"
              "如实告诉用户拿不到模板文件，不要退回附件文本摘要或自造配图当风格来源。")
        return 2
    extract(args[0], args[1], export_all="--export-all-media" in flags)
    if "--no-draft" not in flags:
        import subprocess
        d = os.path.join(os.path.dirname(os.path.abspath(__file__)), "draft.py")
        sys.stdout.flush()
        r = subprocess.run([sys.executable, d, args[1]])
        if r.returncode:
            # 普查产物已经齐了，缺的只是草案。重跑整条抽取会同样失败在这一步，
            # 所以给一个区别于成功的终止哨兵，并指明只需重跑 draft.py。
            print("EXTRACT_PARTIAL 普查产物齐全，草案生成失败："
                  "python3 -B scripts/draft.py %s 单独重跑看报错" % args[1])
            sys.stdout.flush()
            return 1
    # 最后一行是终止哨兵：stdout 被截断时退出码仍可能是 0，两个哨兵都没有就是没跑完。
    print("EXTRACT_OK %s" % os.path.join(args[1], "l-out"))
    sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
