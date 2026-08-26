#!/usr/bin/env python3
"""Regression tests for preserving per-container radii."""
import os
import tempfile
import unittest

from draft import emit_body, emit_frontmatter
from query import _recipe_css


def render_frontmatter(radii):
    data = {
        "radii_census": radii,
        "spacing_candidates": {},
    }
    tokens = [("surface", {"hex": "#FFFFFF"})]

    with tempfile.TemporaryDirectory() as output_dir:
        emit_frontmatter(
            data,
            tokens,
            [],
            {},
            [],
            [],
            output_dir,
        )
        with open(os.path.join(output_dir, "frontmatter.yaml"), encoding="utf-8") as stream:
            return stream.read()


def render_body():
    data = {
        "canvas": {"px": [1920, 1080]},
        "form_hint": {"form": 2},
        "counts": {"slides": 1},
    }

    with tempfile.TemporaryDirectory() as output_dir:
        emit_body(
            data,
            [],
            [],
            {},
            [],
            [],
            [],
            {},
            output_dir,
        )
        with open(os.path.join(output_dir, "body.md"), encoding="utf-8") as stream:
            return stream.read()


class RoundedContractTest(unittest.TestCase):
    def test_multiple_radius_tiers_are_not_collapsed_into_one_card_token(self):
        frontmatter = render_frontmatter(
            [
                {"px": 6.9, "n": 2},
                {"px": 11.9, "n": 2},
                {"px": 14.4, "n": 3},
            ]
        )

        self.assertNotIn("rounded:", frontmatter)

    def test_single_radius_tier_can_remain_a_global_token(self):
        frontmatter = render_frontmatter([{"px": 12, "n": 9}])

        self.assertIn("rounded:\n  card: 12px", frontmatter)

    def test_rare_rounded_exceptions_do_not_override_a_zero_radius_majority(self):
        frontmatter = render_frontmatter(
            [
                {"px": 0, "n": 241},
                {"px": 3.4, "n": 4},
                {"px": 6.9, "n": 3},
                {"px": 50.5, "n": 1},
            ]
        )

        self.assertNotIn("rounded:", frontmatter)

    def test_generated_usage_defaults_unspecified_container_radius_to_zero(self):
        body = render_body()

        self.assertIn("没有 `border-radius` 就按 `0`", body)
        self.assertIn("不得自行补圆角", body)

    def test_recipe_does_not_promote_one_rounded_exception_to_the_whole_group(self):
        css = _recipe_css(
            {"type": "solid", "color": {"hex": "#FFFFFF"}},
            None,
            [0] * 70 + [50.5],
            None,
        )

        self.assertFalse(any("border-radius" in declaration for declaration in css))

    def test_recipe_keeps_a_radius_shared_by_the_whole_group(self):
        css = _recipe_css(
            {"type": "solid", "color": {"hex": "#FFFFFF"}},
            None,
            [6.9] * 17,
            None,
        )

        self.assertIn("border-radius: 6.9px", css)


if __name__ == "__main__":
    unittest.main()
