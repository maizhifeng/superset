---
name: pptx-style-extract
description: 从 PPTX/POTX 附件抽取 deck 风格包 v2（design.md + layouts.md + assets/ + ref/）。**对话里出现 .pptx / .potx 附件就先跑本 skill**——默认它是要参考的模板，不需要用户明说「按这个风格」。只有用户点明了另一种意图（只要翻译、只要总结、只要提取文字、要改这份文件本身）才跳过。附件文本摘要不能替代抽取。
metadata:
  display-names:
    zh-CN: PPT 模板风格抽取
    en-US: PPTX Style Extract
---

# pptx-style-extract（PPT 模板风格抽取）

一份 PPTX → 一个风格包：`manifest.json`（机器清单）+ `design.md`（消费入口）+ `layouts.md` + `assets/` + `ref/`。

三步依次跑完才有这个包：**抽取**（脚本出草案）→ **判断**（你改草案里的 TODO——认图、命名、写气质）→ **打包**（脚本产出 `design.md` + `layouts.md`）。deck 的版式坐标、资产路径、logo 出现在哪些页型，全部从包里读。

脚本路径相对本 skill 根目录；不做环境检测，依赖缺失脚本自己降级并在输出里报。

## When To Use This Skill

对话里出现 `.pptx` / `.potx` 附件，**默认它是要参考的模板**——先跑本 skill 抽风格，再动手做 deck。用户上传一份 PPT 却不说要干什么时，绝大多数情况就是「照着这个做」；等他明说才抽，等于把默认值设反了。

只有用户点明了另一种意图才跳过：只要翻译、只要总结、只要提取文字、要修改这份文件本身。

`SummarizeAttachmentOrFile` 的文本摘要不能替代抽取——它丢掉主题色、字体、母版几何、版式坐标和可复用的视觉资产，正是做 deck 最需要的那些。

## Runtime Contract

- Required dependency boundary: Python 3 standard library only.
- Pillow may be present and improves image hashing, palette extraction, contact sheets, and asset transcoding. If Pillow is missing or fails, continue with degraded extraction and record the degradation in outputs.
- Do not run `pip install`, `uv pip install`, `npm install`, or any other dependency installation in the user session.
- Run Python with bytecode disabled: `PYTHONDONTWRITEBYTECODE=1 python3 -B ...`.
- Default working directory: `tmp/pptx-style-extract/<unique-id>/`, **relative to the project root**. The sandbox file tools (`read_file` / `write` / `multi_edit`) only accept project-relative paths — an absolute `/tmp/...` workdir makes every draft edit fall back to hand-written shell scripts.
- Intermediates stay under the project's `tmp/`; they are scratch, not deliverables. Only the final deck assets copied by the deck authoring step enter the app source tree.
- `package.py` only runs v1 checks when `--check-v1 <path>` is passed or `DSM_V1_DIR` points to a sibling checker. It must not rely on developer-machine paths in the sandbox.

## Fast Path Contract

Generated packages must make the attachment-consumption path explicit in `design.md` and exported consumer attachments, not in the user prompt:

- `design.md` and `layouts.md` are the authoritative generation entrypoints. Audit files under `ref/` and zip payload internals are not generation material.
- If an attachment summary returns `assetRoot` / `assetPaths`, treat `assetRoot` as an opaque prefix and only concatenate declared asset paths. Do not inspect, list, glob, or repair attachment directories.
- The generated Agent Fast Path must forbid shell exploration such as `ls <assetRoot>`, `ls <assetRoot>/assets/backgrounds`, `find <assetRoot>`, `glob("<assetRoot>/**")`, or any command containing `assets/design-style-packages`.
- If self-checking asset usage is needed, inspect final HTML/CSS for the declared path strings or use browser runtime resource checks. Do not fall back to shell directory exploration.
- Background, logo, layout safety, and asset-use rules belong in the generated style package (`design.md` / `layouts.md`), not in ad hoc query wording.

## 1. 抽取

附件的真实路径通常已经在用户消息的 `<<< 附件信息 >>>` 块里给出（`附件已保存到 <path>`）——直接用那个路径。**只有**消息里没给路径时才列目录，用列出来的名字，不要按附件标题猜文件名：

```bash
ls -la .agent/<conversation_id>/attachments/
```

一条命令，写成单行并带 `2>&1`：

```bash
mkdir -p tmp/pptx-style-extract/<unique-id> && PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/extract.py "<真实路径>" tmp/pptx-style-extract/<unique-id>/stage1 2>&1
```

输出最后一行必是这两个哨兵之一，照它走，不要用 `ls` 去探查目录——那会白花好几轮还是查不出原因：

- `EXTRACT_OK <outdir>/l-out` — 跑完了，进第 2 步
- `EXTRACT_PARTIAL ...` — 普查产物齐全、只有草案挂了，按它给的命令单独重跑 `draft.py`，不要重跑整条抽取
- 两个都没有 — 输出被截断（退出码可能仍是 0），原样重跑一次

**目录里没有 `.pptx` / `.potx`**（只有 `skills/` 之类）说明这次上传没有落成沙箱本地文件，本 skill 无法执行：如实告诉用户模板文件在沙箱里取不到、请重新上传或反馈平台，然后停下。此时**不要**用 `summarize_attachment_or_file` 的文本摘要当风格来源，也不要用 `generate_image` 自造配图充当模板视觉——那样产出的 deck 与模板无关，却看起来像成功了。

一条命令出全部：`extract.json`（普查数值）、`media-out/`（候选图）、`ref/`（审计层）、`l-out/`（**判断单、坐标事实、BRIEF.md、分批候选图、整页语境图和 layout-sheet.png**）。

非 OOXML / 损坏 / 加密 → 报告调用方，不产半成品。

## 2. 判断

1. 读 `<outdir>/l-out/BRIEF.md` 一次，确定待判断文件、视觉组和页型代表页；需要查候选的全部原始位置、尺寸、重复次数、透明度或近白比例时读 `asset-vision-groups.json`。没有候选图片的页无需做图片判断。
2. 一次并行看全部 `vision-group-*.jpg` 与 `layout-sheet.png`。每张视觉组拼版都同时给出页面语境和带编号的候选卡；透明或近白候选会同时显示棋盘格和深灰底。除非拼版把图片标成 unreadable，不打开单张素材、不再读旧的 `contact-sheet` / `asset-context-sheet`。
3. 在 `manifest.yaml` 按每个 `asset_vision_groups` 候选实例填写 `visual_kind`；同一素材在不同页型或位置可分别判断。仅在预算外候选或需要改写既有判断时追加 `asset_decisions`；位置例外写 `box: [x, y, w, h]`，同图同位置跨页型不同时再写 `layout`。可用值固定为 `logo|slogan|background|texture|icon|decorative|illustration|photo|chart|screenshot|footer-copyright|page-number|watermark|content-image|unknown`，不新造值；`package.py` 会把它映射回现有 v2 资产类型，视觉组字段不会进入最终包。
4. 按页面语境判断用途：本 deck 自己的品牌标志才是 `logo`；图表、截图、logo 墙，以及用于解释当前页具体产品、案例或信息的图片是 `content-image`；封面、目录、章节或封底中承担构图主视觉的局部图，即使是产品或摄影图，也用 `decorative` 或 `illustration` 保留为版式素材。页码、水印和版权标记用对应的 omit 类值。脚本已直接保留不透明满屏背景和封面主视觉，不为它们补判断；半透明满屏叠加层仍要在视觉组中定性。拿不准的候选用 `unknown`，不要按品牌名、页码或图片数量猜用途。
5. 用一次 `multi_edit` 批量完成其余 TODO：风格气质，以及 `layout-controls.yaml` 中的页型/文本角色、布局模式和背景规则。普通文本槽默认 `body`，只把确实属于 `title|subtitle|header|footer` 的例外写进 `text_roles`；有 flow 与 slots 两种形态时默认保留 slots，只有样张明确需要内容随高度重排才填 `layout_modes: <页型>: flow`。不补不存在的标题、页眉或页脚。直接编辑草案，不写脚本改 YAML，也不修改 Skill 源码。
6. `layout-controls.yaml` 的 `bg_rules:` 按**背景资产**分组（不是按页型），只编辑草案已有且被页型 `background:` 引用的真实图片背景；没有 `bg_rules` 就不要新增。纯色、渐变、外框、几何装饰和透明叠层不是这里的背景资产。逐张背景填 `text_safe` / `avoid` / `pairing_rule`：看图标清视觉主体、强光斑、深色透明区，打包时自动并入用该背景的所有页型。标题、正文、关键数字、图表、卡片、时间线及其容器的外接矩形都不得压住背景主体，透明容器也不能跨进禁放区。

`layout-controls.yaml` 是唯一需要编辑的版式判断文件，只含 `names`、`roles`、`text_roles`、`layout_modes` 和 `bg_rules`。`layouts.yaml` 是兼容用的坐标事实——页型、坐标、字号、色值、对齐、以及各页型自带的 `role: logo` 资产槽全部直读，**不要打开或修改它**。打包时控制文件会覆盖旧文件中的同名判断区。

判断口径：

- **图片按用途三分**——整幅替换底图的艺术图/摄影图属**背景族**；服务于当前页具体内容的图表、截图、产品说明图是**内容图，不进包**；用于封面、目录、章节或封底构图的局部主视觉不解释内容，即使画面是产品或摄影图，也属**装饰图，标 `decorative` 或 `illustration` 进 assets**；其余纹理、插画、色块、几何点缀同属装饰图。不透明满屏图默认走背景；局部图和半透明满屏叠加层结合候选图与整页语境逐张定性，避免把重要装饰误当内容丢弃。首页、末页优先保留样张，但是否为 `cover` 或 `closing` 仍按页面意图判断。
- **logo 特指这份 deck 自己的品牌标志**——看图确认是本 PPT 的品牌文字或标志图形才留 `logo`；一页若是 logo 墙（客户/合作方 logo 罗列），那些是内容图、不当风格 logo。拿不准就保留该候选并填 `unknown`，在 `gaps` 写一句；不要删除或合并 `asset_vision_groups` 条目。
- **anchors 是事实不是结论**——草案里每条只报测到的数（覆盖率、计数、占比），没有「这套风格的特征是 X」这种断言。这一段在 design.md 里读起来像总纲，消费端会照它建全局样式，所以脚本不敢替你下结论：一条 1/8 覆盖率的元素被描述成「跨页不动」，消费端就会每页都摆它。看过重建图后，把真正是这套模板特征的那几条改写成设计要点，不是特征的直接删掉。
- **数值只改名不改值**——草案里的坐标/色值/字号来自普查；确需推导值（CJK 行高转译、投影尺度上抬）在 manifest 写 `derived:` 声明理由，机检认声明。
- **页型命名**——模板自带版式名时草案已填好；只有靠样张聚类的模板（`layout-controls.yaml` 的 `names` 里还是 TODO）才需要按 BRIEF 的 slot 原文起中文名。
- **页型角色**——`layout-controls.yaml` 的 `roles:` 段有 TODO 时，看 `layout-sheet.png` 上对应的代表页定 `cover|section|content|quote|closing|blank|custom`。草案只把客观事实摆在注释里（代表页页码、页数、文字块数、字号序列、图片数、有无满屏底图），不替你下结论：字号多大算章节页、文字块多少算密集页，每套模板的答案都不一样。
- **文本角色**——`layout-controls.yaml` 的 `text_roles:` 段有候选时，结合重建图和注释中的样例文字判断标题、副标题、页眉、页脚或正文。这里仅改变已有文本槽的语义；所有文本槽、图片、容器与装饰仍由 `layouts:` 保留。标题、页眉或页脚已在背景中可见时，在 Hard Rules 写明对应页型只渲染已有 slots，不重复叠加文字。
- **资产位置不要写成全局规则**——同一个 logo 常按页型换位换尺寸（封面一个位置一个尺寸、内容页另一个）。位置只存在于 `layouts.md` 各页型的 `slots`，正文里只说「按该页型的 slot 摆放，没有就不放」。一张图只在 `manifest` 标了 `kind` 还不够：生成侧只摆 `slots` 里带 `asset:` 引用它的那些，没有任何页型引用它就不会被放出来。要它出现，就在对应页型的 `slots` 加一条 `asset:` 引用。
- **背景和版式要配对**——真实背景不是纯色底。看 `layout-sheet.png` 判断每个页型上的视觉主体与文字、卡片落点；仅当代表页看不清时，才打开 `manifest.yaml` 已声明的那张背景资产核对。`background` 草案已按版式直读填好，你只需在 `layout-controls.yaml` 的 `bg_rules` 里逐张背景补 `text_safe`、`avoid`、`pairing_rule`，避免消费 Agent 把文字、图表、卡片、时间线、标题容器、正文容器或宽透明容器的外接矩形压到金字塔、人物、产品图、强光斑或深色区域上。
- 双主题只认 BRIEF 的 `themes`；单主题包不写 `theme` 字段。

判断单里的**结构事实**（每个页型上方的注释）是判「这页该用绝对坐标还是流式」的依据：栅格几列、垂直间距序列（突变处即区带边界）、样张里每个文字槽的实际字数、命中哪个容器样式配方。文件头另有容器样式配方清单，带出现次数与跨页数——跨页多的是共性风格，只在一处出现的多半不是。

**页型给 `flow` 还是 `slots`，由你定**：内容长度会变的内容页（列表、表格、卡片组）优先用 `flow`，区带依次排，高度由实际内容决定；构图固定的页（封面、章节页）用 `slots` 绝对坐标。在 `layout-controls.yaml` 的扁平 `layout_modes:` 段为每个候选页型填 `flow` 或 `slots`，打包时按它落一份。判据就在该页型上方的结构事实里：规整多列栅格、等距重复的间距、成对出现的长文本槽都指向 `flow`。`flow` 中并列卡片以 `grid` 表达，每张卡片的容器、标题和正文放在同一个一层 `role: group` 中；logo、页码、页眉和页脚等固定锚点留在带 `box` 的 `free` 区带。模型结合实际内容判断纵向间距与留白，不机械照搬样张的 `y` 坐标。

普查是有损的。判断不了时可以直接翻 `<outdir>/ref/source/` —— PPTX 解压后的原文都在那里（`ppt/slides/slideN.xml`、`ppt/slideLayouts/`、`ppt/theme/`）。它只在中间产物里，不进交付包。

要更多依据时用 `PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/query.py <outdir> <子命令>`（`shapes` / `colors` / `fonts` / `text-scale` / `images` / `clusters` / `media` / `slides` / `layouts` / `recipes` / `grids` / `get <点路径>`）。读数一律走它，**不写解析脚本、不读 XML、不开浏览器**。

## 3. 打包

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/package.py <outdir> <outdir>/l-out <包输出目录> --force
```

package.py exit 0 后才可交付、导出或供 deck 消费；成功即结束本次抽取，不再重读草案、打开 `layouts.yaml` 或追加检查。`media-out/`、`l-out/` 都是中间产物，不能作为风格来源。FAIL 会指名道姓（TODO 未改 / 数值不可追溯 / 枚举误用 / 引用断链 / 体量超标），改判断单后**用同一个包目录重跑**（`--force` 就是为回修准备的），不要去改产物；体量 FAIL 走降级链（审计出包 → sidecar 化 → archetype 收缩）。

跑之前先确认 `manifest.yaml`、`frontmatter.yaml`、`body.md` 和 `layout-controls.yaml`（旧草案没有该文件时才检查 `layouts.yaml`）的 `TODO` 已经全部改完。改完直接跑 package.py，不用先 `ls` 确认目录。

## 完成判据

- [ ] package.py exit 0
- [ ] design.md 的 Usage 能回答消费三问：封面底图是哪个文件？logo 每页放哪、用哪个文件？版式坐标去哪查？
- [ ] design.md / layouts.md 能回答背景安全三问：每张背景的可放文字区域在哪里？禁放区在哪里？每个页型必须配哪张背景？
- [ ] Agent Fast Path 写清 `assetRoot` / `assetPaths` 的不透明前缀协议，并禁止目录探索。
- [ ] 抽不出的都在 `gaps`，无编造

配套 `v2-format-spec.md`（包形态与 schema）、`font-fallback.yaml`（商业字体降级表）只在你要偏离草案结构时才需要读——草案的字段结构与包一致，`package.py` 按它落盘。

## Consume The Style Pack In A Deck

After `package.py` succeeds, the output package is for immediate model consumption.

Read `<pack_dir>/design.md` first, especially `## Usage`, `## Hard Rules`, colors, typography, components, assets, and safe-area. Then read `<pack_dir>/layouts.md`; its `canvas` and `slots[].box` are the geometry source for deck-stage sections.

When generating a deck:

1. Call `copy_starter_component` with `kind: "deck-stage.js"`.
2. Build `<deck-stage width="<canvas width>" height="<canvas height>">` using the `canvas` declared in `layouts.md` — source decks are not always 16:9, and a default-sized stage shifts every coordinate on the page. Each slide is one static `<section data-pptx-layout="<chosen archetype>">`.
3. Inline CSS variables from `design.md` into the HTML `<style>` block using a `--ppt-*` prefix.
4. **位移动画用独立的 `translate` 属性**：`@keyframes fadeUp { from{opacity:0; translate:0 24px} to{opacity:1; translate:0 0} }`。`transform` 是单一属性，动画里碰它会覆盖掉元素原有的那条（`left:50%; transform:translateX(-50%)` 的居中就此丢失）；`translate` / `rotate` / `scale` 各自独立，与已有 `transform` 叠加。
5. Map `layouts.md` slots to absolute-positioned elements inside each section: expand `box: [x,y,w,h]` mechanically to `left/top/width/height`, then apply the slot's `css` declaration string unchanged. `box` owns geometry; `css` owns all rendering style, including the template's text padding, typography, alignment, line height, letter spacing, and rotation. Do not reinterpret PPTX fields or replace slot CSS with your own type scale. A slot with `asset` is a fixed image element: use that exact asset at that box on that archetype only; do not omit or replace it. Do not reflow any of this as generic web grids.
6. Copy `<pack_dir>/assets/` into the project, for example `assets/pptx-style/<pack-name>/`, and reference those copied files with relative URLs. The scratch `tmp/pptx-style-extract/...` path must never appear in the final HTML.
7. Use the font stacks and fallback rules from `design.md`; do not install fonts or dependencies at runtime.
8. Before the regular slide preflight, verify every background and fixed image asset against the selected archetype:

   ```bash
   PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/verify_layout_assets.py <pack_dir> <index.html> --asset-prefix <copied-assets-prefix>
   ```

   `PPTX_LAYOUT_ASSETS: FAIL` means fix every reported instance according to `layouts.md`, then rerun the same command. Do not deliver or call `run_commit` until it prints `PPTX_LAYOUT_ASSETS: PASS`.
9. Run the slide preflight checks: no resource failures, no section overflow, and sampled screenshots follow the package colors, typography, layouts, assets, and Hard Rules.

## Export Consumer Attachments

When the style package is sent as a runtime attachment rather than mounted as a directory, export a consumer artifact that makes the fast path visible to the model:

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/export_consumer_zip.py <pack_dir> <out.zip> --work-dir <consumer_dir>
PYTHONDONTWRITEBYTECODE=1 python3 -B scripts/export_consumer_md.py <pack_dir> <out.md>
```

The consumer zip starts with a text prefix containing Agent Fast Path, `design.md`, and a bounded `layouts.md` excerpt. The markdown exporter inlines `design.md` / `layouts.md` for flows that should avoid archive preprocessing altogether.
