#!/usr/bin/env python3
"""Verify that generated slides honor every asset bound to their PPTX layout."""
import argparse
import hashlib
import os
import posixpath
import re
import sys
from collections import Counter
from html.parser import HTMLParser
from urllib.parse import urlsplit

from check_v2 import Pack

URL_RE = re.compile(r'url\(\s*[\'"]?([^\'")\s]+)', re.I)
VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}


def normalized_path(value):
    path = urlsplit(value).path.replace("\\", "/")
    return posixpath.normpath(path).lstrip("./")


def bound_asset_ids(value, known_asset_ids):
    found = Counter()
    if isinstance(value, dict):
        for key, child in value.items():
            if (key in ("asset", "background")
                    and isinstance(child, str)
                    and child in known_asset_ids):
                found[child] += 1
            found.update(bound_asset_ids(child, known_asset_ids))
    elif isinstance(value, list):
        for child in value:
            found.update(bound_asset_ids(child, known_asset_ids))
    return found


def layout_asset_contract(pack):
    known_asset_ids = set(pack.assets)
    owners = {}
    for layout_name, (layout, _) in pack.layouts.items():
        for asset_id, _, _ in layout_asset_instances(
                layout, known_asset_ids, pack.canvas):
            owners.setdefault(asset_id, set()).add(layout_name)
    return owners


def asset_urls(pack, asset_prefix, asset_ids):
    prefix = normalized_path(asset_prefix).rstrip("/")
    urls = {}
    for asset_id in asset_ids:
        entry, _ = pack.assets.get(asset_id, (None, None))
        if not isinstance(entry, dict):
            continue
        path = entry.get("path")
        if not isinstance(path, str) or not path:
            continue
        relative = normalized_path(path)
        if relative.startswith("assets/"):
            relative = relative[len("assets/"):]
        urls.setdefault(posixpath.join(prefix, relative), set()).add(asset_id)
    return urls


def bound_asset_instances(value, known_asset_ids):
    """Return every positioned fixed-asset instance nested in slots or flow."""
    instances = []
    if isinstance(value, dict):
        box = value.get("box")
        asset_id = value.get("asset")
        if (isinstance(box, list) and len(box) == 4
                and isinstance(asset_id, str)
                and asset_id in known_asset_ids):
            instances.append((asset_id, value.get("role") or "asset", box))
        for key, child in value.items():
            if key not in ("asset", "background"):
                instances.extend(bound_asset_instances(child, known_asset_ids))
    elif isinstance(value, list):
        for child in value:
            instances.extend(bound_asset_instances(child, known_asset_ids))
    return instances


def layout_asset_instances(layout, known_asset_ids, canvas):
    """Return every fixed image instance declared by one layout."""
    if not isinstance(layout, dict):
        return []
    instances = []
    background = layout.get("background")
    if canvas and isinstance(background, str) and background in known_asset_ids:
        instances.append(
            (background, "background", [0, 0, canvas[0], canvas[1]]))
    instances.extend(bound_asset_instances(layout, known_asset_ids))
    return instances


def inline_styles(value):
    styles = {}
    for declaration in (value or "").split(";"):
        if ":" not in declaration:
            continue
        name, raw = declaration.split(":", 1)
        styles[name.strip().lower()] = re.sub(
            r"\s*!important\s*$", "", raw.strip().lower())
    return styles


def css_number(value):
    match = re.fullmatch(r"(-?(?:\d+(?:\.\d*)?|\.\d+))(?:px)?", value or "")
    return float(match.group(1)) if match else None


def element_box(reference, canvas):
    styles = reference["styles"]
    if reference["slide_root"] and not any(
            name in styles for name in ("left", "top", "width", "height")):
        return [0.0, 0.0, float(canvas[0]), float(canvas[1])]
    values = [
        css_number(styles.get(name))
        for name in ("left", "top", "width", "height")
    ]
    if styles.get("position") != "absolute" or any(
            value is None for value in values):
        return None
    return values


def boxes_match(actual, expected, tolerance=1.0):
    return actual is not None and all(
        abs(actual_value - expected_value) <= tolerance
        for actual_value, expected_value in zip(actual, expected)
    )


def file_sha256(path):
    digest = hashlib.sha256()
    with open(path, "rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def copied_asset_problems(pack, html_path, asset_prefix, asset_ids):
    """Verify copied fixed assets still contain the source PPTX bytes."""
    problems = []
    html_root = os.path.dirname(os.path.abspath(html_path))
    prefix = normalized_path(asset_prefix).rstrip("/")
    for asset_id in sorted(asset_ids):
        entry, _ = pack.assets.get(asset_id, (None, None))
        path = entry.get("path") if isinstance(entry, dict) else None
        if not isinstance(path, str) or not path:
            continue
        relative = normalized_path(path)
        if relative.startswith("assets/"):
            relative = relative[len("assets/"):]
        source_path = os.path.join(pack.root, "assets", *relative.split("/"))
        copied_relative = posixpath.join(prefix, relative)
        copied_path = os.path.join(html_root, *copied_relative.split("/"))
        if not os.path.isfile(copied_path):
            problems.append(
                "固定素材 %s 未复制到项目: %s" % (asset_id, copied_relative))
            continue
        if not os.path.isfile(source_path):
            problems.append(
                "风格包中的固定素材 %s 不存在: %s" % (asset_id, path))
            continue
        if file_sha256(copied_path) != file_sha256(source_path):
            problems.append(
                "固定素材 %s 已被替换或改写，必须使用 PPTX 原文件" % asset_id)
    return problems


def urls_from_attrs(attrs):
    urls = []
    for key, value in attrs:
        if not value:
            continue
        if key.lower() in ("src", "href"):
            urls.append(value)
        elif key.lower() == "srcset":
            urls.extend(item.strip().split(" ", 1)[0] for item in value.split(","))
        elif key.lower() == "style":
            urls.extend(URL_RE.findall(value))
    return urls


class SlideAssetParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.slides = []
        self._stack = []
        self._style_depth = 0
        self.outside_urls = []

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        attrs_map = {key.lower(): value for key, value in attrs}
        urls = urls_from_attrs(attrs)
        parent = self._stack[-1] if self._stack else None
        parent_slide = parent["slide"] if parent else None
        slide_root = bool(
            tag == "section" and parent and parent["tag"] == "deck-stage")
        slide = ({
            "layout": attrs_map.get("data-pptx-layout"),
            "references": [],
        } if slide_root else parent_slide)
        if slide_root:
            self.slides.append(slide)
        styles = inline_styles(attrs_map.get("style"))
        hidden = bool(
            (parent and parent["hidden"])
            or "hidden" in attrs_map
            or attrs_map.get("aria-hidden", "").lower() == "true"
            or styles.get("display") == "none"
            or styles.get("visibility") in ("hidden", "collapse")
            or styles.get("content-visibility") == "hidden"
            or css_number(styles.get("width")) == 0
            or css_number(styles.get("height")) == 0
            or (
                css_number(styles.get("opacity")) is not None
                and css_number(styles.get("opacity")) <= 0
            )
        )
        if slide is not None and (urls or attrs_map.get("data-pptx-asset")):
            slide["references"].append({
                "asset": attrs_map.get("data-pptx-asset"),
                "hidden": hidden,
                "slide_root": slide_root,
                "source": attrs_map.get("src"),
                "styles": styles,
                "tag": tag,
                "urls": urls,
            })
        elif urls:
            self.outside_urls.extend(urls)
        if tag == "style":
            self._style_depth += 1
        if tag not in VOID_TAGS:
            self._stack.append({
                "hidden": hidden,
                "slide": slide,
                "tag": tag,
            })

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag.lower() not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "style" and self._style_depth:
            self._style_depth -= 1
        if tag not in VOID_TAGS and self._stack:
            self._stack.pop()

    def handle_data(self, data):
        if not self._style_depth:
            return
        self.outside_urls.extend(URL_RE.findall(data))


def validate_layout_assets(pack_dir, html_path, asset_prefix):
    """Return violations of the asset contract declared by each layout."""
    pack = Pack(pack_dir)
    owners = layout_asset_contract(pack)
    known_urls = asset_urls(pack, asset_prefix, owners)
    if not known_urls:
        return []
    asset_urls_by_id = {
        asset_id: url
        for url, asset_ids in known_urls.items()
        for asset_id in asset_ids
    }

    with open(html_path, encoding="utf-8") as stream:
        text = stream.read()
    parser = SlideAssetParser()
    parser.feed(text)
    parser.close()

    problems = copied_asset_problems(pack, html_path, asset_prefix, owners)
    for url in parser.outside_urls:
        for asset_id in sorted(known_urls.get(normalized_path(url), ())):
            problems.append(
                "模板资产 %s 出现在 slide section 外，无法核验页型归属" % asset_id)
    for number, slide in enumerate(parser.slides, 1):
        layout = slide["layout"]
        if not layout:
            problems.append("第 %d 页缺少 data-pptx-layout，无法核验模板资产归属" % number)
            continue
        if layout not in pack.layouts:
            problems.append("第 %d 页声明了不存在的模板页型: %s" % (number, layout))
            continue
        expected = layout_asset_instances(
            pack.layouts[layout][0], set(pack.assets), pack.canvas)
        actual = []
        for reference in slide["references"]:
            referenced_ids = set()
            normalized_urls = [normalized_path(url) for url in reference["urls"]]
            for url in normalized_urls:
                referenced_ids.update(known_urls.get(url, ()))
            asset_id = reference["asset"]
            if not asset_id:
                for referenced_id in sorted(referenced_ids):
                    problems.append(
                        "第 %d 页模板资产 %s 缺少 data-pptx-asset 实例标记"
                        % (number, referenced_id))
                continue
            if asset_id not in pack.assets:
                problems.append(
                    "第 %d 页声明了不存在的模板资产: %s" % (number, asset_id))
                continue
            expected_url = asset_urls_by_id.get(asset_id)
            uses_expected_source = (
                len(normalized_urls) == 1
                and normalized_urls[0] == expected_url
                and (
                    reference["tag"] != "img"
                    or (
                        reference["source"]
                        and normalized_path(reference["source"]) == expected_url
                    )
                )
            )
            if not uses_expected_source:
                problems.append(
                    "第 %d 页固定实例 %s 未引用对应的 PPTX 原素材"
                    % (number, asset_id))
            if reference["hidden"]:
                problems.append(
                    "第 %d 页固定实例 %s 不可隐藏" % (number, asset_id))
            actual.append({
                "asset": asset_id,
                "box": element_box(reference, pack.canvas),
            })

        used_asset_counts = Counter(instance["asset"] for instance in actual)
        for asset_id in sorted(used_asset_counts):
            if layout not in owners.get(asset_id, set()):
                allowed = "、".join(sorted(owners.get(asset_id) or ())) or "（无）"
                problems.append(
                    "第 %d 页页型 %s 不得使用 %s；只允许: %s"
                    % (number, layout, asset_id, allowed))
        unmatched = list(actual)
        for asset_id, _, expected_box in expected:
            matching_index = next((
                index for index, instance in enumerate(unmatched)
                if instance["asset"] == asset_id
                and boxes_match(instance["box"], expected_box)
            ), None)
            if matching_index is not None:
                unmatched.pop(matching_index)
                continue
            same_asset = next((
                instance for instance in unmatched
                if instance["asset"] == asset_id
            ), None)
            if same_asset:
                problems.append(
                    "第 %d 页固定实例 %s 的位置尺寸必须为 %s，当前为 %s"
                    % (number, asset_id, expected_box, same_asset["box"]))
                unmatched.remove(same_asset)
            else:
                problems.append(
                    "第 %d 页页型 %s 缺少固定实例 %s，位置尺寸应为 %s"
                    % (number, layout, asset_id, expected_box))
        for instance in unmatched:
            if layout in owners.get(instance["asset"], set()):
                problems.append(
                    "第 %d 页页型 %s 额外使用了固定实例 %s"
                    % (number, layout, instance["asset"]))
    return problems


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Verify that generated deck HTML honors PPTX layout asset bindings.")
    parser.add_argument("pack_dir")
    parser.add_argument("html_path")
    parser.add_argument("--asset-prefix", required=True)
    args = parser.parse_args(argv)

    problems = validate_layout_assets(args.pack_dir, args.html_path, args.asset_prefix)
    if not problems:
        print("PPTX_LAYOUT_ASSETS: PASS")
        return 0
    print("PPTX_LAYOUT_ASSETS: FAIL count=%d" % len(problems))
    for problem in problems:
        print("[layoutAssets] %s" % problem)
    return 1


if __name__ == "__main__":
    sys.exit(main())
