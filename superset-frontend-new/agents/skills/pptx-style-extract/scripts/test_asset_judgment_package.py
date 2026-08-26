#!/usr/bin/env python3
"""Integration regression tests for model-decided image roles."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from check_v2 import Pack, RULES  # noqa: E402
from package import (
    apply_asset_decisions,
    bind_asset_vision_group_scopes,
    Fail,
    load_layout_blocks,  # noqa: E402
    main as package_main,
    validate_asset_vision_groups,
)


class AssetJudgmentPackageTest(unittest.TestCase):
    def test_asset_vision_index_requires_selected_candidates(self):
        with tempfile.TemporaryDirectory() as lout:
            with open(os.path.join(lout, "asset-vision-groups.json"),
                      "w", encoding="utf-8") as stream:
                json.dump({"version": 2}, stream)

            with self.assertRaisesRegex(Fail, "缺少 selected"):
                validate_asset_vision_groups(lout, {"asset_vision_groups": []})

    def test_asset_vision_groups_must_keep_every_extracted_candidate(self):
        with tempfile.TemporaryDirectory() as lout:
            with open(os.path.join(lout, "asset-vision-groups.json"),
                      "w", encoding="utf-8") as stream:
                json.dump({
                    "version": 2,
                    "selected": [{
                        "candidates": [{
                            "id": "asset-cover",
                            "source_media": "cover.png",
                            "placements": [{
                                "box": [100, 200, 300, 400],
                                "archetype": "cover",
                            }],
                        }, {
                            "id": "asset-ornament",
                            "source_media": "ornament.png",
                            "placements": [{
                                "box": [10, 20, 30, 40],
                                "archetype": "content",
                            }],
                        }],
                    }],
                }, stream)
            manifest = {
                "asset_vision_groups": [{
                    "id": "asset-cover",
                    "source_media": "cover.png",
                    "layout": "cover",
                    "box": "[100, 200, 300, 400]",
                    "visual_kind": "illustration",
                }, {
                    "id": "asset-ornament",
                    "source_media": "ornament.png",
                    "layout": "content",
                    "box": "[10, 20, 30, 40]",
                    "visual_kind": "decorative",
                }],
            }

            validate_asset_vision_groups(lout, manifest)
            manifest["asset_vision_groups"].pop()

            with self.assertRaisesRegex(Fail, "逐项保留抽取候选.*asset-ornament"):
                validate_asset_vision_groups(lout, manifest)

    def test_asset_vision_groups_reject_rewritten_extracted_candidate_scope(self):
        with tempfile.TemporaryDirectory() as lout:
            with open(os.path.join(lout, "asset-vision-groups.json"),
                      "w", encoding="utf-8") as stream:
                json.dump({
                    "version": 2,
                    "selected": [{
                        "candidates": [{
                            "id": "asset-ornament",
                            "source_media": "ornament.png",
                            "placements": [{
                                "box": [10, 20, 30, 40],
                                "archetype": None,
                            }],
                        }],
                    }],
                }, stream)
            manifest = {
                "asset_vision_groups": [{
                    "id": "asset-ornament",
                    "source_media": "other.png",
                    "box": "[10, 20, 30, 40]",
                    "visual_kind": "decorative",
                }],
            }

            with self.assertRaisesRegex(Fail, "改写了抽取候选的图片或位置"):
                validate_asset_vision_groups(lout, manifest)

    def test_v2_candidate_ids_resolve_same_box_on_different_layouts(self):
        with tempfile.TemporaryDirectory() as lout:
            with open(os.path.join(lout, "asset-vision-groups.json"),
                      "w", encoding="utf-8") as stream:
                json.dump({
                    "version": 2,
                    "selected": [{
                        "candidates": [{
                            "id": "asset-cover-logo",
                            "source_media": "shared.png",
                            "placements": [{
                                "box": [100, 200, 80, 80],
                                "archetype": "cover",
                            }],
                        }, {
                            "id": "asset-content-ornament",
                            "source_media": "shared.png",
                            "placements": [{
                                "box": [100, 200, 80, 80],
                                "archetype": "content",
                            }],
                        }],
                    }],
                }, stream)
            manifest = {
                "assets": [],
                "asset_vision_groups": [{
                    "id": "asset-cover-logo",
                    "source_media": "shared.png",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "logo",
                }, {
                    "id": "asset-content-ornament",
                    "source_media": "shared.png",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "decorative",
                }],
            }

            bind_asset_vision_group_scopes(lout, manifest)
            decisions, _ = apply_asset_decisions(
                manifest,
                bound_sources={"shared.png"},
                bound_slots={
                    "shared.png": {
                        ("cover", (100, 200, 80, 80)),
                        ("content", (100, 200, 80, 80)),
                    },
                },
            )

        self.assertEqual(
            decisions.for_scope("shared.png", "cover", (100, 200, 80, 80)),
            "logo",
        )
        self.assertEqual(
            decisions.for_scope("shared.png", "content", (100, 200, 80, 80)),
            "texture",
        )

    def test_legacy_asset_vision_index_accepts_a_group_default(self):
        with tempfile.TemporaryDirectory() as lout:
            with open(os.path.join(lout, "asset-vision-groups.json"),
                      "w", encoding="utf-8") as stream:
                json.dump({
                    "version": 1,
                    "selected": [{
                        "candidates": [{
                            "id": "asset-cover",
                            "source_media": "cover.png",
                            "placements": [{"box": [0, 0, 100, 100]}],
                        }, {
                            "id": "asset-ornament",
                            "source_media": "ornament.png",
                            "placements": [{"box": [10, 20, 30, 40]}],
                        }],
                    }],
                }, stream)
            manifest = {
                "asset_vision_groups": [{
                    "id": "vision-1",
                    "source_media": "[cover.png, ornament.png]",
                    "visual_kind": "decorative",
                }],
            }

            validate_asset_vision_groups(lout, manifest)

    def test_layout_controls_override_legacy_judgment_without_reading_layout_todos(self):
        with tempfile.TemporaryDirectory() as root:
            lout = os.path.join(root, "l-out")
            os.makedirs(lout)
            with open(os.path.join(lout, "layouts.yaml"), "w", encoding="utf-8") as stream:
                stream.write(
                    "names:\n"
                    "  content: TODO中文名\n"
                    "roles:\n"
                    "  content: TODO角色\n"
                    "layouts:\n"
                    "  content:\n"
                    "    slots:\n"
                    "      - {role: body, box: [10, 20, 30, 40], type: body}\n"
                    "    confidence: high\n"
                )
            with open(os.path.join(lout, "layout-controls.yaml"), "w", encoding="utf-8") as stream:
                stream.write(
                    'names:\n'
                    '  content: "内容页"\n'
                    'roles:\n'
                    '  content: content\n'
                )

            blocks = load_layout_blocks(lout)

            self.assertEqual([key for key, _, _ in blocks],
                             ["names", "roles", "layouts"])
            self.assertIn("内容页", blocks[0][2][0])
            self.assertIn("content", blocks[1][2][0])
            self.assertNotIn("TODO", "\n".join(
                line for _, _, lines in blocks for line in lines
            ))

    def test_layout_controls_reject_non_judgment_block(self):
        with tempfile.TemporaryDirectory() as root:
            lout = os.path.join(root, "l-out")
            os.makedirs(lout)
            with open(os.path.join(lout, "layouts.yaml"), "w", encoding="utf-8") as stream:
                stream.write("layouts:\n  content:\n    role: content\n")
            with open(os.path.join(lout, "layout-controls.yaml"), "w", encoding="utf-8") as stream:
                stream.write("layouts:\n  cover:\n    role: cover\n")

            with self.assertRaisesRegex(Fail, "只能包含"):
                load_layout_blocks(lout)

    def test_layout_controls_must_cover_all_legacy_judgment_blocks(self):
        with tempfile.TemporaryDirectory() as root:
            lout = os.path.join(root, "l-out")
            os.makedirs(lout)
            with open(os.path.join(lout, "layouts.yaml"), "w", encoding="utf-8") as stream:
                stream.write(
                    'names:\n'
                    '  content: "内容页"\n'
                    'roles:\n'
                    '  content: content\n'
                    'layouts:\n'
                    '  content:\n'
                    '    role: content\n'
                )
            with open(os.path.join(lout, "layout-controls.yaml"), "w",
                      encoding="utf-8") as stream:
                stream.write("roles:\n  content: content\n")

            with self.assertRaisesRegex(Fail, "缺：names"):
                load_layout_blocks(lout)

    def test_layout_controls_must_keep_each_legacy_judgment_entry(self):
        with tempfile.TemporaryDirectory() as root:
            lout = os.path.join(root, "l-out")
            os.makedirs(lout)
            with open(os.path.join(lout, "layouts.yaml"), "w", encoding="utf-8") as stream:
                stream.write(
                    'names:\n'
                    '  cover: "封面"\n'
                    '  content: "内容页"\n'
                    'roles:\n'
                    '  cover: cover\n'
                    '  content: content\n'
                    'layouts:\n'
                    '  cover:\n'
                    '    role: cover\n'
                    '  content:\n'
                    '    role: content\n'
                )
            with open(os.path.join(lout, "layout-controls.yaml"), "w",
                      encoding="utf-8") as stream:
                stream.write(
                    'names:\n'
                    '  cover: "封面"\n'
                    'roles:\n'
                    '  cover: cover\n'
                    '  content: content\n'
                )

            with self.assertRaisesRegex(Fail, "names 段缺少旧判断条目：content"):
                load_layout_blocks(lout)

    def test_package_strips_judgment_fields_and_preserves_content_slot(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow unavailable")

        with tempfile.TemporaryDirectory() as root:
            stage1 = os.path.join(root, "stage1")
            lout = os.path.join(stage1, "l-out")
            pack = os.path.join(root, "pack")
            media = os.path.join(stage1, "media-out")
            ref = os.path.join(stage1, "ref")
            os.makedirs(lout)
            os.makedirs(media)
            os.makedirs(ref)

            Image.new("RGBA", (40, 20), (20, 40, 60, 255)).save(
                os.path.join(media, "partner-logo.png"))
            Image.new("RGBA", (24, 24), (60, 40, 20, 255)).save(
                os.path.join(media, "ornament.png"))

            box_rows = [
                ("ppt/media/image1.png", "partner-logo.png", [100, 200, 400, 200]),
                ("ppt/media/image2.png", "ornament.png", [40, 40, 120, 120]),
            ]
            extract = {
                "source": {"filename": "fixture.pptx"},
                "canvas": {
                    "px": [1920, 1080],
                    "source": {"cx": 12192000, "cy": 6858000, "unit": "EMU"},
                },
                "media": [
                    {
                        "media": source,
                        "out": "media-out/" + output,
                        "source_px": [40, 20] if output == "partner-logo.png" else [24, 24],
                    }
                    for source, output, _ in box_rows
                ],
                "images": [
                    {
                        "media": source,
                        "boxes": [{
                            "count": 1,
                            "box": {"x": box[0], "y": box[1], "w": box[2], "h": box[3]},
                            "parts": ["ppt/slides/slide1.xml"],
                        }],
                    }
                    for source, _, box in box_rows
                ],
                "color_freq": [],
                "text_scale": [],
            }
            with open(os.path.join(stage1, "extract.json"), "w", encoding="utf-8") as stream:
                json.dump(extract, stream)
            with open(os.path.join(ref, "shapes.json"), "w", encoding="utf-8") as stream:
                json.dump({
                    "shapes": [
                        {
                            "part": "ppt/slides/slide1.xml",
                            "kind": "pic",
                            "name": output,
                            "box": {"x": box[0], "y": box[1], "w": box[2], "h": box[3]},
                        }
                        for _, output, box in box_rows
                    ],
                }, stream)

            with open(os.path.join(lout, "manifest.yaml"), "w", encoding="utf-8") as stream:
                stream.write(
                    "version: alpha\n"
                    "name: asset-judgment-fixture\n"
                    "description: >\n"
                    "  A restrained fixture with explicit image-role judgments and traced layout slots.\n"
                    "assets:\n"
                    "  - id: logo-primary\n"
                    "    source_media: partner-logo.png\n"
                    "    kind: logo\n"
                    "    on-bg: light\n"
                    "asset_vision_groups:\n"
                    "  - id: vision-1\n"
                    "    source_media: [partner-logo.png, ornament.png]\n"
                    "    visual_kind: content-image\n"
                    "asset_decisions:\n"
                    "  - source_media: ornament.png\n"
                    "    visual_kind: decorative\n"
                )
            with open(os.path.join(lout, "frontmatter.yaml"), "w", encoding="utf-8") as stream:
                stream.write("")
            with open(os.path.join(lout, "layouts.yaml"), "w", encoding="utf-8") as stream:
                stream.write(
                    'roles:\n'
                    '  content: TODO角色\n'
                    'layouts:\n'
                    '  content:\n'
                    '    name: "内容页"\n'
                    '    role: content\n'
                    '    slots:\n'
                    '      - {role: logo, box: [100, 200, 400, 200], type: pic, '
                    'asset: logo-primary, source_media: partner-logo.png}\n'
                    '      - {role: asset-candidate, box: [40, 40, 120, 120], type: pic, '
                    'source_media: ornament.png}\n'
                    '    confidence: high\n'
                )
            with open(os.path.join(lout, "layout-controls.yaml"), "w",
                      encoding="utf-8") as stream:
                stream.write("roles:\n  content: content\n")
            with open(os.path.join(lout, "body.md"), "w", encoding="utf-8") as stream:
                stream.write(
                    "## Usage\n\n"
                    "Read `layouts.md` before composing a slide.\n\n"
                    "## Assets\n\n"
                    "{{ASSET_TABLE}}\n\n"
                    "## Hard Rules\n\n"
                    "{{LOGO_RULES}}\n"
                )
            check_v1 = os.path.join(root, "check_v1.py")
            with open(check_v1, "w", encoding="utf-8") as stream:
                stream.write("raise SystemExit(0)\n")

            rc = package_main([stage1, lout, pack, "--check-v1", check_v1])

            self.assertEqual(rc, 0)
            with open(os.path.join(pack, "design.md"), encoding="utf-8") as stream:
                design = stream.read()
            with open(os.path.join(pack, "layouts.md"), encoding="utf-8") as stream:
                layouts = stream.read()
            self.assertNotIn("asset_decisions", design)
            self.assertNotIn("asset_vision_groups", design)
            self.assertNotIn("visual_kind", design)
            self.assertNotIn("source_media", design)
            self.assertNotIn("source_media", layouts)
            self.assertNotIn("TODO", layouts)
            self.assertNotIn("{{LOGO_RULES}}", design)
            self.assertNotIn("logo-primary", design)
            self.assertNotIn("logo-primary", layouts)
            self.assertIn(
                "- {role: pic, box: [100, 200, 400, 200], type: pic}",
                layouts,
            )
            self.assertIn("texture-1:", design)
            self.assertIn("kind: texture", design)
            self.assertIn(
                "- {role: texture, box: [40, 40, 120, 120], type: pic, asset: texture-1}",
                layouts,
            )
            gate = Pack(pack)
            self.assertFalse([
                result
                for result in (rule(gate) for rule in RULES)
                if result.fails
            ])

    def test_package_places_a_rendered_picture_instance_as_a_logo_asset(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow unavailable")

        with tempfile.TemporaryDirectory() as root:
            stage1 = os.path.join(root, "stage1")
            lout = os.path.join(stage1, "l-out")
            pack = os.path.join(root, "pack")
            media = os.path.join(stage1, "media-out")
            ref = os.path.join(stage1, "ref")
            os.makedirs(lout)
            os.makedirs(media)
            os.makedirs(ref)

            source = "generated/instance/picture-directory-logo.webp"
            output = "picture-directory-logo.webp"
            box = [1813, 18, 59, 228]
            Image.new("RGBA", (59, 228), (20, 60, 100, 255)).save(
                os.path.join(media, output), "WEBP")
            extract = {
                "source": {"filename": "fixture.pptx"},
                "canvas": {
                    "px": [1920, 1080],
                    "source": {"cx": 12192000, "cy": 6858000, "unit": "EMU"},
                },
                "media": [{
                    "media": source,
                    "out": "media-out/" + output,
                    "generated": True,
                    "rendered_from": "ppt/media/original-logo.png",
                }],
                "images": [{
                    "media": source,
                    "boxes": [{
                        "count": 1,
                        "box": dict(zip(("x", "y", "w", "h"), box)),
                        "parts": ["ppt/slides/slide2.xml"],
                    }],
                }],
                "color_freq": [],
                "text_scale": [],
            }
            with open(os.path.join(stage1, "extract.json"), "w", encoding="utf-8") as stream:
                json.dump(extract, stream)
            with open(os.path.join(ref, "shapes.json"), "w", encoding="utf-8") as stream:
                json.dump({"shapes": [{
                    "part": "ppt/slides/slide2.xml",
                    "kind": "pic",
                    "box": dict(zip(("x", "y", "w", "h"), box)),
                }]}, stream)
            with open(os.path.join(lout, "asset-vision-groups.json"),
                      "w", encoding="utf-8") as stream:
                json.dump({
                    "version": 2,
                    "selected": [{
                        "candidates": [{
                            "id": "asset-directory-logo",
                            "source_media": output,
                            "placements": [{
                                "slide": 2,
                                "archetype": "content",
                                "box": box,
                            }],
                        }],
                    }],
                    "omitted": [],
                }, stream)
            with open(os.path.join(lout, "manifest.yaml"), "w", encoding="utf-8") as stream:
                stream.write(
                    "version: alpha\n"
                    "name: rendered-instance-fixture\n"
                    "description: Rendered local PPT image instances remain reusable assets.\n"
                    "asset_vision_groups:\n"
                    "  - id: asset-directory-logo\n"
                    "    source_media: picture-directory-logo.webp\n"
                    "    box: [1813, 18, 59, 228]\n"
                    "    visual_kind: logo\n"
                )
            for name, content in (
                ("frontmatter.yaml", ""),
                ("body.md", "Read `layouts.md` before composing a slide.\n\n{{ASSET_TABLE}}\n"),
                ("layouts.yaml",
                 'layouts:\n'
                 '  content:\n'
                 '    name: "目录"\n'
                 '    role: content\n'
                 '    slots:\n'
                 '      - {role: asset-candidate, box: [1813, 18, 59, 228], type: pic, '
                 'source_media: picture-directory-logo.webp}\n'
                 '    confidence: high\n'),
            ):
                with open(os.path.join(lout, name), "w", encoding="utf-8") as stream:
                    stream.write(content)
            check_v1 = os.path.join(root, "check_v1.py")
            with open(check_v1, "w", encoding="utf-8") as stream:
                stream.write("raise SystemExit(0)\n")

            self.assertEqual(package_main([stage1, lout, pack, "--check-v1", check_v1]), 0)

            with open(os.path.join(pack, "design.md"), encoding="utf-8") as stream:
                design = stream.read()
            with open(os.path.join(pack, "layouts.md"), encoding="utf-8") as stream:
                layouts = stream.read()
            self.assertTrue(os.path.isfile(os.path.join(pack, "assets", "logos", "1.webp")))
            self.assertIn("logo-1:", design)
            self.assertIn("assets/logos/1.webp", design)
            self.assertIn(
                "- {role: logo, box: [1813, 18, 59, 228], type: pic, asset: logo-1}",
                layouts,
            )


if __name__ == "__main__":
    unittest.main()
