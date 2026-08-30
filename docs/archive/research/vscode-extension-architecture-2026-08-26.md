# VS Code 插件体系调研与 C2 边界建议（2026-08-26）

> 调研日期：2026-08-26（Asia/Singapore）
>
> C2 基线：`0c6b7c1b7f623f62ffe47b4d77762a4624e6c7fe`
>
> VS Code 源码基线：[`microsoft/vscode@3d079185299158cc8c7428ea1ea67dfeb0e978c6`](https://github.com/microsoft/vscode/commit/3d079185299158cc8c7428ea1ea67dfeb0e978c6)
>
> 范围：扩展宿主、清单与贡献点、激活、命令、Workspace Trust、远程拓扑、Gallery/Marketplace、兼容性、安装/更新/签名，以及这些设计如何映射到 C2。

## 证据口径

- **[上游事实]**：VS Code 官方文档直接说明的行为。
- **[源码事实]**：固定 commit 的 `microsoft/vscode` 源码直接显示的行为。
- **[仓库事实]**：当前 C2 工作树中的代码或规范。
- **[推断]**：根据上面事实得出的产品或架构判断，不冒充上游承诺。
- **[建议]**：面向 C2 的设计选择。

只使用 VS Code 官方文档和 `microsoft/vscode` 官方仓库作为上游证据。文中没有把下载量、评分、发布者徽章或“能安装”当作安全与质量证明。

## 结论先行

1. **VS Code 的关键不是“所有东西都是插件”，而是 Core 与扩展 API 之间有硬边界。** 官方源码组织明确把 `src/vs/` 称为 Core，把 `extensions/` 称为内置扩展；扩展通过 Extension API 运行在 Extension Host，而不是拿到 Core 的依赖注入容器：[Source Code Organization](https://github.com/microsoft/vscode/wiki/source-code-organization)、[稳定 API `vscode.d.ts`](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vscode-dts/vscode.d.ts)。
2. **C2 应保留 Rust Plugin Kernel 作为内部模块装配机制，但不要再把它等同于社区插件 API。** `codetwo_kernel::Plugin` 是 Core 内部模块接口；社区插件只能通过一个显式、版本化、最小化的 C2 Extension API 与宿主交互。当前“一个插件的 commands 就是 app 的全部 public API”以及把 realm 内全部命令发给第三方进程，是最需要先收紧的边界。
3. **清单贡献、激活条件、运行时实现必须拆开。** VS Code 可以在不执行扩展代码时读取和渲染贡献；命令被真正调用时才激活扩展，再由运行时注册 handler。C2 当前能静态读取 UI/LSP，但运行时命令直到 `initialize` 才出现，因而无法完整做安装前能力审查、懒激活或升级能力差异提示。
4. **“信任插件”与“信任工作区”是两件事。** VS Code 分开处理发布者/扩展信任与 Workspace Trust，并明确 Extension Host 不是 OS sandbox。C2 当前 `trusted` 只覆盖“是否允许运行这个 bundle”，还缺“是否允许这个插件对当前项目内容执行敏感行为”的独立工作区策略。
5. **`c2-plugins` 应是社区目录与供应链控制面，不是把所有插件源码收进一个 monorepo。** 它应收录身份、版本、兼容性、不可变来源、摘要/签名和撤回状态；插件源码继续归作者仓库。C2 客户端消费由 CI 生成并签名的索引，解析最高兼容版本，验证后原子安装为 disabled/untrusted。
6. **不要照搬 VSIX、Node Extension Host、共享扩展进程、任意 renderer/webview 或 `extensionKind`。** C2 的“一 bundle/realm 一进程”和宿主渲染安全 UI descriptor 更适合当前产品；远程执行位置应等真正有远程扩展宿主时再成为独立维度。

## 1. VS Code 实际上如何分 Core 与扩展

### 1.1 Core、扩展 API、扩展不是同一层

**[上游事实]** VS Code 官方源码组织把 `src/vs/` 定义为分层、模块化的 Core，把内置扩展放在 `extensions/`；扩展通过 Extension API 运行在 Extension Host：[官方源码组织](https://github.com/microsoft/vscode/wiki/source-code-organization)。Core 内部的 `base / platform / editor / workbench / code` 分层并不会自动成为扩展可访问 API。

**[源码事实]** 稳定公共 API 集中定义在 `src/vscode-dts/vscode.d.ts`。未稳定的 API 分散在 `vscode.proposed.*.d.ts`，官方说明 proposed API 会变化、只供开发/Insiders 使用、不能发布到 Marketplace：[Using Proposed API](https://code.visualstudio.com/api/advanced-topics/using-proposed-api)。清单 Schema 也把 `enabledApiProposals` 标为仅开发可用：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/services/extensions/common/extensionsRegistry.ts#L239-L251)。

**[推断]** VS Code 的可持续性来自“Core 可以重构，稳定 Extension API 尽量不破坏”，而不是来自 Core 内部所有 service/command 都可被扩展调用。

### 1.2 Extension Host 是故障/响应性边界，不是权限沙箱

**[上游事实]** VS Code 有三种宿主：本地 Node.js、本地/浏览器 WebWorker、远端 Node.js；扩展由宿主运行，声明激活事件后按需加载。官方称 Extension Host 用来避免扩展直接拖慢 UI、修改 UI 或阻塞启动：[Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)。

**[源码事实]** 三种实际 host kind 是 `LocalProcess / LocalWebWorker / Remote`：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/services/extensions/common/extensionHostKind.ts#L9-L13)。桌面本地宿主由 Electron utility process 启动，入口是 `vs/workbench/api/node/extensionHostProcess`：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensions/electron-main/extensionHostStarter.ts#L108-L128)。

**[上游事实]** 扩展宿主与 VS Code 自身拥有相同 OS 权限；扩展可以读写文件、发网络请求、起进程和改设置。Workspace Trust 也不能阻止一个恶意扩展故意忽略 Restricted Mode：[Extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)、[Workspace Trust](https://code.visualstudio.com/docs/editing/workspaces/workspace-trust)。

**[推断]** VS Code 的进程边界不是逐插件安全隔离。C2 当前第三方 runtime 每个 bundle/realm 独立进程，故障与 teardown 粒度更清楚；应保留它，同时继续诚实标注“有用户 OS 权限，不是 sandbox”。

## 2. 清单、贡献、激活与命令是四个不同概念

### 2.1 清单是可静态索引的产品契约

**[上游事实]** 每个 VS Code 扩展根目录都有 `package.json`。其中 `name / publisher / version / engines.vscode` 负责身份和兼容性；`main / browser` 是执行入口；`contributes` 是声明式贡献；`activationEvents` 决定何时激活；`extensionKind` 与 `capabilities` 处理运行位置和受限环境：[Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)。

**[源码事实]** Core 注册每个 extension point 时同时注册 JSON Schema、可选的隐式激活事件生成器和处理 handler：[ExtensionsRegistry](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/services/extensions/common/extensionsRegistry.ts#L644-L675)。因此 Core 在运行扩展代码之前就能验证并消费主题、语言、菜单、命令等贡献。

### 2.2 贡献声明不等于运行时 handler

以 commands 为例：

1. `contributes.commands` 声明 ID、标题、图标和 enablement，Core 把它放进菜单/命令目录，并生成 `onCommand:<id>` 激活事件：[commands extension point 源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/services/actions/common/menusExtensionPoint.ts#L897-L979)。
2. 用户第一次调用命令时，宿主按激活事件加载扩展。VS Code 1.74 起，已贡献的 commands/views/languages 等无需作者重复写对应激活事件：[Activation Events](https://code.visualstudio.com/api/references/activation-events)。隐式事件由 contribution generator 统一汇总：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/implicitActivationEvents.ts#L49-L84)。
3. 扩展的 `activate()` 调用 `commands.registerCommand` 注册真正 handler。Extension Host 通过 RPC 把全局命令注册到主线程，dispose 时注销：[Extension Host 命令源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/api/common/extHostCommands.ts#L1458-L1495)、[Main Thread 命令源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/api/browser/mainThreadCommands.ts#L534-L595)。

**[上游事实]** 官方命令指南也明确区分 `contributes.commands`（可发现、可展示）与 `registerCommand`（绑定 handler）：[Commands](https://code.visualstudio.com/api/extension-guides/command)。稳定 API 还把 `_` 开头的命令视为 internal，`getCommands(true)` 可以过滤它们：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vscode-dts/vscode.d.ts#L10976-L11032)。

**[建议]** C2 不必复制 VS Code 全部 activation DSL，但要复制这条分层：

```text
静态 manifest contribution
        │  安装/搜索时可验证、可展示、可审计
        ▼
eligible = installed + enabled + bundle-trusted + workspace-policy-allowed
        │  用户调用声明命令 / 打开匹配语言 / 明确后台触发
        ▼
启动 runtime -> initialize -> handler 必须与 manifest 声明吻合
```

第一版只需要由贡献自动推导激活：`onCommand`、`onLanguage`、明确的 `onProjectOpen`。不要默认提供 `*`/startup 激活；VS Code 自己也建议仅在其他事件都不适用时才用 `*`：[Activation Events](https://code.visualstudio.com/api/references/activation-events#Start-up)。

## 3. Trust、scope 与执行位置不能混成一个字段

### 3.1 VS Code 有两套不同的信任

**[上游事实]** 从 1.97 起，首次安装第三方发布者扩展时会提示是否信任该发布者；命令行安装不会自动信任发布者：[Extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)。这是“是否愿意运行这个发布者的代码”。

**[上游事实]** Workspace Trust 是“是否信任当前工作区内容不会诱导自动执行代码”。扩展可声明：

- `supported: true`：Restricted Mode 仍完整运行；
- `supported: false`：未信任工作区时禁用；
- `supported: "limited"`：只开安全子集，并可用 `restrictedConfigurations` 屏蔽工作区注入的危险配置。

来源：[Workspace Trust Extension Guide](https://code.visualstudio.com/api/extension-guides/workspace-trust)。如果没有声明，带执行入口的扩展默认按不支持处理；源码最终回退为 `false`：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/services/extensions/common/extensionManifestPropertiesService.ts#L186-L219)。

**[建议]** C2 将当前一个 `trusted` 拆成四个可解释状态：

| 状态 | 回答的问题 | 建议归属 |
| --- | --- | --- |
| Catalog integrity | 索引是否由 C2 信任根签发、是否过期/撤回 | Core registry client |
| Publisher/artifact identity | 下载内容是否由预期发布者/目录签发且摘要匹配 | Core installer/verifier |
| Bundle run consent | 用户是否允许这个 bundle 的进程/LSP/MCP 运行 | 用户级 policy；现有 `trusted` 的语义 |
| Workspace execution consent | 这个 bundle 是否可对当前项目执行、读取危险配置或启动项目二进制 | 项目级 `full / limited / denied` policy |

`enabled` 仍只是用户想不想用；`scopeSupport` 仍只是该 runtime 能否拥有独立 project instance。四者都不是 OS sandbox。

### 3.2 `extensionKind` 不是 user/project scope

**[上游事实]** VS Code 会结合可用 host、扩展的 Node/Web 能力、安装在本地还是远端以及 `extensionKind` 偏好，决定在 local/web/remote host 中运行。`ui` 偏向靠近 UI，`workspace` 偏向靠近工作区：[Extension Host](https://code.visualstudio.com/api/advanced-topics/extension-host)、[Remote Extensions](https://code.visualstudio.com/api/advanced-topics/remote-extensions)。源码选择器也把本地/远端是否安装作为独立输入：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/workbench/services/extensions/common/extensionHostKind.ts#L43-L87)。

**[建议]** 不要把 VS Code 的 `extensionKind` 映射到 C2 的 `scopeSupport`：

- `scopeSupport`：配置/数据/命令 realm 的隔离能力；
- execution placement：进程物理跑在本机还是远端 workspace host；
- runtime kind：native process、未来的 worker，还是 data-only；
- target platform：包内是否有特定 OS/arch 二进制。

当前 C2 没有真正的远端扩展宿主，因此不要先加一个看似完整但不能兑现的 `extensionKind`。将来实现远端 host 时再新增独立 placement 字段和端到端测试。

## 4. Marketplace 不是一个插件链接列表

### 4.1 VS Code Gallery 保存和参与决策的元数据

**[源码事实]** `IGalleryExtension` 不只含名称和下载地址，还含稳定 identifier/UUID、publisher 与 verified domain、版本、安装量/评分、分类和 tag、发布日期、pre-release、是否签名、全部 target platform，以及 manifest/readme/license/repository/download/signature 等资产。版本 properties 还含依赖、engine、API proposals、target platform、是否执行代码：[Gallery 类型](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/extensionManagement.ts#L166-L251)。

**[源码事实]** Gallery client 选择版本时会同时检查 release/pre-release、target platform、组织 allowlist 和 `engines.vscode`，不是直接拿“最新版本”：[兼容版本解析](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/extensionGalleryService.ts#L951-L1062)。Manifest 规定 Gallery 还可公布 query、filter/sort、签名覆盖和 public/private 扩展能力：[Gallery Manifest](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/extensionGalleryManifest.ts#L9-L64)。

**[上游事实]** 发布使用 `vsce` 生成/上传 VSIX；Marketplace 的认证、托管和管理由 Azure DevOps 提供，并支持 publisher、pre-release 与 platform-specific 包：[Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)。因此“Marketplace”至少包含索引、不可变版本资产、身份、兼容解析和管理控制面。

### 4.2 版本与兼容性

**[上游事实]** 清单的 `version` 是扩展自身 SemVer，`engines.vscode` 是宿主兼容范围且不可为 `*`：[Extension Manifest](https://code.visualstudio.com/api/references/extension-manifest)。发布还允许每个平台独立 VSIX。VS Code 安装具体版本或自动更新时，会寻找当前宿主/平台可用的版本，而非假设 latest 一定可运行：[Extension Marketplace](https://code.visualstudio.com/docs/configure/extensions/extension-marketplace)。

**[源码事实]** 源码对版本、engine、目标平台分别建模；Gallery 对缺失或不匹配 engine fail closed：[清单校验](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensions/common/extensionValidator.ts#L242-L374)、[目标平台与 Gallery metadata](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/extensionManagement.ts#L42-L175)。

**[建议]** C2 保留现有三个版本轴，并新增一个宿主兼容轴：

| 版本轴 | 用途 |
| --- | --- |
| bundle `version` | 插件自身版本与升级顺序 |
| `extensions.dev.codetwo.standardVersion` | 静态 manifest/贡献 Schema 版本 |
| runtime `protocol` | 进程 wire protocol；major 协商 |
| 新增 `engines.codetwo` | 可安装/可更新的 C2 宿主版本范围 |

只有前三个不足以回答“某个 1.0 manifest 是否依赖 C2 1.8 才提供的稳定能力”。`initialize` 的 capability negotiation 继续作为运行时真相，但安装器应先用 `engines.codetwo + targetPlatforms + channel + yanked` 选择最高兼容版本。

### 4.3 签名、撤回与企业策略

**[上游事实]** Marketplace 对每次发布/更新做恶意软件、动态行为、secret 等检查；Marketplace 对发布包签名，VS Code 安装时验证来源与完整性。恶意扩展可进入 block list 并被自动卸载：[Extension runtime security](https://code.visualstudio.com/docs/configure/extensions/extension-runtime-security)。

**[源码事实]** Gallery metadata 包含 signature asset；安装器下载 VSIX 后验证签名，built product 遇到未执行、无效、不受信、被撤销或内容篡改等状态会删除下载并失败：[Gallery signature asset](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/extensionGalleryService.ts#L516-L574)、[签名验证实现](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/node/extensionSignatureVerificationService.ts#L20-L135)、[安装 fail closed](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/node/extensionManagementService.ts#L299-L384)。

**[源码事实]** Gallery 还有独立 control manifest，包含 malicious、deprecated、搜索修正和强制更新映射：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/extensionGalleryService.ts#L1916-L1978)。组织可按 publisher、extension、稳定版、具体版本和平台配置 allowlist：[源码](https://github.com/microsoft/vscode/blob/3d079185299158cc8c7428ea1ea67dfeb0e978c6/src/vs/platform/extensionManagement/common/extensionManagement.ts#L716-L807)。

**[建议]** C2 第一版无需复制评分、Q&A 和大规模搜索服务，但不能跳过：不可变版本、摘要/签名、兼容解析、撤回状态、缓存的 last-known-good 索引、安装前/升级前验证。

## 5. 当前 C2：正确骨架与仍然混在一起的边界

### 5.1 已经正确的部分

**[仓库事实]** 当前 [C2 Plugin Standard](../../reference/plugin-standard.md) 已把 Bundle、Contribution、Runtime module、Host adapter、Policy 分成五个概念；安装不执行代码，runtime/LSP 需要 enabled + trusted；项目 runtime 有独立 graph/process/command realm/data dir；第三方 UI 只能提交宿主渲染 descriptor。这些都应保留。

**[仓库事实]** 第三方 process bundle 会转换成同一 loader 中的 `bundle:<id>` factory，并按 bundle/realm 单独起进程：[bundle runtime](../../../crates/plugins/src/app/bundle_runtime.rs)。当前 marketplace parser 已支持 root `marketplace.json`、逐条错误隔离、local/GitHub/Git/npm/archive source shape，以及 Git SHA/archive SHA-256 字段：[marketplace parser](../../../crates/plugins/src/marketplace.rs)。`c2-plugins` 应成为这套格式的 canonical catalog，而不是新造第二套插件系统。

### 5.2 P0 边界缺口

#### A. 内部模块机制仍被当成公共插件模型

**[仓库事实]** 当前 Core 文档说“每个 subsystem 都是 Plugin”，并写明“一个插件的 commands 就是 app 的 public API”：[CoreApp module](../../../crates/plugins/src/app/mod.rs)。`BUILTIN` 目录又把 paths/store/bus/providers/engine/plugin-hub 等基础设施与 Git、voice、market、skills 等可选能力一起注册和展示：[built-in registry](../../../crates/plugins/src/app/plugins/mod.rs)。

**[推断]** 内部统一生命周期很有价值，但它不应决定外部 API 和用户词汇。否则“关闭一个插件”可能意味着关闭数据库/政策恢复面，“开发插件”又可能被理解成实现 Rust trait、写 JSON-RPC 进程或只放一个 Skill。

#### B. 第三方 runtime 能看到并调用 realm 内全部 Core 命令

**[仓库事实]** `initialize.host.commands` 当前由 `ctx.runtime().commands()` 全量生成；协议注释明确写着插件可以回调任意一个命令。`command/call` 直接进入同一 realm 的普通 command path：[protocol host surface](../../../crates/plugins/src/app/protocol/mod.rs)、[wire contract](../../../crates/plugins/src/app/protocol/wire.rs)、[request dispatch](../../../crates/plugins/src/app/protocol/peer.rs)。

**[推断]** realm 隔离阻止跨项目 fallback，但没有形成 Core/private 与 Extension/public 的边界。任何新增内部 command 都会无意扩大第三方 API 与权限面，也让 Core 难以重构。

#### C. Runtime commands 不是静态贡献

**[仓库事实]** C2 `ui` descriptor 在 manifest 中静态存在，但 runtime commands 要等 `initialize` 返回才注册；manifest 没有完整的 runtime command declaration：[Plugin Standard](../../reference/plugin-standard.md)、[Plugin Protocol](../../reference/plugin-protocol.md)。

**[推断]** 安装页无法在不运行插件时完整显示“会注册哪些命令/输入 schema”，UI descriptor 只能在执行时二次核对，宿主也无法依据 command 做真正懒激活。

#### D. Marketplace 是单版本目录，不是版本解析与供应链

**[仓库事实]** 当前 `MarketplacePlugin` 每项只有一个 `version + source`；没有 publisher identity、`engines.codetwo`、target platform、channel、releasedAt、artifact signature、yank/deprecation/advisory 或多版本解析。GitHub `reference` 和 `sha` 都可选；archive `sha256` 也可选：[marketplace parser](../../../crates/plugins/src/marketplace.rs)。

**[推断]** 这足够做本地目录/预览，不足以支撑默认社区更新渠道。

## 6. 推荐的 C2 分层和命名

### 6.1 四层模型

| 层 | 定义 | 能否由用户安装/更新 | 能否依赖 Core 私有 service |
| --- | --- | --- | --- |
| **Bootstrap Core** | loader、policy/LKG/safe mode、Extension API gateway、安装/验证、权限与 secret broker、持久化迁移、通用 command/event/contribution registry | 否 | 是；不可被普通插件关闭 |
| **Core module** | 用 `codetwo_kernel::Plugin` 组织的编译期内部模块；只是 Core 实现细节 | 否 | 是；不自动成为公共 API |
| **Built-in extension** | C2 随产品发布、但只使用稳定 C2 Extension API 的可选 bundle | 是或随版本管理 | 否 |
| **Community extension** | 从 `c2-plugins` 或用户源安装的第三方 bundle，进程隔离运行 | 是 | 否 |

Host adapter 独立于上表：Electrobun window/dialog/update、原生 keychain/voice/通知、TUI/server transport 由 Core 通过稳定 host capability 接口提供，不让扩展直接拿 shell 私有对象。

### 6.2 判断一个功能属于 Core 还是扩展

以下任一为真，应属于 Bootstrap Core/Core module，而不是社区插件：

- 它决定包是否可信、命令是否有权限、secret 是否可见；
- 它必须在插件失效后仍能恢复 safe mode、数据或插件管理；
- 它定义持久化 schema、公开 wire/API、project identity/path authorization；
- 它监督插件进程、分配 data dir、渲染通用 slot 或原子安装/回滚；
- 只能依赖未公开的 Rust service 才能实现。

只有在“关闭它不破坏产品/安全不变量，并且它只使用稳定公开 Extension API”时，才应成为 built-in/community extension。内部测试仍可用 loader 把 Core modules 拆开验证；“内部可卸载”不等于“用户可管理的插件”。

### 6.3 新的公共 Extension API gateway

**[建议]** 在现有 command seam 上加元数据和过滤，不另建平行调用链：

```text
Core/internal command registry
       │ metadata: visibility, since, args/result schema, permission class
       ▼
Extension API gateway
       │ only visibility=extension_public + realm/trust/workspace policy allowed
       ▼
process plugin initialize / command.call
```

最低要求：

- command/event 显式标为 `internal` 或 `extension_public`，默认 internal；
- public command 有稳定 ID、`since`、args/result JSON Schema、权限类别和 project-scope 规则；
- 第三方 `host.commands` 只收到 public 子集，`command/call` 再次校验，不能只靠初始化列表；
- 外部 manifest 的 `inject/optionalInject` 不再接 Core 私有 service name；改为稳定的 public capability ID，或只保留宿主 feature detection；
- proposed capability 只能在开发者模式、指定插件 ID 下启用，不能进入 `c2-plugins` stable channel；
- 内部 Core modules 可继续用 typed service injection，不受公共 API 限制。

### 6.4 静态 commands 与懒激活

在 `extensions.dev.codetwo` 中新增静态 `commands` contribution：

```json
{
  "commands": [{
    "id": "review.run",
    "title": "Review workspace",
    "description": "Review the current workspace.",
    "argsSchema": { "type": "object", "additionalProperties": false }
  }]
}
```

规则：

- UI contribution 只能引用同 bundle 的静态 command；
- runtime `initialize` 只能实现已声明 command，ID/schema 不匹配则 fail closed；
- enabled + trusted 表示 eligible，不等于进程常驻；第一次 command/onLanguage/明确后台事件再启动；
- unload 时 handler、event、task、child process 一起撤销；空闲回收不能打断 active lease；
- 确实需要常驻的 provider 可使用一个少量、封闭、可审计的 activation event 列表。

## 7. `c2-plugins` 仓库建议

### 7.1 仓库职责

`c2-plugins` 是 C2 官方维护的**社区目录、版本索引和安全控制面**：

- 收录社区插件元数据和不可变 release；
- PR review + CI 做静态验证，不运行第三方 install/build scripts；
- 生成机器索引和 control feed；
- 发布签名索引/控制清单与 canonical archives；
- 记录 deprecated/yanked/malicious/replacedBy/advisory；
- 不接管作者源码仓库，不把“被收录”写成官方质量背书。

### 7.2 建议目录

```text
c2-plugins/
├── marketplace.json             # CI 生成；客户端默认入口
├── control.json                 # CI 生成；撤回、替代、安全通告
├── plugins/
│   └── <publisher>/<name>/
│       └── entry.json           # 人工评审的源数据；含多版本
├── schemas/
│   ├── marketplace.schema.json
│   ├── entry.schema.json
│   └── control.schema.json
├── advisories/
│   └── <publisher>.<name>-<id>.md
└── scripts/                     # 只做闭合 schema/生成/校验
```

`marketplace.json` 应由 `entry.json` 生成，避免多人直接改一个大数组。插件 ID 使用稳定的 `<publisher>.<name>`；display name 不是身份。publisher 至少绑定 GitHub org/user，未来可增加签名 key 与 key rotation record。

### 7.3 每个版本必须具备的字段

```json
{
  "id": "acme.review",
  "displayName": "Review",
  "description": "Review the current workspace.",
  "publisher": { "id": "acme", "repositoryOwner": "acme" },
  "repository": "https://github.com/acme/c2-review",
  "license": "Apache-2.0",
  "categories": ["developer-tools"],
  "versions": [{
    "version": "1.2.3",
    "channel": "stable",
    "releasedAt": "2026-08-26T00:00:00Z",
    "engines": { "codetwo": ">=1.4.0 <2.0.0" },
    "targetPlatforms": ["universal"],
    "source": {
      "kind": "github",
      "repository": "acme/c2-review",
      "commit": "<full immutable commit>",
      "path": "."
    },
    "artifact": {
      "url": "<immutable canonical archive>",
      "sha256": "<64 hex>",
      "signature": "<C2 registry signature asset>"
    }
  }],
  "status": "active"
}
```

字段名是设计建议，不是已实现 Schema。关键不变量是：版本不可变、source 不允许浮动 branch/tag、bundle manifest identity/version 必须匹配、archive 摘要必填、索引签名与 artifact 摘要都验证。

### 7.4 PR/CI 验证

每个收录/版本 PR 至少验证：

1. closed JSON Schema、唯一 `publisher.name + version + target`；
2. source 是完整 commit，目标 path 不逃逸；
3. 从 commit 读取 bundle，不运行 repository scripts；
4. 用 C2 正式 validator 检查 `plugin.json`、贡献、路径、大小、symlink 和 executable 限制；
5. catalog ID/version 与 bundle manifest 一致；
6. `engines.codetwo`、channel、target platform 可解析；
7. repository、license、support/security contact 存在；
8. secret scan、依赖/恶意软件扫描结果作为发布 gate；
9. 生成 canonical archive、SHA-256 和签名；
10. 重建索引/control 后结果可重复，签名发布原子化。

### 7.5 客户端安装与更新

```text
fetch signed index -> verify + freshness -> cache LKG
  -> resolve stable/pre-release + engines + platform + policy
  -> download immutable archive
  -> verify registry signature + SHA-256
  -> validate manifest and catalog identity again
  -> show contribution/capability diff
  -> atomic install as disabled + untrusted
  -> explicit enable / bundle trust / workspace policy
```

更新必须保留前一版本和配置以便失败回滚。签名 key 改变、publisher identity 改变或新增 executable contribution（runtime/LSP/MCP/hook）时，不应静默继承原 trust。普通兼容 patch 是否自动更新由用户/组织 policy 决定；pre-release 与 stable 使用明确 channel，不依赖“哪个 SemVer 数字更大”的偶然排序。

Control feed 对 confirmed malicious 版本应至少让 C2 fail closed：停止/隔离 runtime、阻止重启/更新到该版本并展示 advisory；删除持久数据仍由用户决定。索引拉取失败时继续使用未过期 LKG，而不是把空目录当成功。

## 8. 哪些 VS Code 设计不应照搬

| VS Code 机制 | C2 选择 |
| --- | --- |
| VSIX + Node `vscode` API 兼容 | 不做；继续 Agent Plugins bundle + C2 manifest/protocol |
| 多个扩展共享一个 Node Extension Host | 不做；保留每 bundle/realm 独立进程 |
| 任意 webview/renderer UI | 不做 1.0 兼容层；继续 host-rendered descriptor |
| `extensionKind` local/ui/workspace/web | 暂不做；不能冒充尚不存在的远端扩展宿主 |
| `*` startup activation | 不作为默认或常规入口；使用贡献推导的懒激活 |
| 安装量、评分、verified domain | 只做发现/身份辅助信号，不做安全或质量证明 |
| Marketplace 自动更新语义 | 不直接复制；C2 先做签名、兼容解析、LKG 和能力 diff |
| Core 内部 command/service 全部开放 | 不做；只通过版本化 Extension API gateway 暴露显式 public 子集 |

## 9. 建议实施顺序与验收

### P0 — 先固定边界

- 规范和 UI 统一术语：Core module / built-in extension / community extension / contribution / runtime；
- Bootstrap Core 不可由普通 policy 关闭；safe mode 与插件管理始终可用；
- command/event 增加 `internal` 与 `extension_public`，第三方只见 public；
- 外部 runtime 不再依赖 Core 私有 service names。

**验收**：新加一个未标 public 的 Core command，第三方 `host.commands` 看不到且 `command/call` 被拒绝；禁用任意扩展后仍可进入插件管理和 reset。

### P1 — 静态贡献与兼容性

- manifest 增加 static commands、`engines.codetwo`、target/channel；
- runtime handler 必须与静态声明吻合；
- enabled/trusted 改为 eligible，按 command/language 触发懒启动。

**验收**：不启动进程即可渲染完整权限/命令清单；不兼容版本不可安装；未声明 handler fail closed；未使用插件不常驻。

### P2 — 建 `c2-plugins`

- 建独立仓库与 PR 模板、schemas、entry 目录、生成器；
- 先收录少量官方/示例插件，生成 read-only signed index；
- CodeTwo 默认只读浏览，安装仍走现有 Plugin Hub 与同一 validator。

**验收**：一条坏 entry 不隐藏其他条目；索引不可重复生成、签名无效、浮动 ref、manifest/version 不匹配都让 CI 或客户端 fail closed。

### P3 — 安装、更新与控制面

- canonical archive、artifact/index 签名、LKG cache；
- compatible version resolver、stable/pre-release、update/rollback；
- control feed、deprecated/yanked/malicious 与组织 allowlist。

**验收**：篡改 archive、旧索引重放、被撤回版本、平台/engine 不匹配均不能运行；更新中断仍能启动旧版；capability/signing identity 扩张会重新确认。

### P4 — 只有真实需求后再做远端宿主

先证明远端 process lifecycle、文件/secret 边界、网络断线、版本匹配和项目 realm，再添加 execution placement。不要用现有 mobile remote control 或 project scope 冒充 VS Code Remote Extension Host。

## 最终判断

当前 C2 不需要重写 Plugin Kernel，也不需要造一个 VS Code 兼容层。正确方向是给现有设计加一条更深的边界：

```text
Rust Plugin Kernel = Core 内部模块机制
               │
               ▼
版本化 C2 Extension API + Contribution Registry = 唯一公共扩展面
               │
               ▼
Built-in / Community Bundles = 同一公共契约、不同发行来源
               │
               ▼
c2-plugins = 签名目录、版本与安全控制面，不是执行宿主
```

先完成这条边界，再扩大社区目录。否则 `c2-plugins` 只会更快地放大当前“所有命令都是公共 API、所有信任都是一个布尔值、latest 就是可安装版本”的问题。
