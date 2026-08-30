# Codex App 排版与界面几何调研

> 取证日期：2026-08-31（Asia/Singapore）
>
> 研究对象：本机 `/Applications/ChatGPT.app` 中的 Codex 桌面界面
>
> 适用版本：`26.825.51511`，build `7377`，macOS Apple Silicon 发行包
> 方法边界：官方 OpenAI 文档 + 已安装 App 的只读静态资源；本报告没有操作桌面 UI，
> 也不把静态 CSS 当成最终像素截图。由于 Codex 对自身窗口的读取存在安全限制，本轮无法
> 用自动化工具读取运行中窗口；结论止于静态资源证据，实屏项单列为待验证。

## 先说结论

这版 Codex 桌面界面不是一套“统一使用 OpenAI Sans”的排版。它的主体更接近 macOS
原生应用：普通 UI 使用系统无衬线字体栈，代码使用系统等宽字体栈；`OpenAI Sans` 只在
品牌名称和少量标题中显式出现。

可以把最常见的桌面排版骨架概括成：

- 正文 / 对话：`14px`，Markdown 默认行高 `22.75px`；
- 列表 / 辅助 UI：`13px`，常配显式 `20px` 行高；
- 更弱的说明 / 时间：`12px`，常配 `16px` 行高；
- 代码设置的静态 schema 默认值是 `12px`；Composer 代码块为 `12 / 20px`，diff 为
  `12 / 21.6px`；
- 字重：`400 / 500 / 600 / 700`，桌面常用 `400` 与 `500`；
- 间距基数：`4px`，最常见的组件 gap 是 `4 / 8 / 12 / 16px`；
- 图标令牌覆盖 `10 / 12 / 14 / 16 / 18 / 20 / 24 / 28px`，其中打包 JS 中
  `14 / 16 / 18px` 的静态引用最密集；控件外框常见 `28 / 36px`；
- 桌面工具栏高度令牌为 `46px`，紧凑工具栏 `36px`，pane 工具栏 `40px`；
- 主内容最大宽度 `48rem`（默认 `768px`），面板内边距 `20px`，工具栏水平内边距
  `16px`；
- 圆角采用一组 `2–24px` 的基础令牌，并通过条件支持的 superellipse 分支放大到
  `2.5–30px`。因此不能只抄一个“Codex 圆角 = 12px”。

## 证据等级

| 标记 | 含义 | 置信度 |
| --- | --- | --- |
| A | App 包内 CSS、JS、`Info.plist` 或 `package.json` 的直接声明 | 高 |
| B | 从 A 级变量按 CSS 计算规则换算，或从打包 JS 的 class literal 判断调用 | 中高 |
| C | 需要浏览器 computed style、字体解析或实屏测量才能最终确认 | 待验证 |

所有本地源均来自同一个 `app.asar`：SHA-256
`f56ac8d5254a10fc4a04e7417fa787d135c3bbca49bad7d668d4ae65833d40c7`。主样式
`webview/assets/app-initial-NNCUNt29.css` 的 SHA-256 为
`21117c4678d5b57299f9b9b109463b9b9b259f100491375fab0278d6bb12401b`。包内没有随附
`.map` 文件，虽然 JS 尾部仍保留 `sourceMappingURL` 注释；因此组件调用只能以打包 class
literal 为证，不能冒充原始 TypeScript 源码位置。

## 为什么检查的是 `ChatGPT.app`

OpenAI 官方更新日志说明，Codex 从桌面版 `26.707` 起进入 ChatGPT 桌面应用，macOS
用户仍可保留 Codex 图标；这解释了本机应用文件名是 `ChatGPT.app`，而不是另一个
`Codex.app`。[OpenAI Docs：Codex joins the ChatGPT desktop app](https://learn.chatgpt.com/docs/changelog#codex-joins-the-chatgpt-desktop-app-26707)

本机静态身份互相吻合：

| 字段 | 值 | 来源 | 置信度 / 适用范围 |
| --- | --- | --- | --- |
| `CFBundleShortVersionString` | `26.825.51511` | `Contents/Info.plist` | A；本机已安装包 |
| `CFBundleVersion` | `7377` | `Contents/Info.plist` | A；本机已安装包 |
| bundle id | `com.openai.codex` | `Contents/Info.plist` | A；macOS 包 |
| package name / product | `openai-codex-electron` / `Codex` | `app.asar!/package.json` | A；此构建 |
| package version / build | `26.825.51511` / `7377` | `app.asar!/package.json` | A；与 plist 一致 |
| renderer toolchain | Electron `42.3.0`、Vite `8.1.5` | `app.asar!/package.json` | A；构建依赖，不等同于设计契约 |

OpenAI 的当前桌面应用概览说明了项目、文件、工具与长任务等产品能力，但没有发布字号、
行高、间距、圆角或图标尺寸令牌；当前 changelog 也没有与版本 `26.825.51511` 对应的视觉
规格表。因此下面的数值以已签名安装包内资源为主要第一手证据，不称为 OpenAI 对外承诺的
设计规范。[OpenAI Docs：ChatGPT desktop app](https://learn.chatgpt.com/docs/app) ·
[OpenAI Docs：ChatGPT & Codex changelog](https://learn.chatgpt.com/docs/changelog)

### 官方设置页展示值不等于本机静态默认值

OpenAI 的设置参考页在 Appearance 示例中把 UI 字号与代码字号都展示为 `14px`；这只能
证明产品允许分别配置两类字号，以及文档页面当时展示的值，不能证明本机安装包的出厂
默认值。[OpenAI Docs：Settings reference](https://learn.chatgpt.com/docs/reference/settings)

本机构建的打包 JS 明确把 `sansFontSize` 默认设为 `14`、`codeFontSize` 默认设为 `12`，
并向 renderer 注入 `--vscode-editor-font-size: 12px`。因此本报告把两者严格分开：

- **官方设置参考页展示：UI `14px` / 代码 `14px`**（公开页面示例，不代表本机配置或出厂默认）；
- **26.825.51511 静态 schema 默认：UI `14px` / 代码 `12px`**（本报告的 A 级包内证据）。

不能把公开页面的 `14 / 14px` 写成应用出厂默认，也不能用 CSS 预加载阶段的 `13px`
fallback 覆盖运行时 JS 注入的代码默认 `12px`。由于自访问安全限制，本轮没有读取真实
Codex 窗口或本机当前 Appearance 配置，所有后续数值均按静态 schema 默认计算。

## 字体家族

| 用途 | 声明 | 来源 | 置信度 / 适用范围 |
| --- | --- | --- | --- |
| 普通 UI | `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif` | CSS `--font-sans-default`、`body { font-family: var(--vscode-font-family) }` | A；Electron 桌面界面。macOS 实际解析到哪一个系统字体需 computed style 确认 |
| 浏览器子界面 | `-apple-system-body, ui-sans-serif, -apple-system, system-ui, "Segoe UI", "Helvetica", ...` | CSS `[data-codex-window-type="browser"] --font-sans-default` | A；只适用于内置浏览器 surface，不应覆盖桌面 shell 结论 |
| 代码 / diff / `pre` | `ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace` | CSS `--font-mono-default`、桌面 `--vscode-editor-font-family`、`code, pre` | A；字体栈确定，macOS 最终命中的具体 face 为 C |
| 品牌字 | `"OpenAI Sans"`，回退到普通 UI 栈 | CSS `--font-openai-sans` 与两个 WOFF2 `@font-face` | A；仅显式带 `font-openai-sans` 的元素 |
| 公式 | KaTeX 自带 `Main / Math / SansSerif / Typewriter / Size*` 等字体 | 同一 CSS 中的 KaTeX `@font-face` | A；只适用于公式渲染 |

`OpenAI Sans` 包内只声明了 `400` 和 `500` 两个字体文件。打包主 JS 中可复核的显式用途
包括 Codex / ChatGPT 模式名称，以及 Activity 侧栏标题；Activity 标题请求
`17px / 24px / 600`。因为包内没有单独的 `600` face，是否由 Chromium 合成较粗字重
属于 C 级事项。

## 桌面字号、行高与字重

### 基础文字令牌

Electron surface 把 `text-xs` 与 `text-sm` 从通用值覆盖为 `12px` 和 `13px`；
`text-base` 与 `text-lg` 保持 `14px` 和 `16px`。下表中的“默认行高”是 utility 未另带
`leading-*` 时的计算结果。

| 角色 / utility | 字号 | 默认行高 | 常见用途 | 来源 | 置信度 / 适用范围 |
| --- | ---: | ---: | --- | --- | --- |
| `text-xs` | `12px` | `16px`（`1.3333`） | 时间、弱说明、badge | CSS token + Electron override | A/B；桌面 |
| `text-sm` | `13px` | `18.57px`（`1.4286`） | 列表项、按钮标签、辅助正文 | CSS token + Electron override | A/B；桌面；实际组件常另写 `leading-4/5` |
| `text-base` | `14px` | `21px`（`1.5`） | 默认 UI、菜单、输入 | CSS token；桌面 `--vscode-font-size` 指向它 | A/B；桌面 |
| `text-lg` | `16px` | `24.89px`（`1.5556`） | 较强标题 / 重点文字 | CSS token | A/B；桌面 |
| `heading-xs` | `12px` | `16.8px`（`1.4`） | 小节弱标题 | CSS component class | A；桌面 |
| `heading-sm` | `13px` | `18.2px`（`1.4`） | 小标题 | CSS component class | A；桌面 |
| `heading-base` | `20px` | `26.6px`（`1.33`） | 常规页面标题 | 运行时 JS 向 root 与 body 注入 `--text-heading-md:20px` | A/B；桌面默认 UI 14px；覆盖 CSS 预加载阶段的 `18px` |
| `heading-dialog` | `20px` | `28px` | 对话框标题 | CSS component class + 运行时 heading token | A/B；另有 `-0.36px` tracking |
| `heading-lg` | `24px` | `28.8px`（`1.2`） | 大标题 | CSS component class | A；桌面 |
| Activity 标题 | `17px` | `24px` | Activity 侧栏标题 | 主 JS literal：`font-openai-sans text-[17px] leading-6 font-semibold` | B；此构建的明确调用 |

显式行高 utility 仍大量存在：`leading-4 / 5 / 6` 分别是 `16 / 20 / 24px`。所以不要把
上表的 `18.57px` 当成每一个 13px 标签的最终行高；例如侧栏条目经常是
`text-sm leading-5`，最终为 `13 / 20px`。

### 对话、Markdown 与代码

| 内容 | 字号 | 行高 | 字体 / 字重 | 来源 | 置信度 / 适用范围 |
| --- | ---: | ---: | --- | --- | --- |
| 对话 / Markdown 正文 | `14px` | `22.75px`（`14 × 1.625`） | 系统 sans，通常 `400` | `--codex-chat-font-size → --vscode-font-size → text-base`；Markdown `leading-relaxed` | A/B；桌面默认样式 |
| Markdown small / 表格 / inline code | `12.25px` | 由具体 table / block 决定 | inline code 为系统 mono、`500` | `max(code-size 12px, 14px × .875)` | B；默认设置下；预加载 fallback 可短暂为 `13px` |
| Composer 多行正文 | `14px` | `18.9px`（`14 × 1.35`） | 系统 sans，`400` | Composer CSS | A/B；默认 multiline |
| Composer 单行正文 | `14px` | `20px` | 系统 sans，`400` | Composer CSS | A；single-line |
| Composer 代码块 | `12px` | `20px` | 系统 mono | Rich text CSS：`font-mono`、运行时代码设置、`spacing × 5` | A/B；默认设置下 |
| diff | `12px` | `21.6px`（`12 × 1.8`） | 系统 mono | `--diffs-font-*` + 运行时代码设置 | A/B；默认设置下 |
| terminal / xterm | `12px` | `14.4px`（`1.2`） | 系统 mono | appearance schema + xterm `lineHeight:1.2` | A/B；默认设置下 |

Markdown inline code 的默认圆角为 `6px`，内边距约为 `2.1px 4.2px`；这来自
`14px` chat 字号派生的 Markdown spacing，而不是 4px 通用间距的整数倍。

### 字重与字距

| 令牌 | 值 | 来源 | 置信度 / 适用范围 |
| --- | ---: | --- | --- |
| normal | `400` | `--font-weight-normal` | A；全 surface |
| medium | `500` | `--font-weight-medium`，Electron 明确覆盖为 `500` | A；桌面常用强调 |
| semibold | `600` | `--font-weight-semibold` | A；标题和强标签 |
| bold | `700` | `--font-weight-bold` | A；较少的强强调 |
| normal tracking | `0em` | `--tracking-normal` / `--text-tracking` | A；默认 |
| wide tracking | `0.025em` | `--tracking-wide` | A；常见于 uppercase label |
| 紧凑 14px 文本 | `-0.13px` | 主 JS 多处 `text-base leading-6 tracking-[-0.13px]` | B；局部调用，不是全局 token |

## 间距、宽度与行高几何

### 4px 基础网格

CSS 的全局 `--spacing` 是 `0.25rem`，在默认 16px 根字号下等于 `4px`。因此 utility
可直接换算：

| utility / 变量 | 像素值 | 来源 | 置信度 / 适用范围 |
| --- | ---: | --- | --- |
| `gap-1 / 2 / 3 / 4` | `4 / 8 / 12 / 16px` | `calc(var(--spacing) × n)` | A/B；默认根字号 |
| `p-1 / 2 / 3 / 4 / 5 / 6` | `4 / 8 / 12 / 16 / 20 / 24px` | 同上 | A/B；默认根字号 |
| row vertical padding | `5px` | Electron / browser body：`spacing × 1.25` | A/B；通用 row token |
| panel padding | `20px` | body `--padding-panel-base: spacing × 5` | A/B；桌面与 browser body |
| toolbar padding | `16px` | root `--padding-toolbar: spacing × 4` | A/B；默认桌面 |
| conversation item gap | `16px` | `--conversation-item-gap` | A；对话流 |
| grouped item gap | `4px` | `--conversation-grouped-item-gap` | A；同组消息 |
| thread content max width | `48rem`（默认 `768px`） | body token | A/B；桌面主 thread |
| Markdown wide block | `56rem`（默认 `896px`） | body token | A/B；宽表格等 |
| sidebar width | `clamp(240px, preferred 275px, min(520px, 100vw - 320px))` | `--spacing-token-sidebar` | A；响应式侧栏 |

打包主 JS 的 class literal 计数中，`gap-1 / 2 / 3 / 4` 分别出现
`190 / 292 / 116 / 52` 次，`gap-1.5`（`6px`）出现 `65` 次。它只能说明实现偏爱
`4–16px` 这段网格，不能当成实际页面
渲染频率，也不能证明每个 literal 在当前路由都可见。

### 高度与控件

| 角色 | 尺寸 | 来源 | 置信度 / 适用范围 |
| --- | ---: | --- | --- |
| 主 toolbar | `46px` | `--height-toolbar` | A；默认 shell |
| 紧凑 toolbar | `36px` | `--height-toolbar-sm` | A |
| pane toolbar | `40px` | `--height-toolbar-pane` | A |
| 通用 nav row | `31px` 计算值 | `14 × 1.5 + 5 × 2` | B；未被局部变量覆盖时 |
| 侧栏任务 row | `30px` | 主 JS 明确设置 `--height-token-nav-row:30px` | B；此构建侧栏实现 |
| Composer 主按钮 | `28px` | `--spacing-token-button-composer: spacing × 7` | A/B；桌面默认 |
| Composer 小按钮 | `28px` | 通用 token 为 `20px`，但 Electron 所在 body 规则覆盖为 `spacing × 7` | A/B；桌面最终声明值；不是通用预加载值 |
| 单行 Composer footer | 上下 `4px`，左右 `8px`，列 gap `5px` | Composer CSS | A；Electron 默认 |
| 多行 Composer footer | 左右 `8px`，下方 `8px`，列 gap `5px` | Composer CSS | A；默认 spacing variant |

## 图标尺寸与描边

Codex 同时使用 Lucide、定制 SVG / Lottie 和产品图标，不能假设所有图标都来自一个库。

| 语义 / class | 尺寸 | 来源 | 置信度 / 适用范围 |
| --- | ---: | --- | --- |
| `icon-3xs` | `10px` | CSS direct | A |
| `icon-xxs` | `12px` | CSS direct | A |
| `icon-2xs` | 默认 `14px` | CSS fallback | A；browser 可被 secondary token 覆盖成 16px |
| `icon-xs` | 默认 `16px` | CSS fallback | A；最常见的标准操作图标档 |
| `icon-sm` | `18px` | CSS direct | A |
| `icon-base` | `20px` | CSS direct | A；主导航 / 较强操作常用档 |
| `icon-md` | `24px` | CSS direct | A |
| `icon-lg` | `28px` | CSS direct | A |
| 侧栏条目图标 | glyph 通常 `16px`，外框 `24 × 24px` | CSS `.sidebar-item-icon` + 主 JS 中侧栏 `icon-xs` 调用 | A/B；当前桌面侧栏 |
| 侧栏图标按钮 | `24 × 24px`，内边距 `4px` | CSS `.sidebar-icon-button` | A/B；内部可用空间 `16 × 16px` |
| Lucide 默认 | `24 × 24px` viewBox / rendered size，`stroke-width:2`，round cap/join | `createLucideIcon-*.js` | A；调用方 class 可覆盖 rendered size |
| Projects 定制动效图标 | `20 × 20px`，主 stroke `1.33` | `sidebar-projects-icon-*.js` Lottie data | A；只代表该定制图标 |

主应用 chunk 的图标尺寸 literal 静态计数为：`16px` 281、`14px` 98、`18px` 89、
`20px` 27、`24px` 20、`12px` 19、`28px` 7、`10px` 1。它支持
“14 / 16 / 18px 是常用 glyph 档位”的判断，但只是编译产物文本出现次数，不是运行时
渲染频次，也不能说明所有路由同时可见。

内置 browser surface 另有语义图标令牌：leading `20px`、secondary `16px`、disclosure
`12px`、primary action `20px`。这是 browser 专用覆盖，不应直接套到 Electron 侧栏。

## 圆角与形状

### 基础圆角令牌

| token | 基础值 | `corner-shape: superellipse(1.5)` 受支持时的计算值 | 来源 | 置信度 / 适用范围 |
| --- | ---: | ---: | --- | --- |
| `2xs` | `2px` | `2.5px` | CSS base × scale | A/B；条件分支 |
| `xs` | `4px` | `5px` | 同上 | A/B |
| `sm` | `6px` | `7.5px` | 同上 | A/B |
| `md` | `8px` | `10px` | 同上 | A/B；md 及以上还应用 superellipse shape |
| `lg` | `10px` | `12.5px` | 同上 | A/B |
| `xl` | `12px` | `15px` | 同上 | A/B |
| `2xl` | `16px` | `20px` | 同上 | A/B |
| `3xl` | `20px` | `25px` | 同上 | A/B |
| `4xl` | `24px` | `30px` | 同上 | A/B |
| full | `9999px` | 不变 | CSS direct | A；胶囊 / 圆形 |

Electron 默认使用 scale `1` 的基础值。当 renderer 支持对应条件分支时，root 可将 radius
scale 设为 `1.25`，
并给 `rounded-md` 及以上应用 `superellipse(1.5)`。本报告没有读取运行中 renderer 的
computed style，所以本机当前真正走哪一支是 C 级实屏验证项。

Composer 的局部规则更具体：compact 使用 `radius-lg`，默认多行使用 `radius-3xl`，显式
single-line radius token 为 `22px`，而默认单行形态可以直接使用 `9999px` 胶囊。设计上
是按状态切换形状，不是所有 Composer 都固定为同一个圆角。

## 给 CodeTwo 的可执行参考（推断，不是复制规范）

如果目标是接近当前 Codex 桌面版的密度，最小可行的起点是：

1. 普通 UI 保持 macOS 系统 sans，主体 `14px`；不要把 OpenAI Sans 全局化。
2. 对话正文先试 `14 / 23px`，列表先试 `13 / 20px`，弱说明先试 `12 / 16px`。
3. 采用 `4px` 网格，默认组件间距集中在 `8 / 12 / 16px`，面板 padding `20px`。
4. 常规操作图标先用 `16px`，主导航或更强操作用 `20px`，少量强调用 `24px`；外框与
   glyph 尺寸分开。
5. 列表行先从 `30–32px`、工具栏 `40–46px` 做实屏比较，而不是只调文字大小。
6. 圆角按控件角色建立层级；如要复现 squircle，必须同时验证 radius 数值与
   `corner-shape` 支持，不能只把圆角整体加大 25%。

这些建议属于基于当前构建的工程归纳。CodeTwo 是否采用，需要另开实现 Artifact，并在
真实窗口的浅色、深色、窄宽度和中文内容下验证。

## 可复核命令

以下命令均为只读；提取目标应使用临时目录，不修改 App bundle：

```sh
/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' \
  /Applications/ChatGPT.app/Contents/Info.plist
/usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' \
  /Applications/ChatGPT.app/Contents/Info.plist

audit_dir=$(mktemp -d /tmp/codex-asar-audit.XXXXXX)
npx --yes @electron/asar@4.3.0 extract \
  /Applications/ChatGPT.app/Contents/Resources/app.asar "$audit_dir"

rg -n -- '--font-sans-default|--text-sm:|--spacing:|--radius-lg-base' \
  "$audit_dir/webview/assets/app-initial-NNCUNt29.css"
find "$audit_dir/webview" -type f -name '*.map'
shasum -a 256 /Applications/ChatGPT.app/Contents/Resources/app.asar
```

## 尚未验证

- 没有操作 Codex / ChatGPT 桌面 UI，没有用 DevTools 或 Browser 读取 computed style。
- Codex 的自访问安全限制使本轮无法用自动化工具读取运行中 Codex 窗口；没有确认本机
  当前 Appearance 配置。文中的 `14 / 14px` 仅是官方设置参考页的展示值。
- 没有确认 macOS 最终解析出的具体系统 sans / mono PostScript 字体名。
- 没有确认当前 Electron renderer 是否进入 `corner-shape: superellipse(1.5)` 分支。
- 没有把每个 class literal 映射到一个可见页面；动态 class 和条件路由可能改变实际使用。
- 没有用截图测量字形边界、baseline、图标光学尺寸和 macOS backing scale。

这些项应由真实窗口验证补齐；静态报告的价值是给实屏检查提供精确候选值和选择器，而不是
替代实屏验收。
