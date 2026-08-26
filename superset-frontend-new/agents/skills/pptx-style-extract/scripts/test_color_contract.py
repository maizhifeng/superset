#!/usr/bin/env python3
"""Regression test for the generated consumer-facing color contract."""
import os
import tempfile
import unittest

from draft import emit_body


class ColorContractTest(unittest.TestCase):
    def test_body_allows_supporting_colors_without_a_second_accent_system(self):
        data = {
            "canvas": {"px": [1920, 1080]},
            "counts": {"slides": 1},
            "form_hint": {"form": 3},
        }
        tokens = [
            ("primary", {"hex": "#123456"}),
            ("surface", {"hex": "#FFFFFF"}),
        ]
        fonts = [
            {
                "names": ["Example Sans"],
                "stack": ["Example Sans", "Noto Sans SC"],
            },
        ]
        roles = {"body": {"sz_px": 36}}
        archetypes = [
            {
                "name": "content",
                "slots": [],
            },
        ]

        with tempfile.TemporaryDirectory() as output_dir:
            emit_body(
                data,
                tokens,
                fonts,
                roles,
                [],
                archetypes,
                [],
                {},
                output_dir,
            )
            with open(os.path.join(output_dir, "body.md"), encoding="utf-8") as stream:
                body = stream.read()

        self.assertIn("允许新增中性色、低彩度辅助色或局部语义色", body)
        self.assertRegex(body, r"正负.*风险.*警告.*状态.*图表序列")
        self.assertIn("必要时可以使用 Colors 之外的颜色", body)
        self.assertIn("不能形成与模板主色竞争的第二强调色", body)
        self.assertIn("色相、明度和饱和度关系", body)
        self.assertIn("高饱和、高对比、大面积或跨页重复", body)
        self.assertIn("标题、关键数字、图表主序列、卡片底色或渐变", body)


if __name__ == "__main__":
    unittest.main()
