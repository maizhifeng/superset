#!/usr/bin/env python3
"""Regression tests for consumer rules emitted into design.md."""
import os
import tempfile
import unittest

from draft import emit_body


class DesignConsumerContractTest(unittest.TestCase):
    def test_generated_design_owns_template_consumption_rules(self):
        data = {
            "canvas": {"px": [1920, 1080]},
            "counts": {"slides": 1},
            "form_hint": {"form": 3},
        }
        tokens = [("primary", {"hex": "#123456"})]
        fonts = [
            {
                "names": ["Example Sans"],
                "stack": ["Example Sans", "Noto Sans SC"],
            },
        ]
        roles = {"body": {"sz_px": 36}}
        assets = [
            {
                "id": "bg-content",
                "kind": "background",
                "role": "content",
            },
        ]
        archetypes = [{"name": "content", "slots": []}]

        with tempfile.TemporaryDirectory() as output_dir:
            emit_body(
                data,
                tokens,
                fonts,
                roles,
                assets,
                archetypes,
                [],
                {},
                output_dir,
            )
            with open(os.path.join(output_dir, "body.md"), encoding="utf-8") as stream:
                body = stream.read()

        self.assertIn("是全局 token", body)
        self.assertIn("局部 slot / decor 的 `css` 优先", body)
        self.assertIn("字体使用 Typography 的完整栈与降级", body)
        self.assertIn("将包内 `assets/` 复制到项目内相对目录", body)
        self.assertIn("本机绝对路径", body)
        self.assertIn("背景、资产和本段规则均来自本风格包", body)
        self.assertIn("页面无资源加载失败、内容溢出或画幅裁切", body)
        self.assertIn("沿用该页型已有的标题层级与局部 `css`", body)
        self.assertIn("背景中已经可见的固定标题不再创建文本", body)
        self.assertIn("没有 `subtitle` 槽就不新增副标题", body)
        self.assertIn("区带自带 `margin: [左, 右]` 时用它的", body)
        self.assertIn("必须完整阅读本 `design.md` 和 `layouts.md`", body)
        self.assertIn("确认全部页型后再开始搭页", body)
        self.assertIn("不能只看摘要、前几个页型", body)
        self.assertIn('data-pptx-layout="<页型名>"', body)
        self.assertIn('data-pptx-asset="<asset id>"', body)
        self.assertIn(
            "position:absolute;left:<x>px;top:<y>px;width:<w>px;height:<h>px",
            body,
        )
        self.assertIn("元素必须可见", body)
        self.assertIn("`box` 使用全画布 `[0, 0, 1920, 1080]`", body)
        self.assertIn("该页型绑定的背景与图片资产均已使用", body)
        self.assertIn("不得省略或换图", body)


if __name__ == "__main__":
    unittest.main()
