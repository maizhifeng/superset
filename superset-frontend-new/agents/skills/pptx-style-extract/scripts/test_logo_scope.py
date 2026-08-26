#!/usr/bin/env python3
"""Regression tests for template asset placement in generated deck HTML."""
import os
import shutil
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from verify_layout_assets import validate_layout_assets


class LayoutAssetContractTest(unittest.TestCase):
    def write_asset(self, root, relative_path, contents, copied_prefix):
        source = os.path.join(root, "assets", relative_path)
        copied = os.path.join(root, copied_prefix, relative_path)
        os.makedirs(os.path.dirname(source), exist_ok=True)
        os.makedirs(os.path.dirname(copied), exist_ok=True)
        with open(source, "wb") as stream:
            stream.write(contents)
        shutil.copyfile(source, copied)

    def write_pack(self, root):
        self.write_asset(
            root,
            "logos/1.png",
            b"logo",
            "assets/pptx-volcengine",
        )
        with open(os.path.join(root, "design.md"), "w", encoding="utf-8") as stream:
            stream.write(
                "---\n"
                "assets:\n"
                "  logo-1:\n"
                "    path: assets/logos/1.png\n"
                "    kind: logo\n"
                "layouts: layouts.md\n"
                "---\n"
            )
        with open(os.path.join(root, "layouts.md"), "w", encoding="utf-8") as stream:
            stream.write(
                "---\n"
                "canvas: 1920x1080\n"
                "layouts:\n"
                "  cover:\n"
                "    role: cover\n"
                "    slots:\n"
                "      - {role: logo, box: [64, 64, 224, 48], type: pic, asset: logo-1}\n"
                "  content:\n"
                "    role: content\n"
                "    slots:\n"
                "      - {role: title, box: [100, 100, 800, 100], type: title}\n"
                "  closing:\n"
                "    role: closing\n"
                "    slots:\n"
                "      - {role: logo, box: [64, 64, 224, 48], type: pic, asset: logo-1}\n"
                "---\n"
            )

    def write_html(self, root, content):
        path = os.path.join(root, "index.html")
        with open(path, "w", encoding="utf-8") as stream:
            stream.write(content)
        return path

    def write_texture_pack(self, root):
        self.write_asset(
            root,
            "textures/1.webp",
            b"texture",
            "assets/pptx-claude",
        )
        with open(os.path.join(root, "design.md"), "w", encoding="utf-8") as stream:
            stream.write(
                "---\n"
                "assets:\n"
                "  texture-1:\n"
                "    path: assets/textures/1.webp\n"
                "    kind: texture\n"
                "layouts: layouts.md\n"
                "---\n"
            )
        with open(os.path.join(root, "layouts.md"), "w", encoding="utf-8") as stream:
            stream.write(
                "---\n"
                "canvas: 1920x1080\n"
                "layouts:\n"
                "  cover:\n"
                "    role: cover\n"
                "    slots:\n"
                "      - {role: texture, box: [1142, 0, 778, 1080], type: pic, asset: texture-1}\n"
                "  content:\n"
                "    role: content\n"
                "    slots:\n"
                "      - {role: title, box: [100, 100, 800, 100], type: title}\n"
                "---\n"
            )

    def write_background_pack(self, root):
        self.write_asset(
            root,
            "backgrounds/content.webp",
            b"background",
            "assets/pptx-claude",
        )
        with open(os.path.join(root, "design.md"), "w", encoding="utf-8") as stream:
            stream.write(
                "---\n"
                "assets:\n"
                "  bg-content-1:\n"
                "    path: assets/backgrounds/content.webp\n"
                "    kind: background\n"
                "layouts: layouts.md\n"
                "---\n"
            )
        with open(os.path.join(root, "layouts.md"), "w", encoding="utf-8") as stream:
            stream.write(
                "---\n"
                "canvas: 1920x1080\n"
                "layouts:\n"
                "  content:\n"
                "    role: content\n"
                "    background: bg-content-1\n"
                "    slots:\n"
                "      - {role: title, box: [100, 100, 800, 100], type: title}\n"
                "---\n"
            )

    def test_logo_is_limited_to_every_archetype_with_its_slot(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_pack(root)
            html = self.write_html(
                root,
                '<deck-stage>'
                '<section data-pptx-layout="cover">'
                '<img data-pptx-asset="logo-1" '
                'style="position:absolute;left:64px;top:64px;width:224px;height:48px" '
                'src="assets/pptx-volcengine/logos/1.png"></section>'
                '<section data-pptx-layout="content"><h1>正文</h1></section>'
                '<section data-pptx-layout="closing">'
                '<img data-pptx-asset="logo-1" '
                'style="position:absolute;left:64px;top:64px;width:224px;height:48px" '
                'src="assets/pptx-volcengine/logos/1.png"></section>'
                '</deck-stage>',
            )

            self.assertEqual(
                [],
                validate_layout_assets(root, html, "assets/pptx-volcengine"),
            )

    def test_logo_on_an_unowned_archetype_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_pack(root)
            html = self.write_html(
                root,
                '<deck-stage>'
                '<section data-pptx-layout="content">'
                '<img data-pptx-asset="logo-1" '
                'style="position:absolute;left:64px;top:64px;width:224px;height:48px" '
                'src="assets/pptx-volcengine/logos/1.png"></section>'
                '</deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-volcengine")

            self.assertEqual(1, len(problems))
            self.assertIn("content", problems[0])
            self.assertIn("logo-1", problems[0])

    def test_nested_content_section_does_not_become_a_slide(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<section class="content"><img data-pptx-asset="logo-1" '
                'style="position:absolute;left:64px;top:64px;width:224px;height:48px" '
                'src="assets/pptx-volcengine/logos/1.png">'
                '</section></section></deck-stage>',
            )

            self.assertEqual(
                [],
                validate_layout_assets(root, html, "assets/pptx-volcengine"),
            )

    def test_each_slide_declares_its_template_archetype(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_pack(root)
            html = self.write_html(
                root,
                "<deck-stage><section><h1>未声明页型</h1></section></deck-stage>",
            )

            self.assertEqual(
                ["第 1 页缺少 data-pptx-layout，无法核验模板资产归属"],
                validate_layout_assets(root, html, "assets/pptx-volcengine"),
            )

    def test_logo_in_global_css_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_pack(root)
            html = self.write_html(
                root,
                '<style>.slide-logo { background-image: url('
                '"assets/pptx-volcengine/logos/1.png") }</style>'
                '<deck-stage><section data-pptx-layout="content">正文</section></deck-stage>',
            )

            self.assertEqual(
                ["模板资产 logo-1 出现在 slide section 外，无法核验页型归属"],
                validate_layout_assets(root, html, "assets/pptx-volcengine"),
            )

    def test_logo_in_a_slide_style_block_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="content"><style>'
                '.slide-logo { background-image: url('
                '"assets/pptx-volcengine/logos/1.png") }</style>'
                '正文</section></deck-stage>',
            )

            self.assertEqual(
                ["模板资产 logo-1 出现在 slide section 外，无法核验页型归属"],
                validate_layout_assets(root, html, "assets/pptx-volcengine"),
            )

    def test_layout_must_use_its_bound_texture(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img src="assets/generated/replacement.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(1, len(problems))
            self.assertIn("cover", problems[0])
            self.assertIn("texture-1", problems[0])
            self.assertIn("缺少固定实例", problems[0])

    def test_layout_bound_texture_on_an_unowned_layout_is_rejected(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="content">'
                '<img data-pptx-asset="texture-1" '
                'style="position:absolute;left:1142px;top:0;width:778px;height:1080px" '
                'src="assets/pptx-claude/textures/1.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(1, len(problems))
            self.assertIn("content", problems[0])
            self.assertIn("texture-1", problems[0])
            self.assertIn("不得使用", problems[0])

    def test_layout_must_use_its_bound_background_with_query_and_fragment(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_background_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="content" '
                'data-pptx-asset="bg-content-1" '
                'style="background-image:url('
                '\'assets/pptx-claude/backgrounds/content.webp?v=2#slide\')">'
                '正文</section></deck-stage>',
            )

            self.assertEqual(
                [],
                validate_layout_assets(root, html, "assets/pptx-claude"),
            )

    def test_repeated_asset_slots_require_repeated_placements(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            with open(os.path.join(root, "layouts.md"), "w", encoding="utf-8") as stream:
                stream.write(
                    "---\n"
                    "canvas: 1920x1080\n"
                    "layouts:\n"
                    "  cover:\n"
                    "    role: cover\n"
                    "    slots:\n"
                    "      - {role: texture, box: [0, 0, 100, 100], type: pic, asset: texture-1}\n"
                    "      - {role: texture, box: [1800, 980, 100, 100], type: pic, asset: texture-1}\n"
                    "---\n"
                )
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img data-pptx-asset="texture-1" '
                'style="position:absolute;left:0;top:0;width:100px;height:100px" '
                'src="assets/pptx-claude/textures/1.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(1, len(problems))
            self.assertIn("位置尺寸应为 [1800, 980, 100, 100]", problems[0])

    def test_legacy_logo_scope_entrypoint_keeps_failure_exit_code(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img src="assets/generated/replacement.webp"></section></deck-stage>',
            )

            result = subprocess.run(
                [
                    sys.executable,
                    os.path.join(os.path.dirname(__file__), "verify_logo_scope.py"),
                    root,
                    html,
                    "--asset-prefix",
                    "assets/pptx-claude",
                ],
                capture_output=True,
                check=False,
                text=True,
            )

            self.assertEqual(1, result.returncode)
            self.assertIn("PPTX_LAYOUT_ASSETS: FAIL", result.stdout)

    def test_copied_asset_must_keep_the_source_pptx_bytes(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            copied = os.path.join(
                root, "assets", "pptx-claude", "textures", "1.webp")
            with open(copied, "wb") as stream:
                stream.write(b"generated replacement")
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img data-pptx-asset="texture-1" '
                'style="position:absolute;left:1142px;top:0;width:778px;height:1080px" '
                'src="assets/pptx-claude/textures/1.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(1, len(problems))
            self.assertIn("已被替换或改写", problems[0])

    def test_fixed_asset_must_keep_its_layout_box(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img data-pptx-asset="texture-1" '
                'style="position:absolute;left:0;top:0;width:778px;height:1080px" '
                'src="assets/pptx-claude/textures/1.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(1, len(problems))
            self.assertIn("位置尺寸必须为 [1142, 0, 778, 1080]", problems[0])

    def test_fixed_asset_cannot_be_hidden(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<div hidden><img data-pptx-asset="texture-1" '
                'style="position:absolute;left:1142px;top:0;width:778px;height:1080px" '
                'src="assets/pptx-claude/textures/1.webp"></div>'
                '</section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(1, len(problems))
            self.assertIn("不可隐藏", problems[0])

    def test_zero_sized_fixed_asset_is_hidden(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img data-pptx-asset="texture-1" '
                'style="position:absolute;left:1142px;top:0;width:0;height:1080px" '
                'src="assets/pptx-claude/textures/1.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(2, len(problems))
            self.assertTrue(any("不可隐藏" in problem for problem in problems))
            self.assertTrue(any("位置尺寸必须为" in problem for problem in problems))

    def test_fixed_asset_reference_requires_an_instance_marker(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img style="position:absolute;left:1142px;top:0;width:778px;height:1080px" '
                'src="assets/pptx-claude/textures/1.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(2, len(problems))
            self.assertTrue(any(
                "缺少 data-pptx-asset" in problem for problem in problems))
            self.assertTrue(any(
                "缺少固定实例 texture-1" in problem for problem in problems))

    def test_fixed_asset_cannot_hide_a_generated_source_behind_the_original_url(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img data-pptx-asset="texture-1" '
                'style="position:absolute;left:1142px;top:0;width:778px;height:1080px;'
                'background-image:url(\'assets/pptx-claude/textures/1.webp\')" '
                'src="assets/generated/replacement.webp"></section></deck-stage>',
            )

            problems = validate_layout_assets(root, html, "assets/pptx-claude")

            self.assertEqual(1, len(problems))
            self.assertIn("未引用对应的 PPTX 原素材", problems[0])

    def test_fixed_asset_nested_in_flow_is_checked_at_its_box(self):
        with tempfile.TemporaryDirectory() as root:
            self.write_texture_pack(root)
            with open(os.path.join(root, "layouts.md"), "w", encoding="utf-8") as stream:
                stream.write(
                    "---\n"
                    "canvas: 1920x1080\n"
                    "layouts:\n"
                    "  cover:\n"
                    "    role: cover\n"
                    "    flow:\n"
                    "      top: 80\n"
                    "      margin: [80, 80]\n"
                    "      gap: 32\n"
                    "      regions:\n"
                    "        - kind: free\n"
                    "          items:\n"
                    "            - {role: texture, type: pic, box: [1142, 0, 778, 1080], asset: texture-1}\n"
                    "---\n"
                )
            html = self.write_html(
                root,
                '<deck-stage><section data-pptx-layout="cover">'
                '<img data-pptx-asset="texture-1" '
                'style="position:absolute;left:1142px;top:0;width:778px;height:1080px" '
                'src="assets/pptx-claude/textures/1.webp"></section></deck-stage>',
            )

            self.assertEqual(
                [],
                validate_layout_assets(root, html, "assets/pptx-claude"),
            )


if __name__ == "__main__":
    unittest.main()
