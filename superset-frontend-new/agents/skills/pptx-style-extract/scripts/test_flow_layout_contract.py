#!/usr/bin/env python3
"""Regression tests for model-selected flow layouts and grouped card columns."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from check_v2 import Pack, rule_v2_14, rule_v2_16
from draft import draft_flow, draft_layouts, emit_layouts
from package import apply_asset_decisions, build_layouts_md, Fail, split_top_blocks


def text_slot(role, box, text):
    return {
        "role": role,
        "type": "title" if role == "title" else "body",
        "box": box,
        "sz": 36,
        "txt": text,
        "css": "font-size: 36px",
    }


class FlowLayoutContractTest(unittest.TestCase):
    def test_sample_page_keeps_every_text_slot_for_card_grouping(self):
        slide_part = "ppt/slides/slide2.xml"
        layout_part = "ppt/slideLayouts/slideLayout2.xml"
        shapes = []
        for index in range(8):
            shapes.append({
                "part": slide_part,
                "layer": "slide",
                "id": str(index + 1),
                "kind": "sp",
                "name": "Text",
                "ph": None,
                "box": {"x": 100 + (index % 3) * 560, "y": 100 + index * 80,
                        "w": 480, "h": 60},
                "text": {
                    "bodyPr": {},
                    "lstStyle": {"lvl1pPr": {"sz_px": 32}},
                    "paragraphs": [{"runs": [{"text": "Text %d" % index}]}],
                },
            })
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 0},
            "slides": [{"part": slide_part, "layout": layout_part, "background": None}],
            "background_composites": {},
        }

        with tempfile.TemporaryDirectory() as output_dir:
            os.makedirs(os.path.join(output_dir, "ref"))
            with open(os.path.join(output_dir, "ref", "shapes.json"), "w",
                      encoding="utf-8") as stream:
                import json
                json.dump({"shapes": shapes}, stream)
            archetypes, _, _ = draft_layouts(data, output_dir)

        self.assertEqual(len(archetypes[0]["slots"]), 8)

    def test_layout_mode_selects_flow_without_leaking_draft_control(self):
        draft = """names:
  layout-1: 内容页
roles:
  layout-1: content
layout_modes:
  layout-1: flow
layouts:
  layout-1:
    flow:
      top: 100
      margin: [80, 80]
      gap: 40
      regions:
        - kind: stack
          gap: 20
          items:
            - {role: title, type: title}
            - {role: body, type: body}
    slots:
      - {role: title, box: [80, 100, 1760, 80], type: title}
      - {role: body, box: [80, 220, 1760, 400], type: body}
    confidence: high
"""

        layouts_md = build_layouts_md(split_top_blocks(draft), (1920, 1080))

        self.assertIn("    flow:", layouts_md)
        self.assertNotIn("    slots:", layouts_md)
        self.assertNotIn("layout_modes:", layouts_md)

        slots_md = build_layouts_md(
            split_top_blocks(draft.replace("layout-1: flow", "layout-1: slots")),
            (1920, 1080),
        )

        self.assertIn("    slots:", slots_md)
        self.assertNotIn("    flow:", slots_md)
        self.assertNotIn("layout_modes:", slots_md)

    def test_layout_mode_defaults_to_slots_when_both_forms_exist(self):
        draft = """names:
  layout-1: 内容页
roles:
  layout-1: content
layouts:
  layout-1:
    flow:
      top: 100
      margin: [80, 80]
      gap: 40
      regions:
        - kind: stack
          items:
            - {role: title, type: title}
            - {role: body, type: body}
    slots:
      - {role: title, box: [80, 100, 1760, 80], type: title}
      - {role: body, box: [80, 220, 1760, 400], type: body}
    confidence: high
"""

        layouts_md = build_layouts_md(split_top_blocks(draft), (1920, 1080))

        self.assertIn("    slots:", layouts_md)
        self.assertNotIn("    flow:", layouts_md)

    def test_flow_instance_override_uses_source_box_without_leaking_it(self):
        manifest = {
            "assets": [],
            "asset_vision_groups": [{
                "id": "vision-1",
                "source_media": "[shared.png]",
                "visual_kind": "content-image",
            }],
            "asset_decisions": [{
                "source_media": "shared.png",
                "box": "[100, 200, 80, 80]",
                "visual_kind": "decorative",
            }],
        }
        decisions, asset_ids = apply_asset_decisions(manifest)
        draft = """names:
  layout-1: 内容页
roles:
  layout-1: content
layout_modes:
  layout-1: flow
layouts:
  layout-1:
    flow:
      top: 100
      margin: [80, 80]
      gap: 40
      regions:
        - kind: stack
          gap: 20
          items:
            - {role: asset-candidate, type: pic, source_media: shared.png, source_box: [100, 200, 80, 80]}
    slots:
      - {role: asset-candidate, box: [100, 200, 80, 80], type: pic, source_media: shared.png}
    confidence: high
"""

        layouts_md = build_layouts_md(
            split_top_blocks(draft), (1920, 1080),
            asset_decisions=decisions, asset_ids=asset_ids,
        )

        self.assertIn("- {role: texture, type: pic, asset: texture-1}", layouts_md)
        self.assertNotIn("source_media", layouts_md)
        self.assertNotIn("source_box", layouts_md)

    def test_layout_mode_rejects_unknown_value(self):
        draft = """names:
  layout-1: 内容页
roles:
  layout-1: content
layout_modes:
  layout-1: auto
layouts:
  layout-1:
    flow:
      top: 100
      margin: [80, 80]
      gap: 40
      regions:
        - kind: stack
          items:
            - {role: title, type: title}
            - {role: body, type: body}
    slots:
      - {role: title, box: [80, 100, 1760, 80], type: title}
      - {role: body, box: [80, 220, 1760, 400], type: body}
    confidence: high
"""

        with self.assertRaisesRegex(Fail, "layout-1 的 layout_modes 判断是 'auto'"):
            build_layouts_md(split_top_blocks(draft), (1920, 1080))

    def test_model_identified_footer_moves_to_positioned_free_region(self):
        draft = """names:
  layout-1: 内容页
roles:
  layout-1: content
text_roles:
  layout-1-text-1: title
  layout-1-text-2: body
  layout-1-text-3: footer
layout_modes:
  layout-1: flow
layouts:
  layout-1:
    flow:
      top: 100
      margin: [80, 80]
      gap: 40
      regions:
        - kind: stack
          gap: 20
          items:
            # text-role: layout-1-text-1
            - {role: body, type: body}
            # text-role: layout-1-text-2
            - {role: body, type: body}
            # text-role: layout-1-text-3
            - {role: body, type: body}
    slots:
      # text-role: layout-1-text-1
      - {role: body, box: [80, 100, 1760, 80], type: body}
      # text-role: layout-1-text-2
      - {role: body, box: [80, 220, 1760, 400], type: body}
      # text-role: layout-1-text-3
      - {role: body, box: [80, 1000, 1760, 40], type: body}
    confidence: high
"""

        layouts_md = build_layouts_md(split_top_blocks(draft), (1920, 1080))

        self.assertIn("        - kind: free", layouts_md)
        self.assertIn(
            "- {role: footer, box: [80, 1000, 1760, 40], type: footer}",
            layouts_md,
        )
        stack = layouts_md.split("        - kind: stack", 1)[1].split(
            "        - kind: free", 1,
        )[0]
        self.assertNotIn("role: footer", stack)

    def test_multicolumn_cards_emit_one_level_groups(self):
        archetype = {
            "name": "layout-1",
            "zh": "三列问题页",
            "role": "content",
            "bg": None,
            "slots": [
                text_slot("title", [120, 80, 1680, 80], "三大关键问题"),
                text_slot("summary", [120, 200, 1680, 80], "本季度核心问题摘要"),
                text_slot("card-title", [150, 360, 480, 60], "毛利承压"),
                text_slot("body", [150, 440, 480, 180], "毛利率低于目标"),
                text_slot("card-title", [720, 360, 480, 60], "收入延期"),
                text_slot("body", [720, 440, 480, 180], "重点项目验收延后"),
                text_slot("card-title", [1290, 360, 480, 60], "续约下滑"),
                text_slot("body", [1290, 440, 480, 180], "中小客户流失增加"),
            ],
            "decor": [
                {
                    "box": [120, 330, 540, 420],
                    "geom": "rect",
                    "css": "background: #FFFFFF; border: 1px solid #DDE7F2",
                },
                {
                    "box": [690, 330, 540, 420],
                    "geom": "rect",
                    "css": "background: #FFFFFF; border: 1px solid #DDE7F2",
                },
                {
                    "box": [1260, 330, 540, 420],
                    "geom": "rect",
                    "css": "background: #FFFFFF; border: 1px solid #DDE7F2",
                },
                {
                    "box": [115, 660, 550, 95],
                    "geom": "rect",
                    "css": "background: #0A84FF",
                },
                {
                    "box": [685, 660, 550, 95],
                    "geom": "rect",
                    "css": "background: #0A84FF",
                },
                {
                    "box": [1255, 660, 550, 95],
                    "geom": "rect",
                    "css": "background: #0A84FF",
                },
            ],
            "pages": [2],
            "rep": 2,
            "pic_n": 0,
            "confidence": "medium",
        }
        archetype["flow"] = draft_flow(archetype, {}, (1920, 1080))

        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([archetype], output_dir)
            with open(os.path.join(output_dir, "layouts.yaml"), encoding="utf-8") as stream:
                layouts_yaml = stream.read()

        self.assertNotIn("\nlayout_modes:\n", layouts_yaml)
        self.assertIn("默认保留 slots", layouts_yaml)
        self.assertIn("        - kind: grid\n          cols: 3", layouts_yaml)
        self.assertEqual(layouts_yaml.count("            - role: group"), 3)
        self.assertEqual(layouts_yaml.count("              items:"), 3)
        self.assertEqual(layouts_yaml.count("role: container"), 3)

        default_layouts_md = build_layouts_md(split_top_blocks(layouts_yaml), (1920, 1080))

        self.assertNotIn("    flow:", default_layouts_md)
        self.assertIn("    slots:", default_layouts_md)

        decided = layouts_yaml.replace(
            "layouts:",
            "layout_modes:\n  layout-1: flow\nlayouts:",
        )
        layouts_md = build_layouts_md(split_top_blocks(decided), (1920, 1080))

        self.assertNotIn("layout_modes:", layouts_md)
        self.assertNotIn("    slots:", layouts_md)
        self.assertIn("    flow:", layouts_md)
        self.assertEqual(layouts_md.count("            - role: group"), 3)
        self.assertEqual(layouts_md.count("              items:"), 3)

        with tempfile.TemporaryDirectory() as pack_dir:
            with open(os.path.join(pack_dir, "design.md"), "w", encoding="utf-8") as stream:
                stream.write("---\nversion: alpha\nlayouts: layouts.md\n---\n")
            with open(os.path.join(pack_dir, "layouts.md"), "w", encoding="utf-8") as stream:
                stream.write(layouts_md)
            pack = Pack(pack_dir)

        self.assertEqual(rule_v2_14(pack).level, "PASS")
        self.assertEqual(rule_v2_16(pack).level, "PASS")

    def test_title_and_single_card_row_gap_form_two_flow_regions(self):
        archetype = {
            "name": "layout-1",
            "zh": "标题加三列卡片",
            "role": "content",
            "bg": None,
            "slots": [
                text_slot("title", [228, 73, 1465, 68], "核心能力"),
            ],
            "decor": [],
            "pages": [2],
            "rep": 2,
            "pic_n": 0,
            "confidence": "high",
        }
        for left in (70, 671, 1270):
            archetype["decor"].append({
                "box": [left, 212, 580, 660],
                "geom": "rect",
                "css": "background: rgba(255,255,255,0.7)",
            })
            for top in (270, 374, 498, 621, 797):
                archetype["slots"].append(
                    text_slot("body", [left + 80, top, 405, 41], "卡片内容"),
                )

        flow = draft_flow(archetype, {}, (1920, 1080))

        self.assertIsNotNone(flow)
        self.assertEqual([region["kind"] for region in flow["regions"]], ["stack", "grid"])
        self.assertEqual(flow["regions"][1]["cols"], 3)
        self.assertEqual(
            [item["role"] for item in flow["regions"][1]["items"]],
            ["group", "group", "group"],
        )

    def test_centered_card_grid_carries_its_own_symmetric_margin(self):
        # 短标题贴左（x=120..900），三张卡片居中（左右各 360）。整页 margin 取「最左槽 +
        # 最右槽」的外包络 = [120, 360]，直接套给居中卡片组会把它拉偏成左对齐（左缝小、
        # 右缝大）。卡片区带应带自己的对称 margin，还原居中。
        archetype = {
            "name": "layout-1",
            "zh": "标题加三列卡片",
            "role": "content",
            "bg": None,
            "slots": [
                text_slot("title", [120, 73, 780, 68], "核心能力"),
            ],
            "decor": [],
            "pages": [2],
            "rep": 2,
            "pic_n": 0,
            "confidence": "high",
        }
        for left in (360, 760, 1160):
            archetype["decor"].append({
                "box": [left, 430, 400, 300],
                "geom": "rect",
                "css": "background: rgba(255,255,255,0.7)",
            })
            for top in (490, 570):
                archetype["slots"].append(
                    text_slot("body", [left + 40, top, 320, 41], "卡片内容"),
                )

        flow = draft_flow(archetype, {}, (1920, 1080))

        self.assertIsNotNone(flow)
        self.assertEqual([region["kind"] for region in flow["regions"]], ["stack", "grid"])
        self.assertEqual(flow["margin"], [120, 360])
        grid = flow["regions"][1]
        self.assertEqual(grid.get("margin"), [360, 360])

        archetype["flow"] = flow
        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([archetype], output_dir)
            with open(os.path.join(output_dir, "layouts.yaml"), encoding="utf-8") as stream:
                layouts_yaml = stream.read()
        decided = layouts_yaml.replace(
            "layouts:",
            "layout_modes:\n  layout-1: flow\nlayouts:",
        )
        layouts_md = build_layouts_md(split_top_blocks(decided), (1920, 1080))
        self.assertRegex(layouts_md, r"- kind: grid\n\s+cols: 3\n\s+gap: \[\d+, \d+\]\n\s+margin: \[360, 360\]")

    def test_symmetric_card_grid_omits_region_margin(self):
        # 卡片组横向范围已和整页一致（都对称），不该冒出多余的区带 margin——保证对已有
        # 对称模板零回归、layouts.md 不膨胀。
        archetype = {
            "name": "layout-1",
            "zh": "标题加三列卡片",
            "role": "content",
            "bg": None,
            "slots": [
                text_slot("title", [120, 73, 1680, 68], "核心能力"),
            ],
            "decor": [],
            "pages": [2],
            "rep": 2,
            "pic_n": 0,
            "confidence": "high",
        }
        for left in (120, 720, 1320):
            archetype["decor"].append({
                "box": [left, 430, 480, 300],
                "geom": "rect",
                "css": "background: rgba(255,255,255,0.7)",
            })
            for top in (490, 570):
                archetype["slots"].append(
                    text_slot("body", [left + 40, top, 400, 41], "卡片内容"),
                )

        flow = draft_flow(archetype, {}, (1920, 1080))

        self.assertIsNotNone(flow)
        self.assertEqual(flow["margin"], [120, 120])
        grid = flow["regions"][1]
        self.assertEqual(grid["kind"], "grid")
        self.assertNotIn("margin", grid)

        archetype["flow"] = flow
        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([archetype], output_dir)
            with open(os.path.join(output_dir, "layouts.yaml"), encoding="utf-8") as stream:
                layouts_yaml = stream.read()
        grid_block = layouts_yaml.split("- kind: grid", 1)[1].split("items:", 1)[0]
        self.assertNotIn("margin:", grid_block)

    def test_fixed_template_anchors_stay_in_a_positioned_free_region(self):
        archetype = {
            "name": "layout-1",
            "zh": "内容页",
            "role": "content",
            "bg": None,
            "slots": [
                text_slot("title", [120, 100, 1680, 80], "标题"),
                text_slot("body", [120, 260, 1680, 280], "正文"),
                {
                    "role": "logo",
                    "type": "pic",
                    "box": [1740, 40, 100, 60],
                    "sz": 0,
                    "txt": "",
                    "asset": "logo-primary",
                },
                {
                    "role": "slide-number",
                    "type": "slide-number",
                    "box": [1780, 1000, 60, 40],
                    "sz": 24,
                    "txt": "2",
                    "css": "font-size: 24px",
                },
            ],
            "decor": [],
            "pages": [2],
            "rep": 2,
            "pic_n": 1,
            "confidence": "medium",
        }
        archetype["flow"] = draft_flow(archetype, {}, (1920, 1080))

        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([archetype], output_dir)
            with open(os.path.join(output_dir, "layouts.yaml"), encoding="utf-8") as stream:
                layouts_yaml = stream.read()

        self.assertIn("        - kind: free", layouts_yaml)
        self.assertIn(
            "- {role: logo, type: pic, box: [1740, 40, 100, 60], asset: logo-primary}",
            layouts_yaml,
        )
        self.assertIn(
            "- {role: slide-number, type: slide-number, box: [1780, 1000, 60, 40]",
            layouts_yaml,
        )


if __name__ == "__main__":
    unittest.main()
