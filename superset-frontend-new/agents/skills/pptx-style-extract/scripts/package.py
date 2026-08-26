#!/usr/bin/env python3
"""S11 打包器：把「阶段一抽取产物 + L 层判断单」机械组装成风格包 v2。

    python3 package.py <stage1-outdir> <l-out-dir> <pack-out-dir> [选项]

      --check-v1 <path>   顺带跑 v1 门禁（需要外部 check_v1.py 路径）
      --style-name <name> 覆盖 manifest 里的 name（包目录名仍取 pack-out-dir）
      --force             pack-out-dir 已存在且非空时照样写

本脚本零判断：所有语义来自 <l-out-dir>，所有数值来自 <stage1-outdir>/extract.json。
它只做四件机械事——排键序、拷资产、算审计数据、跑门禁。

================================================================================
L 层判断单 schema（<l-out-dir> 四个文件，这段就是填写说明书）
================================================================================

本脚本自带极简 YAML 读取器，只认下面这些写法，**不要用锚点/别名/复杂嵌套流**：
  key: 标量                     标量可加引号（会原样保留到产物里）
  key: [a, b, c]                流式列表
  key: |  或  key: >            块标量（`|` 保留换行，`>` 折成一行）
  key:                          后跟缩进块 —— 对 frontmatter.yaml / layouts.yaml
    ...                         这类「原样透传」的键，块内文本**逐字节照搬**进产物，
                                所以缩进/引号/注释请按最终想要的样子写

--------------------------------------------------------------------------------
1) manifest.yaml —— 包身份 + 资产映射（唯一需要本脚本解析结构的文件）
--------------------------------------------------------------------------------

    version: alpha                    # 可选，默认 alpha
    name: azure-mist-deck             # 必填，包名（英文 kebab）
    name_zh: 碧空雾面                  # 可选
    description: >                    # 可选，一段话，会折成单行进 frontmatter
      整幅铺满带颗粒感的淡蓝雾面底图……
    themes: [dark, light]             # 可选；单主题包不写
    default-theme: dark               # themes 长度 >1 时必填（V2-13）
    theme-mechanism: "……"             # 可选，进 ref/audit.yaml（不进 design.md）
    color-confidence: {level: medium, note: "……"}   # 可选，进 ref/audit.yaml
    assets:                           # 可选；无资产包可整段省略
      - id: bg-cover                  # 必填。命名规则 <kind 前缀>-<语义名>，
                                      #   logo- / slogan- / bg- / texture- / icon-
        source_media: <原图文件名>     # media-out/ 里的**原图**文件名（不是压缩版）
        kind: background              # logo|slogan|background|texture|icon
        role: cover                   # background/icon 用；封闭枚举见规范 §2
        theme: dark                   # 双主题包按需
        on-bg: light                  # logo/slogan 用
        mark: lockup                  # logo/slogan 用；**自动进 audit.yaml**
        use_full: true                # true = 同时落原图为 <name>@full.<ext>
        recipe: "linear-gradient(…)"  # 可选，CSS 重绘配方
        confidence: high              # 可选，默认 high；**自动进 audit.yaml**
      - id: bg-surface                # 纯色背景：不给 source_media，给 color
        kind: background
        role: content
        color: "{colors.surface}"

    asset_vision_groups:              # 抽取草案专用，打包后不进入消费包
      - id: vision-1
        source_media: [mark.png, ornament.png]
        visual_kind: decorative       # FaaS 枚举；同组默认，可被 asset_decisions 覆盖

    asset_decisions:                  # 可选：单图覆盖；旧版 decision 仍兼容
      - source_media: chart.png
        visual_kind: chart

  说明：`boxes` / `aspect` / `canvas-source` **不要填**——脚本按 source_media 从
  extract.json 的 images[] 直接取，写进 ref/audit.yaml。

    derived:                          # 可选：推导值豁免声明（数值可追溯机检用）
      - value: "1.05"                 #   按字面值豁免：产物里出现的该值放行
        reason: "CJK 行高转译"
      - value: "#5A5A5A"
        reason: "白字 70% 不透明度的等效实色"
      - token: light-surface          #   按键名豁免：该 token（或其祖先键）下所有值放行
        reason: "材质推导，gaps 已注明"
    rebase_factor: 1.6                # 可选：字号等比上抬倍率；命中「普查值 × 它 ±1px」即放行

  打包最后一步会校验产物里每个 hex / fontSize / slots.box 是否可追溯：
  hex 命中 color_freq ∪ 形状与背景的填充/描边/渐变 stop 色 ∪ images[].dominant_colors
  （每通道 ±8，采样色有量化误差）；fontSize 命中 text_scale；box 命中 ref/shapes.json
  某形状框 ±2px。命不中又没在 derived 里声明 → FAIL 并给出最近候选。

--------------------------------------------------------------------------------
2) frontmatter.yaml —— L 层判断产物，原样进 design.md frontmatter
--------------------------------------------------------------------------------

  顶层键只允许这些（缺哪个就不写哪个，脚本按规范 §1 键序重排）：
    colors / typography / spacing / rounded / components / omitted
    anchors / gaps / exceptions / safe-area
  写法就是最终 frontmatter 的样子，例如：

    colors:
      surface: "#FFFFFF"
      primary: "#RRGGBB"
    safe-area:
      content: {top: <px>, right: <px>, bottom: <px>, left: <px>, applies-to: [content]}
      confidence: medium

--------------------------------------------------------------------------------
3) layouts.yaml —— archetype 数据，渲染成 layouts.md
--------------------------------------------------------------------------------

  只需一个顶层键 `layouts:`，内容原样透传。**不要写 canvas**——脚本从
  extract.json 取并放成 layouts.md frontmatter 首键（V2-10 / V2-R6）。

    layouts:
      cover:
        name: "封面"
        role: cover
        background: bg-cover
        slots:
          - {role: title, box: [<x>, <y>, <w>, <h>], type: title,
             css: "<由源模板转译出的 CSS 声明串>"}
        confidence: high

  可选 `body:` 块标量 —— 追加到 layouts.md frontmatter 之后作为说明正文。

--------------------------------------------------------------------------------
4) body.md —— design.md 正文全文
--------------------------------------------------------------------------------

  从 `## Overview` 开始的全部正文（Usage / Colors / Typography / Hard Rules /
  Exceptions……）。脚本原样拼在 frontmatter 之后，不改一个字。
"""
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))

# 规范 §1 键序：官方白名单 → v1 自造 → v2 自造。审计键（canvas-source /
# theme-mechanism / color-confidence）按 V2-R6 不进 design.md，故不在此列。
FRONTMATTER_ORDER = [
    "version", "name", "name_zh", "description",
    "colors", "typography", "spacing", "rounded", "components", "omitted",
    "anchors", "gaps", "exceptions",
    "themes", "default-theme", "assets", "layouts", "safe-area",
]
# frontmatter.yaml 允许 L 层提供的键（其余由 manifest / 脚本产出）
L_FRONTMATTER_KEYS = {"colors", "typography", "spacing", "rounded", "components",
                      "omitted", "anchors", "gaps", "exceptions", "safe-area"}
# design.md 资产条目只留消费字段，顺序固定（check_v2 V2-R6 把其余判成审计字段）
ASSET_CONSUMER_FIELDS = ["path", "url", "color", "full", "kind", "role",
                         "theme", "on-bg", "recipe"]
ASSET_AUDIT_FIELDS = ["boxes", "aspect", "mark", "confidence"]
KIND_PREFIX = {"background": "bg", "logo": "logo", "slogan": "slogan",
               "texture": "texture", "icon": "icon"}
# 与 studio_server_faas 的 assetVisualKinds 对齐。它是抽取期视觉分类，不是 v2
# 消费包的 kind：后者仍只允许 KIND_PREFIX 中的五种资产类型。
ASSET_VISUAL_KINDS = {
    "logo", "slogan", "background", "texture", "icon",
    "decorative", "illustration", "photo", "chart", "screenshot",
    "footer-copyright", "page-number", "watermark", "content-image", "unknown",
}
VISUAL_KIND_TO_DECISION = {
    "logo": "logo",
    "slogan": "slogan",
    "background": "background",
    "texture": "texture",
    "icon": "icon",
    "decorative": "texture",
    "illustration": "texture",
    "photo": "content",
    "chart": "content",
    "screenshot": "content",
    "content-image": "content",
    "footer-copyright": "omit",
    "page-number": "omit",
    "watermark": "omit",
    # FaaS 也会把非内容的 unknown 局部图保留为 texture，避免丢掉未能命名的装饰。
    "unknown": "texture",
}
LEGACY_ASSET_DECISIONS = {"content", "texture", "logo", "icon", "slogan"}
# 交付包的 ref/ 只留 audit.yaml（人复核数值出处用，几 KB）。
# 频次原表、聚类原始数据、extract.json、重建图、logo 候选图全部留在 stage1 抽取目录，
# 不拷进包——规范原本指望「下发时链路剥离」，但链路上没有环节真的剥离，结果
# 审计材料带着「别读我」一起进消费上下文，还占掉包体的大头。
REF_CARRY = ()


class Fail(SystemExit):
    def __init__(self, msg):
        super().__init__("package.py: %s" % msg)


class AssetDecisions(dict):
    """按素材的默认决定，以及只在对应 slot 生效的实例覆盖。"""

    def __init__(self, defaults=None, overrides=None, roles=None,
                 default_overrides=None, explicit_overrides=None):
        super().__init__(defaults or {})
        self.overrides = overrides or {}
        self.roles = roles or {}
        self.default_overrides = default_overrides or set()
        self.explicit_overrides = explicit_overrides or set()

    def for_slot(self, source, line, layout_name=None):
        box = source_box(line) or slot_box(line)
        return self.for_scope(source, layout_name, box)

    def for_scope(self, source, layout_name, box):
        if box is not None:
            for key in ((source, layout_name, box), (source, None, box)):
                if key in self.explicit_overrides:
                    return self.overrides[key]
        if source in self.default_overrides:
            return self.get(source)
        if box is not None:
            for key in ((source, layout_name, box), (source, None, box)):
                if key in self.overrides:
                    return self.overrides[key]
        return self.get(source)


class AssetIds(dict):
    """同一原图因实例用途不同而落成多个资产时，按最终用途取对应 id。"""

    def __init__(self, defaults=None, by_decision=None):
        super().__init__(defaults or {})
        self.by_decision = by_decision or {}

    def for_decision(self, source, decision):
        return self.by_decision.get((source, decision)) or self.get(source)


# ------------------------------------------------------------ 极简 YAML 读取
def split_top_blocks(text):
    """顶层 `key:` 切块。返回 [(key, inline_value, block_lines)]，块内逐字节保留。"""
    out, cur = [], None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            if cur:
                cur[2].append(raw)
            continue
        m = re.match(r"([A-Za-z_][\w-]*):(.*)$", raw)
        if m and not raw[0].isspace():
            cur = [m.group(1), m.group(2).strip(), []]
            out.append(cur)
        elif cur:
            cur[2].append(raw)
        else:
            raise Fail("顶层出现无键行: %r" % raw[:60])
    # 去掉每块尾部空行，避免透传时带出多余空白
    for entry in out:
        while entry[2] and not entry[2][-1].strip():
            entry[2].pop()
    return out


LAYOUT_CONTROL_KEYS = {
    "names", "roles", "text_roles", "layout_modes", "bg_rules",
}


def control_entry_keys(lines):
    """读取扁平判断段的一级条目，防止整段覆盖时漏掉旧结论。"""
    return {
        match.group(1)
        for line in lines
        for match in [re.match(r"^\s{2}([\w-]+):", line)]
        if match
    }


def load_layout_blocks(lout):
    """读取版式坐标事实；新草案把可编辑判断区放在独立的小文件里。"""
    lay_path = os.path.join(lout, "layouts.yaml")
    if not os.path.exists(lay_path):
        return None
    with open(lay_path, encoding="utf-8") as stream:
        layouts = split_top_blocks(stream.read())
    controls_path = os.path.join(lout, "layout-controls.yaml")
    if not os.path.exists(controls_path):
        return layouts
    with open(controls_path, encoding="utf-8") as stream:
        controls = split_top_blocks(stream.read())
    invalid = {key for key, _, _ in controls} - LAYOUT_CONTROL_KEYS
    if invalid:
        raise Fail("layout-controls.yaml 只能包含 %s，不能包含：%s"
                   % ("|".join(sorted(LAYOUT_CONTROL_KEYS)), ", ".join(sorted(invalid))))
    legacy_keys = {key for key, _, _ in layouts if key in LAYOUT_CONTROL_KEYS}
    control_keys = {key for key, _, _ in controls}
    missing = legacy_keys - control_keys
    if missing:
        raise Fail("layout-controls.yaml 必须覆盖 layouts.yaml 的全部判断段，缺：%s"
                   % ", ".join(sorted(missing)))
    legacy_blocks = {key: lines for key, _, lines in layouts}
    control_blocks = {key: lines for key, _, lines in controls}
    for key in sorted(legacy_keys):
        missing_entries = (control_entry_keys(legacy_blocks[key])
                           - control_entry_keys(control_blocks[key]))
        if missing_entries:
            raise Fail("layout-controls.yaml 的 %s 段缺少旧判断条目：%s"
                       % (key, ", ".join(sorted(missing_entries))))
    base = [block for block in layouts if block[0] not in LAYOUT_CONTROL_KEYS]
    return controls + base


def unquote(s):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in '"\'':
        return s[1:-1]
    # 未加引号的标量后面跟行内注释：按 YAML 规矩剥掉（前面必须有空白）
    s = re.split(r"\s+#", s, maxsplit=1)[0].strip()
    return s


def scalar_of(inline, lines):
    """标量取值：支持 `key: v`、`key: |`、`key: >`。

    `|` 按公共缩进整体 dedent，**不逐行 strip** —— 正文里的嵌套列表/缩进代码块
    靠相对缩进表意，逐行 strip 会把它们拍平。
    """
    if inline in ("|", ">", "|-", ">-"):
        if inline.startswith(">"):
            return " ".join(ln.strip() for ln in lines if ln.strip()).strip()
        indents = [len(ln) - len(ln.lstrip()) for ln in lines if ln.strip()]
        pad = min(indents) if indents else 0
        return "\n".join(ln[pad:] if len(ln) >= pad else ln.lstrip()
                         for ln in lines).strip("\n")
    return unquote(inline)


def parse_flow_list(s):
    s = s.strip()
    if not (s.startswith("[") and s.endswith("]")):
        return None
    inner = s[1:-1].strip()
    return [unquote(x) for x in inner.split(",") if x.strip()] if inner else []


def parse_item_list(lines):
    """`- key: v` 形式的对象列表。"""
    items, cur = [], None
    for raw in lines:
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        stripped = raw.strip()
        if stripped.startswith("- "):
            cur = {}
            items.append(cur)
            stripped = stripped[2:].strip()
            if not stripped:
                continue
        if cur is None:
            raise Fail("资产列表里出现不属于任何 `- ` 项的行: %r" % raw[:60])
        m = re.match(r"([A-Za-z_][\w-]*):(.*)$", stripped)
        if not m:
            raise Fail("资产列表行无法解析: %r" % raw[:60])
        # 值原样保留（含作者的引号）：recipe / color / url 这些是直接透传进
        # design.md 的文本，重新决定要不要加引号会改掉作者的写法。
        cur[m.group(1)] = m.group(2).strip()
    return items


def read_manifest(path):
    blocks = split_top_blocks(open(path, encoding="utf-8").read())
    man, assets, asset_vision_groups, asset_decisions, raw = {}, [], [], [], {}
    derived = []
    for key, inline, lines in blocks:
        if key == "assets":
            assets = parse_item_list(lines)
        elif key == "asset_vision_groups":
            asset_vision_groups = parse_item_list(lines)
        elif key == "asset_decisions":
            asset_decisions = parse_item_list(lines)
        elif key == "derived":
            derived = parse_item_list(lines)
        elif inline.startswith("["):
            man[key] = parse_flow_list(inline)
        elif inline.startswith("{"):
            man[key] = inline                      # 流映射原样透传
        else:
            man[key] = scalar_of(inline, lines)
        if lines:
            # 记住原始块形态（如 `description: >` 多行），回写时逐字节照搬，
            # 不把作者的折行改成一条长行。
            raw[key] = (inline, lines)
    man["assets"] = assets
    man["asset_vision_groups"] = asset_vision_groups
    man["asset_decisions"] = asset_decisions
    man["derived"] = derived
    man["_raw"] = raw
    return man


def validate_asset_vision_groups(lout, manifest):
    """新草案的候选索引存在时，视觉判断必须逐项覆盖且不改写实例事实。"""
    index_path = os.path.join(lout, "asset-vision-groups.json")
    if not os.path.exists(index_path):
        return {}
    try:
        with open(index_path, encoding="utf-8") as stream:
            index = json.load(stream)
    except (OSError, ValueError) as exc:
        raise Fail("asset-vision-groups.json 无法读取：%s" % exc)
    if "selected" not in index:
        raise Fail("asset-vision-groups.json 缺少 selected 候选列表")

    expected = {}
    for group in index.get("selected") or []:
        for candidate in group.get("candidates") or []:
            candidate_id = unquote(str(candidate.get("id") or ""))
            source = unquote(str(candidate.get("source_media") or candidate.get("file") or ""))
            placements = candidate.get("placements") or []
            placement = placements[0] if placements else {}
            raw_box = placement.get("box")
            box = tuple(raw_box) if isinstance(raw_box, list) and len(raw_box) == 4 else None
            layout = unquote(str(candidate.get("layout") or placement.get("archetype") or ""))
            if not candidate_id or not source or box is None:
                raise Fail("asset-vision-groups.json 的候选缺少 id、source_media 或 box")
            if candidate_id in expected:
                raise Fail("asset-vision-groups.json 的候选 id 重复：%s" % candidate_id)
            expected[candidate_id] = (source, layout or None, box)

    actual = {}
    for item in manifest.get("asset_vision_groups") or []:
        candidate_id = unquote(item.get("id") or "")
        sources = source_media_list(item.get("source_media") or "")
        layout, box = decision_scope(item, "asset_vision_groups.%s" % candidate_id)
        if not candidate_id:
            raise Fail("asset_vision_groups 必须逐项填写 id")
        if candidate_id in actual:
            raise Fail("asset_vision_groups 的候选 id 重复：%s" % candidate_id)
        actual[candidate_id] = (sources, layout, box)

    expected_ids = set(expected)
    actual_ids = set(actual)
    instance_format = index.get("version", 1) >= 2
    if instance_format:
        missing = sorted(expected_ids - actual_ids)
        extra = sorted(actual_ids - expected_ids)
        if missing or extra:
            problems = []
            if missing:
                problems.append("缺少：%s" % ", ".join(missing))
            if extra:
                problems.append("出现未知项：%s" % ", ".join(extra))
            raise Fail("asset_vision_groups 必须逐项保留抽取候选，%s"
                       % "；".join(problems))
        for candidate_id, expected_scope in expected.items():
            sources, layout, box = actual[candidate_id]
            expected_source, expected_layout, expected_box = expected_scope
            if sources != [expected_source] or box != expected_box:
                raise Fail("asset_vision_groups.%s 改写了抽取候选的图片或位置"
                           % candidate_id)
            if layout and expected_layout and layout != expected_layout:
                raise Fail("asset_vision_groups.%s 改写了抽取候选的页型"
                           % candidate_id)
        return expected

    # 旧草案用视觉组 id 和 source_media 列表表达默认判断，无法逐实例比对。
    # 保留这种兼容输入，但仍要求每个选中的候选来源至少被一个组覆盖。
    actual_sources = {
        source for sources, _, _ in actual.values() for source in sources
    }
    missing_sources = sorted({
        source for source, _, _ in expected.values()
    } - actual_sources)
    if missing_sources:
        raise Fail("asset_vision_groups 必须覆盖抽取候选来源，缺少：%s"
                   % ", ".join(missing_sources))
    return {}


def bind_asset_vision_group_scopes(lout, manifest):
    """用 v2 候选 id 恢复实例页型，模型无需重复填写 layout。"""
    expected = validate_asset_vision_groups(lout, manifest)
    for item in manifest.get("asset_vision_groups") or []:
        candidate_id = unquote(item.get("id") or "")
        scope = expected.get(candidate_id)
        if scope and scope[1]:
            item["_resolved_layout"] = scope[1]


# ------------------------------------------------------------------- 组装
def yaml_scalar(v):
    """标量回写。已带引号 / 流式结构原样；含 YAML 危险序列才补引号。"""
    s = str(v)
    if not s:
        return "''"
    if s[0] in '"\'[{' or s[-1] in '"\']}':
        return s
    if re.search(r":\s|\s#|^[-?*&!|>%@`]", s) or s.strip() != s:
        return '"%s"' % s.replace('"', '\\"')
    return s


def truthy(v):
    return str(v).strip().lower() in ("1", "true", "yes", "on")


# 浏览器能解码的图片格式。落进包的资产必须在此列，否则消费端引用到就是一张空白图。
WEB_SAFE_EXT = {"png", "jpg", "jpeg", "webp", "gif", "svg", "avif"}


def asset_ext(name):
    return name.rsplit(".", 1)[-1].lower() if "." in name else ""


def strip_kind_prefix(aid, kind):
    """`bg-cover` + background -> `cover`；前缀对不上就整名照用。"""
    for pref in (KIND_PREFIX.get(kind), kind):
        if pref and aid.startswith(pref + "-"):
            return aid[len(pref) + 1:]
    return aid


def source_media_list(value):
    """`source_media: one.png` 与视觉组的 `[a.png, b.png]` 两种写法都接受。"""
    raw = value.strip()
    parsed = parse_flow_list(raw)
    return parsed if parsed is not None else [unquote(raw)] if raw else []


def visual_kind_decision(value, label):
    visual_kind = unquote(value or "")
    if visual_kind not in ASSET_VISUAL_KINDS:
        raise Fail("%s 的 visual_kind 只能是 %s"
                   % (label, "|".join(sorted(ASSET_VISUAL_KINDS))))
    return VISUAL_KIND_TO_DECISION[visual_kind]


def slot_box(line):
    match = re.search(r"\bbox:\s*\[([^\]]+)\]", line)
    return parse_box_match(match)


def source_box(line):
    match = re.search(r"\bsource_box:\s*\[([^\]]+)\]", line)
    return parse_box_match(match)


def parse_box_match(match):
    if not match:
        return None
    try:
        values = tuple(int(float(part.strip())) for part in match.group(1).split(","))
    except ValueError:
        return None
    return values if len(values) == 4 else None


def decision_scope(item, label):
    raw_box = item.get("box")
    box = slot_box("box: %s" % raw_box) if raw_box else None
    if raw_box and box is None:
        raise Fail("%s 的 box 必须是四个数的 [x, y, w, h]" % label)
    layout = unquote(item.get("_resolved_layout") or item.get("layout") or "")
    if layout and box is None:
        raise Fail("%s 的 layout 必须与 box 一起填写" % label)
    return layout or None, box


def register_asset_decision(decisions, visual_kinds, key, decision, visual_kind):
    """合并相同实例的重复判断；显式 visual_kind 必须逐字一致。"""
    if key not in decisions:
        decisions[key] = decision
        visual_kinds[key] = visual_kind
        return
    previous_kind = visual_kinds[key]
    if ((previous_kind and visual_kind and previous_kind != visual_kind)
            or (not previous_kind or not visual_kind)
            and decisions[key] != decision):
        label = "source_media" if key[2] is None else "实例"
        raise Fail("图片判断的 %s判断冲突: %s" % (label, key[0]))


def register_asset_role(roles, background_roles, source, layout, box, decision, role):
    if not role:
        return
    if source in roles and roles[source] != role:
        raise Fail("图片判断的 source_media role 冲突: %s" % source)
    roles[source] = role
    if decision != "background" or box is None:
        return
    for (known_layout, known_box), (known_source, known_role) in background_roles.items():
        if (known_box == box
                and (known_layout == layout
                     or known_layout is None
                     or layout is None)
                and known_role != role):
            raise Fail("图片判断的背景实例 role 冲突: %s、%s"
                       % (known_source, source))
    background_roles[(layout, box)] = (source, role)


def decision_overrides(manifest):
    """把视觉组默认值与单图/单页型实例覆盖展开为按 source_media 的内部决定。"""
    scoped, visual_kinds, roles, background_roles = {}, {}, {}, {}
    for group in manifest.get("asset_vision_groups") or []:
        group_id = unquote(group.get("id") or "")
        sources = source_media_list(group.get("source_media") or "")
        if not group_id or not sources:
            raise Fail("asset_vision_groups 必须逐项填写 id 与 source_media")
        visual_kind = unquote(group.get("visual_kind") or "")
        decision = visual_kind_decision(visual_kind,
                                        "asset_vision_groups.%s" % group_id)
        layout, box = decision_scope(
            group, "asset_vision_groups.%s" % group_id)
        if box is not None and len(sources) != 1:
            raise Fail("asset_vision_groups.%s 的实例判断只能填写一个 source_media"
                       % group_id)
        role = unquote(group.get("role") or "")
        for source in sources:
            key = (source, layout, box)
            register_asset_decision(scoped, visual_kinds, key, decision, visual_kind)
            register_asset_role(
                roles, background_roles, source, layout, box, decision, role)

    explicit_defaults, explicit_default_kinds = {}, {}
    explicit_overrides, explicit_override_kinds = {}, {}
    explicit_roles = {}
    for item in manifest.get("asset_decisions") or []:
        source = unquote(item.get("source_media") or "")
        visual_kind = item.get("visual_kind")
        legacy = item.get("decision")
        if not source or (visual_kind and legacy):
            raise Fail("asset_decisions 每项只填 source_media 和 visual_kind（或旧 decision）")
        if visual_kind:
            decision = visual_kind_decision(visual_kind, "asset_decisions.%s" % source)
        else:
            decision = unquote(legacy or "")
            if decision not in LEGACY_ASSET_DECISIONS:
                raise Fail("asset_decisions 的旧 decision 只能是 %s"
                           % "|".join(sorted(LEGACY_ASSET_DECISIONS)))
        layout, box = decision_scope(item, "asset_decisions.%s" % source)
        target = (explicit_defaults, explicit_default_kinds) if box is None else (
            explicit_overrides, explicit_override_kinds)
        register_asset_decision(
            target[0], target[1], (source, layout, box), decision,
            unquote(visual_kind) if visual_kind else None)
        role = unquote(item.get("role") or "")
        register_asset_role(
            explicit_roles, background_roles, source, layout, box, decision, role)

    scoped.update(explicit_defaults)
    scoped.update(explicit_overrides)
    for source, role in explicit_roles.items():
        if source in roles and roles[source] != role:
            raise Fail("图片判断的 source_media role 冲突: %s" % source)
        roles[source] = role

    defaults = {
        source: decision
        for (source, _, box), decision in scoped.items()
        if box is None
    }
    overrides = {
        (source, layout, box): decision
        for (source, layout, box), decision in scoped.items()
        if box is not None
    }
    return AssetDecisions(
        defaults, overrides, roles,
        {source for source, _, _ in explicit_defaults},
        set(explicit_overrides),
    )


def reusable_decisions_for_source(source, decisions):
    """无布局槽位时，收集该源图所有可能落盘的可复用用途。"""
    reusable = {"background", "texture", "logo", "icon", "slogan"}
    default = decisions.get(source)
    overrides = {
        decision for (override_source, layout, box), decision in decisions.overrides.items()
        if override_source == source
        and decision in reusable
        and (source not in decisions.default_overrides
             or (override_source, layout, box) in decisions.explicit_overrides)
    }
    return overrides | ({default} if default in reusable else set())


def reusable_decisions_for_slots(source, decisions, source_slots=None):
    """按实际图片槽的最终决定保留资产，可让同图在不同实例按用途绑定。"""
    reusable = {"background", "texture", "logo", "icon", "slogan"}
    slots = (source_slots or {}).get(source)
    if slots is None:
        return reusable_decisions_for_source(source, decisions)
    return {
        decisions.for_scope(source, layout_name, box)
        for layout_name, box in slots
    } & reusable


def validate_instance_decisions(decisions, bound_slots):
    """实例判断必须指向已有图片槽，避免 layout 拼错后静默退化为通用图片。"""
    if bound_slots is None:
        return
    for source, layout_name, box in decisions.overrides:
        slots = bound_slots.get(source) or set()
        matches = ((layout_name, box) in slots if layout_name is not None
                   else any(slot_box == box for _, slot_box in slots))
        if not matches:
            raise Fail("图片判断的实例没有对应图片槽: %s" % source)


def apply_asset_decisions(manifest, bound_sources=None, bound_slots=None):
    """把抽取期图片判断并入正式 assets；内容图与噪声不进入消费产物。"""
    decisions = decision_overrides(manifest)
    if bound_sources is not None:
        declared = set(decisions)
        declared |= {source for source, _, _ in decisions.overrides}
        unbound = sorted(declared - set(bound_sources))
        if unbound:
            raise Fail("图片判断中这些图片没有对应图片槽：%s"
                       % "、".join(unbound))
    validate_instance_decisions(decisions, bound_slots)

    assets = []
    by_source_kind = {}
    serial = Counter()
    used_ids = {unquote(item.get("id") or "")
                for item in manifest.get("assets") or [] if item.get("id")}
    decision_sources = list(decisions)
    for source, _, _ in decisions.overrides:
        if source not in decision_sources:
            decision_sources.append(source)
    desired_kinds = {
        source: reusable_decisions_for_slots(source, decisions, bound_slots)
        for source in decision_sources
    }
    emitted = set()

    def next_asset_id(kind):
        serial[kind] += 1
        aid = "%s-%d" % (KIND_PREFIX[kind], serial[kind])
        while aid in used_ids:
            serial[kind] += 1
            aid = "%s-%d" % (KIND_PREFIX[kind], serial[kind])
        used_ids.add(aid)
        return aid

    def append_asset(item, source, decision):
        old_kind = unquote(item.get("kind") or "")
        pair = (source, decision if source in decision_sources else old_kind)
        if source and pair in emitted:
            return
        row = dict(item)
        if decision and decision != old_kind:
            row["kind"] = decision
            row["id"] = next_asset_id(decision)
            for field in ("role", "theme", "on-bg", "mark"):
                row.pop(field, None)
        if decision == "background":
            row["role"] = decisions.roles.get(source) or "content"
        if source:
            emitted.add(pair)
            by_source_kind[(source, row["kind"])] = row
        used_ids.add(unquote(row.get("id") or ""))
        assets.append(row)

    for item in manifest.get("assets") or []:
        source = unquote(item.get("source_media") or "")
        if source in decision_sources:
            for decision in sorted(desired_kinds[source]):
                append_asset(item, source, decision)
        else:
            append_asset(item, source, None)

    for source in decision_sources:
        for decision in sorted(desired_kinds[source]):
            if (source, decision) in emitted:
                continue
            append_asset({
                "id": next_asset_id(decision),
                "source_media": source,
                "kind": decision,
            }, source, decision)
    manifest["assets"] = assets
    source_kinds = defaultdict(set)
    for source, kind in by_source_kind:
        source_kinds[source].add(kind)
    defaults = {
        source: unquote(by_source_kind[(source, next(iter(kinds)))]["id"])
        for source, kinds in source_kinds.items()
        if len(kinds) == 1
    }
    scoped = {
        (source, kind): unquote(item["id"])
        for (source, kind), item in by_source_kind.items()
    }
    return decisions, AssetIds(defaults, scoped)


def media_row_of(extract, source_media):
    for m in extract.get("media") or []:
        if m.get("out") and os.path.basename(m["out"]) == source_media:
            return m
    for m in extract.get("media") or []:
        if os.path.basename(m["media"]) == source_media:
            return m
    return None


def image_row_of(extract, source_media):
    for i in extract.get("images") or []:
        if os.path.basename(i["media"]) == source_media:
            return i
    # An svg that ships as a raster's vector companion has no images[] row of its
    # own — the placement is recorded on the raster (a:blip embeds the png, the svg
    # rides in a:extLst/svgBlip). Its boxes therefore come from the companion.
    for i in extract.get("images") or []:
        comp = i.get("svg_companion")
        if comp and os.path.basename(comp) == source_media:
            return i
    return None


def place_assets(manifest, extract, stage1, pack):
    """拷贝资产 + 生成 design.md 的 assets 段 + audit.yaml 的 assets 段。"""
    consumer, audit, copied = {}, {}, []
    for a in manifest["assets"]:
        a = dict(a)
        for f in ("id", "kind", "source_media", "use_full", "mark", "confidence"):
            if f in a:
                a[f] = unquote(a[f])
        aid = a.get("id")
        if not aid:
            raise Fail("assets 里有条目缺 id")
        kind = a.get("kind")
        if kind not in KIND_PREFIX:
            raise Fail("%s: kind=%r 不在 %s 内" % (aid, kind, sorted(KIND_PREFIX)))
        entry = {"kind": kind}
        for f in ("role", "theme", "on-bg", "recipe"):
            if a.get(f):
                entry[f] = a[f]

        if a.get("color"):
            entry["color"] = a["color"]            # 纯色背景，不落文件
        elif a.get("url"):
            entry["url"] = a["url"]
        elif a.get("source_media"):
            src = a["source_media"]
            row = media_row_of(extract, src)
            if row is None or not row.get("out"):
                raise Fail("%s: media-out 里找不到 %s（extract.json media 无该导出行；"
                           "非候选图需先用 extract.py --export-all-media 补导）" % (aid, src))
            base = strip_kind_prefix(aid, kind)
            sub = os.path.join(pack, "assets", kind + "s")
            os.makedirs(sub, exist_ok=True)
            comp = row.get("compressed_out")
            orig_path = os.path.join(stage1, row["out"])
            if comp:
                comp_path = os.path.join(stage1, comp)
                cext = asset_ext(comp)
                dst = os.path.join(sub, "%s.%s" % (base, cext))
                shutil.copy2(comp_path, dst)
                copied.append(dst)
                entry["path"] = "assets/%ss/%s.%s" % (kind, base, cext)
                if truthy(a.get("use_full")):
                    oext = asset_ext(row["out"])
                    if oext.lower() in WEB_SAFE_EXT:
                        fdst = os.path.join(sub, "%s@full.%s" % (base, oext))
                        shutil.copy2(orig_path, fdst)
                        copied.append(fdst)
                        entry["full"] = "assets/%ss/%s@full.%s" % (kind, base, oext)
                    else:
                        # 原图是浏览器不解码的格式（tiff/bmp 之类）。落进包并在 design.md
                        # 里声明成可用资源，消费端引用它就是一张空白图——实测踩过一次，
                        # 封面与结束页因此空白。压缩版已经带着全部像素，full 不给。
                        print("  ⚠ %s 的原图是 .%s，浏览器不解码，只给压缩版" % (aid, oext))
            else:
                oext = asset_ext(row["out"])
                if oext.lower() not in WEB_SAFE_EXT:
                    # 转码两条路（Pillow / sips）都没成，原图又是浏览器不解码的格式。
                    # 照落进去就是把一张永远显示不出来的图当资产下发——实测封面因此空白。
                    raise Fail("%s: 原图是 .%s，浏览器不解码，而转码没有产物"
                               "（extract.json 里看 transcode_blocked 的原因）。"
                               "装上 Pillow 重跑抽取，或把这条资产从 manifest 删掉"
                               "并在 gaps 写明。" % (aid, oext))
                dst = os.path.join(sub, "%s.%s" % (base, oext))
                shutil.copy2(orig_path, dst)
                copied.append(dst)
                entry["path"] = "assets/%ss/%s.%s" % (kind, base, oext)
                if truthy(a.get("use_full")):
                    raise Fail("%s: use_full=true 但 %s 没有压缩版产物，"
                               "path/full 会指向同一文件" % (aid, src))
        else:
            raise Fail("%s: 必须给 source_media / color / url 之一" % aid)

        consumer[aid] = entry
        # ---- 审计数据全部机器算，L 层不碰
        au = {}
        if a.get("source_media"):
            img = image_row_of(extract, a["source_media"])
            if img:
                # 首项为主位 = 出现次数最多者；次数打平时按阅读顺序（上→下、左→右）
                # 定序，避免同频簇的先后取决于字典插入顺序。
                clusters = sorted(img.get("boxes") or [],
                                  key=lambda c: (-c["count"], c["box"]["y"], c["box"]["x"]))
                boxes = [[int(round(c["box"][k])) for k in ("x", "y", "w", "h")]
                         for c in clusters]
                if boxes:
                    au["boxes"] = boxes
                    # aspect 取**未取整**的 box —— 从取整后的整数反算会明显偏
                    # 先取整再相除，误差会落到小数点后两位，logo 这种细长框尤其明显。
                    raw = clusters[0]["box"]
                    if raw.get("h"):
                        au["aspect"] = round(raw["w"] / float(raw["h"]), 3)
        if a.get("mark"):
            au["mark"] = a["mark"]
        au["confidence"] = a.get("confidence") or "high"
        audit[aid] = au
    return consumer, audit, copied


def _pages_of(extract, source_media):
    img = image_row_of(extract, source_media) if source_media else None
    if not img:
        return []
    pages = set()
    for c in img.get("boxes") or []:
        for p in c.get("parts") or []:
            m = re.search(r"slide(\d+)\.xml$", p)
            if m and "/slides/" in p:
                pages.add(int(m.group(1)))
    return sorted(pages)


def _archetypes_using(layouts_text, aid, key="asset"):
    """layouts.yaml 里哪些 archetype 引用了这个资产。

    key='asset' 查 slots 里的图片槽；key='background' 查页型底图。
    """
    out, cur, sect = [], None, None
    for line in (layouts_text or "").split("\n"):
        if re.match(r"^\w[\w-]*:\s*$", line):
            sect = line.split(":")[0]
            continue
        if sect != "layouts":
            continue
        m = re.match(r"^  ([\w-]+):\s*$", line)
        if m:
            cur = m.group(1)
            continue
        if cur and re.search(r"%s:\s*%s\b" % (key, re.escape(aid)), line) and cur not in out:
            out.append(cur)
    return out


def expand_placeholders(body, manifest, consumer, audit, extract, layouts_text):
    """body.md 里的 `{{ASSET_TABLE}}` / `{{LAYOUT_LIST}}` 由本脚本按落盘真值渲染——
    路径与页型清单是打包期才确定的事实，不该由 L 层手抄（抄错就是死链）。"""
    if "{{ASSET_TABLE}}" in body:
        rows = ["| 资产 | 文件 | 什么时候用 |", "|---|---|---|"]
        src_of = {unquote(a.get("id", "")): a.get("source_media") for a in manifest["assets"]}
        for aid, e in consumer.items():
            pages = _pages_of(extract, src_of.get(aid))
            box = (audit.get(aid) or {}).get("boxes") or []
            # 单元格保持短句：哪个页型用哪张由 `background` 字段决定，
            # 那句说明放在表格前一次即可，逐行重复只是把同一句抄 N 遍。
            if e["kind"] == "background":
                users = _archetypes_using(layouts_text, aid, key="background")
                when = ("%s 用它" % "/".join("`%s`" % o for o in users[:6])
                        if users else "未被任何页型引用")
            else:
                # 位置逐页型不同（同一 logo 常在封面左上、内容页右上，尺寸也不同），
                # 所以这里只给归属，坐标一律交给 layouts.md 的 slots。
                owners = _archetypes_using(layouts_text, aid)
                when = ("%s 这 %d 个页型带它" % ("/".join("`%s`" % o for o in owners[:6]),
                                              len(owners))
                        if owners else "⚠ 没有页型声明它的位置，本包不使用它")
            f = "`%s`" % e["path"] if e.get("path") else (
                "`%s`" % e["url"] if e.get("url") else "纯色 `%s`" % e.get("color"))
            if e.get("full"):
                f += "（原图 `%s`）" % e["full"]
            rows.append("| `%s` | %s | %s |" % (aid, f, when))
        body = body.replace("{{ASSET_TABLE}}", "\n".join(rows))
    if "{{LOGO_RULES}}" in body:
        rows = []
        for aid, entry in consumer.items():
            if entry.get("kind") != "logo":
                continue
            owners = _archetypes_using(layouts_text, aid)
            rows.append("- `%s` 只出现在这些页型上：%s；其余页型不放。位置取该页型 "
                        "`slots` 里 `role: logo` 那一项的 `box`，原样使用该文件、保持原比例。"
                        % (aid, "、".join("`%s`" % owner for owner in owners) or "（无）"))
        body = body.replace("{{LOGO_RULES}}", "\n".join(rows))
    if "{{LAYOUT_LIST}}" in body:
        rows, sect, names = [], None, {}
        for line in (layouts_text or "").split("\n"):
            if re.match(r"^\w[\w-]*:\s*$", line):
                sect = line.split(":")[0]
                continue
            m = re.match(r"^  ([\w-]+):\s*(.*)$", line)
            if not m:
                m2 = re.match(r"^    name:\s*(.+?)\s*$", line)
                if m2 and rows and rows[-1][1] is None:
                    rows[-1][1] = unquote(m2.group(1))
                continue
            if sect == "names" and m.group(2).strip():
                names[m.group(1)] = unquote(m.group(2))
            elif sect == "layouts" and not m.group(2).strip():
                rows.append(["- `%s`" % m.group(1), names.get(m.group(1))])
        rows = ["%s —— %s" % (k, n) if n else k for k, n in rows]
        body = body.replace("{{LAYOUT_LIST}}", "\n".join(rows) or "（无 archetype）")
    return body


def render_assets_block(consumer):
    out = ["assets:"]
    for aid, entry in consumer.items():
        out.append("  %s:" % aid)
        for f in ASSET_CONSUMER_FIELDS:
            if f in entry:
                out.append("    %s: %s" % (f, yaml_scalar(entry[f])))
    return out


# ------------------------------------------------- 数值可追溯机检（抄错即 FAIL）
HEX_RE = re.compile(r"#([0-9A-Fa-f]{6})\b")
FONTSIZE_RE = re.compile(r"\b(?:fontSize|font-size):\s*([\d.]+)px")
BOX_RE = re.compile(r"\bbox:\s*\[\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,"
                    r"\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\]")
KEYLINE_RE = re.compile(r"^(\s*)-?\s*([A-Za-z_][\w-]*):\s*(.*)$")
DOMINANT_TOL = 8         # 采样主色的每通道容差（量化误差天然存在）
BOX_TOL = 2.0            # slot 坐标逐维容差
SIZE_TOL = 0.51          # 字号容差（px 取整误差）
REBASE_TOL = 1.0         # 等比上抬后的字号容差


def _hex2rgb(h):
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def frontmatter_of(path):
    if not os.path.exists(path):
        return ""
    t = open(path, encoding="utf-8").read()
    parts = t.split("---\n")
    return parts[1] if len(parts) >= 3 else ""


def _scan_keyed(text):
    """逐行产出 (行号, 该行祖先键路径, 行内容)，供 token 级豁免定位。"""
    stack = []
    for i, raw in enumerate(text.splitlines(), 1):
        m = KEYLINE_RE.match(raw)
        if m:
            indent = len(m.group(1))
            while stack and stack[-1][0] >= indent:
                stack.pop()
            path = [k for _, k in stack] + [m.group(2)]
            stack.append((indent, m.group(2)))
            yield i, path, raw
        else:
            yield i, [k for _, k in stack], raw


def build_trace_index(extract, shapes):
    """可命中集合：色 / 字号 / 形状框。"""
    hexes, dominant = set(), []
    for c in extract.get("color_freq") or []:
        for k in ("resolved", "hex"):
            v = c.get(k)
            if isinstance(v, str) and v.startswith("#") and len(v) == 7:
                hexes.add(v.upper())
    # 主题 clrScheme 也是普查值：出厂色常被「排除色」条款正面引用（页面频次为 0
    # 恰恰是它要论证的事），不收进来会把这类正确引用误判成抄错。
    for t in extract.get("themes") or []:
        for v in (t.get("clrScheme") or {}).values():
            if isinstance(v, str) and v.startswith("#") and len(v) == 7:
                hexes.add(v.upper())

    def eat_fill(f):
        if not isinstance(f, dict):
            return
        col = f.get("color") or {}
        for k in ("resolved", "hex"):
            v = col.get(k) if isinstance(col, dict) else None
            if isinstance(v, str) and v.startswith("#") and len(v) == 7:
                hexes.add(v.upper())
        for st in f.get("stops") or []:                 # 渐变 stop 色
            eat_fill(st if "color" in st else {"color": st})

    for grp in ("slides", "layouts"):
        for row in extract.get(grp) or []:
            eat_fill(row.get("background"))
    for s in shapes:
        eat_fill(s.get("fill"))
        ln = s.get("line") or {}
        eat_fill(ln)
        eat_fill(ln.get("gradient"))
    for i in extract.get("images") or []:
        for dc in i.get("dominant_colors") or []:
            if dc.get("hex"):
                dominant.append((_hex2rgb(dc["hex"]), dc["hex"].upper()))

    sizes = sorted({e["sz_px"] for e in extract.get("text_scale") or []
                    if e.get("sz_px")})
    boxes = []
    for s in shapes:
        b = s.get("box")
        if b and b.get("w") is not None:
            boxes.append((b["x"], b["y"], b["w"], b["h"],
                          "%s %s" % (os.path.basename(s["part"]), s.get("name") or s["kind"])))
    return {"hexes": hexes, "dominant": dominant, "sizes": sizes, "boxes": boxes}


def _hex_hit(value, idx):
    v = value.upper()
    if v in idx["hexes"]:
        return True, None
    rgb = _hex2rgb(v)
    best, bestd = None, None
    for drgb, dhex in idx["dominant"]:
        d = max(abs(a - b) for a, b in zip(rgb, drgb))
        if d <= DOMINANT_TOL:
            return True, None
        if bestd is None or d < bestd:
            best, bestd = dhex, d
    for h in idx["hexes"]:
        d = max(abs(a - b) for a, b in zip(rgb, _hex2rgb(h)))
        if bestd is None or d < bestd:
            best, bestd = h, d
    return False, ("最近 %s（每通道差 %d）" % (best, bestd) if best else "普查里无任何色值")


def _size_hit(v, idx, factor):
    for s in idx["sizes"]:
        if abs(s - v) <= SIZE_TOL:
            return True, None
        if factor and abs(s * factor - v) <= REBASE_TOL:
            return True, None
    if not idx["sizes"]:
        return False, "普查里无字号"
    near = min(idx["sizes"], key=lambda s: abs(s - v))
    tip = "最近 %gpx" % near
    if factor:
        nf = min(idx["sizes"], key=lambda s: abs(s * factor - v))
        tip += "；×%g 后最近 %gpx→%.1f" % (factor, nf, nf * factor)
    return False, tip


def _box_hit(box, idx):
    best, bestd = None, None
    for x, y, w, h, tag in idx["boxes"]:
        d = max(abs(box[0] - x), abs(box[1] - y), abs(box[2] - w), abs(box[3] - h))
        if d <= BOX_TOL:
            return True, None
        if bestd is None or d < bestd:
            best, bestd = (x, y, w, h, tag), d
    if best is None:
        return False, "shapes.json 无形状"
    return False, ("最近 [%g, %g, %g, %g]（%s，最大维差 %.1fpx）"
                   % (best[0], best[1], best[2], best[3], best[4], bestd))


# 判断产物：L 层看着背景图划出来的区域，本就不该命中普查值——整键豁免，
# 不要求写 derived。逼它们走 derived 只会把整段豁免掉，机检反而更弱。
JUDGEMENT_KEYS = frozenset(("avoid", "text_safe", "pairing_rule"))


def media_integrity(stage1, extract):
    """extract.json 记录的尺寸，必须和磁盘上那个文件真实的尺寸一致。

    这条挡的是「记录全对、文件被顶替」——两个 media 的输出名撞车时，后写的覆盖先写的，
    extract.json 里各自的记录都还是对的，任何只读记录的检查都发现不了；只有把记录和
    文件本身对一遍才抓得到。实测某模板因此把一张 109x109 的图当成了整页背景。
    """
    try:
        from PIL import Image
    except Exception:
        return []                      # 没有 Pillow 就量不了，跳过而不是假装通过
    bad, seen = [], {}
    for m in extract.get("media") or []:
        for key, rel in (("source_px", m.get("out")),
                         ("compressed_px", m.get("compressed_out"))):
            rec = m.get(key)
            if not rel or not rec:
                continue
            path = os.path.join(stage1, rel)
            if not os.path.exists(path):
                bad.append("%s 的 %s 指向 %s，文件不存在" % (m["media"], key, rel))
                continue
            try:
                with Image.open(path) as im:
                    real = list(im.size)
            except Exception:
                continue
            if real != list(rec):
                bad.append("%s 的 %s 记录 %s，但 %s 实际是 %s"
                           % (m["media"], key, rec, rel, real))
            if rel in seen and seen[rel] != m["media"]:
                bad.append("%s 与 %s 都写到 %s" % (seen[rel], m["media"], rel))
            seen[rel] = m["media"]
    return bad


def trace_check(pack, extract, shapes, derived_values, derived_tokens, factor):
    """产物里每个 hex / 字号 / slot 坐标都必须可追溯到普查值或 derived 声明。"""
    idx = build_trace_index(extract, shapes)
    problems, checked = [], Counter()
    targets = [("design.md", frontmatter_of(os.path.join(pack, "design.md"))),
               ("layouts.md", frontmatter_of(os.path.join(pack, "layouts.md")))]
    for fname, text in targets:
        if not text:
            continue
        for lineno, path, raw in _scan_keyed(text):
            if JUDGEMENT_KEYS & set(path):
                checked["judgement"] += 1
                continue
            exempt_token = any(k in derived_tokens for k in path)
            for m in HEX_RE.finditer(raw):
                val = "#" + m.group(1).upper()
                checked["hex"] += 1
                if exempt_token or val in derived_values:
                    checked["exempt"] += 1
                    continue
                ok, tip = _hex_hit(val, idx)
                if not ok:
                    problems.append(("hex", fname, lineno, val, tip, ".".join(path)))
            for m in FONTSIZE_RE.finditer(raw):
                val = float(m.group(1))
                checked["size"] += 1
                if exempt_token or m.group(1) in derived_values:
                    checked["exempt"] += 1
                    continue
                ok, tip = _size_hit(val, idx, factor)
                if not ok:
                    problems.append(("fontSize", fname, lineno, "%gpx" % val, tip,
                                     ".".join(path)))
            for m in BOX_RE.finditer(raw):
                box = [float(x) for x in m.groups()]
                checked["box"] += 1
                key = "[%s]" % ", ".join(m.groups())
                if exempt_token or key in derived_values:
                    checked["exempt"] += 1
                    continue
                ok, tip = _box_hit(box, idx)
                if not ok:
                    problems.append(("slot box", fname, lineno,
                                     "[%g, %g, %g, %g]" % tuple(box), tip, ".".join(path)))
    return problems, checked


def render_audit(manifest, extract, audit):
    L = ["# 审计元数据（从 design.md 剥离，消费模型不需要；机检与人工复核用）"]
    src = extract["canvas"]["source"]
    L.append("canvas-source: {cx: %d, cy: %d, unit: %s}"
             % (src["cx"], src["cy"], src.get("unit", "EMU")))
    for k in ("theme-mechanism", "color-confidence"):
        if manifest.get(k):
            L.append("%s: %s" % (k, yaml_scalar(manifest[k])))
    if audit:
        L.append("assets:")
        for aid, au in audit.items():
            L.append("  %s:" % aid)
            if au.get("boxes"):
                L.append("    boxes:")
                for b in au["boxes"]:
                    L.append("    - [%d, %d, %d, %d]" % tuple(b))
            for f in ("aspect", "mark", "confidence"):
                if f in au:
                    L.append("    %s: %s" % (f, yaml_scalar(au[f])))
    return "\n".join(L) + "\n"


def _sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def _rel_files(root):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames.sort()
        for name in sorted(filenames):
            path = os.path.join(dirpath, name)
            files.append(os.path.relpath(path, root))
    return files


def build_package_manifest(manifest, consumer, audit, extract, pack):
    """Machine index for the style package.

    design.md remains the consumer entry. manifest.json is for storage/control
    planes: stable identity plus file and asset checksums.
    """
    files = []
    for rel in _rel_files(pack):
        if rel == "manifest.json":
            continue
        path = os.path.join(pack, rel)
        files.append({
            "path": rel,
            "bytes": os.path.getsize(path),
            "sha256": _sha256(path),
        })

    assets = []
    for aid, entry in consumer.items():
        item = {"id": aid, "kind": entry.get("kind")}
        for key in ("role", "theme", "on-bg", "path", "full", "url", "color"):
            if entry.get(key):
                item[key] = entry[key]
        for key in ("path", "full"):
            rel = entry.get(key)
            if rel:
                path = os.path.join(pack, rel)
                if os.path.exists(path):
                    item[key + "_bytes"] = os.path.getsize(path)
                    item[key + "_sha256"] = _sha256(path)
        au = audit.get(aid) or {}
        if au.get("confidence"):
            item["confidence"] = au["confidence"]
        assets.append(item)

    files_digest = hashlib.sha256()
    for item in files:
        files_digest.update(item["path"].encode("utf-8"))
        files_digest.update(b"\0")
        files_digest.update(item["sha256"].encode("ascii"))
        files_digest.update(b"\0")
        files_digest.update(str(item["bytes"]).encode("ascii"))
        files_digest.update(b"\n")

    pkg = {
        "schemaVersion": "pptx-style-package/v2",
        "id": manifest.get("name"),
        "name": manifest.get("name"),
        "name_zh": manifest.get("name_zh"),
        "version": manifest.get("version") or "alpha",
        "description": manifest.get("description"),
        "entry": "design.md",
        "layouts": "layouts.md" if os.path.exists(os.path.join(pack, "layouts.md")) else None,
        "canvas": "%dx%d" % tuple(extract["canvas"]["px"]),
        "source": {
            "filename": (extract.get("source") or {}).get("filename"),
            "content_type_kind": (extract.get("source") or {}).get("content_type_kind"),
            "is_template": (extract.get("source") or {}).get("is_template"),
            "bytes": (extract.get("source") or {}).get("bytes"),
        },
        "themes": manifest.get("themes") or ["single"],
        "default_theme": manifest.get("default-theme"),
        "files": files,
        "assets": assets,
        "totals": {
            "file_count": len(files),
            "bytes": sum(f["bytes"] for f in files),
            "sha256": files_digest.hexdigest(),
            "asset_count": len(assets),
        },
    }
    return {k: v for k, v in pkg.items() if v is not None}


def strip_agent_fast_path(body):
    if "## Agent Fast Path" not in body:
        return body
    return re.sub(r"\n?## Agent Fast Path\n.*?(?=\n## |\Z)", "\n", body,
                  count=1, flags=re.S).lstrip("\n")


def build_design(manifest, l_frontmatter, consumer, body, has_sidecar, canvas):
    blocks = {k: (inline, lines) for k, inline, lines in l_frontmatter}
    bad = set(blocks) - L_FRONTMATTER_KEYS
    if bad:
        raise Fail("frontmatter.yaml 出现不该由 L 层提供的顶层键: %s"
                   "（身份键写 manifest.yaml，assets/layouts 由脚本生成）"
                   % ", ".join(sorted(bad)))
    out = ["---"]
    for key in FRONTMATTER_ORDER:
        if key in ("version", "name", "name_zh", "description"):
            block = (manifest.get("_raw") or {}).get(key)
            if block:
                out.append("%s:%s" % (key, (" " + block[0]) if block[0] else ""))
                out += block[1]
                continue
            v = manifest.get(key) or ("alpha" if key == "version" else None)
            if v:
                out.append("%s: %s" % (key, yaml_scalar(v)))
        elif key in ("themes", "default-theme"):
            v = manifest.get(key)
            if isinstance(v, list):
                out.append("%s: [%s]" % (key, ", ".join(v)))
            elif v:
                out.append("%s: %s" % (key, yaml_scalar(v)))
        elif key == "assets":
            if consumer:
                out += render_assets_block(consumer)
        elif key == "layouts":
            if has_sidecar:
                out.append("layouts: layouts.md")
        elif key in blocks:
            inline, lines = blocks[key]
            out.append("%s:%s" % (key, (" " + inline) if inline else ""))
            out += lines
        if key == "exceptions" and not has_sidecar and canvas:
            out.append("canvas: %dx%d" % tuple(canvas))
    out.append("---")
    text = "\n".join(out) + "\n"
    # Fast Path 已废弃：它是 Usage / Hard Rules / 资产表 / 页型清单的第二份副本。
    # 规则的唯一出处是正文各段，这里只负责把历史产物里的残留剥掉。
    body = strip_agent_fast_path(body)
    if body:
        text += body if body.startswith("\n") else "\n" + body
    if not text.endswith("\n"):
        text += "\n"
    return text


def layout_forms(lines):
    """每个页型草案里实际给了哪几种形态（flow / slots）。"""
    out, cur = {}, None
    for line in lines:
        m = re.match(r"^  ([\w-]+):\s*$", line)
        if m:
            cur = m.group(1)
            out[cur] = set()
            continue
        m = re.match(r"^    (flow|slots):\s*$", line)
        if m and cur:
            out[cur].add(m.group(1))
    return out


def layout_modes(lines):
    """读取扁平 `layout_modes:` 判断区。"""
    out = {}
    for line in lines:
        m = re.match(r"^\s{2}([\w-]+):\s*([^\s#]+)", line)
        if m:
            out[m.group(1)] = m.group(2).strip()
    return out


def text_role_boxes(lines):
    """从 slots 里的同名标记取回文本槽坐标，供 flow 固定锚点复用。"""
    out, pending = {}, None
    for line in lines:
        marker = re.match(r"^\s*#\s*text-role:\s*([\w-]+)\s*$", line)
        if marker:
            pending = marker.group(1)
            continue
        if pending:
            box = re.search(r"\bbox:\s*(\[[^\]]+\])", line)
            if box:
                out[pending] = box.group(1)
                pending = None
    return out


def select_layout_forms(lines, modes):
    """按 `layout_modes` 只保留每个页型选中的 flow 或 slots。"""
    forms = layout_forms(lines)
    out, layout, drop = [], None, False
    for line in lines:
        layout_match = re.match(r"^  ([\w-]+):\s*$", line)
        form_match = re.match(r"^    (flow|slots):\s*$", line)
        if layout_match:
            layout, drop = layout_match.group(1), False
        elif form_match:
            selected = modes.get(layout)
            if selected is None and len(forms.get(layout) or ()) >= 2:
                selected = "slots"
            drop = selected is not None and selected != form_match.group(1)
        elif drop and re.match(r"^    \S", line):
            drop = False
        if not drop:
            out.append(line)
    return out


def shrink_safe_area(lines):
    """text_safe 与 avoid 相交时把安全区收掉重叠的那部分。

    text_safe 是脚本按「该背景各页型的槽位并集」算的，而模板里的槽位本身可能就压在
    主视觉上；avoid 是看图的人填的。两者从不同来源来，会直接打架——实测一张背景的
    text_safe 有 34% 落在 avoid 里，消费端按 text_safe 把标题放进了禁放区，正好压在
    背景的山峰主体上。这里以 avoid 为准收缩：能不能放字是看图的人说了算。
    """
    def parse_box(s):
        m = re.findall(r"-?\d+", s)
        return [int(x) for x in m[:4]] if len(m) >= 4 else None

    ts_i = ts = None
    avoids = []
    for i, ln in enumerate(lines):
        st = ln.strip()
        if st.startswith("text_safe:"):
            ts_i, ts = i, parse_box(st.split(":", 1)[1].split("#")[0])
        elif st.startswith("avoid:"):
            for chunk in re.findall(r"box:\s*\[[^\]]*\]", st):
                b = parse_box(chunk)
                if b:
                    avoids.append(b)
    if ts is None or not avoids:
        return lines, None
    x0, y0, x1, y1 = ts[0], ts[1], ts[0] + ts[2], ts[1] + ts[3]
    for a in avoids:
        ax0, ay0, ax1, ay1 = a[0], a[1], a[0] + a[2], a[1] + a[3]
        if ax1 <= x0 or ax0 >= x1 or ay1 <= y0 or ay0 >= y1:
            continue                       # 不相交
        # 从被侵占得最少的一边切：优先保留面积最大的剩余矩形
        cands = []
        if ax0 > x0:
            cands.append((x0, y0, ax0, y1))
        if ax1 < x1:
            cands.append((ax1, y0, x1, y1))
        if ay0 > y0:
            cands.append((x0, y0, x1, ay0))
        if ay1 < y1:
            cands.append((x0, ay1, x1, y1))
        if not cands:
            return lines, "text_safe 被 avoid 完全覆盖，这张背景没有可放文字的区域"
        x0, y0, x1, y1 = max(cands, key=lambda c: (c[2] - c[0]) * (c[3] - c[1]))
    new = [x0, y0, x1 - x0, y1 - y0]
    if new == ts:
        return lines, None
    lines = list(lines)
    lines[ts_i] = "    text_safe: [%d, %d, %d, %d]   # 已按 avoid 收缩（原 %s）" % (
        new[0], new[1], new[2], new[3], ts)
    return lines, None


def resolve_asset_candidate_lines(lines, decisions, asset_ids):
    """把 source_media 临时字段转成资产引用；内容图保留通用 pic 槽。"""
    out = []
    content_slots = set()
    layout_name, layout_form = None, None
    for line in lines:
        layout_match = re.match(r"^  ([\w-]+):\s*$", line)
        form_match = re.match(r"^    (flow|slots):\s*$", line)
        if layout_match:
            layout_name, layout_form = layout_match.group(1), None
        elif form_match:
            layout_form = form_match.group(1)
        match = re.search(r"\bsource_media:\s*([^,}]+)", line)
        if not match:
            out.append(line)
            continue
        source = unquote(match.group(1).strip())
        candidate_box = source_box(line) or slot_box(line)
        decision = (decisions.for_slot(source, line, layout_name)
                    if isinstance(decisions, AssetDecisions)
                    else decisions.get(source))
        line = re.sub(r"\s*,?\s*source_media:\s*[^,}]+", "", line, count=1)
        line = re.sub(r"\s*,?\s*source_box:\s*\[[^\]]+\]", "", line, count=1)
        # 预算裁掉、没有进入视觉组的素材不凭空判成风格资产；保留原位置通用图片槽，
        # 让生成侧可放这一页的内容图。`omit` 是页码/水印等纯噪声，直接去掉槽。
        if decision == "omit":
            continue
        if decision in (None, "content"):
            line = re.sub(r"\s*,?\s*asset:\s*[^,}]+", "", line, count=1)
            line = re.sub(r"(\brole:\s*)[\w-]+", r"\g<1>pic", line, count=1)
            # 内容图不进风格资产，但同一位置只能留一个通用图片槽。不同图片源在同一
            # box 的叠加是原 PPT 的内容选择，不应被转换成两个生成时必然重叠的 pic 槽。
            content_key = (layout_name, layout_form, candidate_box or line.strip())
            if content_key in content_slots:
                continue
            content_slots.add(content_key)
            out.append(line)
            continue
        aid = (asset_ids.for_decision(source, decision)
               if isinstance(asset_ids, AssetIds) else asset_ids.get(source))
        if not aid:
            raise Fail("layouts.yaml 引用了未完成资产判断的 source_media: %s" % source)
        if re.search(r"\basset:\s*[^,}]+", line):
            line = re.sub(r"(\basset:\s*)[^,}]+", r"\g<1>%s" % aid, line, count=1)
        else:
            line = line.replace("}", ", asset: %s}" % aid, 1)
        line = re.sub(r"(\brole:\s*)[\w-]+", r"\g<1>%s" % decision, line, count=1)
        out.append(line)
    return out


def build_layouts_md(layouts_blocks, canvas, asset_decisions=None, asset_ids=None):
    blocks = {k: (inline, lines) for k, inline, lines in layouts_blocks}
    if "canvas" in blocks:
        raise Fail("layouts.yaml 不要写 canvas —— 脚本从 extract.json 取")
    if "layouts" not in blocks:
        raise Fail("layouts.yaml 缺顶层键 `layouts:`")
    # `names:` / `roles:` / `text_roles:` / `layout_modes:` / `bg_rules:` 是给 L 层集中填判断的
    # 扁平区——在这里并回各 archetype，本身不进产物。让 L 层只改扁平键值，别去动 layouts 里的
    # slots/confidence 结构（嵌套结构手改极易破坏缩进，进而静默改变语义）。
    names, roles = {}, {}
    for key, sink in (("names", names), ("roles", roles)):
        for line in blocks.get(key, ("", []))[1]:
            m = re.match(r"^\s{2}([\w-]+):\s*(.+?)\s*$", line)
            if m:
                sink[m.group(1)] = unquote(m.group(2))
    text_roles = {}
    allowed_text_roles = {"title", "subtitle", "header", "footer", "body"}
    for line in blocks.get("text_roles", ("", []))[1]:
        m = re.match(r"^\s{2}([\w-]+):\s*([A-Za-z-]+)(?:\s+#.*)?$", line)
        if not m:
            continue
        role_id, role = m.groups()
        if role not in allowed_text_roles:
            raise Fail("text_roles.%s 取值 %s 非法；应为 %s"
                       % (role_id, role, "|".join(sorted(allowed_text_roles))))
        text_roles[role_id] = role
    bg_rules, cur = {}, None
    for line in blocks.get("bg_rules", ("", []))[1]:
        # 键后面允许行内注释（草案会标「用它的页型：…」）
        m = re.match(r"^\s{2}([\w-]+):\s*(?:#.*)?$", line)
        if m:
            cur = m.group(1)
            bg_rules[cur] = []
            continue
        if cur and line.strip():
            bg_rules[cur].append("    " + line.strip())
    out = ["---", "canvas: %dx%d" % tuple(canvas)]
    # 禁放区是背景的属性，按背景写一次；页型只留 `background:` 指针。
    # 合并进每个页型会把同一句话按页型数复制 N 遍。
    if bg_rules:
        out.append("backgrounds:")
        for bg, lines in bg_rules.items():
            lines, err = shrink_safe_area(lines)
            if err:
                raise Fail("%s: %s" % (bg, err))
            out.append("  %s:" % bg)
            out += lines
    modes = layout_modes(blocks.get("layout_modes", ("", []))[1])
    decided_layout_roles = set(roles)
    out.append("layouts:")
    pending_text_role = None
    used_text_roles = set()
    decisions = asset_decisions if asset_decisions is not None else {}
    resolved_asset_ids = asset_ids if asset_ids is not None else {}
    source_layout_lines = resolve_asset_candidate_lines(
        blocks["layouts"][1], decisions, resolved_asset_ids)
    role_boxes = text_role_boxes(source_layout_lines)
    layout_lines = select_layout_forms(source_layout_lines, modes)
    cur, fixed_items = None, []
    emitted_roles = set()

    def flush_fixed_items():
        if not fixed_items:
            return
        out.append("        - kind: free")
        out.append("          items:")
        out.extend(fixed_items)
        fixed_items.clear()

    for line in layout_lines:
        m = re.match(r"^  ([\w-]+):\s*$", line)
        if m:
            flush_fixed_items()
            cur = m.group(1)
        elif fixed_items and re.match(r"^    \S", line):
            flush_fixed_items()
        if cur in decided_layout_roles and re.match(r"^    role:\s*", line):
            # 页型草案中的 role 只是初始值；最终语义只由扁平 roles 判断单决定。
            # 否则两者同时写入会产生重复 YAML 键，并让后面的草案默认值覆盖模型判断。
            continue
        # 判断单里的结构事实（栅格、间距序列、样张字数、命中配方）是给 L 层判断用的，
        # 不进产物——消费端要的是结论，不是推导过程。layout_mode 同理，它是判断的载体。
        if line.lstrip().startswith("#"):
            marker = re.match(r"^\s*#\s*text-role:\s*([\w-]+)\s*$", line)
            if marker:
                pending_text_role = marker.group(1)
            continue
        if pending_text_role:
            role = text_roles.get(pending_text_role)
            if role:
                # header 是语义角色，V2 没有同名的渲染 slot type；保留 role 供消费端
                # 识别固定页眉，同时用 body 通过 V2 的类型枚举。
                slot_type = role if role in ("title", "subtitle", "footer") else "body"
                line, role_n = re.subn(r"(\{\s*role:\s*)[\w-]+",
                                       r"\g<1>%s" % role, line, count=1)
                line, type_n = re.subn(r"(\btype:\s*)[\w-]+",
                                       r"\g<1>%s" % slot_type, line, count=1)
                if role_n != 1 or type_n != 1:
                    raise Fail("text_roles.%s 没有命中一个文本槽" % pending_text_role)
                if (modes.get(cur) == "flow" and role in ("header", "footer")
                        and re.match(r"^\s{12}-\s*\{", line) and "box:" not in line):
                    box = role_boxes.get(pending_text_role)
                    if not box:
                        raise Fail("text_roles.%s 识别为 %s，但 slots 中没有坐标"
                                   % (pending_text_role, role))
                    line = re.sub(r",\s*type:", ", box: %s, type:" % box, line, count=1)
                    fixed_items.append(line)
                    used_text_roles.add(pending_text_role)
                    pending_text_role = None
                    continue
                used_text_roles.add(pending_text_role)
            pending_text_role = None
        out.append(line)
        if cur and re.match(r"^    role:\s*", line):
            emitted_roles.add(cur)
        if m and m.group(1) in names:
            out.append('    name: "%s"' % names.pop(m.group(1)))
        if m and m.group(1) in roles:
            out.append("    role: %s" % roles.pop(m.group(1)))
            emitted_roles.add(m.group(1))
    flush_fixed_items()
    if names:
        raise Fail("names 里这些页型在 layouts 下找不到：%s" % ", ".join(sorted(names)))
    if roles:
        raise Fail("roles 里这些页型在 layouts 下找不到：%s" % ", ".join(sorted(roles)))
    unused_text_roles = set(text_roles) - used_text_roles
    if unused_text_roles:
        raise Fail("text_roles 里这些判断没有命中文本槽：%s"
                   % ", ".join(sorted(unused_text_roles)))
    missing_role = [
        k for k in re.findall(r"^  ([\w-]+):\s*$", "\n".join(blocks["layouts"][1]), re.M)
        if k not in emitted_roles
    ]
    if missing_role:
        raise Fail("这些页型没有 role（在 layouts.yaml 的 roles 段填）：%s" % ", ".join(missing_role))
    # 未声明 layout_modes 时默认 slots：固定坐标是从原 PPT 直接普查的安全交付形态。
    # 模型只在看样张确认内容需要随高度重排时显式改为 flow。
    forms = layout_forms(blocks["layouts"][1])
    bad = []
    for k, v in sorted(modes.items()):
        if len(forms.get(k) or ()) < 2:
            continue                          # 只有一份形态，无从选择
        if v not in ("flow", "slots"):
            bad.append("%s 的 layout_modes 判断是 %r" % (k, v))
        elif v not in forms[k]:
            bad.append("%s 选了 %s 但该页型没有这一份" % (k, v))
    if bad:
        raise Fail("layout_modes 只能填 flow 或 slots，一个页型一个词：%s" % "；".join(bad))
    declared = set(re.findall(r"^    background:\s*(\S+)\s*$",
                              "\n".join(blocks["layouts"][1]), re.M))
    stray = set(bg_rules) - declared
    if stray:
        raise Fail("backgrounds 段里这些背景没有任何页型在用：%s" % ", ".join(sorted(stray)))
    out.append("---")
    text = "\n".join(out) + "\n"
    if "body" in blocks:
        body = scalar_of(blocks["body"][0], blocks["body"][1])
        if body:
            text += "\n" + body.rstrip("\n") + "\n"
    return text


# --------------------------------------------------------------------- 主流程

def _autodetect_check_v1():
    skill_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    for cand in (os.environ.get("DSM_V1_DIR"),
                 os.path.join(os.path.dirname(skill_root), "miaoda-design-system-extract"),
                 os.path.expanduser("~/dev/gitlab/miaoda_workspace/.agents/skills/miaoda-design-system-extract")):
        if cand and os.path.isfile(os.path.join(cand, "scripts", "check_v1.py")):
            return os.path.join(cand, "scripts", "check_v1.py")
    return None


def main(argv=None):
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("stage1")
    ap.add_argument("lout")
    ap.add_argument("pack")
    ap.add_argument("--check-v1", default=None, help="check_v1.py 路径；缺省自动探测（$DSM_V1_DIR → 同级 skill → 开发机路径）")
    ap.add_argument("--style-name", default=None)
    ap.add_argument("--force", action="store_true")
    args = ap.parse_args(argv)

    stage1, lout, pack = (os.path.abspath(p) for p in (args.stage1, args.lout, args.pack))
    ex_path = os.path.join(stage1, "extract.json")
    if not os.path.exists(ex_path):
        raise Fail("找不到 %s" % ex_path)
    extract = json.load(open(ex_path, encoding="utf-8"))

    need = ["manifest.yaml", "frontmatter.yaml", "body.md"]
    for f in need:
        if not os.path.exists(os.path.join(lout, f)):
            raise Fail("判断单缺 %s（schema 见本脚本 docstring）" % f)
    if os.path.isdir(pack) and os.listdir(pack) and not args.force:
        raise Fail("%s 非空；加 --force 覆盖" % pack)

    left = []
    control_path = os.path.join(lout, "layout-controls.yaml")
    draft_files = ["manifest.yaml", "frontmatter.yaml", "body.md"]
    # 新草案的可编辑判断已移到小型控制文件；layouts.yaml 中保留的旧控制区只是
    # 兼容坐标事实，仍含 TODO 也不会进入最终 layouts.md。
    draft_files.append("layout-controls.yaml" if os.path.exists(control_path)
                       else "layouts.yaml")
    for f in draft_files:
        p = os.path.join(lout, f)
        if not os.path.exists(p):
            continue
        for i, line in enumerate(open(p, encoding="utf-8"), 1):
            if "TODO" in line:
                left.append("%s:%d  %s" % (f, i, line.strip()[:90]))
    if left:
        raise Fail("判断单还有 %d 处草案占位没改（TODO 是 draft.py 留给 L 层的判断点）：\n    %s"
                   % (len(left), "\n    ".join(left)))
    mdesc = re.search(r"^description:\s*[|>]?\s*\n((?:\s+\S.*\n?)+)",
                      open(os.path.join(lout, "manifest.yaml"), encoding="utf-8").read(), re.M)
    if mdesc and len(re.sub(r"\s+", "", mdesc.group(1))) < 20:
        raise Fail("manifest 的 description 只有 %d 个字符——它是消费模型定调的唯一入口，"
                   "写清底色/主色/字形/版面骨架，不要留占位"
                   % len(re.sub(r"\s+", "", mdesc.group(1))))

    manifest = read_manifest(os.path.join(lout, "manifest.yaml"))
    bind_asset_vision_group_scopes(lout, manifest)
    if args.style_name:
        manifest["name"] = args.style_name
    if not manifest.get("name"):
        raise Fail("manifest.yaml 缺 name")
    themes = manifest.get("themes")
    if isinstance(themes, list) and len(themes) > 1 and not manifest.get("default-theme"):
        raise Fail("themes 有 %d 个主题，必须给 default-theme（V2-13）" % len(themes))

    l_fm = split_top_blocks(open(os.path.join(lout, "frontmatter.yaml"),
                                 encoding="utf-8").read())
    body = open(os.path.join(lout, "body.md"), encoding="utf-8").read()
    layouts_blocks = load_layout_blocks(lout)
    bound_sources, bound_slots = set(), defaultdict(set)
    if layouts_blocks is not None:
        for key, _, lines in layouts_blocks:
            layout_name = None
            for line in lines:
                layout_match = re.match(r"^  ([\w-]+):\s*$", line)
                if layout_match:
                    layout_name = layout_match.group(1)
                match = re.search(r"\bsource_media:\s*([^,}]+)", line)
                if match:
                    source = unquote(match.group(1).strip())
                    bound_sources.add(source)
                    box = source_box(line) or slot_box(line)
                    if key == "layouts" and box is not None:
                        bound_slots[source].add((layout_name, box))
    has_asset_judgments = bool(
        manifest.get("asset_vision_groups") or manifest.get("asset_decisions"))
    asset_decisions, asset_ids = apply_asset_decisions(
        manifest,
        bound_sources=bound_sources if has_asset_judgments else None,
        bound_slots=bound_slots if has_asset_judgments else None)
    canvas = extract["canvas"]["px"]
    final_layouts = (build_layouts_md(
        layouts_blocks, canvas, asset_decisions=asset_decisions, asset_ids=asset_ids)
        if layouts_blocks is not None else None)

    os.makedirs(pack, exist_ok=True)
    consumer, audit, copied = place_assets(manifest, extract, stage1, pack)

    lay_text = final_layouts or ""
    body = expand_placeholders(body, manifest, consumer, audit, extract, lay_text)
    design = build_design(manifest, l_fm, consumer, body,
                          has_sidecar=layouts_blocks is not None, canvas=canvas)
    with open(os.path.join(pack, "design.md"), "w", encoding="utf-8") as f:
        f.write(design)
    if layouts_blocks is not None:
        with open(os.path.join(pack, "layouts.md"), "w", encoding="utf-8") as f:
            f.write(final_layouts)

    # 审计记录写回**抽取工作目录**，不进交付包：包是消费产物，`ref/` 里的东西
    # 没有任何门禁读、消费模型也用不上，放进去只会让「别读我」和「几 MB 材料」同时下发。
    ref = os.path.join(stage1, "ref")
    os.makedirs(ref, exist_ok=True)
    audit_path = os.path.join(ref, "audit.yaml")
    with open(audit_path, "w", encoding="utf-8") as f:
        f.write(render_audit(manifest, extract, audit))
    carried = []
    # L 层自备的 ref 补充件（判断理由、版式溯源等）也归到抽取目录
    l_ref = os.path.join(lout, "ref")
    if os.path.isdir(l_ref):
        shutil.copytree(l_ref, ref, dirs_exist_ok=True)
        carried.append("(L 层 ref/)")

    with open(os.path.join(pack, "manifest.json"), "w", encoding="utf-8") as f:
        json.dump(build_package_manifest(manifest, consumer, audit, extract, pack),
                  f, ensure_ascii=False, indent=2, sort_keys=True)
        f.write("\n")

    print("pack → %s" % pack)
    print("  design.md %d 行 / %.1f KB%s"
          % (len(design.splitlines()), len(design.encode()) / 1024.0,
             "   layouts.md sidecar" if layouts_blocks is not None else "   (layouts 内联/缺省)"))
    print("  assets %d 条目 / %d 文件落盘" % (len(consumer), len(copied)))
    for d in copied:
        print("    %-52s %8d B" % (os.path.relpath(d, pack), os.path.getsize(d)))
    print("  审计记录 -> %s%s（不进交付包）"
          % (os.path.relpath(audit_path, os.path.dirname(stage1)),
             "  " + ", ".join(carried) if carried else ""))

    # ---- 数值可追溯机检：产物里每个色值/字号/坐标都得能指回普查值
    derived_values, derived_tokens = set(), set()
    for d in manifest.get("derived") or []:
        if d.get("value"):
            v = unquote(d["value"])
            derived_values.add(v.upper() if v.startswith("#") else v)
        if d.get("token"):
            derived_tokens.add(unquote(d["token"]))
    try:
        factor = float(manifest.get("rebase_factor") or 0) or None
    except ValueError:
        raise Fail("rebase_factor 不是数字: %r" % manifest.get("rebase_factor"))
    sp = os.path.join(stage1, "ref", "shapes.json")
    shapes = json.load(open(sp, encoding="utf-8"))["shapes"] if os.path.exists(sp) else []
    problems, checked = trace_check(pack, extract, shapes,
                                    derived_values, derived_tokens, factor)
    integrity = media_integrity(stage1, extract)
    if integrity:
        print("\n--- 媒体产物完整性 ---")
        for b in integrity:
            print("  FAIL " + b)
        raise Fail("media-out 里的文件和 extract.json 的记录对不上（%d 处）" % len(integrity))
    print("\n--- 数值可追溯机检 ---")
    print("  受检 hex %d / fontSize %d / slot box %d；derived 豁免 %d%s%s"
          % (checked["hex"], checked["size"], checked["box"], checked["exempt"],
             "；判断键跳过 %d 行（avoid/text_safe/pairing_rule）" % checked["judgement"]
             if checked["judgement"] else "",
             "；rebase_factor=%g" % factor if factor else ""))
    if not shapes:
        print("  ⚠ 未找到 %s，slot 坐标一项无法校验" % sp)
    trace_rc = 0
    if problems:
        trace_rc = 1
        print("  FAIL %d 处数值无法追溯（既不命中普查值，也没在 manifest 的 derived 里声明）："
              % len(problems))
        for kind, fname, lineno, val, tip, path in problems:
            print("    %s:%d  %s %s  ← %s" % (fname, lineno, kind, val, path))
            print("        %s" % (tip or ""))
        print("  修法二选一：改成命中的值，或在 manifest.yaml 的 derived: 段声明推导理由。")
    else:
        print("  PASS 全部可追溯")

    rc = trace_rc
    print("\n--- check_v2 ---")
    sys.stdout.flush()          # 子进程直写 fd，不 flush 会让本脚本的输出排在其后
    r = subprocess.run([sys.executable, os.path.join(HERE, "check_v2.py"), pack])
    rc = rc or r.returncode
    if not args.check_v1:
        args.check_v1 = _autodetect_check_v1()
        if not args.check_v1:
            print("check_v1: 未探测到（$DSM_V1_DIR / 同级 skill / 开发机路径均无）—— v1 门禁未跑，交付前必须补跑")
    if args.check_v1:
        print("\n--- check_v1 ---")
        sys.stdout.flush()
        r1 = subprocess.run([sys.executable, args.check_v1,
                             os.path.join(pack, "design.md"), "slide"])
        rc = rc or r1.returncode
    if rc:
        print("\n门禁未过（exit %d）。回修属 L 层的事：改判断单后重跑本脚本。" % rc)
        return rc
    return rc


if __name__ == "__main__":
    sys.exit(main())
