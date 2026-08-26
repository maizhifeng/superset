# 风格包 v2 规范（DSM v1 超集）

> 与 `dsm-v1-spec.md`（v1 单文件规范）配套：v1 的全部规则原样生效，本文只定义 v2 新增部分。机器门禁 = `check_v1.py`（v1 部分）+ `scripts/check_v2.py`（本文 §5 十三条）。**纯 design.md（不含任何 v2 新增段）永远是合法 v2 退化态、可独立消费**——存量风格零迁移。
> 字段名/枚举/阈值以本文为唯一权威；抽取执行步骤在 SKILL.md，本文只写格式。

## 0. 包形态（定稿：独立风格包）

```
<style-name>/
  manifest.json    # 机器清单：id/name/version/files/assets、体积、sha256
  design.md        # 消费入口 + 权威：v1 全部 + §1-§4 新增段（含 layouts 指针）
  layouts.md       # layouts sidecar（§3）
  assets/          # 二进制资产：<kind>s/<id 去 kind 前缀>.<ext>，如 assets/logos/on-light.svg
  ref/             # 审计层（audit.yaml 元数据、证据、频次原表、溯源），下发时由链路剥离
```

- 消费方直接读 design.md，靠目录约定找 sidecar 与资产；frontmatter `path` 是唯一文件引用点。
- manifest（`manifest.json`，识别靠内部 `schemaVersion` 字面量不靠文件名）服务存储、索引、校验和迁移；消费模型不需要读它。
- `ref/` 只放 `audit.yaml`（数值出处的人工复核记录，几 KB）。频次原表、聚类原始数据、`extract.json`、重建图、logo 候选图**留在抽取工作目录，不进交付包**——原设计是「下发时链路剥离」，但链路上没有环节真的做剥离，审计材料会连带进消费上下文并占掉包体的大头。

## 1. design.md frontmatter 新增键

全部可选（缺 = 退化 v1）。**含 `layouts` 或 `safe-area` 必有 `canvas`**。坐标一律归一化整数 px@1920。

**design.md 只装消费者要用的东西**：审计与溯源元数据（`canvas-source`、`theme-mechanism`、`color-confidence`、资产的 boxes/aspect/mark/confidence）一律落 `ref/audit.yaml`；`canvas` 落 layouts.md frontmatter（与坐标数据同处）。

**键序强制**（V2-9 机检，8k 截断护栏）：

```
官方白名单键: version → name → name_zh → description → colors → typography → spacing → rounded → components → omitted
v1 自造键:   anchors → gaps → exceptions
v2 自造键:   themes → default-theme → assets → layouts → safe-area
```

`omitted` 留手工作者，抽取产物只用 `gaps` 记「抽不出」。

**引用硬规则**：`themes / assets / layouts / safe-area` 四段禁止花括号引用（`{assets.x}` = FAIL），正文写反引号裸 id。唯一例外：纯色背景的 `color: "{colors.x}"`（引 colors 命名空间，合法且必须）。

**YAML 键名红线**：禁用 YAML 1.1 布尔字面量作键名（`on / off / yes / no / true / false / y / n`）——PyYAML 会把 `on:` 解析成 `True:`。资产的「在什么底上用」字段因此叫 `on-bg`。

### 1.1 `canvas`（在 layouts.md frontmatter，不在 design.md）

```yaml
canvas: 1920x1080      # layouts.md 首键；px = round(EMU / sldSz_cx * 1920)
```

- 非 16:9 保宽 1920、高按真实比例，差异记 `gaps`。
- 原始 EMU（`canvas-source`，PPT 反向生成用）落 `ref/audit.yaml`。

### 1.2 `themes` 与双主题色板（主题前缀 token 名）

```yaml
themes: [dark, light]
default-theme: dark            # 双主题包必填（V2-13）
colors:                        # v1 单层扁平，主题进 token 名
  dark-surface: "#RRGGBB"
  dark-on-surface: "#RRGGBB"
  light-surface: "#RRGGBB"
  primary: "#RRGGBB"           # 共用色不加前缀
```

- token 前缀约定（`dark-X`/`light-X` = 主题专属，无前缀 = 共用）在 `## Usage` 里向消费者写一句；主题机制溯源（clrMap 反转等）落 `ref/audit.yaml`。
- 嵌套/模式对象形态禁用（官方 lint 0.4.0 下整名引用 broken-ref 致败），前缀是唯一 0-error 形态。
- **色角色基名优先映射 MD3 词表**（bg→surface/background、text→on-surface、强调→primary/secondary/tertiary、配对一律 `on-X`），抽不出对应再自造。

### 1.3 排除色

- **排除色进 `## Hard Rules` 带证据计数**，正向给替代（如「`<hex>` 为编辑器参考线色（出现 <N> 次），非设计色」）。频次原表与 color-confidence 证据进 `ref/`。
- 排除色断言必须以**解析后频次**为准，`styleRef` 主题兜底引用（不渲染）与真实设计用色分开。

## 2. `assets` 段

**条目只留消费字段**——design.md 是给消费模型读的，每个字段都要回答「用什么、用在哪」。boxes / aspect / mark / confidence / 频次注记是审计字段，落 `ref/assets-audit.yaml`，不进 design.md（D10「审计进 ref/」的完整贯彻）。

```yaml
assets:
  logo-on-light:
    path: assets/logos/on-light.svg   # 包内相对路径
    kind: logo                 # 封闭枚举：logo | slogan | background | texture | icon
    on-bg: light               # light | dark
  bg-cover-dark:
    path: assets/backgrounds/cover-dark.webp
    full: assets/backgrounds/cover-dark@full.jpg   # 可选：原图（方案甲双产物）
    kind: background
    role: cover                # cover | content | section | closing | accent
    theme: dark
    recipe: "linear-gradient(<angle>, <color> 0%, <color> 100%)"   # 可选：CSS 重绘配方
  bg-content-solid:            # 纯色背景：无 path/url，引 colors token
    kind: background
    role: content
    color: "{colors.dark-bg}"
```

- **`path` / `url` / `color` 三者恰好存在一个**（V2-12）；`color` 仅 `kind: background` 允许；`full` 仅可与 `path` 共存。
- **每个资产必须在正文 `## Usage` 的资产用法表里有一行用法**（文件、用在哪、怎么摆）——条目字段说明"是什么"，用法表说明"怎么用"，两者缺一即孤儿（V2-2）。
- `themes` 每主题应有可用 logo `on-bg` 变体（缺 → V2-8 WARN）。
- 文件格式：webp 优先、jpg 可接受；svg 保源、**禁内嵌 base64 位图**（假矢量按位图处理）。
- **二进制承载两方案**：
  - 方案甲·包内（抽取产物默认形态）：大图保留原图 + 压缩图（`<name>@full.<ext>` / `<name>.<ext>`，`path` 指压缩图、`full` 指原图），消费侧优先用压缩图；压缩图 >500KB WARN、包内总量 >20MB FAIL。
  - 方案乙·平台云盘（入库后目标形态）：条目用 `url`，消费时按云盘图片处理参数取压缩版；包内不落二进制，体积约束不适用。入库时由后端把 `path`/`full` 重写为 `url`（重写版仍须过 V2-1/V2-12）。
  - `url` 必须 http(s) 持久地址，禁 24h TTL 签名 URL。
- 被遮挡/无用资产、页面内容图不进包；抽不出不编造（记 `gaps`，logo 候选图存 `ref/logo-candidates/`）。**边界**：「内容图」指内容区里的图表/截图/配图；实例页整幅替换底图的满屏主视觉（含封面艺术图）属背景族，照收。

## 2.5 `## Usage` 章节（正文必产，紧随 Overview）

design.md 是消费模型的操作文档，不是抽取记录。`## Usage` 承载三件事，全部**可执行**（具体文件、具体坐标、具体顺序）：

1. **消费步骤**：① 画布取 `layouts.md` 的 `canvas`；② 从页型清单选 archetype，按其 flow / slots / decor / background 原样落版；③ `design.md` frontmatter 的 colors / typography / spacing / rounded / components 作为全局 token，局部 CSS 优先；④ 包内资产复制到项目相对目录后引用，字体使用完整 fallback 栈且不在运行时安装；⑤ 双主题包写明默认主题与 token 前缀切换法。
2. **资产用法表**：每个资产一行——id、文件路径、用在哪类页、怎么摆（logo 给坐标，背景给首选序——如「封面首选 cover-art，无主视觉需求用 cover-dark」）。
3. **强调色族纪律**：强调色族以 `colors` 段和 layout slot CSS 为主。必要时可使用其他颜色，但新增颜色须与模板整体的色相、明度和饱和度关系协调，且不能形成与模板主色竞争的第二强调色。中性色、低彩度辅助色或局部语义色可表达正负、风险、警告、状态、图表序列，但须保持辅助层级；新色不得通过高饱和、高对比、大面积、跨页重复，或用于标题、关键数字、图表主序列、卡片底色、渐变来获得主视觉权重。
4. **交付检查**：逐页确认色板、字体、版式、背景、资产和 Hard Rules 均来自本包，并检查资源加载、内容溢出与画幅裁切。

**Hard Rules 必须包含对应的正向硬规则**（有资产的包）：每页放 logo（位置+文件）；封面底图必用 cover 资产；版式从 layouts.md 取；以 colors / layout slot CSS 为强调色基准，新增颜色与整体色板协调并保持辅助层级。禁止句只用于无法正向表达的红线，且同句给替代。

## 3. `layouts` 段（默认 sidecar）

design.md frontmatter 里 `layouts` 键**类型二义**：值为 string 且 `.md` 结尾 = sidecar 指针（`layouts: layouts.md`）；值为 map = 内联。键名统一 `layouts`（`layouts-file` = FAIL）。

```yaml
layouts:
  cover:
    name: "封面"
    role: cover                # 封闭七值：cover | section | content | quote | closing | blank | custom
    themes: [dark, light]      # 深浅孪生合并
    background: {dark: bg-cover-dark, light: bg-cover-light}
    slots:
      - {role: title, box: [<x>, <y>, <w>, <h>], type: title, css: "<CSS 声明串>"}
      - {role: logo,  box: [<x>, <y>, <w>, <h>], asset: {dark: logo-on-dark, light: logo-on-light}}
    decor:
      - {box: [<x>, <y>, <w>, <h>], geom: ellipse, css: "<CSS 声明串>"}
    confidence: high
```

- **`background` 三形态**：`<asset-id>` / `{<theme>: <asset-id>}` / `{color: <colors-token>}`（`color` 是保留键，主题名禁止叫 color）。`asset` 两形态：`<asset-id>` / `{<theme>: <asset-id>}`。
- **背景安全扩展**：有真实背景图的 archetype 建议写 `text_safe: [x,y,w,h]`、`avoid: [{box: [x,y,w,h], reason: "..."}]`、`pairing_rule: "..."`。这些是消费约束，不参与封闭枚举；用于避免标题、正文、图表、卡片、表格、时间线及其容器外接矩形覆盖背景视觉主体、强光斑或深色透明区；透明容器也不能跨进禁放区。
- **流式页型**：内容长度会变化的内容页可用 `flow.regions` 表达纵向区带。`stack` 表达单列顺序，`grid` 表达并列列组，`free` 中的 item 必须带 `box`，用于 logo、页码、页眉和页脚等固定锚点。并列卡片可在 `grid.items` 中使用一层 `{role: group, css, gap, items}`：group 的 `css` 是卡片容器样式，内部 `items` 按顺序排布；不继续嵌套 group。区带可带自己的 `margin: [左, 右]`，覆盖 `flow` 整块的 `margin`（居中卡片组和贴左标题横向范围本就不同）；不带则继承整块 `margin`。纵向位置与留白由消费模型结合实际内容决定，不把样张的 `y` 坐标当作流式硬约束。
- **`decor`（可选）**：这一页无文字的图形骨架——图标托底的圆、卡片、分隔线。每条 `{box, geom, css}`：`box` 定位，`css` 是可直接写进 style 的声明串，`geom` 取源形状的 prst（`ellipse` 另加 `border-radius: 50%`）。圆角以每条 `css` 为准，没有 `border-radius` 就按 `0`；不得因 `geom: roundRect` 自行补圆角，因为 OOXML 的 roundRect 可以有零圆角调节点。层级在背景之上、`slots` 之下；带 `asset` 的槽落在 decor 之上是版式本意，不算重叠。
- **slot 样式契约**：`box` 只承载 `[x,y,w,h]` 几何；可渲染属性统一放进 `css`，并可直接写入 HTML `style`。PPTX `bodyPr.insets_px` 转成 `box-sizing: border-box; padding: ...`，字号/字重/颜色/水平与垂直对齐/行高/字距/旋转分别转成标准 CSS。禁止在 slot 中输出 `size` / `weight` / `color` / `align` / `valign` / `insets_px` 等旧字段。
- **文本角色判断**：脚本把实例页及其引用版式中的现有文本槽、几何和 CSS 完整写入草案；`text_roles` 只供模型把这些槽判断为 `title | subtitle | header | footer | body`，不控制槽位去留。判断不清时用 `body`，不归纳模板中不存在的标题、页眉或页脚。
- **标题结构**：存在合适的模板页型时，沿用其标题层级和局部 CSS，只渲染该页型已有的文字槽；背景中已经可见的固定标题不重复创建文本，该页型没有副标题槽时不新增副标题。没有合适参考时由模型按模板整体视觉判断。
- **圆角作用域**：`rounded` 只允许表达全档共同的单一圆角档位；零圆角与非零圆角混用、或存在多个非零档位时不输出该全局 token。此时每个 `role: container` / `decor` 的 `css` 是唯一事实源，逐项原样消费，不得归并或推断。
- **`type` 封闭枚举**：`title | subtitle | body | pic | table | chart | media | slide-number | footer`。大数字/序号走 `type: title`，语义由 `role`（如 `big-number`）承担。
- **`slots.*.role` 开放不校验**（语义槽位）：优先复用已知词表（OOXML ST_SlideLayoutType / Slidev 20 布局 / Google PredefinedLayout，如 big-number、caption、main-point），确无对应再自造。
- archetype ≤15（内联降级形态 ≤11）；深浅孪生合并为一条；版式溯源/母版取舍进 `ref/`。
- **sidecar 容器形态**：统一 frontmatter（`---` 包裹 YAML）+ 正文可留说明。sidecar 内禁止重复 `canvas` / `themes` 等 design.md 已有键（冲突以 design.md 为准，机检 WARN）。

## 4. `safe-area` 段

```yaml
safe-area:                     # 开放命名 map，可多套边距体系
  content:    {top: <px>, right: <px>, bottom: <px>, left: <px>, applies-to: [content, quote]}
  editorial:  {left: <px>, right: <px>, applies-to: [cover, section, closing]}
  confidence: medium
```

冲突裁决：`slots.box` 是实例真值，`safe-area` 是归纳框架，**以 slots.box 为准**。

## 5. check_v2 校验（19 行：V2-1..V2-16 + V2-R5/R6/R7）

check_v1 全部规则原样生效。扫描范围 = 包目录，V2-1/V2-2 跨 design.md + layouts.md 求并集。

| # | 规则 | 级别 |
|---|---|---|
| V2-1 | `path`/`url`/`full` 引用断链（含 slots 的 by-theme 嵌套形态） | FAIL |
| V2-2 | 孤儿资产（`full` 指向的文件不算孤儿） | WARN |
| V2-3 | 坐标出 canvas ±5% 出血容差（四边各 ±5%，受检 = `slots.box`；canvas 读 layouts.md frontmatter） | FAIL |
| V2-4 | `kind/on-bg/role/theme/type` 枚举合法（role 分语境：assets 五值封闭 / layouts 七值封闭 / slots 开放） | FAIL |
| V2-5 | 推断段缺 confidence（受检 = layouts 条目 / safe-area 块；assets 的 confidence 在 `ref/audit.yaml`，不受本检） | FAIL |
| V2-6 | （仅包内承载）压缩图单张 >500KB WARN；包内资产总量 >20MB FAIL（口径 = `assets/**` ∪ 声明 path/full 并集，KB=1024；`full` 文件免单张 WARN、计入总量；url 承载不适用） | WARN/FAIL |
| V2-7 | 花括号引用新段（`{assets.*}` 等）显式拦截 | FAIL |
| V2-8 | `themes` 声明主题缺可用 logo `on-bg` 变体 | WARN |
| V2-9 | frontmatter 键名/键序符合 §1 清单（键序乱 = WARN；`layouts-file` 废弃键 = FAIL，须改用 `layouts`） | WARN/FAIL |
| V2-10 | 含 layouts/safe-area 但包内（design.md ∪ layouts.md frontmatter）无 canvas | FAIL |
| V2-11 | 键名命中 YAML 1.1 布尔字面量 | FAIL |
| V2-12 | `path`/`url`/`color` 恰好存在一个；`color` 仅 background 允许；`full` 仅可伴随 `path` | FAIL |
| V2-13 | 多主题（`themes` 长度 >1）缺 `default-theme`（只看 design.md frontmatter——冲突以 design.md 为准） | WARN |
| V2-14 | 版式的 `flow` 与 `slots` 互斥（同时出现 = FAIL）；`flow.regions[].kind` 在 `grid`/`stack`/`free` 内，`grid` 必带 `cols` | FAIL |
| V2-15 | 同段字段自洽：`backgrounds.*` 的 `text_safe` 不得与任一 `avoid` 相交；两者形态须为 `[x, y, w, h]` 四个数且 w/h 为正 | FAIL |
| V2-16 | slot/flow item 的渲染样式只通过 `css` 承载；出现 `size/weight/color/align/valign/insets_px` 旧键 | FAIL |
| V2-R5 | sidecar frontmatter 重复 design.md 已有顶层键（`layouts` 载荷键与 `canvas` 除外——canvas 的家就在 sidecar） | WARN |
| V2-R6 | assets 条目出现审计字段（boxes/aspect/mark/confidence）或 design.md 顶层出现 canvas/canvas-source/theme-mechanism/color-confidence——应移 `ref/audit.yaml` / layouts.md | WARN |
| V2-R7 | 有 layouts sidecar 指针但正文未出现 `layouts.md` 字样（弱指针，消费者到不了版式数据） | WARN |

补充口径：url 只验格式（非 http(s) FAIL）+ 签名参数启发式 WARN，活性归下发链路。

## 6. 体量与降级链

- v1 门限不变：slide 档 22000 字符 FAIL、est-token >6000 WARN；**按 8k token 保守设计**（appType=6 内联 8k 静默截断）。
- 降级链（顺序执行，不允许交付 FAIL 件）：审计字段出包（默认已做）→ **layouts sidecar 化（无损，默认形态）** → archetype 上限收缩（有损，最后手段）。

## 7. `confidence` 契约

消费侧：

| level | 消费方行为 |
|---|---|
| `high` | 按值执行，视同显式规范 |
| `medium` | 按值执行；与内容冲突时允许 ±5% 微调，不得改语义角色 |
| `low` | 建议值，可按版面调整，但必须满足 safe-area 与不出血 |

生产侧初评（脚本执行，与消费契约是两回事）：**直读字段 = high、单信号推断 = medium、聚类/看图推断 = low**；LLM 仅可多信号互证升档，升档必须在 `ref/` 写明依据。

## 8. 开放命名治理

`safe-area` 键名 / `slots.role` / asset id 采用晋升制：单风格自用 → ≥2 风格需要进推荐词表 → 高频升规范枚举；不支持降级。
