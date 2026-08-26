#!/usr/bin/env python3
"""Focused regression tests for deterministic picture compositing."""
import io
import os
import sys
import tempfile
import unittest
from unittest import mock
from xml.etree import ElementTree as ET

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import extract  # noqa: E402
from census import image_census  # noqa: E402
from extract import (  # noqa: E402
    _draw_picture,
    _is_full_canvas_fill_overlay,
    compose_backgrounds,
    export_media,
    export_visible_picture_instances,
)
from ooxml import Units  # noqa: E402
from parts import walk_tree  # noqa: E402
from render_pages import background_css  # noqa: E402


class _Archive:
    def __init__(self, media, raw):
        self.names = {media}
        self.media = [media]
        self.zip = self
        self.raw = raw

    def read(self, media):
        if media not in self.names:
            raise KeyError(media)
        return self.raw

    def size_of(self, media):
        if media not in self.names:
            raise KeyError(media)
        return len(self.raw)


class _CompositeArchive(_Archive):
    def __init__(self, media, raw, slide):
        super().__init__(media, raw)
        self.layouts = []
        self.slides = [slide]

    @staticmethod
    def xml(_part):
        return {}


class _ShapeContext:
    def __init__(self, media):
        self.part = "ppt/slides/slide1.xml"
        self.layer = "slide"
        self.units = Units(1920, 1080)
        self.clrmap = {}
        self.clrscheme = {}
        self.media = media

    def media_of(self, _relationship_id):
        return self.media


def _png(pixels):
    image = Image.new("RGBA", (len(pixels), 1))
    image.putdata(pixels)
    output = io.BytesIO()
    image.save(output, "PNG")
    return output.getvalue()


class BackgroundCompositeTest(unittest.TestCase):
    def test_applies_flip_and_opacity_once(self):
        media = "ppt/media/source.png"
        package = _Archive(media, _png([(255, 0, 0, 255), (0, 0, 255, 255)]))
        canvas = Image.new("RGBA", (2, 1), (255, 255, 255, 255))

        drawn = _draw_picture(canvas, {
            "media": media,
            "box_unrotated": {"x": 0, "y": 0, "w": 2, "h": 1},
            "flipH": True,
            "opacity": 0.5,
        }, package)

        self.assertTrue(drawn)
        left, right = canvas.getpixel((0, 0)), canvas.getpixel((1, 0))
        self.assertEqual(left[:3], (128, 128, 255))
        self.assertEqual(right[:3], (255, 128, 128))
        self.assertEqual(left[3], 255)
        self.assertEqual(right[3], 255)

    def test_exports_a_cropped_rotated_visible_instance_from_a_near_blank_source(self):
        media = "ppt/media/source.png"
        source = Image.new("RGBA", (1000, 1000))
        for x in range(460, 540):
            for y in range(460, 540):
                source.putpixel((x, y), (15, 80, 160, 255))
        raw = io.BytesIO()
        source.save(raw, "PNG")
        package = _Archive(media, raw.getvalue())
        shape = {
            "kind": "pic",
            "media": media,
            "part": "ppt/slides/slide2.xml",
            "box_unrotated": {"x": 100, "y": 200, "w": 20, "h": 100},
            "box": {"x": 50, "y": 240, "w": 120, "h": 20},
            "crop": {"l": 40, "t": 40, "r": 40, "b": 40},
            "rot": 90,
        }

        with tempfile.TemporaryDirectory() as outdir:
            rows = export_visible_picture_instances(package, [shape], outdir, True)
            self.assertEqual(len(rows), 1)
            self.assertTrue(rows[0]["generated"])
            self.assertEqual(rows[0]["rendered_from"], media)
            self.assertTrue(shape["media"].startswith("generated/instance/"))

            rendered = Image.open(os.path.join(outdir, rows[0]["out"])).convert("RGBA")
            self.assertGreater(rendered.width, rendered.height)
            self.assertGreater(sum(pixel[3] for pixel in rendered.getdata()) / rendered.width
                               / rendered.height, 13)

    def test_instance_webp_writer_removes_partial_output_after_a_save_error(self):
        canvas = Image.new("RGBA", (1, 1), (15, 80, 160, 255))

        with tempfile.TemporaryDirectory() as outdir:
            path = os.path.join(outdir, "instance.webp")
            with mock.patch.object(Image.Image, "save", side_effect=OSError("webp unavailable")):
                reason = extract._save_picture_instance_webp(canvas, path)

            self.assertEqual("pillow-error: OSError: webp unavailable", reason)
            self.assertFalse(os.path.exists(path))
            self.assertFalse(os.path.exists(path + ".tmp"))

    def test_instance_webp_failure_keeps_the_source_media_and_records_the_reason(self):
        media = "ppt/media/source.png"
        package = _Archive(media, _png([(15, 80, 160, 255)]))
        shape = {
            "kind": "pic",
            "media": media,
            "part": "ppt/slides/slide2.xml",
            "layer": "slide",
            "box_unrotated": {"x": 0, "y": 0, "w": 100, "h": 100},
            "box": {"x": 0, "y": 0, "w": 100, "h": 100},
            "rot": 90,
        }

        with tempfile.TemporaryDirectory() as outdir:
            blocked = {}
            with mock.patch.object(
                    extract, "_save_picture_instance_webp",
                    return_value="pillow-error: OSError: webp unavailable"):
                rows = export_visible_picture_instances(
                    package, [shape], outdir, True, blocked)
            images, _ = image_census([shape], [], Units(1920, 1080))
            media_rows = export_media(package, images, outdir, True)

        self.assertEqual([], rows)
        self.assertEqual(media, shape["media"])
        self.assertTrue(images[0]["visible_instance_blocked"])
        self.assertTrue(media_rows[0]["candidate"])
        self.assertIn("visible_instance_fallback", media_rows[0]["reasons"])
        self.assertEqual({
            media: {
                "reason": "pillow-error: OSError: webp unavailable",
                "attempted_specs": 1,
                "part_refs": ["ppt/slides/slide2.xml"],
            },
        }, blocked)

    def test_alpha_modulations_combine_for_a_visible_instance(self):
        media = "ppt/media/source.png"
        package = _Archive(media, _png([(20, 40, 60, 255)]))
        picture_tree = ET.fromstring("""
            <p:spTree xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
              <p:pic>
                <p:nvPicPr><p:cNvPr id="1" name="half-alpha"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
                <p:blipFill>
                  <a:blip r:embed="rId1">
                    <a:alphaMod amt="50000"/>
                    <a:alphaModFix amt="50000"/>
                  </a:blip>
                  <a:stretch><a:fillRect/></a:stretch>
                </p:blipFill>
                <p:spPr>
                  <a:xfrm><a:off x="0" y="0"/><a:ext cx="100" cy="100"/></a:xfrm>
                  <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                </p:spPr>
              </p:pic>
            </p:spTree>
        """)
        shapes = []
        walk_tree(picture_tree, _ShapeContext(media), shapes)

        self.assertEqual(shapes[0]["opacity"], 0.25)
        with tempfile.TemporaryDirectory() as outdir:
            rows = export_visible_picture_instances(package, shapes, outdir, True)
            self.assertEqual(len(rows), 1)
            rendered = Image.open(os.path.join(outdir, rows[0]["out"])).convert("RGBA")
            self.assertAlmostEqual(rendered.getpixel((50, 50))[3], 64, delta=2)

    def test_composites_full_canvas_gradient_and_solid_fill_overlays(self):
        media = "ppt/media/source.png"
        slide = "ppt/slides/slide1.xml"
        package = _CompositeArchive(media, _png([(0, 0, 255, 255)]), slide)
        picture = {
            "part": slide,
            "kind": "pic",
            "media": media,
            "box_unrotated": {"x": 0, "y": 0, "w": 2, "h": 1},
            "w_pct": 100,
            "h_pct": 100,
        }
        shape_base = {
            "geom": {"prst": "rect"},
            "line": {"none": True},
        }
        gradient_overlay = {
            **shape_base,
            "part": slide,
            "kind": "sp",
            "box_unrotated": {"x": 0, "y": 0, "w": 2, "h": 1},
            "w_pct": 100,
            "h_pct": 100,
            "fill": {
                "type": "gradient",
                "stops": [
                    {"pos": 0, "color": {"resolved": "rgba(255,0,0,0.5)"}},
                    {"pos": 100, "color": {"resolved": "rgba(255,0,0,0.5)"}},
                ],
                "angle_deg": 0,
            },
        }
        solid_overlay = {
            **shape_base,
            "part": slide,
            "kind": "sp",
            "box_unrotated": {"x": 0, "y": 0, "w": 2, "h": 1},
            "w_pct": 100,
            "h_pct": 100,
            "fill": {
                "type": "solid",
                "color": {"resolved": "rgba(0,255,0,0.5)"},
            },
        }
        text_overlay = dict(solid_overlay, text={
            "paragraphs": [{"runs": [{"text": "Do not flatten me"}]}],
        })

        self.assertTrue(_is_full_canvas_fill_overlay(gradient_overlay))
        self.assertFalse(_is_full_canvas_fill_overlay(text_overlay))
        self.assertFalse(_is_full_canvas_fill_overlay({
            **gradient_overlay,
            "fill": {**gradient_overlay["fill"], "path": "circle"},
        }))
        with tempfile.TemporaryDirectory() as outdir:
            part_map, rows, _ = compose_backgrounds(
                package,
                {"layout_of_slide": {}, "master_of_layout": {}},
                [picture, gradient_overlay, solid_overlay, text_overlay],
                {},
                Units(2, 1),
                outdir,
                True,
            )

            self.assertEqual(set(part_map), {slide})
            self.assertEqual(len(rows), 1)
            self.assertEqual(
                [layer["kind"] for layer in rows[0]["composited_from"]],
                ["picture", "fill_overlay", "fill_overlay"],
            )
            rendered = Image.open(os.path.join(outdir, rows[0]["out"])).convert("RGB")
            red, green, blue = rendered.getpixel((0, 0))
            self.assertGreater(red, 50)
            self.assertGreater(green, 100)
            self.assertGreater(blue, 50)

    def test_preserves_fill_and_picture_draw_order(self):
        media = "ppt/media/source.png"
        slide = "ppt/slides/slide1.xml"
        package = _CompositeArchive(media, _png([(0, 0, 255, 255)]), slide)
        overlay = {
            "part": slide,
            "kind": "sp",
            "geom": {"prst": "rect"},
            "line": {"none": True},
            "box_unrotated": {"x": 0, "y": 0, "w": 2, "h": 1},
            "w_pct": 100,
            "h_pct": 100,
            "fill": {"type": "solid", "color": {"resolved": "rgba(255,0,0,0.5)"}},
        }
        picture = {
            "part": slide,
            "kind": "pic",
            "media": media,
            "box_unrotated": {"x": 0, "y": 0, "w": 2, "h": 1},
            "w_pct": 100,
            "h_pct": 100,
        }

        with tempfile.TemporaryDirectory() as outdir:
            _, rows, _ = compose_backgrounds(
                package,
                {"layout_of_slide": {}, "master_of_layout": {}},
                [overlay, picture],
                {},
                Units(2, 1),
                outdir,
                True,
            )

            rendered = Image.open(os.path.join(outdir, rows[0]["out"])).convert("RGB")
            self.assertEqual(rendered.getpixel((0, 0)), (0, 0, 255))

    def test_path_gradient_background_is_not_linearized_for_compositing(self):
        media = "ppt/media/source.png"
        slide = "ppt/slides/slide1.xml"
        package = _CompositeArchive(media, _png([(0, 0, 255, 255)]), slide)
        picture = {
            "part": slide,
            "kind": "pic",
            "media": media,
            "box_unrotated": {"x": 0, "y": 0, "w": 2, "h": 1},
            "w_pct": 100,
            "h_pct": 100,
            "rot": 90,
        }
        background = {
            "type": "gradient",
            "path": "circle",
            "stops": [
                {"pos": 0, "color": {"resolved": "#FF0000"}},
                {"pos": 100, "color": {"resolved": "#00FF00"}},
            ],
        }

        self.assertIsNone(background_css(background))
        with tempfile.TemporaryDirectory() as outdir:
            _, rows, _ = compose_backgrounds(
                package,
                {"layout_of_slide": {}, "master_of_layout": {}},
                [picture],
                {slide: background},
                Units(2, 1),
                outdir,
                True,
            )

            rendered = Image.open(os.path.join(outdir, rows[0]["out"])).convert("RGB")
            self.assertEqual(rendered.getpixel((0, 0)), (0, 0, 255))


if __name__ == "__main__":
    unittest.main()
