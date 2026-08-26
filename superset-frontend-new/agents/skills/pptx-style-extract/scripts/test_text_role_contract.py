#!/usr/bin/env python3
"""Regression tests for inherited layout text and model-decided text roles."""
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from draft import draft_layouts, emit_layouts, inherited_text_shapes
from package import build_layouts_md, split_top_blocks


def text_shape(part, layer, shape_id, box, text, placeholder):
    return {
        "part": part,
        "layer": layer,
        "id": shape_id,
        "kind": "sp",
        "name": "Text Placeholder",
        "ph": placeholder,
        "box": box,
        "text": {
            "bodyPr": {},
            "lstStyle": {
                "lvl1pPr": {
                    "sz_px": 48,
                    "weight": 600,
                    "color": {"resolved": "#C41230"},
                },
            },
            "paragraphs": [
                {
                    "runs": [{"text": text}],
                },
            ] if text else [],
        },
    }


class TextRoleContractTest(unittest.TestCase):
    def test_empty_non_placeholder_layout_shape_is_not_a_text_slot(self):
        layout_part = "ppt/slideLayouts/slideLayout2.xml"
        decorative_shape = text_shape(
            layout_part,
            "layout",
            "9",
            {"x": 0, "y": 0, "w": 1920, "h": 24},
            "",
            None,
        )
        decorative_shape["name"] = "Decorative bar"

        self.assertEqual(inherited_text_shapes([decorative_shape], []), [])

    def test_empty_slide_inherits_text_slot_and_css_from_its_layout(self):
        layout_part = "ppt/slideLayouts/slideLayout2.xml"
        slide_part = "ppt/slides/slide1.xml"
        shapes = [
            text_shape(
                layout_part,
                "layout",
                "10",
                {"x": 120, "y": 80, "w": 840, "h": 120},
                "Example heading",
                {"type": "body", "idx": "10"},
            ),
            text_shape(
                slide_part,
                "slide",
                "2",
                None,
                "",
                {"type": "body", "idx": "10"},
            ),
        ]
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 0},
            "slides": [
                {
                    "part": slide_part,
                    "layout": layout_part,
                    "background": None,
                },
            ],
            "background_composites": {},
        }

        with tempfile.TemporaryDirectory() as output_dir:
            os.makedirs(os.path.join(output_dir, "ref"))
            with open(
                os.path.join(output_dir, "ref", "shapes.json"),
                "w",
                encoding="utf-8",
            ) as stream:
                json.dump({"shapes": shapes}, stream)
            archetypes, _, _ = draft_layouts(data, output_dir)

        self.assertEqual(len(archetypes), 1)
        self.assertEqual(len(archetypes[0]["slots"]), 1)
        slot = archetypes[0]["slots"][0]
        self.assertEqual(slot["box"], [120, 80, 840, 120])
        self.assertEqual(slot["txt"], "Example heading")
        self.assertEqual(slot["role"], "body")
        self.assertEqual(slot["type"], "body")
        self.assertTrue(slot["_needs_role"])
        self.assertIn("font-size: 48px", slot["css"])
        self.assertIn("font-weight: 600", slot["css"])
        self.assertIn("color: #C41230", slot["css"])

    def test_text_role_judgement_changes_semantics_without_dropping_slot(self):
        archetype = {
            "name": "layout-1",
            "zh": None,
            "role": "content",
            "bg": None,
            "slots": [
                {
                    "role": "body",
                    "type": "body",
                    "box": [120, 80, 840, 120],
                    "sz": 48,
                    "txt": "Example heading",
                    "css": "font-size: 48px; color: #C41230",
                    "_needs_role": True,
                    "_source_layer": "layout",
                    "_placeholder": "body/10",
                },
            ],
            "decor": [],
            "pages": [1],
            "rep": 1,
            "pic_n": 0,
            "confidence": "low",
        }

        with tempfile.TemporaryDirectory() as output_dir:
            emit_layouts([archetype], output_dir)
            path = os.path.join(output_dir, "layouts.yaml")
            with open(path, encoding="utf-8") as stream:
                draft = stream.read()

        self.assertIn("默认均为 body", draft)
        self.assertIn(
            "# text-role: layout-1-text-1",
            draft,
        )
        self.assertEqual(draft.count("box: [120, 80, 840, 120]"), 1)

        decided = draft.replace(
            "layouts:",
            "text_roles:\n  layout-1-text-1: title\nlayouts:",
        )
        layouts_md = build_layouts_md(split_top_blocks(decided), (1920, 1080))

        self.assertNotIn("text_roles:", layouts_md)
        self.assertEqual(layouts_md.count("box: [120, 80, 840, 120]"), 1)
        self.assertIn(
            "role: title, box: [120, 80, 840, 120], type: title",
            layouts_md,
        )
        self.assertIn('css: "font-size: 48px; color: #C41230"', layouts_md)

    def test_header_role_uses_a_v2_slot_type(self):
        draft = """names:
  layout-1: 内容页
roles:
  layout-1: content
text_roles:
  layout-1-text-1: header
layouts:
  layout-1:
    slots:
      # text-role: layout-1-text-1
      - {role: body, box: [120, 80, 840, 120], type: body}
    confidence: high
"""

        layouts_md = build_layouts_md(split_top_blocks(draft), (1920, 1080))

        self.assertIn(
            "role: header, box: [120, 80, 840, 120], type: body",
            layouts_md,
        )
        self.assertNotIn("type: header", layouts_md)

    def test_decided_layout_role_replaces_the_draft_default(self):
        draft = """names:
  layout-1: 末页
roles:
  layout-1: closing
layouts:
  layout-1:
    role: content
    slots:
      - {role: title, box: [120, 80, 840, 120], type: title}
    confidence: high
"""

        layouts_md = build_layouts_md(split_top_blocks(draft), (1920, 1080))

        self.assertIn("    role: closing", layouts_md)
        self.assertNotIn("    role: content", layouts_md)
        self.assertEqual(layouts_md.count("    role:"), 1)

    def test_last_slide_is_kept_as_a_role_candidate_when_layout_limit_is_full(self):
        shapes, slides = [], []
        for index in range(1, 11):
            slide_part = "ppt/slides/slide%d.xml" % index
            shapes.append(text_shape(
                slide_part,
                "slide",
                str(index),
                {"x": 120, "y": 80, "w": 840, "h": 120},
                "Slide %d" % index,
                {"type": "body", "idx": str(index)},
            ))
            slides.append({
                "part": slide_part,
                "layout": "ppt/slideLayouts/slideLayout1.xml",
                "background": "#%02x0000" % index,
            })
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 0},
            "slides": slides,
            "background_composites": {},
        }

        with tempfile.TemporaryDirectory() as output_dir:
            os.makedirs(os.path.join(output_dir, "ref"))
            with open(os.path.join(output_dir, "ref", "shapes.json"), "w",
                      encoding="utf-8") as stream:
                json.dump({"shapes": shapes}, stream)
            archetypes, _, leftover = draft_layouts(data, output_dir)
            emit_layouts(archetypes, output_dir)
            with open(os.path.join(output_dir, "layouts.yaml"), encoding="utf-8") as stream:
                draft = stream.read()

        last_archetype = next(
            archetype for archetype in archetypes if archetype["pages"] == [10]
        )
        self.assertTrue(last_archetype["_last_page_candidate"])
        self.assertNotIn(10, leftover)
        self.assertIn(
            "代表页 %s，共 1 页；" % last_archetype["rep"],
            draft,
        )
        self.assertIn("末页候选，结合样张判断 closing 或实际角色", draft)
        decided = draft.replace(
            "%s: TODO角色" % last_archetype["name"],
            "%s: closing" % last_archetype["name"],
        )
        layouts_md = build_layouts_md(split_top_blocks(decided), (1920, 1080))
        self.assertRegex(
            layouts_md,
            r"  %s:\n(?:    .*\n)*?    role: closing\n"
            % last_archetype["name"],
        )
        self.assertRegex(
            layouts_md,
            r"  %s:\n(?:    .*\n)*?      - \{role: body, box: \[120, 80, 840, 120\]"
            % last_archetype["name"],
        )
        self.assertIn(
            "  %s:" % last_archetype["name"],
            layouts_md,
        )

    def test_template_layout_shape_without_ph_key_does_not_crash(self):
        # form=3 模板里，版式层可能有「带 box、带文字、但没有 ph 键」的普通形状
        # （非占位符的文本/装饰）。layouts_from_template 的入口筛选是
        # `s.get('ph') or shape_text(s)`——有文字就放进来，随后按 ph 判类型时若用
        # s['ph'] 直接下标就会 KeyError: 'ph'，整份抽取在草案阶段崩掉（EXTRACT_PARTIAL）。
        layout_part = "ppt/slideLayouts/slideLayout1.xml"
        shape = {
            "part": layout_part,
            "layer": "layout",
            "id": "7",
            "kind": "sp",
            "name": "页脚文字",
            # 关键：没有 'ph' 键
            "box": {"x": 100, "y": 980, "w": 800, "h": 60},
            "text": {
                "bodyPr": {},
                "lstStyle": {"lvl1pPr": {"sz_px": 20}},
                "paragraphs": [{"runs": [{"text": "内部资料"}]}],
            },
        }
        data = {
            "canvas": {"px": [1920, 1080]},
            "form_hint": {"form": 3},
            "layouts": [{"part": layout_part}],
            "slides": [{"part": "ppt/slides/slide1.xml", "layout": layout_part,
                        "background": None}],
            "background_composites": {},
        }

        with tempfile.TemporaryDirectory() as output_dir:
            os.makedirs(os.path.join(output_dir, "ref"))
            with open(os.path.join(output_dir, "ref", "shapes.json"), "w",
                      encoding="utf-8") as stream:
                json.dump({"shapes": [shape]}, stream)
            # 修复前这里抛 KeyError: 'ph'（draft.py 用 s['ph'] 直接下标），
            # 抽取在草案阶段崩掉、退成 EXTRACT_PARTIAL。修复后应正常返回。
            archetypes, pages, leftover = draft_layouts(data, output_dir)

        self.assertIsInstance(archetypes, list)


if __name__ == "__main__":
    unittest.main()
