#!/usr/bin/env python3
"""Regression tests for the consumer-facing layout slot CSS contract."""
import os
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import draft  # noqa: E402
from check_v2 import Pack, rule_v2_16  # noqa: E402
from draft import (  # noqa: E402
    asset_vision_contexts,
    bound_visual_candidates,
    build_asset_vision_groups,
    contact_sheets,
    cover_background_media,
    draft_layouts,
    emit_asset_vision_groups,
    emit_layouts,
    emit_manifest,
    fullscreen_overlay_media,
    needs_asset_judgment,
    preserve_image_bearing_groups,
    select_asset_vision_groups,
    slide_image_marks,
    slot_style,
    visual_slot_candidates,
)
from package import (  # noqa: E402
    apply_asset_decisions,
    build_layouts_md,
    Fail,
    FONTSIZE_RE,
    resolve_asset_candidate_lines,
    split_top_blocks,
)


class LayoutCssTest(unittest.TestCase):
    def test_text_slot_emits_rendering_style_as_css_only(self):
        shape = {
            "text": {
                "bodyPr": {
                    "anchor": "ctr",
                    "insets_px": {"lIns": 12, "tIns": 8, "rIns": 10, "bIns": 6},
                    "rot": "900000",
                },
                "lstStyle": {
                    "lvl1pPr": {
                        "sz_px": 48,
                        "weight": 600,
                        "italic": True,
                        "underline": "sng",
                        "strike": "sngStrike",
                        "spc_px": 1.5,
                        "color": {"resolved": "#123456"},
                        "algn": "ctr",
                        "lnSpc": {"mult": 1.0},
                    },
                },
                "paragraphs": [],
            },
        }
        slot = {
            "role": "title",
            "type": "title",
            "box": [100, 80, 800, 160],
            "sz": 48,
            "txt": "标题",
        }
        slot.update(slot_style(shape))
        archetype = {
            "name": "layout-1",
            "zh": "标题页",
            "role": "content",
            "bg": None,
            "slots": [slot],
            "decor": [],
            "pages": [1],
            "rep": 1,
            "pic_n": 0,
            "confidence": "high",
        }

        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([archetype], output_dir)
            with open(os.path.join(output_dir, "layouts.yaml"), encoding="utf-8") as stream:
                layouts_yaml = stream.read()
            with open(os.path.join(output_dir, "layout-controls.yaml"), encoding="utf-8") as stream:
                layout_controls = stream.read()
            layouts_md = build_layouts_md(split_top_blocks(layouts_yaml), (1920, 1080))

        self.assertIn("names:", layout_controls)
        self.assertNotIn("\nlayouts:\n", layout_controls)
        self.assertNotIn("box: [100, 80, 800, 160]", layout_controls)
        self.assertIn(
            'css: "box-sizing: border-box; padding: 8px 10px 6px 12px; '
            'font-size: 48px; font-weight: 600; font-style: italic; '
            'text-decoration: underline line-through; letter-spacing: 1.5px; color: #123456; '
            'text-align: center; line-height: 1.2; display: flex; '
            'flex-direction: column; justify-content: center; rotate: 15deg"',
            layouts_md,
        )
        for legacy_key in ("size", "weight", "color", "align", "valign", "insets_px"):
            self.assertNotRegex(layouts_md, rf"[,{{]\s*{legacy_key}:")
        self.assertEqual(FONTSIZE_RE.findall(layouts_md), ["48"])

    def test_layout_gate_rejects_legacy_slot_style_keys(self):
        with tempfile.TemporaryDirectory() as pack_dir:
            with open(os.path.join(pack_dir, "design.md"), "w", encoding="utf-8") as stream:
                stream.write("---\nversion: alpha\nlayouts: layouts.md\n---\n\nRead layouts.md.\n")
            with open(os.path.join(pack_dir, "layouts.md"), "w", encoding="utf-8") as stream:
                stream.write(
                    "---\ncanvas: 1920x1080\nlayouts:\n  cover:\n    role: cover\n"
                    "    slots:\n      - {role: title, type: title, box: [0, 0, 800, 100], "
                    "size: 48, align: center}\n    confidence: high\n---\n"
                )

            result = rule_v2_16(Pack(pack_dir))

        self.assertEqual(result.level, "FAIL")
        self.assertEqual(len(result.fails), 1)
        self.assertIn("旧样式键 align/size", result.fails[0])

    def test_normautofit_fontscale_shrinks_emitted_font_size(self):
        # 章节大号数字：160px 字号靠 normAutofit fontScale 0.9 装进 144px 的框。
        # 不乘 fontScale，消费端拿到 160px，字比框高，渐变裁切把底部切成透明。
        shape = {
            "text": {
                "bodyPr": {"anchor": "t", "font_scale": 0.9, "ln_spc_reduction": 0.1},
                "lstStyle": {"lvl1pPr": {"sz_px": 160, "lnSpc": {"mult": 1.0}}},
                "paragraphs": [{"runs": [{"text": "01."}]}],
            },
        }
        style = slot_style(shape)
        self.assertIn("font-size: 144px", style["css"])
        self.assertNotIn("font-size: 160px", style["css"])
        # lnSpcReduction 0.1 把 1.0*1.2 的行高压到 1.08
        self.assertIn("line-height: 1.08", style["css"])

    def test_missing_autofit_leaves_font_size_untouched(self):
        # 无 normAutofit（或无 fontScale）时零影响：字号原样、行高不缩。
        shape = {
            "text": {
                "bodyPr": {"anchor": "t"},
                "lstStyle": {"lvl1pPr": {"sz_px": 160, "lnSpc": {"mult": 1.0}}},
                "paragraphs": [{"runs": [{"text": "01."}]}],
            },
        }
        style = slot_style(shape)
        self.assertIn("font-size: 160px", style["css"])
        self.assertIn("line-height: 1.2", style["css"])

    def test_run_level_style_is_emitted_from_flat_ooxml_record(self):
        # read_txbody 把 a:rPr 的属性直接展开到 run；没有嵌套 rPr 字段。
        shape = {
            "text": {
                "bodyPr": {"anchor": "t"},
                "paragraphs": [{
                    "runs": [{
                        "text": "品牌标题",
                        "sz_px": 52,
                        "weight": 700,
                        "latin": "Brand Sans",
                        "color": {"resolved": "#C1121F"},
                    }],
                }],
            },
        }

        style = slot_style(shape)

        self.assertIn("font-size: 52px", style["css"])
        self.assertIn(
            'font-family: "Brand Sans", "PingFang SC", "Microsoft YaHei", sans-serif',
            style["css"],
        )
        self.assertIn("font-weight: 700", style["css"])
        self.assertIn("color: #C1121F", style["css"])

    def test_run_level_style_overrides_inherited_list_style(self):
        shape = {
            "text": {
                "lstStyle": {
                    "lvl1pPr": {
                        "sz_px": 20,
                        "latin": "Inherited Sans",
                        "color": {"resolved": "#111111"},
                    },
                },
                "paragraphs": [{
                    "runs": [{
                        "text": "直接格式",
                        "sz_px": 52,
                        "latin": "Direct Sans",
                        "color": {"resolved": "#C1121F"},
                    }],
                }],
            },
        }

        style = slot_style(shape)

        self.assertIn("font-size: 52px", style["css"])
        self.assertIn('font-family: "Direct Sans"', style["css"])
        self.assertIn("color: #C1121F", style["css"])
        self.assertNotIn("font-size: 20px", style["css"])
        self.assertNotIn("Inherited Sans", style["css"])

    def test_asset_decisions_keep_content_slots_and_bind_texture_slots(self):
        manifest = {
            "assets": [],
            "asset_decisions": [
                {"source_media": "chart.png", "decision": "content"},
                {"source_media": "ornament.png", "decision": "texture"},
            ],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)
        lines = resolve_asset_candidate_lines([
            "      - {role: asset-candidate, box: [10, 20, 300, 200], type: pic, "
            "source_media: chart.png}",
            "      - {role: asset-candidate, box: [20, 30, 80, 80], type: pic, "
            "source_media: ornament.png}",
        ], decisions, asset_ids)

        self.assertEqual(len(lines), 2)
        self.assertNotIn("chart.png", lines[0])
        self.assertNotIn("source_media", lines[0])
        self.assertNotIn("asset:", lines[0])
        self.assertIn("role: pic", lines[0])
        self.assertNotIn("source_media", lines[1])
        self.assertIn("role: texture", lines[1])
        self.assertIn("asset: texture-1", lines[1])
        self.assertEqual(manifest["assets"], [{
            "id": "texture-1",
            "source_media": "ornament.png",
            "kind": "texture",
        }])

    def test_faas_visual_groups_map_content_and_decorative_without_leaking_to_pack(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-1",
                    "source_media": "[partner-logo.png, ornament.png]",
                    "visual_kind": "content-image",
                },
                {
                    "id": "vision-2",
                    "source_media": "[illustration.png]",
                    "visual_kind": "illustration",
                },
            ],
            "asset_decisions": [
                {"source_media": "ornament.png", "visual_kind": "decorative"},
            ],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)
        lines = resolve_asset_candidate_lines([
            "      - {role: asset-candidate, box: [10, 20, 300, 200], type: pic, "
            "source_media: partner-logo.png}",
            "      - {role: asset-candidate, box: [20, 30, 80, 80], type: pic, "
            "source_media: ornament.png}",
            "      - {role: asset-candidate, box: [40, 50, 60, 60], type: pic, "
            "source_media: illustration.png}",
        ], decisions, asset_ids)

        self.assertEqual(decisions["partner-logo.png"], "content")
        self.assertEqual(decisions["ornament.png"], "texture")
        self.assertEqual(decisions["illustration.png"], "texture")
        self.assertEqual(
            [asset["kind"] for asset in manifest["assets"]],
            ["texture", "texture"],
        )
        self.assertEqual(lines[0], "      - {role: pic, box: [10, 20, 300, 200], type: pic}")
        self.assertIn("asset: texture-1", lines[1])
        self.assertIn("asset: texture-2", lines[2])

    def test_same_source_same_box_uses_its_layout_specific_vision_decision(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-1",
                    "source_media": "shared.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "content-image",
                },
                {
                    "id": "vision-2",
                    "source_media": "shared.png",
                    "layout": "layout-2",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "decorative",
                },
            ],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)
        lines = resolve_asset_candidate_lines([
            "  layout-1:",
            "    slots:",
            "      - {role: asset-candidate, box: [100, 200, 80, 80], type: pic, "
            "source_media: shared.png}",
            "  layout-2:",
            "    slots:",
            "      - {role: asset-candidate, box: [100, 200, 80, 80], type: pic, "
            "source_media: shared.png}",
        ], decisions, asset_ids)

        self.assertEqual(lines[2], "      - {role: pic, box: [100, 200, 80, 80], type: pic}")
        self.assertIn("role: texture", lines[5])
        self.assertIn("asset: texture-1", lines[5])

    def test_build_layouts_keeps_instance_only_asset_decisions(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "cover-illustration.png",
                "layout": "layout-1",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "illustration",
            }],
        }
        decisions, asset_ids = apply_asset_decisions(manifest)
        layouts_yaml = """\
names:
  layout-1: "封面"
roles:
  layout-1: cover
layouts:
  layout-1:
    role: content
    slots:
      - {role: asset-candidate, box: [100, 200, 80, 80], type: pic, source_media: cover-illustration.png}
    confidence: high
"""

        layouts_md = build_layouts_md(
            split_top_blocks(layouts_yaml), (1920, 1080), decisions, asset_ids)

        self.assertIn(
            "{role: texture, box: [100, 200, 80, 80], type: pic, asset: texture-1}",
            layouts_md,
        )

    def test_duplicate_instance_vision_decisions_are_idempotent(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-1",
                    "source_media": "cover-illustration.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "illustration",
                },
                {
                    "id": "vision-2",
                    "source_media": "cover-illustration.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "illustration",
                },
            ],
            "asset_decisions": [{
                "source_media": "cover-illustration.png",
                "layout": "layout-1",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "illustration",
            }],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)
        lines = resolve_asset_candidate_lines([
            "  layout-1:",
            "    slots:",
            "      - {role: asset-candidate, box: [100, 200, 80, 80], type: pic, "
            "source_media: cover-illustration.png}",
        ], decisions, asset_ids)

        self.assertIn("role: texture", lines[2])
        self.assertIn("asset: texture-1", lines[2])
        self.assertEqual(manifest["assets"], [{
            "id": "texture-1",
            "source_media": "cover-illustration.png",
            "kind": "texture",
        }])

    def test_duplicate_instance_vision_decisions_reject_conflicting_kinds(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-1",
                    "source_media": "cover-illustration.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "illustration",
                },
                {
                    "id": "vision-2",
                    "source_media": "cover-illustration.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "decorative",
                },
            ],
        }

        with self.assertRaisesRegex(Fail, "实例判断冲突"):
            apply_asset_decisions(manifest)

    def test_asset_decision_overrides_a_vision_group_instance(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "cover-illustration.png",
                "layout": "layout-1",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "illustration",
            }],
            "asset_decisions": [{
                "source_media": "cover-illustration.png",
                "layout": "layout-1",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "content-image",
            }],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)

        self.assertEqual(
            decisions.for_slot(
                "cover-illustration.png",
                "box: [100, 200, 80, 80]",
                "layout-1",
            ),
            "content",
        )
        self.assertEqual(asset_ids, {})
        self.assertEqual(manifest["assets"], [])

    def test_instance_content_override_removes_unused_source_asset(self):
        manifest = {
            "assets": [{
                "id": "texture-old",
                "source_media": "cover-illustration.png",
                "kind": "texture",
            }],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "cover-illustration.png",
                "visual_kind": "illustration",
            }],
            "asset_decisions": [{
                "source_media": "cover-illustration.png",
                "layout": "layout-1",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "content-image",
            }],
        }

        decisions, asset_ids = apply_asset_decisions(
            manifest,
            bound_sources={"cover-illustration.png"},
            bound_slots={
                "cover-illustration.png": {("layout-1", (100, 200, 80, 80))},
            },
        )

        self.assertEqual(
            decisions.for_slot(
                "cover-illustration.png",
                "box: [100, 200, 80, 80]",
                "layout-1",
            ),
            "content",
        )
        self.assertEqual(asset_ids, {})
        self.assertEqual(manifest["assets"], [])

    def test_instance_decision_requires_an_exact_layout_slot(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "cover-illustration.png",
                "layout": "layout-mistyped",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "illustration",
            }],
        }

        with self.assertRaisesRegex(Fail, "实例没有对应图片槽"):
            apply_asset_decisions(
                manifest,
                bound_sources={"cover-illustration.png"},
                bound_slots={
                    "cover-illustration.png": {("layout-1", (100, 200, 80, 80))},
                },
            )

    def test_instance_decision_without_layout_matches_any_layout_at_its_box(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "cover-illustration.png",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "illustration",
            }],
        }

        _, asset_ids = apply_asset_decisions(
            manifest,
            bound_sources={"cover-illustration.png"},
            bound_slots={
                "cover-illustration.png": {("layout-1", (100, 200, 80, 80))},
            },
        )

        self.assertEqual(asset_ids, {"cover-illustration.png": "texture-1"})

    def test_source_asset_decision_overrides_a_vision_group_instance(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "cover-illustration.png",
                "layout": "layout-1",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "illustration",
            }],
            "asset_decisions": [{
                "source_media": "cover-illustration.png",
                "visual_kind": "content-image",
            }],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)

        self.assertEqual(
            decisions.for_slot(
                "cover-illustration.png",
                "box: [100, 200, 80, 80]",
                "layout-1",
            ),
            "content",
        )
        self.assertEqual(asset_ids, {})
        self.assertEqual(manifest["assets"], [])

    def test_source_asset_decision_overrides_every_instance_of_its_source(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-1",
                    "source_media": "cover-illustration.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "illustration",
                },
                {
                    "id": "vision-2",
                    "source_media": "cover-illustration.png",
                    "layout": "layout-2",
                    "box": "[200, 200, 80, 80]",
                    "visual_kind": "decorative",
                },
            ],
            "asset_decisions": [{
                "source_media": "cover-illustration.png",
                "visual_kind": "content-image",
            }],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)

        self.assertEqual(
            decisions.for_scope(
                "cover-illustration.png", "layout-1", (100, 200, 80, 80)),
            "content",
        )
        self.assertEqual(
            decisions.for_scope(
                "cover-illustration.png", "layout-2", (200, 200, 80, 80)),
            "content",
        )
        self.assertEqual(asset_ids, {})
        self.assertEqual(manifest["assets"], [])

    def test_asset_decisions_reject_conflicting_instance_kinds(self):
        manifest = {
            "assets": [],
            "asset_decisions": [
                {
                    "source_media": "cover-illustration.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "illustration",
                },
                {
                    "source_media": "cover-illustration.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "decorative",
                },
            ],
        }

        with self.assertRaisesRegex(Fail, "实例判断冲突"):
            apply_asset_decisions(manifest)

    def test_conflicting_background_roles_are_rejected(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-1",
                    "source_media": "shared-background.png",
                    "visual_kind": "background",
                    "role": "cover",
                },
                {
                    "id": "vision-2",
                    "source_media": "shared-background.png",
                    "visual_kind": "background",
                    "role": "content",
                },
            ],
        }

        with self.assertRaisesRegex(Fail, "source_media role 冲突"):
            apply_asset_decisions(manifest)

    def test_asset_decisions_reject_conflicting_background_roles(self):
        manifest = {
            "assets": [],
            "asset_decisions": [
                {
                    "source_media": "shared-background.png",
                    "visual_kind": "background",
                    "role": "cover",
                },
                {
                    "source_media": "shared-background.png",
                    "visual_kind": "background",
                    "role": "content",
                },
            ],
        }

        with self.assertRaisesRegex(Fail, "source_media role 冲突"):
            apply_asset_decisions(manifest)

    def test_asset_decision_rejects_a_conflicting_vision_background_role(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "shared-background.png",
                "visual_kind": "background",
                "role": "cover",
            }],
            "asset_decisions": [{
                "source_media": "shared-background.png",
                "visual_kind": "background",
                "role": "content",
            }],
        }

        with self.assertRaisesRegex(Fail, "source_media role 冲突"):
            apply_asset_decisions(manifest)

    def test_background_roles_conflict_at_the_same_slot_across_sources(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-cover",
                    "source_media": "cover-bg.png",
                    "layout": "cover",
                    "box": "[0, 0, 1920, 1080]",
                    "visual_kind": "background",
                    "role": "cover",
                },
                {
                    "id": "vision-content",
                    "source_media": "content-bg.png",
                    "layout": "cover",
                    "box": "[0, 0, 1920, 1080]",
                    "visual_kind": "background",
                    "role": "content",
                },
            ],
        }

        with self.assertRaisesRegex(Fail, "背景实例 role 冲突"):
            apply_asset_decisions(manifest)

    def test_same_source_instances_bind_assets_by_their_final_decisions(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [
                {
                    "id": "vision-1",
                    "source_media": "shared.png",
                    "layout": "layout-1",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "logo",
                },
                {
                    "id": "vision-2",
                    "source_media": "shared.png",
                    "layout": "layout-2",
                    "box": "[100, 200, 80, 80]",
                    "visual_kind": "decorative",
                },
            ],
        }

        decisions, asset_ids = apply_asset_decisions(manifest)
        lines = resolve_asset_candidate_lines([
            "  layout-1:",
            "    slots:",
            "      - {role: asset-candidate, box: [100, 200, 80, 80], type: pic, "
            "source_media: shared.png}",
            "  layout-2:",
            "    slots:",
            "      - {role: asset-candidate, box: [100, 200, 80, 80], type: pic, "
            "source_media: shared.png}",
        ], decisions, asset_ids)

        self.assertIn("role: logo", lines[2])
        self.assertIn("asset: logo-1", lines[2])
        self.assertIn("role: texture", lines[5])
        self.assertIn("asset: texture-1", lines[5])
        self.assertEqual(
            [(asset["id"], asset["kind"]) for asset in manifest["assets"]],
            [("logo-1", "logo"), ("texture-1", "texture")],
        )

    def test_asset_decisions_do_not_reuse_an_existing_asset_id(self):
        manifest = {
            "assets": [
                {
                    "id": "logo-primary",
                    "source_media": "candidate.png",
                    "kind": "logo",
                },
                {
                    "id": "texture-1",
                    "source_media": "existing.png",
                    "kind": "texture",
                },
            ],
            "asset_decisions": [
                {"source_media": "candidate.png", "decision": "texture"},
            ],
        }

        _, asset_ids = apply_asset_decisions(manifest)

        self.assertEqual(asset_ids["existing.png"], "texture-1")
        self.assertEqual(asset_ids["candidate.png"], "texture-2")
        self.assertEqual(
            [asset["id"] for asset in manifest["assets"]],
            ["texture-2", "texture-1"],
        )

    def test_asset_decisions_reject_candidates_without_layout_slots(self):
        manifest = {
            "assets": [],
            "asset_decisions": [
                {"source_media": "orphan-decoration.png", "decision": "texture"},
            ],
        }

        with self.assertRaisesRegex(Fail, "没有对应图片槽"):
            apply_asset_decisions(manifest, bound_sources=set())

    def test_asset_vision_groups_reject_candidates_without_layout_slots(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "[orphan-decoration.png]",
                "visual_kind": "decorative",
            }],
        }

        with self.assertRaisesRegex(Fail, "没有对应图片槽"):
            apply_asset_decisions(manifest, bound_sources=set())

    def test_translucent_fullscreen_decoration_requires_model_judgment(self):
        candidate = {
            "id": "asset-1",
            "file": "glow.png",
            "fullscreen": True,
            "slides": [2],
            "probe": {"alpha_mean": 80},
        }

        with tempfile.TemporaryDirectory() as output_dir:
            emit_manifest({"theme_topology": {}}, [], [{
                "id": "vision-1",
                "pages": [2],
                "candidates": [dict(candidate, placements=[{
                    "slide": 2,
                    "archetype": "layout-2",
                    "box": [10, 20, 30, 40],
                }])],
            }], output_dir)
            with open(os.path.join(output_dir, "manifest.yaml"), encoding="utf-8") as stream:
                manifest = stream.read()

        self.assertIn("source_media: glow.png", manifest)
        self.assertNotIn(
            "    layout: layout-2\n    box: [10, 20, 30, 40]",
            manifest,
        )
        self.assertIn("box: [10, 20, 30, 40]", manifest)
        self.assertIn("visual_kind: TODO-visual-kind-asset-1", manifest)

    def test_asset_vision_groups_follow_faas_page_budgets(self):
        candidates = [
            {
                "id": "asset-%d" % index,
                "file": "image-%d.png" % index,
                "placements": [{"slide": 2, "box": [index, 0, 10, 10]}],
                "slides": [2],
            }
            for index in range(1, 11)
        ] + [
            {
                "id": "asset-11",
                "file": "image-11.png",
                "placements": [{"slide": 3, "box": [0, 0, 10, 10]}],
                "slides": [3],
            },
            {
                "id": "asset-12",
                "file": "image-12.png",
                "placements": [{"slide": 4, "box": [0, 0, 10, 10]}],
                "slides": [4],
            },
        ]

        groups = build_asset_vision_groups(candidates)

        self.assertEqual(
            [(group["pages"], len(group["candidates"]), group["input_count"]) for group in groups],
            [([2], 9, 10), ([2], 1, 2), ([3, 4], 2, 4)],
        )

    def test_asset_vision_selection_keeps_all_first_and_last_page_batches(self):
        groups = [
            {
                "id": "vision-%d" % index,
                "pages": [index],
                "candidates": [],
                "input_count": 1,
            }
            for index in range(1, 9)
        ] + [{
            "id": "vision-9",
            "pages": [8],
            "candidates": [],
            "input_count": 1,
        }]

        selected, omitted = select_asset_vision_groups(groups, 8)

        self.assertEqual([group["id"] for group in selected], [
            "vision-1", "vision-2", "vision-3", "vision-8", "vision-9",
        ])
        self.assertEqual([group["id"] for group in omitted], [
            "vision-4", "vision-5", "vision-6", "vision-7",
        ])

    def test_asset_vision_selection_interleaves_first_and_last_page_batches(self):
        groups = [
            {
                "id": "first-%d" % index,
                "pages": [1],
                "candidates": [],
                "input_count": 1,
            }
            for index in range(1, 4)
        ] + [
            {
                "id": "last-%d" % index,
                "pages": [8],
                "candidates": [],
                "input_count": 1,
            }
            for index in range(1, 4)
        ]

        selected, omitted = select_asset_vision_groups(groups, 8)

        self.assertEqual(
            {group["id"] for group in selected},
            {"first-1", "first-2", "first-3", "last-1", "last-2"},
        )
        self.assertEqual([group["id"] for group in omitted], ["last-3"])

    def test_asset_vision_groups_degrade_when_pillow_is_unavailable(self):
        candidates = [{
            "id": "asset-1",
            "file": "ornament.png",
            "out": "media-out/ornament.png",
            "probe": {"w": 80, "h": 80},
            "placements": [{"slide": 1, "box": [10, 20, 80, 80]}],
        }]

        with tempfile.TemporaryDirectory() as output_dir:
            lout_dir = os.path.join(output_dir, "l-out")
            os.makedirs(lout_dir)
            with mock.patch.object(draft, "has_pillow", return_value=False):
                selected, omitted, sheets = emit_asset_vision_groups(
                    output_dir, candidates, 1, lout_dir)

            self.assertEqual(selected, [])
            self.assertEqual(len(omitted), 1)
            self.assertEqual(sheets, [])
            self.assertTrue(os.path.isfile(
                os.path.join(lout_dir, "asset-vision-groups.json")))

    def test_brief_blocks_asset_judgment_when_visual_sheets_are_unavailable(self):
        data = {
            "source": {"filename": "template.pptx"},
            "canvas": {"px": [1920, 1080]},
            "counts": {"slides": 1, "layouts": 1},
            "theme_topology": {"themes": ["single"]},
            "form_hint": {"form": 2},
        }
        archetype = {"name": "layout-1", "pages": [1], "rep": 1, "bg": None, "slots": []}

        with tempfile.TemporaryDirectory() as output_dir:
            draft.emit_brief(
                data,
                ([], [], [], {}, [], [], [], [archetype], [], [],
                 [], [{"id": "vision-1", "pages": [1], "candidates": []}], [], None),
                output_dir,
            )
            with open(os.path.join(output_dir, "BRIEF.md"), encoding="utf-8") as stream:
                brief = stream.read()

        self.assertIn("不要给图片候选定性", brief)
        self.assertNotIn("逐张看 `media-out/`", brief)

    def test_brief_does_not_assign_unsampled_template_layouts_to_the_model(self):
        data = {
            "source": {"filename": "template.pptx"},
            "canvas": {"px": [1920, 1080]},
            "counts": {"slides": 1, "layouts": 2},
            "theme_topology": {"themes": ["single"]},
            "form_hint": {"form": 3},
        }
        sampled = {
            "name": "cover",
            "pages": [1],
            "rep": 1,
            "bg": None,
            "slots": [{"role": "title", "sz": 48, "txt": "封面"}],
        }
        template_only = {
            "name": "content",
            "pages": [],
            "rep": None,
            "bg": None,
            "slots": [{"role": "body", "sz": 24, "txt": "模板占位文本"}],
        }

        with tempfile.TemporaryDirectory() as output_dir:
            draft.emit_brief(
                data,
                ([], [], [], {}, [], [], [], [sampled, template_only], [], [],
                 [], [], [], None),
                output_dir,
            )
            with open(os.path.join(output_dir, "BRIEF.md"), encoding="utf-8") as stream:
                brief = stream.read()

        self.assertIn("另有 1 个模板声明版式没有对应样张", brief)
        self.assertIn("- `cover`（第 1 页，覆盖 [1]）", brief)
        self.assertNotIn("模板占位文本", brief)

    def test_brief_uses_form3_sample_pages_for_real_layout_mapping(self):
        data = {
            "source": {"filename": "template.pptx"},
            "canvas": {"px": [1920, 1080]},
            "counts": {"slides": 1, "layouts": 2},
            "theme_topology": {"themes": ["single"]},
            "form_hint": {"form": 3},
        }
        sampled = {
            "name": "content",
            "pages": [],
            "_sample_pages": [1],
            "rep": None,
            "bg": None,
            "slots": [{"role": "title", "sz": 48, "txt": "首页标题"}],
        }
        template_only = {
            "name": "cover",
            "pages": [],
            "_sample_pages": [],
            "rep": None,
            "bg": None,
            "slots": [{"role": "body", "sz": 24, "txt": "模板占位文本"}],
        }

        with tempfile.TemporaryDirectory() as output_dir:
            draft.emit_brief(
                data,
                ([], [], [], {}, [], [], [], [sampled, template_only], [], [],
                 [], [], [], None),
                output_dir,
            )
            with open(os.path.join(output_dir, "BRIEF.md"), encoding="utf-8") as stream:
                brief = stream.read()

        self.assertIn("| `content` | 1 | 1 |", brief)
        self.assertIn("第 1 页实际使用页型：`content`。若样张确为封面，只在 `roles.content` 填 `cover`",
                      brief)
        self.assertIn("- `content`（第 1 页，覆盖 [1]）", brief)
        self.assertIn("另有 1 个模板声明版式没有对应样张", brief)
        self.assertNotIn("模板占位文本", brief)

    def test_unsampled_template_background_does_not_add_control_todos(self):
        sampled = {
            "name": "cover",
            "zh": "封面",
            "role": "cover",
            "pages": [1],
            "rep": 1,
            "bg": None,
            "slots": [],
            "decor": [],
            "pic_n": 0,
            "confidence": "high",
        }
        template_only = {
            "name": "content",
            "zh": "内容页",
            "role": "content",
            "pages": [],
            "rep": None,
            "bg": "bg-template-only",
            "slots": [],
            "decor": [],
            "pic_n": 0,
            "confidence": "low",
        }

        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([sampled, template_only], output_dir)
            with open(os.path.join(output_dir, "layout-controls.yaml"),
                      encoding="utf-8") as stream:
                controls = stream.read()

        background_block = controls.split("bg-template-only:", 1)[1]
        self.assertIn("text_safe: [0, 0, 0, 0]", background_block)
        self.assertIn("avoid: []", background_block)
        self.assertNotIn("TODO", background_block)

    def test_form3_sample_page_background_adds_control_todos(self):
        sampled = {
            "name": "content",
            "zh": "内容页",
            "role": "content",
            "pages": [],
            "_sample_pages": [1],
            "rep": None,
            "bg": "bg-sampled",
            "slots": [],
            "decor": [],
            "pic_n": 0,
            "confidence": "high",
        }

        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([sampled], output_dir)
            with open(os.path.join(output_dir, "layout-controls.yaml"),
                      encoding="utf-8") as stream:
                controls = stream.read()

        background_block = controls.split("bg-sampled:", 1)[1]
        self.assertIn("text_safe: TODO安全文字区", background_block)
        self.assertIn("avoid: TODO禁放区列表", background_block)
        self.assertIn('pairing_rule: "TODO', background_block)

    def test_background_controls_only_edit_existing_image_backgrounds(self):
        archetype = {
            "name": "content",
            "zh": "内容页",
            "role": "content",
            "pages": [1],
            "rep": 1,
            "bg": "bg-content",
            "slots": [],
            "decor": [],
            "pic_n": 0,
            "confidence": "high",
        }

        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([archetype], output_dir)
            with open(os.path.join(output_dir, "layout-controls.yaml"),
                      encoding="utf-8") as stream:
                controls = stream.read()

        self.assertIn("只编辑本草案已列出的真实图片背景", controls)
        self.assertIn("纯色、渐变、外框、几何装饰和透明叠层不新建 bg_rules", controls)
        self.assertIn("bg-content:", controls)

    def test_template_layout_keeps_inherited_linear_gradient_background_as_decor(self):
        layout_part = "ppt/slideLayouts/slideLayout1.xml"
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 3},
            "layouts": [{
                "part": layout_part,
                "name": "内容",
                "used_by_slides": 1,
                "background": {
                    "type": "gradient",
                    "stops": [
                        {"pos": 0, "color": {"resolved": "#4B5CF5"}},
                        {"pos": 100, "color": {"resolved": "#233AFB"}},
                    ],
                    "angle_deg": 0,
                },
            }, {
                "part": "ppt/slideLayouts/slideLayout2.xml",
                "name": "目录",
                "used_by_slides": 0,
            }, {
                "part": "ppt/slideLayouts/slideLayout3.xml",
                "name": "封底",
                "used_by_slides": 0,
            }],
            "slides": [{
                "part": "ppt/slides/slide1.xml",
                "layout": layout_part,
                "background": None,
            }],
            "images": [],
            "media": [],
            "theme_topology": {"themes": ["single"], "per_master": [], "default": "single"},
            "reference_graph": {
                "master_of_layout": {},
                "layout_of_slide": {"ppt/slides/slide1.xml": layout_part},
            },
            "background_composites": {},
        }
        shapes = []
        for index, part in enumerate((layout_part,
                                      "ppt/slideLayouts/slideLayout2.xml",
                                      "ppt/slideLayouts/slideLayout3.xml"), 1):
            shapes.append({
                "part": part,
                "layer": "layout",
                "kind": "sp",
                "box": {"x": 100, "y": 100, "w": 600, "h": 100},
                "ph": {"type": "title", "idx": str(index)},
                "text": {"paragraphs": [{"runs": [{"text": "Title %d" % index,
                                                    "sz_px": 40}]}]},
            })

        with tempfile.TemporaryDirectory() as output_dir:
            os.makedirs(os.path.join(output_dir, "ref"))
            with open(os.path.join(output_dir, "ref", "shapes.json"), "w",
                      encoding="utf-8") as stream:
                import json
                json.dump({"shapes": shapes}, stream)
            archetypes, _, _ = draft_layouts(data, output_dir)
            emit_layouts(archetypes, output_dir)
            emit_manifest(data, [], [], output_dir, archetypes)
            with open(os.path.join(output_dir, "layouts.yaml"), encoding="utf-8") as stream:
                layouts_yaml = stream.read()
            with open(os.path.join(output_dir, "manifest.yaml"), encoding="utf-8") as stream:
                manifest = stream.read()

        self.assertIn("box: [0, 0, 1920, 1080]", layouts_yaml)
        self.assertIn("background-image: linear-gradient(90deg, #4B5CF5 0%, #233AFB 100%)",
                      layouts_yaml)
        self.assertIn('value: "[0, 0, 1920, 1080]"', manifest)
        self.assertIn('reason: "PPT 背景铺满画布"', manifest)

    def test_sampled_layouts_group_inherited_structured_background(self):
        layout_part = "ppt/slideLayouts/slideLayout1.xml"
        slides = [{
            "part": "ppt/slides/slide%d.xml" % index,
            "layout": layout_part,
            "background": None,
        } for index in range(1, 4)]
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 1},
            "layouts": [{
                "part": layout_part,
                "name": "内容",
                "used_by_slides": 3,
            }],
            "slides": slides,
            "images": [],
            "media": [],
            "theme_topology": {"themes": ["single"], "per_master": [], "default": "single"},
            "reference_graph": {
                "master_of_layout": {},
                "layout_of_slide": {
                    slide["part"]: layout_part for slide in slides
                },
            },
            "background_composites": {},
        }
        shapes = [{
            "part": slide["part"],
            "layer": "slide",
            "kind": "sp",
            "box": {"x": 100, "y": 100, "w": 600, "h": 100},
            "ph": {"type": "title", "idx": "1"},
            "text": {"paragraphs": [{"runs": [{
                "text": "Title %d" % index,
                "sz_px": 40,
            }]}]},
        } for index, slide in enumerate(slides, 1)]

        backgrounds = [{
            "source": "bgPr",
            "type": "solid",
            "color": {"resolved": "#FAF9F5"},
        }, {
            "type": "gradient",
            "stops": [
                {"pos": 0, "color": {"resolved": "#4B5CF5"}},
                {"pos": 100, "color": {"resolved": "#233AFB"}},
            ],
            "angle_deg": 0,
        }]
        for background in backgrounds:
            with self.subTest(background=background["type"]):
                data["layouts"][0]["background"] = background
                with tempfile.TemporaryDirectory() as output_dir:
                    os.makedirs(os.path.join(output_dir, "ref"))
                    with open(os.path.join(output_dir, "ref", "shapes.json"), "w",
                              encoding="utf-8") as stream:
                        import json
                        json.dump({"shapes": shapes}, stream)
                    archetypes, pages, _ = draft_layouts(
                        data, output_dir, effective_alpha={})

                self.assertEqual([1, 2, 3], sorted(
                    page for archetype in archetypes for page in archetype["pages"]))
                self.assertTrue(all(page["background"] == background for page in pages))
                self.assertTrue(all(archetype["bg_raw"] is None
                                    for archetype in archetypes))
                self.assertTrue(all(
                    any(decor.get("trace") == "canvas-background"
                        for decor in archetype["decor"])
                    for archetype in archetypes
                ))
                self.assertTrue(all(
                    all(isinstance(value, str)
                        for value in archetype["_source_backgrounds"])
                    for archetype in archetypes
                ))

    def test_asset_vision_groups_fail_when_page_screenshot_is_unreadable(self):
        candidates = [{
            "id": "asset-1",
            "file": "ornament.png",
            "out": "media-out/ornament.png",
            "probe": {"w": 80, "h": 80},
            "placements": [{"slide": 1, "box": [10, 20, 80, 80]}],
        }]

        with tempfile.TemporaryDirectory() as output_dir:
            png_dir = os.path.join(output_dir, "ref", "rebuild", "png")
            lout_dir = os.path.join(output_dir, "l-out")
            os.makedirs(png_dir)
            os.makedirs(lout_dir)
            with open(os.path.join(png_dir, "slide-1.png"), "w", encoding="utf-8") as stream:
                stream.write("not-a-png")
            with mock.patch.object(draft, "render_asset_vision_pages", return_value=png_dir):
                with self.assertRaisesRegex(RuntimeError, "页面截图不可读取"):
                    emit_asset_vision_groups(output_dir, candidates, 1, lout_dir)

    def test_bound_visual_candidates_omit_unbound_media(self):
        bound = {
            "file": "corner-ornament.png",
            "fullscreen": False,
            "slides": [2],
            "probe": {"alpha_mean": 255},
        }
        unbound = {
            "file": "unused-master.svg",
            "fullscreen": False,
            "slides": [],
            "probe": {"alpha_mean": 255},
        }

        archetypes = [{"slots": [{"source_media": "corner-ornament.png"}]}]

        self.assertEqual(
            bound_visual_candidates([bound, unbound], archetypes),
            [bound],
        )

    def test_visual_slot_candidates_use_final_slot_geometry(self):
        candidate = {
            "file": "shared-illustration.png",
            "fullscreen": False,
            "probe": {"alpha_mean": 255},
            "placements": [
                {"slide": 3, "box": [1002, 285, 768, 647]},
                {"slide": 8, "box": [114, 285, 768, 647]},
            ],
        }
        archetypes = [{
            "name": "section",
            "pages": [8],
            "rep": 8,
            "slots": [{
                "source_media": "shared-illustration.png",
                "box": [114, 285, 768, 647],
            }],
        }]

        rows = visual_slot_candidates([candidate], archetypes)

        self.assertEqual(rows[0]["placements"], [{
            "slide": 8,
            "box": [114, 285, 768, 647],
            "archetype": "section",
        }])

    def test_first_page_background_is_not_automatically_a_cover(self):
        archetypes = [{
            "name": "layout-1",
            "pages": [1],
            "bg_raw": "ppt/media/first-page.png",
        }]

        self.assertIsNone(cover_background_media(archetypes))
        self.assertEqual(
            cover_background_media(archetypes + [{
                "name": "cover",
                "pages": [],
                "bg_raw": "ppt/media/template-cover.png",
            }]),
            "ppt/media/template-cover.png",
        )

    def test_visual_slot_candidates_skip_unsampled_template_layouts(self):
        candidate = {
            "file": "template-ornament.png",
            "fullscreen": False,
            "probe": {"alpha_mean": 255},
            "placements": [{"slide": 1, "box": [10, 20, 80, 80]}],
        }
        archetypes = [{
            "name": "template-only",
            "pages": [],
            "_sample_pages": [],
            "rep": None,
            "slots": [{
                "source_media": "template-ornament.png",
                "box": [10, 20, 80, 80],
            }],
        }]

        self.assertEqual(visual_slot_candidates([candidate], archetypes), [])

    def test_visual_slot_candidates_skip_template_only_slot_without_page_context(self):
        candidate = {
            "file": "template-ornament.png",
            "fullscreen": False,
            "probe": {"alpha_mean": 255},
            "placements": [{"layout": "slideLayout-1", "box": [10, 20, 80, 80]}],
        }
        archetypes = [{
            "name": "sampled-layout",
            "pages": [1],
            "rep": 1,
            "slots": [{
                "source_media": "template-ornament.png",
                "box": [10, 20, 80, 80],
            }],
        }]

        self.assertEqual(visual_slot_candidates([candidate], archetypes), [])

    def test_deterministic_fullscreen_images_skip_model_judgment(self):
        self.assertFalse(needs_asset_judgment({
            "fullscreen": True,
            "probe": {"alpha_mean": 255, "near_blank": False},
        }))
        self.assertFalse(needs_asset_judgment({
            "fullscreen": True,
            "probe": {"alpha_mean": 5, "near_blank": True},
        }))
        self.assertTrue(needs_asset_judgment({
            "fullscreen": False,
            "probe": {"alpha_mean": 5, "near_blank": True},
        }))

    def test_shape_fill_images_are_exposed_as_slide_marks(self):
        data = {
            "images": [{
                "media": "ppt/media/fill.png",
                "fullscreen": False,
                "boxes": [{
                    "box": {"x": 120, "y": 240, "w": 360, "h": 420},
                    "parts": ["ppt/slides/slide2.xml"],
                }],
            }],
        }

        marks = slide_image_marks(data)

        self.assertEqual(marks["ppt/slides/slide2.xml"], [{
            "media": "ppt/media/fill.png",
            "box": {"x": 120, "y": 240, "w": 360, "h": 420},
        }])

    def test_form3_layouts_include_instance_image_fills(self):
        layouts = []
        shapes = []
        for index in range(1, 4):
            part = "ppt/slideLayouts/slideLayout%d.xml" % index
            layouts.append({
                "part": part,
                "name": "Layout %d" % index,
                "used_by_slides": 1,
            })
            shapes.append({
                "part": part,
                "layer": "layout",
                "kind": "sp",
                "box": {"x": 10, "y": 10, "w": 500, "h": 100},
                "ph": {"type": "title", "idx": str(index)},
                "text": {"paragraphs": [{"runs": [{
                    "text": "Title %d" % index,
                    "sz_px": 40,
                }]}]},
            })
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 3},
            "layouts": layouts,
            "images": [{
                "media": "ppt/media/fill.png",
                "fullscreen": False,
                "boxes": [{
                    "box": {"x": 120, "y": 240, "w": 360, "h": 420},
                    "parts": ["ppt/slides/slide1.xml"],
                }],
            }],
            "media": [],
            "theme_topology": {
                "themes": ["single"],
                "per_master": [],
                "default": "single",
            },
            "reference_graph": {
                "master_of_layout": {},
                "layout_of_slide": {
                    "ppt/slides/slide1.xml": "ppt/slideLayouts/slideLayout1.xml",
                },
            },
            "background_composites": {},
        }

        with tempfile.TemporaryDirectory() as output_dir:
            os.makedirs(os.path.join(output_dir, "ref"))
            with open(os.path.join(output_dir, "ref", "shapes.json"), "w",
                      encoding="utf-8") as stream:
                import json
                json.dump({"shapes": shapes}, stream)
            archetypes, _, _ = draft_layouts(data, output_dir)

        self.assertTrue(any(
            slot.get("media") == "ppt/media/fill.png"
            for archetype in archetypes
            for slot in archetype["slots"]
        ))

    def test_form3_layouts_include_translucent_fullscreen_overlay_as_candidate(self):
        layouts = []
        shapes = []
        for index in range(1, 4):
            part = "ppt/slideLayouts/slideLayout%d.xml" % index
            layouts.append({
                "part": part,
                "name": "Layout %d" % index,
                "used_by_slides": 1,
            })
            shapes.append({
                "part": part,
                "layer": "layout",
                "kind": "sp",
                "box": {"x": 10, "y": 10, "w": 500, "h": 100},
                "ph": {"type": "title", "idx": str(index)},
                "text": {"paragraphs": [{"runs": [{
                    "text": "Title %d" % index,
                    "sz_px": 40,
                }]}]},
            })
        overlay_media = "ppt/media/overlay.png"
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 3},
            "layouts": layouts,
            "images": [{
                "media": overlay_media,
                "fullscreen": True,
                "boxes": [{
                    "box": {"x": 0, "y": 0, "w": 1920, "h": 1080},
                    "parts": ["ppt/slides/slide1.xml"],
                }],
            }],
            "media": [],
            "theme_topology": {
                "themes": ["single"],
                "per_master": [],
                "default": "single",
            },
            "reference_graph": {
                "master_of_layout": {},
                "layout_of_slide": {
                    "ppt/slides/slide1.xml": "ppt/slideLayouts/slideLayout1.xml",
                },
            },
            "background_composites": {},
        }

        with tempfile.TemporaryDirectory() as output_dir:
            os.makedirs(os.path.join(output_dir, "ref"))
            with open(os.path.join(output_dir, "ref", "shapes.json"), "w",
                      encoding="utf-8") as stream:
                import json
                json.dump({"shapes": shapes}, stream)
            archetypes, _, _ = draft_layouts(
                data, output_dir, effective_alpha={overlay_media: 64})

        self.assertTrue(any(
            slot.get("media") == overlay_media
            for archetype in archetypes
            for slot in archetype["slots"]
        ))

    def test_shape_opacity_marks_opaque_fullscreen_media_as_overlay(self):
        data = {
            "media": [{
                "media": "ppt/media/overlay.png",
                "out": "media-out/overlay.png",
            }],
            "images": [{
                "media": "ppt/media/overlay.png",
                "fullscreen": True,
            }],
        }
        shapes = [{
            "kind": "pic",
            "media": "ppt/media/overlay.png",
            "w_pct": 100,
            "h_pct": 100,
            "opacity": 0.25,
        }]

        with tempfile.TemporaryDirectory() as output_dir:
            media_dir = os.path.join(output_dir, "media-out")
            os.makedirs(media_dir)
            try:
                from PIL import Image
            except ImportError:
                self.skipTest("Pillow unavailable")
            Image.new("RGB", (16, 9), (20, 40, 60)).save(
                os.path.join(media_dir, "overlay.png"))

            overlays = fullscreen_overlay_media(data, output_dir, shapes)

        self.assertEqual(overlays, {"ppt/media/overlay.png"})

    def test_image_bearing_orphan_group_is_kept_without_count_threshold(self):
        kept = [("common", [{"no": 2, "marks": []}])]
        ranked = kept + [
            ("one-image", [{"no": 5, "marks": [{
                "media": "ppt/media/ornament.png",
                "box": {"x": 40, "y": 120, "w": 80, "h": 240},
            }]}]),
            ("no-image", [{"no": 6, "marks": []}]),
        ]

        selected = preserve_image_bearing_groups(kept, ranked)

        self.assertEqual([group[0] for group in selected], ["common", "one-image"])

    def test_asset_vision_contexts_keep_same_source_per_layout_and_box(self):
        contexts = asset_vision_contexts([{
            "id": "asset-1",
            "file": "shared.png",
            "placements": [
                {"slide": 2, "archetype": "layout-1", "box": [10, 20, 80, 80]},
                {"slide": 3, "archetype": "layout-2", "box": [10, 20, 80, 80]},
                {"slide": 4, "archetype": "layout-2", "box": [10, 20, 80, 80]},
                {"slide": 4, "archetype": "layout-2", "box": [100, 20, 80, 80]},
            ],
        }])

        self.assertEqual(
            [(row["id"], row["layout"], row["placements"][0]["slide"])
             for row in contexts],
            [
                ("asset-1-s2", "layout-1", 2),
                ("asset-1-s3", "layout-2", 3),
                ("asset-1-s4", "layout-2", 4),
            ],
        )

    def test_contact_sheets_cover_all_candidates_without_truncation(self):
        try:
            from PIL import Image
        except ImportError:
            self.skipTest("Pillow unavailable")

        with tempfile.TemporaryDirectory() as output_dir:
            media_dir = os.path.join(output_dir, "media-out")
            lout_dir = os.path.join(output_dir, "l-out")
            os.makedirs(media_dir)
            os.makedirs(lout_dir)
            candidates = []
            for index in range(13):
                filename = "image-%02d.png" % index
                Image.new("RGBA", (8, 8), (index, 20, 30, 255)).save(
                    os.path.join(media_dir, filename))
                candidates.append({
                    "file": filename,
                    "out": "media-out/" + filename,
                    "n": 1,
                    "probe": {"w": 8, "h": 8},
                })

            sheets = contact_sheets(output_dir, candidates, lout_dir)
            legacy_exists = os.path.exists(os.path.join(lout_dir, "contact-sheet.png"))

        self.assertEqual(len(sheets), 2)
        self.assertEqual(
            [os.path.basename(path) for path in sheets],
            ["contact-sheet-1.png", "contact-sheet-2.png"],
        )
        self.assertTrue(legacy_exists)

    def test_content_candidates_at_same_geometry_collapse_to_one_slot(self):
        lines = resolve_asset_candidate_lines([
            '      - {role: asset-candidate, box: [10, 20, 300, 200], type: pic, '
            'source_media: chart-a.png, css: "object-fit: contain"}',
            "      - {role: asset-candidate, box: [10, 20, 300, 200], type: pic, "
            "source_media: chart-b.png}",
        ], {
            "chart-a.png": "content",
            "chart-b.png": "content",
        }, {})

        self.assertEqual(lines, [
            '      - {role: pic, box: [10, 20, 300, 200], type: pic, css: "object-fit: contain"}',
        ])

    def test_content_candidates_at_same_geometry_remain_in_distinct_layouts(self):
        lines = resolve_asset_candidate_lines([
            "  layout-a:",
            "    slots:",
            "      - {role: asset-candidate, box: [10, 20, 300, 200], type: pic, "
            "source_media: chart-a.png}",
            "  layout-b:",
            "    slots:",
            "      - {role: asset-candidate, box: [10, 20, 300, 200], type: pic, "
            "source_media: chart-b.png}",
        ], {
            "chart-a.png": "content",
            "chart-b.png": "content",
        }, {})

        self.assertEqual(lines, [
            "  layout-a:",
            "    slots:",
            "      - {role: pic, box: [10, 20, 300, 200], type: pic}",
            "  layout-b:",
            "    slots:",
            "      - {role: pic, box: [10, 20, 300, 200], type: pic}",
        ])


if __name__ == "__main__":
    unittest.main()
