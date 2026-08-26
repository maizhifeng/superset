#!/usr/bin/env python3
"""风格包 v2 机器门禁（镜像 ../v2-format-spec.md §5：V2-1..V2-16 + V2-R5/R6/R7）。

用法: check_v2.py <包目录>
只做 v2 追加校验；check_v1 的规则不重复实现，调用方须先跑 check_v1.py。
无 FAIL 退出码 0（WARN 不阻塞），有 FAIL 退出码 1。
规则以 v2-format-spec.md §5 为唯一事实源，此处为镜像。
"""
import os
import re
import sys

# —— §1 frontmatter 键序清单（V2-9）——
KEY_ORDER = [
    "version", "name", "name_zh", "description", "colors", "typography",
    "spacing", "rounded", "components", "omitted",
    "anchors", "gaps", "exceptions", "canvas",
    "canvas-source", "themes", "default-theme", "theme-mechanism", "color-confidence",
    "assets", "layouts", "safe-area",
]

# —— §2 / §3 封闭枚举（V2-4）——
ENUM_KIND = ["logo", "slogan", "background", "texture", "icon"]
ENUM_MARK = ["primary", "secondary", "icon", "wordmark", "lockup"]
ENUM_ON_BG = ["light", "dark"]
ENUM_ASSET_ROLE = ["cover", "content", "section", "closing", "accent"]
ENUM_LAYOUT_ROLE = ["cover", "section", "content", "quote", "closing", "blank", "custom"]
ENUM_SLOT_TYPE = ["title", "subtitle", "body", "pic", "table", "chart", "media",
                  "slide-number", "footer"]
ENUM_CONFIDENCE = ["high", "medium", "low"]

# —— V2-7 花括号禁引段名 ——
V2_SECTIONS = ["themes", "default-theme", "theme-mechanism", "color-confidence",
               "assets", "layouts", "safe-area", "canvas", "canvas-source"]

# —— V2-11 YAML 1.1 布尔字面量（PyYAML 会把这些键名解析成 True/False）——
BOOL_LITERALS = {"y", "yes", "n", "no", "true", "false", "on", "off"}

# —— V2-6 体积上限（KB = 1024）——
ASSET_WARN_SINGLE = 500 * 1024          # 压缩图单张（受检对象 = 条目 path 指向的包内文件）
ASSET_MAX_TOTAL = 20 * 1024 * 1024      # 包内资产总量（assets/** ∪ 条目 path/full 并集）

# §5 V2-R5 行的排除项：sidecar 自身载荷键，design.md 侧同名键是指针不是冲突
SIDECAR_OWN_KEYS = {"layouts", "layouts-file", "canvas"}   # canvas 的家在 sidecar（§1.1）

# —— V2-3 出血容差 ——
BLEED = 0.05

KEY_RE = re.compile(r'^"?([A-Za-z0-9_@.\-]+)"?\s*:(?:\s+(.*?))?\s*$')


# ============================ 轻量 YAML 子集解析 ============================
# 环境无 PyYAML（已探测：ModuleNotFoundError），手写覆盖本 schema 用到的形态：
# 块映射 / 块序列 / 流映射 / 流序列 / 引号标量 / 折叠标量(>- |)/ 行尾注释。

def _strip_comment(line):
    """去掉行尾 # 注释（引号内的 # 不算，如 "#0A0E1E"）。"""
    out, quote = [], None
    for i, ch in enumerate(line):
        if quote:
            out.append(ch)
            if ch == quote:
                quote = None
            continue
        if ch in '"\'':
            quote = ch
            out.append(ch)
            continue
        if ch == "#" and (i == 0 or line[i - 1] in " \t"):
            break
        out.append(ch)
    return "".join(out).rstrip()


def _scalar(text):
    text = text.strip()
    if len(text) >= 2 and text[0] == text[-1] and text[0] in '"\'':
        return text[1:-1]
    if text in ("", "~", "null", "Null", "NULL"):
        return None
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    if re.fullmatch(r"-?\d+\.\d+", text):
        return float(text)
    return text


def _read_flow_token(text, i, stops):
    """读到 stops 里的字符（引号内不算），返回 (原文, 新位置)。"""
    start, quote = i, None
    while i < len(text):
        ch = text[i]
        if quote:
            if ch == quote:
                quote = None
        elif ch in '"\'':
            quote = ch
        elif ch in stops:
            break
        i += 1
    return text[start:i], i


def _parse_flow(text, i, keys_out, lineno):
    """解析流式 { } / [ ] / 标量，返回 (值, 新位置)。"""
    while i < len(text) and text[i] == " ":
        i += 1
    if i >= len(text):
        return None, i
    if text[i] == "{":
        out, i = {}, i + 1
        while i < len(text):
            while i < len(text) and text[i] in " ,":
                i += 1
            if i < len(text) and text[i] == "}":
                i += 1
                break
            raw_key, i = _read_flow_token(text, i, ":,}")
            key = raw_key.strip().strip('"\'')
            if i < len(text) and text[i] == ":":
                i += 1
                value, i = _parse_flow(text, i, keys_out, lineno)
            else:
                value = None
            if key:
                keys_out.append((key, lineno))
                out[key] = value
        return out, i
    if text[i] == "[":
        out, i = [], i + 1
        while i < len(text):
            while i < len(text) and text[i] in " ,":
                i += 1
            if i < len(text) and text[i] == "]":
                i += 1
                break
            value, i = _parse_flow(text, i, keys_out, lineno)
            out.append(value)
        return out, i
    raw, i = _read_flow_token(text, i, ",}]")
    return _scalar(raw), i


def _parse_inline(text, keys_out, lineno):
    text = text.strip()
    if text[:1] in ("{", "["):
        value, _ = _parse_flow(text, 0, keys_out, lineno)
        return value
    return _scalar(text)


class YamlLite:
    """块结构解析器；同时记录所有出现过的映射键名与行号（V2-9 / V2-11 用）。"""

    def __init__(self, text):
        self.lines = [(n, _strip_comment(raw))
                      for n, raw in enumerate(text.split("\n"), 1)]
        self.pos = 0
        self.keys = []          # [(键名, 行号)] —— 全量，含流映射内的键
        self.root_keys = []     # [(键名, 行号)] —— 仅顶层
        self.anomalies = []     # 解析器看不懂的行

    @staticmethod
    def _indent(text):
        return len(text) - len(text.lstrip(" "))

    def _peek(self):
        while self.pos < len(self.lines):
            lineno, text = self.lines[self.pos]
            if text.strip() == "":
                self.pos += 1
                continue
            return lineno, text
        return None

    def parse(self):
        head = self._peek()
        if head is None:
            return {}
        return self._block(self._indent(head[1]), root=True)

    def _block(self, indent, root=False):
        head = self._peek()
        if head is None:
            return None
        if head[1].strip() == "-" or head[1].strip().startswith("- "):
            return self._seq(indent)
        return self._map(indent, root=root)

    def _map(self, indent, root=False):
        out = {}
        while True:
            head = self._peek()
            if head is None:
                break
            lineno, text = head
            cur = self._indent(text)
            if cur < indent:
                break
            body = text.strip()
            if cur > indent or body.startswith("- "):
                self.anomalies.append((lineno, text))
                self.pos += 1
                continue
            match = KEY_RE.match(body)
            if not match:
                self.anomalies.append((lineno, text))
                self.pos += 1
                continue
            key, rest = match.group(1), match.group(2)
            self.keys.append((key, lineno))
            if root:
                self.root_keys.append((key, lineno))
            self.pos += 1
            out[key] = self._value(rest, indent, lineno)
        return out

    def _value(self, rest, indent, lineno):
        rest = (rest or "").strip()
        if rest in (">", ">-", ">+", "|", "|-", "|+"):
            return self._block_scalar(indent, rest[0])
        if rest:
            return _parse_inline(rest, self.keys, lineno)
        head = self._peek()
        if head is None:
            return None
        child = self._indent(head[1])
        if child > indent:
            return self._block(child)
        if child == indent and head[1].strip().startswith("- "):
            return self._seq(indent)
        return None

    def _block_scalar(self, indent, style):
        parts = []
        while self.pos < len(self.lines):
            _, text = self.lines[self.pos]
            if text.strip() != "" and self._indent(text) <= indent:
                break
            parts.append(text.strip())
            self.pos += 1
        return (" " if style == ">" else "\n").join(p for p in parts if p != "")

    def _seq(self, indent):
        out = []
        while True:
            head = self._peek()
            if head is None:
                break
            lineno, text = head
            if self._indent(text) != indent:
                break
            body = text.strip()
            if body != "-" and not body.startswith("- "):
                break
            item = body[1:].strip()
            item_col = text.find(item, self._indent(text)) if item else indent + 2
            self.pos += 1
            if item == "":
                nxt = self._peek()
                out.append(self._block(self._indent(nxt[1]))
                           if nxt and self._indent(nxt[1]) > indent else None)
                continue
            match = KEY_RE.match(item) if item[:1] not in ("{", "[", '"', "'") else None
            if match:
                key, rest = match.group(1), match.group(2)
                self.keys.append((key, lineno))
                entry = {key: self._value(rest, item_col, lineno)}
                nxt = self._peek()
                if nxt and self._indent(nxt[1]) == item_col:
                    entry.update(self._map(item_col))
                out.append(entry)
            else:
                out.append(_parse_inline(item, self.keys, lineno))
        return out


# ================================ 包加载 ================================

FRONTMATTER_RE = re.compile(r"^---\n(.*?)\n---\n?(.*)$", re.S)
YAML_FENCE_RE = re.compile(r"^```ya?ml\n(.*?)^```", re.S | re.M)


class MdFile:
    """一个 md 文件：frontmatter + 正文 + 正文里的 ```yaml 围栏块。"""

    def __init__(self, path):
        self.path = path
        self.name = os.path.basename(path)
        with open(path, encoding="utf-8") as handle:
            self.text = handle.read()
        match = FRONTMATTER_RE.match(self.text)
        fm_text, self.body = (match.group(1), match.group(2)) if match else ("", self.text)
        self.fm_offset = 1 if match else 0
        parser = YamlLite(fm_text)
        self.data = parser.parse() or {}
        self.keys = [(k, n + self.fm_offset) for k, n in parser.keys]
        self.root_keys = [(k, n + self.fm_offset) for k, n in parser.root_keys]
        self.anomalies = [(n + self.fm_offset, t) for n, t in parser.anomalies]
        self.fenced = []
        for fence in YAML_FENCE_RE.finditer(self.body):
            offset = self.text[:self.text.index(fence.group(0))].count("\n")
            sub = YamlLite(fence.group(1))
            self.fenced.append(sub.parse() or {})
            self.keys += [(k, n + offset) for k, n in sub.keys]

    def section(self, key):
        """先取 frontmatter，再取正文围栏块——存量风格包有把 layouts 写在正文围栏块里的。"""
        if isinstance(self.data.get(key), (dict, list)):
            return self.data[key]
        for block in self.fenced:
            if isinstance(block.get(key), (dict, list)):
                return block[key]
        return self.data.get(key)


class Pack:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.notes = []
        design_path = os.path.join(self.root, "design.md")
        if not os.path.isfile(design_path):
            raise SystemExit(f"FATAL: 包目录缺 design.md: {design_path}")
        self.design = MdFile(design_path)
        self.files = [self.design]

        # layouts sidecar 指针：规范定名 layouts；layouts-file 已废弃但仍解析，
        # 否则整份 sidecar 消失会级联出一堆假 FAIL——废弃键本身由 V2-9 判 FAIL。
        self.layout_pointer = None
        for key in ("layouts", "layouts-file"):
            value = self.design.data.get(key)
            if isinstance(value, str) and value.strip().endswith(".md"):
                self.layout_pointer = (key, value.strip())
                break
        self.layouts_file = None
        candidate = self.layout_pointer[1] if self.layout_pointer else "layouts.md"
        path = os.path.join(self.root, candidate)
        if os.path.isfile(path):
            self.layouts_file = MdFile(path)
            self.files.append(self.layouts_file)
        self.legacy_layout_keys = [(md.name, lineno) for md in self.files
                                   for key, lineno in md.root_keys if key == "layouts-file"]

        # 各段（V2-1/V2-2 要求跨 design.md + layouts.md 求并集）
        self.assets = {}
        self.layouts = {}
        for md in self.files:
            block = md.section("assets")
            if isinstance(block, dict):
                for key, value in block.items():
                    self.assets.setdefault(key, (value, md))
            block = md.section("layouts")
            if isinstance(block, dict):
                for key, value in block.items():
                    self.layouts.setdefault(key, (value, md))
        self.safe_area = None
        for md in self.files:
            block = md.section("safe-area")
            if isinstance(block, dict):
                self.safe_area = (block, md)
                break
        self.themes = []
        for md in self.files:
            value = md.section("themes")
            if isinstance(value, list):
                for theme in value:
                    if theme not in self.themes:
                        self.themes.append(theme)
        self.canvas = None
        for md in self.files:
            value = md.data.get("canvas")
            if isinstance(value, str):
                match = re.fullmatch(r"\s*(\d+)\s*[xX×]\s*(\d+)\s*", value)
                if match:
                    self.canvas = (int(match.group(1)), int(match.group(2)), md)
                    break
        self.colors = self.design.data.get("colors") or {}


# ================================ 校验规则 ================================

class Result:
    def __init__(self, rule, title):
        self.rule, self.title = rule, title
        self.fails, self.warns, self.notes = [], [], []

    @property
    def level(self):
        return "FAIL" if self.fails else ("WARN" if self.warns else "PASS")


def _iter_slots(pack):
    for name, (layout, md) in pack.layouts.items():
        if not isinstance(layout, dict):
            continue
        for slot in layout.get("slots") or []:
            if isinstance(slot, dict):
                yield name, layout, slot, md


def _asset_refs(value):
    """layouts 的 asset/background 值 → [(资产 id, 主题或 None)]；{color: x} 单独识别。"""
    if isinstance(value, str):
        return [(value, None)], None
    if isinstance(value, dict):
        if set(value) == {"color"}:
            return [], value["color"]
        return [(v, k) for k, v in value.items() if isinstance(v, str)], None
    return [], None


def rule_v2_1(pack):
    """V2-1 path/url 引用断链（含 slots 的 by-theme 嵌套形态）"""
    res = Result("V2-1", "path/url 引用断链（含 by-theme 嵌套）")
    checked = 0
    for aid, (entry, md) in sorted(pack.assets.items()):
        if not isinstance(entry, dict):
            continue
        path = entry.get("path")
        url = entry.get("url")
        full = entry.get("full")
        if isinstance(path, str):
            checked += 1
            if not os.path.isfile(os.path.join(pack.root, path)):
                res.fails.append(f"assets.{aid}.path 断链：包内不存在 {path}")
        if isinstance(full, str):        # 方案甲原图（§2），同样是包内路径引用
            checked += 1
            if not os.path.isfile(os.path.join(pack.root, full)):
                res.fails.append(f"assets.{aid}.full 断链：包内不存在 {full}")
        if isinstance(url, str):
            checked += 1
            if not re.match(r"https?://", url):
                res.fails.append(f"assets.{aid}.url 非 http(s) 地址：{url}")
            else:
                res.notes.append(f"assets.{aid}.url 为远端地址，离线不可验活：{url}")
    # layouts 里的 asset/background 引用必须指向已声明资产
    for name, layout, slot, md in _iter_slots(pack):
        refs, color = _asset_refs(slot.get("asset"))
        for aid, theme in refs:
            checked += 1
            if aid not in pack.assets:
                where = f'layouts.{name}.slots[{slot.get("role")}].asset'
                where += f".{theme}" if theme else ""
                res.fails.append(f"{where} 断链：未声明资产 `{aid}`")
        if color is not None:
            res.warns.append(
                f'layouts.{name}.slots[{slot.get("role")}].asset 用了 {{color: ...}} 形态，'
                '§3 未定义（asset 仅 <asset-id> / {<theme>: <asset-id>} 两形态）')
    for name, (layout, md) in sorted(pack.layouts.items()):
        if not isinstance(layout, dict):
            continue
        refs, color = _asset_refs(layout.get("background"))
        for aid, theme in refs:
            checked += 1
            if aid not in pack.assets:
                where = f"layouts.{name}.background" + (f".{theme}" if theme else "")
                res.fails.append(f"{where} 断链：未声明资产 `{aid}`")
        if color is not None:
            token = str(color).strip("{}")
            token = token[len("colors."):] if token.startswith("colors.") else token
            # {color: <colors-token>} 是 §3 三形态之一，合法形态不告警；
            # 与 {<theme>: <asset-id>} 的歧义由 color 是保留键（主题名禁用）在键名层消解。
            if token not in pack.colors:
                res.fails.append(
                    f"layouts.{name}.background.color 断链：colors 未定义 `{token}`")
    # sidecar 指针本身也是一条包内路径引用
    if pack.layout_pointer:
        key, target = pack.layout_pointer
        checked += 1
        if not os.path.isfile(os.path.join(pack.root, target)):
            res.fails.append(f"{key} 指针断链：包内不存在 {target}")
    if checked == 0:
        res.notes.append("包内无 path/url/资产引用，无适用对象")
    else:
        res.notes.append(f"共校验 {checked} 处引用")
    return res


def rule_v2_2(pack):
    """V2-2 孤儿资产"""
    res = Result("V2-2", "孤儿资产（声明但无处引用）")
    if not pack.assets:
        res.notes.append("包内无 assets 段，无适用对象")
        return res
    referenced = set()
    for name, layout, slot, md in _iter_slots(pack):
        referenced.update(aid for aid, _ in _asset_refs(slot.get("asset"))[0])
    for name, (layout, md) in pack.layouts.items():
        if isinstance(layout, dict):
            referenced.update(aid for aid, _ in _asset_refs(layout.get("background"))[0])
    for md in pack.files:                    # 正文反引号裸 id 也算引用（§1 引用硬规则）
        referenced.update(re.findall(r"`([\w\-./]+)`", md.body))
    orphans = [aid for aid in sorted(pack.assets) if aid not in referenced]
    for aid in orphans:
        res.warns.append(f"资产 `{aid}` 声明后未被 layouts 或正文引用")
    res.notes.append(f"{len(pack.assets) - len(orphans)}/{len(pack.assets)} 个资产被引用")
    # 孤儿判定的粒度是「资产 id」，不是文件：条目的 full（原图）挂在已声明 id 下，
    # 只要该 id 被引用就随之被引用，不单独算孤儿（§5 V2-2 行 + §2 方案甲）。
    withfull = [aid for aid, (e, _) in sorted(pack.assets.items())
                if isinstance(e, dict) and isinstance(e.get("full"), str)]
    if withfull:
        res.notes.append(f'{len(withfull)} 个条目带 full（原图）：'
                         f'{", ".join(withfull)}——随其 id 判定，不单独算孤儿')
    return res


def rule_v2_3(pack):
    """V2-3 坐标出 canvas ±5% 出血容差"""
    res = Result("V2-3", f"坐标出 canvas ±{int(BLEED * 100)}% 出血容差")
    boxes = []
    for name, layout, slot, md in _iter_slots(pack):
        if isinstance(slot.get("box"), list):
            boxes.append((f'layouts.{name}.slots[{slot.get("role")}].box', slot["box"]))
    for aid, (entry, md) in sorted(pack.assets.items()):
        if isinstance(entry, dict) and isinstance(entry.get("boxes"), list):
            for idx, box in enumerate(entry["boxes"]):
                boxes.append((f"assets.{aid}.boxes[{idx}]", box))
    if not boxes:
        res.notes.append("包内无坐标，无适用对象")
        return res
    if not pack.canvas:
        res.fails.append("存在坐标但 frontmatter 无可解析的 canvas（见 V2-10）")
        return res
    width, height, _ = pack.canvas
    max_x, max_y = width * (1 + BLEED), height * (1 + BLEED)
    min_x, min_y = -width * BLEED, -height * BLEED
    for where, box in boxes:
        if not (isinstance(box, list) and len(box) == 4
                and all(isinstance(v, (int, float)) for v in box)):
            res.fails.append(f"{where} 不是 4 个数字的 [x, y, w, h]：{box}")
            continue
        x, y, w, h = box
        if x < min_x or y < min_y or x + w > max_x or y + h > max_y:
            res.fails.append(
                f"{where} = {box} 出界（canvas {width}x{height}，"
                f"容许 x∈[{min_x:.0f},{max_x:.0f}] y∈[{min_y:.0f},{max_y:.0f}]）")
    res.notes.append(f"canvas {width}x{height}，校验 {len(boxes)} 个 box")
    return res


def _check_enum(res, where, value, allowed):
    if value is None:
        return
    if value not in allowed:
        res.fails.append(f'{where} = `{value}` 不在枚举 {"|".join(map(str, allowed))}')


def rule_v2_4(pack):
    """V2-4 kind/mark/on-bg/role/theme/type/confidence 枚举合法"""
    res = Result("V2-4", "kind/mark/on-bg/role/theme/type/confidence 枚举合法")
    themes = pack.themes or ENUM_ON_BG
    count = 0
    for aid, (entry, md) in sorted(pack.assets.items()):
        if not isinstance(entry, dict):
            continue
        count += 1
        _check_enum(res, f"assets.{aid}.kind", entry.get("kind"), ENUM_KIND)
        _check_enum(res, f"assets.{aid}.mark", entry.get("mark"), ENUM_MARK)
        _check_enum(res, f"assets.{aid}.on-bg", entry.get("on-bg"), ENUM_ON_BG)
        _check_enum(res, f"assets.{aid}.confidence", entry.get("confidence"), ENUM_CONFIDENCE)
        _check_enum(res, f"assets.{aid}.theme", entry.get("theme"), themes)
        if entry.get("kind") == "background":
            _check_enum(res, f"assets.{aid}.role", entry.get("role"), ENUM_ASSET_ROLE)
    for name, (layout, md) in sorted(pack.layouts.items()):
        if not isinstance(layout, dict):
            continue
        count += 1
        _check_enum(res, f"layouts.{name}.role", layout.get("role"), ENUM_LAYOUT_ROLE)
        _check_enum(res, f"layouts.{name}.confidence", layout.get("confidence"), ENUM_CONFIDENCE)
        for theme in layout.get("themes") or []:
            if theme not in themes:
                res.fails.append(f"layouts.{name}.themes 含未声明主题 `{theme}`")
    for name, layout, slot, md in _iter_slots(pack):
        count += 1
        # slots.role 是开放枚举（§3「slots.*.role 开放不校验」），只校验 type
        _check_enum(res, f'layouts.{name}.slots[{slot.get("role")}].type',
                    slot.get("type"), ENUM_SLOT_TYPE)
    if pack.safe_area:
        _check_enum(res, "safe-area.confidence", pack.safe_area[0].get("confidence"),
                    ENUM_CONFIDENCE)
    conf = pack.design.data.get("color-confidence")
    if isinstance(conf, dict):
        _check_enum(res, "color-confidence.level", conf.get("level"), ENUM_CONFIDENCE)
    if count == 0:
        res.notes.append("包内无 assets/layouts 段，无适用对象")
    else:
        res.notes.append(f"校验 {count} 个带枚举字段的条目")
    return res


def rule_v2_5(pack):
    """V2-5 推断段缺 confidence"""
    res = Result("V2-5", "推断段缺 confidence")
    count = 0
    # assets 的 confidence 属审计字段，落 ref/audit.yaml，不受本检（§5 V2-5 行）
    for name, (layout, md) in sorted(pack.layouts.items()):
        if isinstance(layout, dict):
            count += 1
            if "confidence" not in layout:
                res.fails.append(f"layouts.{name} 缺 confidence")
    if pack.safe_area:
        count += 1
        if "confidence" not in pack.safe_area[0]:
            res.fails.append("safe-area 缺 confidence")
    if count == 0:
        res.notes.append("包内无推断段，无适用对象")
    else:
        res.notes.append(f"校验 {count} 个推断段条目")
    return res


def _pack_asset_files(pack):
    """随包下发的资产文件清单 → {包内相对路径: 字节数}。

    口径（§5 V2-6 行）= `assets/**` 下所有文件 ∪ 条目声明的 path/full 并集，
    并集是为了防「未声明的大文件」和「声明在 assets/ 之外的大文件」两头绕过。
    """
    files = {}
    assets_dir = os.path.join(pack.root, "assets")
    for base, _, names in os.walk(assets_dir):
        for fname in names:
            abspath = os.path.join(base, fname)
            files[os.path.relpath(abspath, pack.root)] = os.path.getsize(abspath)
    for aid, (entry, md) in pack.assets.items():
        if not isinstance(entry, dict):
            continue
        for field in ("path", "full"):
            rel = entry.get(field)
            if isinstance(rel, str) and os.path.isfile(os.path.join(pack.root, rel)):
                files[os.path.normpath(rel)] = os.path.getsize(os.path.join(pack.root, rel))
    return files


def rule_v2_6(pack):
    """V2-6 压缩图单张 >500KB WARN；包内资产总量 >20MB FAIL"""
    res = Result("V2-6", "压缩图单张 >500KB WARN；包内资产总量 >20MB FAIL")
    # 500KB 只管压缩图 = 条目 path 指向的包内文件；
    # full（原图）天然大，豁免单张 WARN 但计入总量；url 条目包内无文件，不适用。
    compressed, url_borne = {}, []
    for aid, (entry, md) in sorted(pack.assets.items()):
        if not isinstance(entry, dict):
            continue
        if isinstance(entry.get("url"), str):
            url_borne.append(aid)
            continue
        rel = entry.get("path")
        if isinstance(rel, str) and os.path.isfile(os.path.join(pack.root, rel)):
            compressed[os.path.normpath(rel)] = os.path.getsize(os.path.join(pack.root, rel))
    for rel, size in sorted(compressed.items()):
        if size > ASSET_WARN_SINGLE:
            res.warns.append(f"{rel} = {size / 1024:.1f}KB > 500KB（压缩图单张上限）")

    files = _pack_asset_files(pack)
    if not files:
        res.notes.append("包内无资产文件，总量检查无适用对象")
    else:
        total = sum(files.values())
        if total > ASSET_MAX_TOTAL:
            res.fails.append(f"包内资产总量 {total / 1024 / 1024:.2f}MB > 20MB"
                             f"（{len(files)} 个文件：assets/** ∪ 条目 path/full）")
        res.notes.append(f"包内资产 {len(files)} 个文件，总 {total / 1024:.1f}KB，"
                         f"最大 {max(files.values()) / 1024:.1f}KB")
    res.notes.append(f"受 500KB 检查的压缩图（条目 path）{len(compressed)} 个"
                     + (f"；url 承载条目 {len(url_borne)} 个不适用体积检查" if url_borne else ""))
    return res


def rule_v2_7(pack):
    """V2-7 花括号引用新段显式拦截"""
    res = Result("V2-7", "花括号引用新段（{assets.*} 等）")
    pattern = re.compile(r"\{(" + "|".join(map(re.escape, V2_SECTIONS)) + r")\.([\w\-]+)\}")
    for md in pack.files:
        for lineno, line in enumerate(md.text.split("\n"), 1):
            for section, token in pattern.findall(line):
                res.fails.append(
                    f"{md.name}:{lineno} 花括号引用新段 {{{section}.{token}}}"
                    "（check_v1 会判未知命名空间 broken-ref，须改反引号裸 id）")
    res.notes.append(f"扫描 {len(pack.files)} 个 md 全文")
    return res


def rule_v2_8(pack):
    """V2-8 themes 声明主题缺可用 logo on-bg 变体"""
    res = Result("V2-8", "themes 每主题需有可用 logo on-bg 变体")
    if not pack.themes:
        res.notes.append("未声明 themes，无适用对象")
        return res
    have = {entry.get("on-bg") for entry, _ in pack.assets.values()
            if isinstance(entry, dict) and entry.get("kind") == "logo"}
    for theme in pack.themes:
        if theme not in have:
            res.warns.append(f"themes 声明 `{theme}`，但无 kind: logo 且 on-bg: {theme} 的资产")
    res.notes.append(f"themes = {pack.themes}，logo on-bg 覆盖 = {sorted(x for x in have if x)}")
    return res


def rule_v2_9(pack):
    """V2-9 frontmatter 键序不符 §1 清单"""
    res = Result("V2-9", "frontmatter 键名/键序符合 §1 清单")
    order_index = {key: i for i, key in enumerate(KEY_ORDER)}
    seen, unknown = [], []
    for key, lineno in pack.design.root_keys:
        if key in order_index:
            seen.append((key, order_index[key], lineno))
        else:
            unknown.append((key, lineno))
    positions = [p for _, p, _ in seen]
    if positions != sorted(positions):
        actual = " → ".join(k for k, _, _ in seen)
        expect = " → ".join(k for k, _, _ in sorted(seen, key=lambda t: t[1]))
        res.warns.append(f"键序乱：实际 {actual}；应为 {expect}")
    for name, lineno in pack.legacy_layout_keys:      # 键名收紧（§3 键名统一 layouts）
        res.fails.append(
            f"{name}:{lineno} 键 `layouts-file` 已废弃，规范定名 `layouts`"
            "（值为 string 且 .md 结尾 = sidecar 指针，值为 map = 内联）")
    for key, lineno in unknown:
        if key == "layouts-file":                     # 已由上面判 FAIL，不重复报 WARN
            continue
        res.warns.append(f"design.md:{lineno} 键 `{key}` 不在 §1 键序清单")
    res.notes.append(f"顶层键 {len(pack.design.root_keys)} 个，识别 {len(seen)} 个")
    return res


def rule_v2_10(pack):
    """V2-10 含 layouts/safe-area 缺 canvas"""
    res = Result("V2-10", "含 layouts/safe-area 必有 canvas")
    triggers = []
    if pack.layouts:
        triggers.append("layouts")
    if pack.safe_area:
        triggers.append("safe-area")
    if not triggers:
        res.notes.append("无 layouts / safe-area 段，无适用对象")
        return res
    if not pack.canvas:
        res.fails.append(f'包内有 {"/".join(triggers)} 但无可解析的 canvas: <W>x<H>')
        return res
    width, height, md = pack.canvas
    res.notes.append(f'触发段 {"/".join(triggers)}；canvas {width}x{height}（来自 {md.name}）')
    return res


def rule_v2_11(pack):
    """V2-11 键名命中 YAML 1.1 布尔字面量"""
    res = Result("V2-11", "键名不得命中 YAML 1.1 布尔字面量")
    total = 0
    for md in pack.files:
        for key, lineno in md.keys:
            total += 1
            if str(key).lower() in BOOL_LITERALS:
                res.fails.append(
                    f"{md.name}:{lineno} 键名 `{key}` 命中 YAML 1.1 布尔字面量"
                    "（PyYAML 会解析成 True/False，须改名，如 on → on-bg）")
    res.notes.append(f"扫描 {total} 个键名（含流映射内的键）")
    return res


def rule_v2_12(pack):
    """V2-12 assets 条目 path/url/color 三态互斥"""
    res = Result("V2-12", "assets 条目 path/url/color 恰好一个；full 仅随 path；color 仅 background")
    if not pack.assets:
        res.notes.append("包内无 assets 段，无适用对象")
        return res
    for aid, (entry, md) in sorted(pack.assets.items()):
        if not isinstance(entry, dict):
            res.fails.append(f"assets.{aid} 不是映射")
            continue
        present = [k for k in ("path", "url", "color") if entry.get(k) is not None]
        if len(present) == 0:
            res.fails.append(f"assets.{aid} 三态全缺（path/url/color 必须恰好一个）")
        elif len(present) > 1:
            res.fails.append(f'assets.{aid} 三态双源：同时存在 {" + ".join(present)}')
        if "color" in present and entry.get("kind") != "background":
            res.fails.append(
                f'assets.{aid} 用 color 但 kind = `{entry.get("kind")}`（仅 background 允许）')
        if entry.get("full") is not None and entry.get("path") is None:
            res.fails.append(
                f'assets.{aid} 有 full 但无 path（§2 方案甲：full 指原图，只允许与 path 共存；'
                f'当前承载 = {" + ".join(present) or "三态全缺"}）')
    res.notes.append(f"校验 {len(pack.assets)} 个资产条目")
    return res


def rule_v2_13(pack):
    """V2-13 声明多主题（themes 长度 >1）但缺 default-theme"""
    res = Result("V2-13", "多主题（themes 长度 >1）须有 default-theme")
    themes = pack.design.data.get("themes")
    if not isinstance(themes, list) or len(themes) <= 1:
        res.notes.append(f"design.md frontmatter themes = {themes!r}，非多主题，无适用对象")
        return res
    default = pack.design.data.get("default-theme")
    if default is None:
        res.warns.append(f"design.md 声明 themes = {themes}（{len(themes)} 个）但缺 default-theme，"
                         "消费侧无从判断默认渲染哪一套")
    else:
        res.notes.append(f"themes = {themes}，default-theme = `{default}`")
    return res


def rule_sidecar_dup(pack):
    """V2-R5 sidecar 不得重复 design.md 已有顶层键（规则正文在 §3 sidecar 容器形态）"""
    res = Result("V2-R5", "sidecar frontmatter 不重复 design.md 顶层键（§3）")
    sidecars = [md for md in pack.files if md is not pack.design]
    if not sidecars:
        res.notes.append("包内无 sidecar 文件，无适用对象")
        return res
    design_keys = {key for key, _ in pack.design.root_keys}
    checked = 0
    for md in sidecars:
        if not md.root_keys:
            res.notes.append(f"{md.name} 无 frontmatter，无适用对象")
            continue
        for key, lineno in md.root_keys:
            if key in SIDECAR_OWN_KEYS:      # sidecar 自身载荷，design.md 侧是指针不是冲突
                continue
            checked += 1
            if key in design_keys:
                res.warns.append(
                    f"{md.name}:{lineno} 顶层键 `{key}` 与 design.md 重复"
                    "（冲突以 design.md 为准，sidecar 侧应删除）")
    res.notes.append(f"{len(sidecars)} 个 sidecar，校验 {checked} 个顶层键")
    return res


AUDIT_TOP_KEYS = ("canvas-source", "theme-mechanism", "color-confidence")
AUDIT_ASSET_FIELDS = ("boxes", "aspect", "mark", "confidence")


def rule_audit_fields(pack):
    """V2-R6 审计元数据不进 design.md（§1 / §2：应移 ref/audit.yaml 或 layouts.md）"""
    res = Result("V2-R6", "审计元数据不进 design.md（应移 ref/audit.yaml / layouts.md）")
    design_keys = {key: lineno for key, lineno in pack.design.root_keys}
    for key in AUDIT_TOP_KEYS:
        if key in design_keys:
            res.warns.append(
                f"design.md:{design_keys[key]} 顶层键 `{key}` 是审计元数据，应移 ref/audit.yaml")
    sidecars = [md for md in pack.files if md is not pack.design and md.root_keys]
    if "canvas" in design_keys and sidecars:
        res.warns.append(
            f'design.md:{design_keys["canvas"]} `canvas` 应移 layouts sidecar 的 frontmatter 首键'
            '（仅内联/退化态才留在 design.md）')
    hit = 0
    for aid, (entry, md) in sorted(pack.assets.items()):
        if not isinstance(entry, dict):
            continue
        extras = [f for f in AUDIT_ASSET_FIELDS if f in entry]
        if extras:
            hit += 1
            res.warns.append(
                f'assets.{aid} 含审计字段 {"/".join(extras)}，应移 ref/audit.yaml'
                '（条目只留消费字段：path/url/color/full/kind/role/theme/on-bg/recipe）')
    if not res.warns:
        res.notes.append("design.md 无审计元数据残留")
    return res


def rule_layouts_pointer(pack):
    """V2-R7 sidecar 指针必须在正文有呼应（弱指针 = 消费者到不了版式数据）"""
    res = Result("V2-R7", "layouts sidecar 指针在正文有呼应（§2.5 Usage）")
    pointer = pack.design.data.get("layouts")
    if not (isinstance(pointer, str) and pointer.endswith(".md")):
        res.notes.append("无 sidecar 指针（内联或无 layouts），无适用对象")
        return res
    mentions = pack.design.body.count(pointer)
    if mentions == 0:
        res.warns.append(
            f"frontmatter 指向 `{pointer}` 但正文零次提及——消费模型不会主动打开它；"
            "在 ## Usage 第一步写明「搭页前先读 layouts.md 选页型」")
    else:
        res.notes.append(f"正文提及 `{pointer}` {mentions} 次")
    return res


ENUM_REGION_KIND = ["grid", "stack", "free"]


def _box4(v):
    """[x, y, w, h] 四个数且 w/h 为正才算合法框，否则 None。

    门禁只该产出 PASS/WARN/FAIL。框里混进字符串会让下面的比大小直接抛 TypeError，
    脚本崩了比报 FAIL 更难查；静默跳过又会让畸形框冒充通过。
    """
    if not (isinstance(v, list) and len(v) == 4):
        return None
    if any(isinstance(x, bool) or not isinstance(x, (int, float)) for x in v):
        return None
    return v if v[2] > 0 and v[3] > 0 else None


def _box_overlap(a, b):
    ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
    bx0, by0, bx1, by1 = b[0], b[1], b[0] + b[2], b[1] + b[3]
    ox = min(ax1, bx1) - max(ax0, bx0)
    oy = min(ay1, by1) - max(ay0, by0)
    return (ox * oy) if ox > 0 and oy > 0 else 0


def rule_v2_15(pack):
    """V2-15 同一段里的字段不能互相矛盾（text_safe 不得与 avoid 相交）

    包里两条规则打架时，消费端照哪条都是错——实测一张背景 text_safe 有 34% 压在
    avoid 上，消费端按 text_safe 把标题放进了禁放区，正好压在背景主体上。
    这类矛盾出在「不同来源的字段拼在一起」：text_safe 是脚本算的，avoid 是看图的人
    填的，谁都没错，凑一起就错。
    """
    res = Result("V2-15", "同段字段自洽（text_safe 不与 avoid 相交）")
    checked = 0
    for md in pack.files:
        for bg, entry in (md.data.get("backgrounds") or {}).items():
            if not isinstance(entry, dict):
                continue
            raw_ts = entry.get("text_safe")
            avoids = entry.get("avoid") or []
            ts = _box4(raw_ts)
            if ts is None:
                if raw_ts is not None:
                    res.fails.append(
                        f"backgrounds.{bg}.text_safe 不是合法的 [x, y, w, h]"
                        f"（四个数、w/h 为正）：{raw_ts!r}")
                continue
            checked += 1
            for i, av in enumerate(avoids):
                raw_box = av.get("box") if isinstance(av, dict) else av
                box = _box4(raw_box)
                if box is None:
                    res.fails.append(
                        f"backgrounds.{bg}.avoid[{i}] 不是合法的 [x, y, w, h]"
                        f"（四个数、w/h 为正）：{raw_box!r}")
                    continue
                ov = _box_overlap(ts, box)
                if ov:
                    res.fails.append(
                        f"backgrounds.{bg} 的 text_safe {ts} 与 avoid[{i}] {box} "
                        f"相交 {ov} px²（占安全区 {round(100.0 * ov / (ts[2] * ts[3]))}%）"
                        f"——消费端按哪条都会违反另一条")
    res.notes.append("校验 %d 段背景规则" % checked if checked else "无 backgrounds 段，无适用对象")
    return res


LEGACY_SLOT_STYLE_KEYS = frozenset(("size", "weight", "color", "align", "valign", "insets_px"))


def rule_v2_16(pack):
    """V2-16 slot 的渲染样式只通过 CSS 承载，禁止泄漏 PPTX/旧契约字段。"""
    res = Result("V2-16", "slot 渲染样式统一使用 css（box 只负责几何）")
    checked = 0
    for name, (layout, _md) in sorted(pack.layouts.items()):
        if not isinstance(layout, dict):
            continue
        groups = [("slots", layout.get("slots") or [])]
        flow = layout.get("flow")
        if isinstance(flow, dict):
            for i, region in enumerate(flow.get("regions") or []):
                if isinstance(region, dict):
                    groups.append((f"flow.regions[{i}].items", region.get("items") or []))
        for group, items in groups:
            for i, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                checked += 1
                legacy = sorted(LEGACY_SLOT_STYLE_KEYS & set(item))
                if legacy:
                    res.fails.append(
                        f'layouts.{name}.{group}[{i}] 含旧样式键 {"/".join(legacy)}；'
                        '保留 box/role/type/asset，把渲染属性转换为可直接写入 style 的 css')
    res.notes.append(f"校验 {checked} 个 slot/flow item")
    return res


def rule_v2_14(pack):
    """V2-14 flow 与 slots 二选一；flow 的区带类型合法、grid 必带 cols"""
    res = Result("V2-14", "flow 形态合法（与 slots 互斥，区带类型在枚举内）")
    n_flow = 0
    for name, (layout, _md) in sorted(pack.layouts.items()):
        if True:
            if not isinstance(layout, dict):
                continue
            flow = layout.get("flow")
            if flow is None:
                continue
            n_flow += 1
            if layout.get("slots"):
                res.fails.append(f"layouts.{name} 同时有 flow 和 slots——"
                                 f"两份坐标都在，消费端不知道该按哪份渲染")
            if not isinstance(flow, dict):
                res.fails.append(f"layouts.{name}.flow 不是映射")
                continue
            regions = flow.get("regions")
            if not isinstance(regions, list) or not regions:
                res.fails.append(f"layouts.{name}.flow 没有 regions")
                continue
            for i, r in enumerate(regions):
                if not isinstance(r, dict):
                    continue
                _check_enum(res, f"layouts.{name}.flow.regions[{i}].kind",
                            r.get("kind"), ENUM_REGION_KIND)
                if r.get("kind") == "grid" and not r.get("cols"):
                    res.fails.append(f"layouts.{name}.flow.regions[{i}] 是 grid 但没有 cols")
                if r.get("kind") == "free" and not layout.get("slots"):
                    # free 区带要按坐标摆，但坐标在 slots 里——而 slots 与 flow 互斥，
                    # 所以 free 的元素必须自带 box
                    for j, it in enumerate(r.get("items") or []):
                        if isinstance(it, dict) and not it.get("box"):
                            res.fails.append(
                                f"layouts.{name}.flow.regions[{i}].items[{j}] 在 free 区带里"
                                f"但没有 box——free 要按坐标摆，坐标必须自带")
    res.notes.append("%d 个页型用 flow" % n_flow if n_flow else "无页型用 flow，无适用对象")
    return res


RULES = [rule_v2_1, rule_v2_2, rule_v2_3, rule_v2_4, rule_v2_5, rule_v2_6,
         rule_v2_7, rule_v2_8, rule_v2_9, rule_v2_10, rule_v2_11, rule_v2_12,
         rule_v2_13, rule_v2_14, rule_v2_15, rule_v2_16, rule_sidecar_dup,
         rule_audit_fields, rule_layouts_pointer]


def main():
    if len(sys.argv) != 2:
        print("用法: check_v2.py <包目录>")
        sys.exit(2)
    pack = Pack(sys.argv[1])
    print(f"包: {pack.root}")
    print("文件: " + ", ".join(md.name for md in pack.files))
    # 这个解析器只服务于机检取数，它读不懂不代表内容有问题——产物是逐字节写出去的，
    # 消费模型读多行 CSS 之类毫无障碍。所以这里既不静默跳过，也不拦住流水线：
    # 把原文交出来，由模型看一眼确认内容没丢。
    unread = [(md.name, lineno, text) for md in pack.files for lineno, text in md.anomalies]
    print("-" * 72)
    failed = 0
    for rule in RULES:
        res = rule(pack)
        print(f"{res.rule:<6} {res.level:<4} {res.title}")
        for line in res.fails:
            print(f"         FAIL  {line}")
        for line in res.warns:
            print(f"         WARN  {line}")
        for line in res.notes:
            print(f"         ·     {line}")
        failed += len(res.fails)
    print("-" * 72)
    print(f'结论: {"FAIL" if failed else "PASS"}（{failed} 条 FAIL）')
    if unread:
        print("-" * 72)
        print(f"待你确认（{len(unread)} 行机检解析器没读懂，产物里内容仍在，"
              f"请对照原文确认没丢东西）：")
        for name, lineno, text in unread:
            print(f"  {name}:{lineno}  {text.strip()[:100]}")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
