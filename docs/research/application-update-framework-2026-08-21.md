# CodeTwo 应用更新框架调研（2026-08-21）

> 调研日期：2026-08-21（Asia/Singapore）
>
> 当前工作树：`f2a11aa848b8c1e66866380b39d3789dc7c1c8c7`
>
> 重点范围：macOS、Mac App Store 之外的直接分发；Windows / Linux 只评估未来复用性
>
> 上游源码基线：Electrobun `v1.18.1`，tag commit `4eba723c85b97559e1d9e13439d9a92ede0832e8`

## 证据口径

- **[仓库事实]**：当前工作树、GitHub 仓库或 CI 的直接观察。
- **[上游事实]**：Apple、框架官方文档或框架官方仓库明确说明的能力。
- **[源码事实]**：从固定版本官方源码能直接读出的行为。
- **[推断]**：基于事实做出的工程或风险判断，不冒充框架承诺。
- **[未确认]**：需要真实签名产物或端到端实验才能回答。

只使用一手来源；框架能力以官方文档和固定版本源码为准，不以搜索摘要、博客或营销页作为就绪证明。

## 结论先行

1. **推荐 macOS 生产路径采用 Sparkle 2.9.x，当前评估版本为 [2.9.6](https://github.com/sparkle-project/Sparkle/releases/tag/2.9.6)。** 通过一个窄的 Swift / Objective-C 原生 helper 把 `SPUUpdater` 接到 Electrobun 的 Bun 主进程；首版使用 Sparkle 标准 UI，稳定后再把状态投影到 React 设置页。
2. **现在不要直接打开 Electrobun 1.18.1 内置自动更新。** 它的 bundle `hash` 是非密码学 `wyhash`，远端 `update.json` 没有签名；完整包下载后只要目标 tar 存在就会被标为 ready，macOS 应用替换路径没有显式 Ed25519、Developer ID / Team ID 或 `codesign` 验证。这是更新来源认证缺口，不是增加一个 SHA-256 sidecar 就能补齐的问题。
3. **任何自动更新之前，先完成 Developer ID 签名、Hardened Runtime、公证和 stapling。** 当前 C2 的 macOS 工作流只会产出 ad-hoc 签名、未公证的 Apple Silicon DMG；它适合内部测试，不是生产自动更新根基。Apple 要求直接分发的 Mac 软件使用 Developer ID，公证准备还包括 Hardened Runtime、安全时间戳和所有可执行代码的有效签名：[Developer ID](https://developer.apple.com/help/account/certificates/create-developer-id-certificates)、[Notarization requirements](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)。
4. **更新托管应与当前私有源码仓库解耦。** 采用公开只读 HTTPS 对象存储 / CDN，资产按版本不可变，最后原子发布签名 appcast。GitHub 官方说明只有公共资源可免认证下载 release asset；当前私有仓库不应把 GitHub token 嵌入客户端：[GitHub release assets authentication](https://docs.github.com/en/rest/releases/assets#get-a-release-asset)。
5. **回滚采用“向前回滚”**：发布一个更高 `CFBundleVersion`、内容回到上一个稳定实现的新版本，而不是把 feed 指向旧版本。Sparkle 2 已移除自动降级支持：[Sparkle 2 upgrade notes](https://sparkle-project.org/documentation/upgrading/)。应用数据迁移必须另行提供向后兼容或可恢复备份；任何更新框架都不能替 C2 回滚数据库语义。

如果 Sparkle helper 的签名、装载或替换实验失败，安全回退不是启用现状 Electrobun updater，而是继续提供经过 Developer ID 签名和公证的手动 DMG，同时选择：向 Electrobun 上游补齐非对称签名与事务安装，或维护一个经过安全评审的窄 fork。

## 当前应用与发布链路

| 项目 | 当前证据 | 对更新方案的含义 |
|---|---|---|
| 桌面技术栈 | **[仓库事实]** [`apps/desktop/package.json`](../../apps/desktop/package.json) 固定 `electrobun: 1.18.1`，renderer 是 React 18 + Vite；[`electrobun.config.ts`](../../apps/desktop/electrobun.config.ts) 的主入口为 `src/electrobun/index.ts`。README 也明确桌面端现为 Electrobun，实验路径使用进程内 Bun host：[README](../../README.md)。 | 当前壳不是 Tauri 或 Electron；二者的 updater 都不是可直接安装的独立 npm 工具。 |
| Rust 边界 | **[仓库事实]** Rust workspace 和 `apps/desktop/src-host` 仍存在，但桌面主宿主已经是 Bun；[`src-host/Cargo.toml`](../../apps/desktop/src-host/Cargo.toml) 将 Rust 定义为 native sidecar。 | 可以写窄原生桥，但不应为了 updater 恢复整套 Tauri shell。 |
| 版本 | **[仓库事实]** `RELEASE_VERSION` 写入 Electrobun app version；post-build 只显式改 `CFBundleShortVersionString`。 | **[未确认]** 最终产物中的 `CFBundleVersion` 是否同样单调递增。Sparkle 用它做更新比较，实施前必须验证：[Sparkle setup](https://sparkle-project.org/documentation/#5-publish-your-appcast)。 |
| 更新配置 | **[仓库事实]** 当前 `release` 没有 `baseUrl`，且 `generatePatch: false`；代码中没有调用 updater 的产品路径。 | 当前应用不会检查更新，也不生成可用的差分发布链。 |
| Nightly | **[仓库事实]** [`nightly-macos.yml`](../../.github/workflows/nightly-macos.yml) 只构建 Apple Silicon DMG，设置 `ELECTROBUN_DEVELOPER_ID="-"`，上传 14 天 Actions artifact。 | Nightly 是内部试包，不应成为稳定更新 channel。 |
| Versioned release | **[仓库事实]** [`release-macos.yml`](../../.github/workflows/release-macos.yml) 校验 SemVer 和不可重复 tag，构建 ad-hoc DMG，仅上传 DMG + SHA-256，并在 release notes 明说未 Apple-notarized。 | 已有“版本不可覆写”的好基础，但缺生产签名、公证、update archive、feed、差分和更新 E2E。 |
| GitHub 当前状态 | **[仓库事实]** 2026-08-21 通过 GitHub API / `gh` 实查：仓库为 private，`gh release list` 为空，`Release macOS` workflow 无运行记录。 | 不能把“工作流文件存在”写成“发布链已经跑通”；私有 release asset 也不能被匿名客户端直接消费。 |
| 架构覆盖 | **[仓库事实]** 两条 macOS workflow 都强制 runner 与 launcher 为 `arm64`。 | 第一阶段只承诺 Apple Silicon；Intel / Universal 必须作为单独产物与升级矩阵验证。 |

### 当前 Electrobun 1.18.1 updater 的安全边界

下面的区分很重要：**内容标识 / 完整性不是发布者身份认证**。

- **[源码事实]** CLI 对最终 bundle 的内存 tar 调用 `Bun.hash.wyhash(..., 43770n)`，并把结果写入 `version.json`。源码自己也明确称其为 updater 检测变化所用的 content hash：[CLI 3610–3644](https://github.com/blackboardsh/electrobun/blob/4eba723c85b97559e1d9e13439d9a92ede0832e8/package/src/cli/index.ts#L3610-L3644)。`wyhash` 没有私钥，不能证明“这是 CodeTwo 发布的版本”。
- **[源码事实]** `update.json` 只有 `version / hash / platform / arch`，没有签名或 key id：[CLI 4200–4217](https://github.com/blackboardsh/electrobun/blob/4eba723c85b97559e1d9e13439d9a92ede0832e8/package/src/cli/index.ts#L4200-L4217)。
- **[源码事实]** `checkForUpdate()` 直接解析远端 JSON，并以“远端 hash 与本地 hash 不同”判断有更新；没有单调版本比较或签名校验：[Updater 179–278](https://github.com/blackboardsh/electrobun/blob/4eba723c85b97559e1d9e13439d9a92ede0832e8/package/src/bun/core/Updater.ts#L179-L278)。
- **[源码事实]** 完整 `.tar.zst` 路径在解压后只检查目标 tar 是否存在，存在即令 `updateReady = true`；没有重新计算并比对声明 hash：[Updater 600–750](https://github.com/blackboardsh/electrobun/blob/4eba723c85b97559e1d9e13439d9a92ede0832e8/package/src/bun/core/Updater.ts#L600-L750)。
- **[源码事实]** macOS apply 路径解包、删除正在运行的 `.app`、rename 新包，并移除 quarantine；该路径没有显式调用 Ed25519、`codesign`、Team ID 或 designated requirement 校验：[Updater 754–916](https://github.com/blackboardsh/electrobun/blob/4eba723c85b97559e1d9e13439d9a92ede0832e8/package/src/bun/core/Updater.ts#L754-L916)。
- **[推断]** 控制更新主机、GitHub 发布权限或传输路径的攻击者可同时控制 metadata 与 bundle；现有 `hash` 无法形成独立信任根。即使生产包未来有 Developer ID 签名，也必须让 updater 在替换前显式验证，不能假定后续启动时的系统行为会补上这一层。
- **[推断]** 因为判断条件是 hash 不同而不是版本更高，旧 metadata / 旧包重放可能成为降级；因为先删除旧 app 再 rename，新包移动失败时缺少显式 last-known-good 恢复。这两项必须用故障注入实测，不能只靠代码阅读宣称一定可利用或一定丢包。

Electrobun 官方确实提供静态托管、BSDIFF 和全量回退，且 GitHub Releases 的 flat 文件名适配很好；但其官方文档同时说明每次 build 只生成“前一版本 → 当前版本”的一条 patch，落后一版以上会回退全量，且 GitHub `/releases/latest/download` 不会指向 prerelease，因此不能承载 canary：[Electrobun updates guide](https://blackboard.sh/electrobun/docs/guides/updates/)。这些是分发效率，不是来源认证。

## 威胁模型与不可妥协门槛

| 威胁 / 故障 | 必须有的控制 | 验收证据 |
|---|---|---|
| 网络中间人、DNS / CDN 配错 | HTTPS；不允许 HTTP fallback；归档独立非对称签名；下载后、解包前验证 | 代理替换 feed / archive 时客户端 fail closed，不展示伪 release notes，不替换 app |
| 对象存储或 GitHub 发布权限被盗 | appcast 和 archive 的签名私钥不放在托管主机；签名 feed；资产不可覆写 | 用无签名权限的托管账号替换文件，客户端仍拒绝 |
| 旧版本 / 旧 feed 重放 | 单调 `CFBundleVersion`；默认禁止 downgrade；stable feed 只向前 | 投喂旧但签名有效的包，客户端不安装 |
| 签名密钥泄漏 / 丢失 | Developer ID 与 Ed25519 分离保管；文档化 key rotation；受保护的 signing environment | 在 beta channel 完成一次受控 key rotation 演练 |
| 断电、磁盘满、权限不足、只读 DMG | staging 后再替换；安装失败保留原 app；明确错误与手动下载出口 | 故障注入后原版本仍可启动，数据不丢 |
| 更新时仍有 agent / terminal / 文件写入 | 检查可后台进行；安装只在安全退出点或用户确认后进行 | 活跃 turn、PTY、未保存文档存在时不会被强制重启 |
| 应用数据 schema 不兼容 | 迁移前备份、schema version、可重复迁移；回滚一律发更高版本的 forward fix | N-1 → N → forward-rollback 真实数据往返测试 |

Apple 的生产门槛独立于 updater：所有可执行内容需要有效签名，使用 Developer ID Application、Hardened Runtime、安全时间戳，并审阅 notarization log；完成后应 staple ticket：[Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)、[custom notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)。Apple 还明确建议签名复杂 bundle 时逐层签名，不要用 `--deep` 作为签名捷径（验证时可以用）：[Creating distribution-signed code](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)。

## 候选能力矩阵

### 产品与安全能力

| 候选 | 来源认证与传输 | 回滚 / 降级 | 发布托管 | 差分更新 | 静默 / 交互 | Channel |
|---|---|---|---|---|---|---|
| **Sparkle 2.9.6** | EdDSA / Ed25519 签 archive；推荐 HTTPS + Developer ID。2.9 可用 `SUVerifyUpdateBeforeExtraction=YES` 和 `SURequireSignedFeed=YES` 在解包前验证并签 appcast / release notes：[security setup](https://sparkle-project.org/documentation/#3-segue-for-security-concerns)、[security keys](https://sparkle-project.org/documentation/customization/#security-settings)。 | Sparkle 2 移除自动 downgrade；应发更高 build version 的 forward fix：[upgrade notes](https://sparkle-project.org/documentation/upgrading/)。数据回滚不在框架职责内。 | 任意 HTTPS 静态站 / CDN；appcast 指向 DMG、ZIP、tar 或 Apple Archive。`generate_appcast` 自动生成 feed、签名和 deltas：[setup](https://sparkle-project.org/documentation/)、[publishing](https://sparkle-project.org/documentation/publishing/)。 | 支持从多个旧版本到新版本的 `.delta`；无匹配或 patch 失败回退全量；工具自动生成并签名：[delta updates](https://sparkle-project.org/documentation/delta-updates/)。 | 有标准 UI、自定义 `SPUUserDriver`、自动检查、后台下载 / 安装；静默安装是用户可控 opt-in，权限不足或长期不退出时仍可能提示：[customization](https://sparkle-project.org/documentation/customization/)、[custom UI](https://sparkle-project.org/documentation/custom-user-interfaces/)。 | Sparkle 2 原生 appcast channels；适合 stable 默认 + beta opt-in。也可用完全分离的 feed URL：[publishing channels](https://sparkle-project.org/documentation/publishing/#channels)。 |
| **Electrobun 1.18.1 内置 updater** | 静态 `baseUrl` + content hash；固定版本源码未见非对称签名、签名 feed、HTTPS scheme guard 或安装前 macOS code-signature 校验。 | 只比较 hash 是否不同，未见单调版本限制或 last-known-good；**[推断]** 可被旧 feed 重放并有非事务替换风险。 | R2 / S3 / GitHub Releases 均为官方路径；GitHub `latest` 只适合 stable：[updates guide](https://blackboard.sh/electrobun/docs/guides/updates/)。 | 自定义 BSDIFF；1.18.1 每 build 只生成紧邻上一版本的一条 patch，其他情况全量回退。当前 C2 明确关闭。 | API 把 check / download / apply 分开，产品可自行交互；apply 会退出、替换、重启，没有标准更新 UI：[Updater API](https://blackboard.sh/electrobun/docs/apis/updater/)。 | 构建有 dev / canary / stable；1.18.1 源码仍有 runtime channel switching TODO；GitHub prerelease 不可通过 `latest` 更新。 |
| **Tauri 2 updater plugin** | 更新签名为强制项且不可关闭；production 默认强制 TLS；公钥内嵌 app，静态 / 动态 JSON 都携带签名：[Tauri updater](https://v2.tauri.app/plugin/updater/#signing-updates)。 | 默认 SemVer 比较；动态 server 可自定义 comparator 来允许 rollback。**[推断]** C2 不应打开该逃生口，应统一 forward fix。 | 动态 endpoint 或静态 JSON；官方 Tauri Action 可生成静态 JSON，适配 GitHub / CDN：[server support](https://v2.tauri.app/plugin/updater/#server-support)。 | 官方文档只列平台 updater 全量 archive / installer，未承诺 binary delta；标记为**未确认 / 不计入能力**。 | JS / Rust API 提供 check、downloadAndInstall、progress、relaunch，UI 由产品实现；Windows 另有 passive / basic / quiet install mode。 | runtime endpoint 可按 stable / beta 选择，官方给出分 channel URL 示例：[runtime endpoints](https://v2.tauri.app/plugin/updater/#endpoints)。 |
| **Electron `autoUpdater` / Squirrel.Mac** | macOS 必须签名；Squirrel 用当前 app designated requirement 验证新 bundle，Electron 更新请求受 ATS 约束：[Electron autoUpdater](https://www.electronjs.org/docs/latest/api/auto-updater/)、[Squirrel signature source](https://github.com/Squirrel/Squirrel.Mac/blob/main/Squirrel/SQRLCodeSignature.m)。metadata 没有类似 Sparkle 2.9 signed feed 的独立信任根。 | Squirrel 动态 server 有意允许 server 驱动 rollback / phased rollout；静态 JSON 模式拒绝相同或更低版本：[Squirrel README](https://github.com/Squirrel/Squirrel.Mac#server-support)。 | 动态 JSON 或静态 object storage；Electron Forge 能发布 macOS ZIP metadata：[Electron update guide](https://www.electronjs.org/docs/latest/tutorial/updates)。 | 当前 Squirrel.Mac 支持一条匹配 `from_version` 的 Sparkle BinaryDelta，失败回退 ZIP：[Squirrel README](https://github.com/Squirrel/Squirrel.Mac#update-server-json-format)。 | 自动检查并下载，退出时自动安装；可提示立即安装并重启。Electron 会转发 checking / available / downloaded / error 事件。 | 动态 server 可按客户端条件做 rollout；静态 feed 可分 URL。框架没有 Sparkle appcast channel 同等抽象。 |

### 工程适配、维护与许可

| 候选 | 与当前栈的集成成本 | CI / 发布改造 | 维护成熟度 | 许可 | 结论 |
|---|---|---|---|---|---|
| **Sparkle 2.9.6** | **中高。** Cocoa framework 不能直接从 Bun 当 npm 模块使用；建议增加很小的 Swift / Objective-C helper，嵌入 `Contents/Frameworks`，只暴露 check / state / install / relaunch。Sparkle 官方允许 `SPUUpdater` 更新其他 bundle，并提供 out-of-process CLI 作为参考：[bundles](https://sparkle-project.org/documentation/bundles/)、[sparkle-cli](https://sparkle-project.org/documentation/sparkle-cli/)。 | 增加 framework / helper 的内到外签名，生成 Ed25519 keys、signed appcast、delta；公证后再上传，appcast 最后发布。 | 项目版权记录始于 2006；当前 2.9.6 仍活跃发布，并有逐版本安全 / 可靠性清单。成熟并不等于可忽略升级，应跟随最新 production patch：[releases](https://github.com/sparkle-project/Sparkle/releases)、[security history](https://sparkle-project.org/documentation/security-and-reliability/)。 | 宽松 MIT-style grant，附带 bsdiff 等第三方 notice；分发时保留完整 notices：[LICENSE](https://github.com/sparkle-project/Sparkle/blob/2.x/LICENSE)。 | **推荐。** macOS 安全能力最完整，代价是一个受控原生 seam。 |
| **Electrobun 1.18.1** | **功能低，安全高。** API 与现有 Bun main 无缝；但要达到要求需上游 / fork 增加签名 metadata、archive verification、版本防回放、原子替换和 LKG，已经不是简单配置。 | 现有 build 本会产 update archive / JSON；需打开 `baseUrl` / patch 并发布全套 artifact。但在认证缺口修复前不要做。 | MIT；上游活跃但项目较新、更新面变化快，C2 又固定在 1.18.1。应以固定 tag 源码而非 main / 2.x 文档判断：[v1.18.1](https://github.com/blackboardsh/electrobun/releases/tag/v1.18.1)、[LICENSE](https://github.com/blackboardsh/electrobun/blob/v1.18.1/LICENSE)。 | MIT。 | **不用于当前生产。** 可保留为未来上游修复后的跨平台候选。 |
| **Tauri 2 plugin** | **很高。** 官方接法必须注册到 `tauri::Builder`，不是独立 Rust crate facade；C2 已从 Tauri 迁到 Electrobun，恢复 shell 会扩大进程、IPC、打包和 QA 范围：[official plugin usage](https://github.com/tauri-apps/plugins-workspace/tree/v2/plugins/updater)。 | 官方签名和 JSON 流程清晰，但要恢复 Tauri bundler / config / runtime。 | Tauri 官方维护，desktop 三平台；签名不可关闭是良好安全基线。 | MIT / Apache-2.0：[repository](https://github.com/tauri-apps/plugins-workspace)。 | **不选。** 作为 Electrobun 上游改进时的安全参照。 |
| **Electron / Squirrel.Mac** | **很高。** Electron `autoUpdater` 只存在于 Electron main；直接接 Squirrel 仍需 Objective-C framework、ReactiveObjC / Mantle 和原生桥，复杂度不低于 Sparkle。 | 需另建 Electron Forge / Squirrel 打包或手工原生工程；与当前 Electrobun artifact 不一致。 | Electron 与 Squirrel 仍活跃，但 C2 不运行 Electron。Squirrel 当前还复用 Sparkle BinaryDelta 源码，直接采用它并没有减少原生供应链面。 | Electron / Squirrel 均为 MIT；Squirrel 同样带 Sparkle / bsdiff notices：[Electron LICENSE](https://github.com/electron/electron/blob/main/LICENSE)、[Squirrel LICENSE](https://github.com/Squirrel/Squirrel.Mac/blob/main/LICENSE)。 | **不选。** 没有理由为 updater 引入 Electron；直接 Squirrel 的 signed-feed 与 UI 能力又弱于 Sparkle。 |

## 推荐架构

```text
React 设置页 / “Check for Updates…” 菜单
                  │ typed RPC
                  ▼
         Electrobun Bun main（策略层）
                  │ JSON-lines / 窄 native bridge
                  ▼
      macOS Update Helper + Sparkle SPUUpdater
                  │
      HTTPS signed appcast（stable / beta）
                  │
      signed full archive + signed deltas
                  ▼
   解包前 Ed25519 验证 → code-signature 检查 → 安全退出安装 / 重启
```

### 边界设计

- **Bun 策略层**只决定何时检查、何时允许安装，以及把状态显示给用户；它不自己下载或替换可执行代码。
- **native helper** 只拥有 Sparkle 生命周期和最小 RPC：`start`、`check`、`state`、`install`、`cancel`。它不接触 C2 项目文件、provider token 或插件权限。
- **首版用 Sparkle 标准 UI**，减少自制更新状态机。待 E2E 稳定后，可用 `SPUUserDriver` 映射到 C2 UI，但仍保留 Sparkle 的权限提示和失败语义；Sparkle 明确要求 custom user driver 仍能呈现 UI，不应拿它绕过用户交互：[custom UI](https://sparkle-project.org/documentation/custom-user-interfaces/)。
- 建议初始设置：`SUEnableAutomaticChecks=YES`、`SUAutomaticallyUpdate=NO`、`SUVerifyUpdateBeforeExtraction=YES`、`SURequireSignedFeed=YES`。允许用户选择后台下载；安装默认要求明确确认，或等应用正常退出。
- C2 有长任务、PTY、worktree 与未保存编辑状态；存在 active turn / process / dirty editor 时，策略层必须延后 restart。安全更新可提高提示优先级，但不应无条件终止工作。

### Channel 与版本规则

- `stable`：默认、只包含生产签名 / 公证且通过完整升级矩阵的版本。
- `beta`：用户显式 opt-in；使用独立 appcast 或 Sparkle channel，不复用 stable 指针。
- `nightly`：继续作为短期 Actions artifact；在生产更新系统验证前不进入 appcast。
- `CFBundleVersion` 必须是严格单调的机器版本；`CFBundleShortVersionString` 可继续是用户可见 SemVer。不要只比较 Git tag。
- 旧资产永不覆写；从 stable 撤回一个版本时停止 feed 指向它，并发布更高 build version 的 forward fix。

## 发布托管与 CI 设计

### 托管选择

**推荐：公开只读 HTTPS 对象存储 / CDN + 私有源码仓库。** 每个版本使用不可变路径，例如：

```text
/c2/macos/1.2.3/C2-1.2.3-arm64.dmg
/c2/macos/1.2.3/C2-1.2.2-to-1.2.3.delta
/c2/macos/1.2.3/release-notes.md
/c2/channels/stable/appcast.xml
/c2/channels/beta/appcast.xml
```

发布顺序必须是：上传版本化 archive / deltas / notes → 从外部网络校验可取回和签名 → 上传签名 appcast 到临时 key → 原子切换 channel key / 对象。私钥不在 bucket、CDN 或 web server 上。Sparkle 也明确建议不要让托管产品的机器接触签名密钥：[security setup](https://sparkle-project.org/documentation/#3-segue-for-security-concerns)。

GitHub Releases 只在另建公开 binary-distribution repo 或主仓库转为 public 后才适合匿名更新；当前 private repo 的 asset API 需要 read access。**不要**在 C2 中放 PAT、GitHub App private key 或带长期凭据的 URL。

### CI 阶段与硬门槛

1. **Build**：从 immutable commit 构建 arm64 `.app`；注入单调 `CFBundleVersion` 与用户版本；保留 dSYM。
2. **Nested signing**：按由内到外顺序签 Bun runtime、launcher、Rust sidecar、Sparkle helper / XPC、framework，最后签 `.app`；Developer ID + Hardened Runtime + timestamp。
3. **Local verification**：
   - `codesign --verify --deep --strict --verbose=4 C2.app`
   - `codesign -dv --verbose=4 C2.app` 并固定校验 identifier / TeamIdentifier
   - `spctl --assess --type execute --verbose=4 C2.app`
4. **Notarize + staple**：`notarytool submit --wait`；无论成功与否都保存并审阅 log；staple app / DMG 后运行 `stapler validate`。Apple 官方提醒即使 notarization 成功也要审阅 warnings：[notarization workflow](https://developer.apple.com/documentation/security/customizing-the-notarization-workflow)。
5. **Sparkle signing**：受保护环境持有 Ed25519 private key；`generate_appcast` 生成并签 archive / deltas / feed。把 public key 嵌入 app；私钥丢失 / 轮换手册与备份必须先完成。
6. **Update E2E**：在隔离 macOS 用户中从已安装的 N-1（不是 build 目录或只读 DMG）升级到 N；确认应用、nested code、数据、进程和重新打开状态。
7. **Publish**：先发布不可变版本资产，最后推进 beta appcast；观察至少一个周期后以人工 approval 推进 stable appcast。

## 实施阶段与退出标准

| 阶段 | 工作 | 退出标准 |
|---|---|---|
| **P0：生产签名基线** | Developer ID、Hardened Runtime、nested signing、notarize、staple；补 `CFBundleVersion`；保留 dSYM / notary log。 | 新装 DMG 在无开发证书机器通过 `codesign`、`spctl`、`stapler`；所有 nested binaries Team ID 正确；仍不启用 updater。 |
| **P1：Sparkle 隔离 spike** | 在 throwaway branch 添加 helper + Sparkle 2.9.6，手工 beta appcast，标准 UI；只实现 check / install / relaunch。 | N-1 → N 全量更新成功；错误签名、错误 Team ID、旧版本重放均 fail closed；移除网络时原 app 可继续启动。若失败，形成可复现 blocker，不扩成 Tauri / Electron 迁移。 |
| **P2：签名发布流水线** | 受保护 key、自动 `generate_appcast` / delta、对象存储、beta feed、签名 feed、人工 promotion。 | CI 不泄露私钥；bucket 账号无法伪造被客户端接受的 update；资产不可覆写；appcast-last 发布可回放审计。 |
| **P3：产品交互与恢复** | 设置页 channel / 自动检查选项、持久 update state、活跃任务安全退出门；手动下载 fallback。 | active turn / PTY / dirty editor 不被强杀；cancel、defer、quit-install、失败恢复均有自动测试和真实 UI QA。 |
| **P4：稳定发布** | beta 小范围运行、两跳更新、key rotation、forward rollback、delta / full fallback、数据迁移演练。 | N-2 → N-1 → N；N → 更高版本 forward rollback；一次 key rotation；断网 / 损坏 / 磁盘满 / 只读安装 / 断电注入均满足门槛后，才能加入 stable appcast。 |
| **P5：其他平台再决策** | 根据 Windows / Linux 真实发布优先级复查 Electrobun 上游 updater 的签名模型；必要时定义平台 updater adapter。 | 不因为 macOS 方案提前承诺跨平台；每个平台有等价来源认证和 rollback 策略。 |

## 必测矩阵

| 类别 | 场景 |
|---|---|
| 正常路径 | 全量 N-1 → N；delta N-1 → N；N-2 无 delta 自动回退全量；手动 check；后台下载后正常退出安装 |
| 身份 / 完整性 | archive bit flip；错误 Ed25519 key；签名 feed 被改；release notes 被改；Developer ID / Team ID 不同；nested helper 签名损坏 |
| 防回放 | feed 指向低 `CFBundleVersion`；旧但签名有效 archive；stable 客户端投喂 beta feed；相同版本不同 payload |
| 传输 | offline；超时；中途断流；HTTP URL；redirect 到非 HTTPS；CDN 返回旧 cache；无 Content-Length |
| 文件系统 | `/Applications` 正常；从 DMG 运行；只读位置；权限不足；磁盘满；目标 app 被占用；安装中 kill / 重启 |
| 产品状态 | agent turn 中；PTY 中；未保存编辑；插件 / MCP 子进程中；多个 C2 实例；应用正常 quit 与 crash |
| 数据 | 真实数据库复制；重复 migration；N → forward rollback；新版写入后旧 schema reader；备份损坏恢复 |
| 发布 | arm64；后续 x64 / Universal；公证离线 ticket；key rotation；私钥缺失；对象存储旧资产被覆盖尝试 |

## 明确未确认项

1. **[未确认]** Sparkle helper 能否在 Electrobun self-extracting wrapper 布局中稳定定位、替换并重启真正运行的 `C2.app`；必须用安装到 `/Applications` 的 production-signed bundle 实测。
2. **[未确认]** Electrobun 生成的最终 Info.plist 是否提供适合 Sparkle 的单调 `CFBundleVersion`，以及 post-build / post-wrap 修改是否会破坏后续 nested signing 顺序。
3. **[未确认]** 当前 entitlements、Bun runtime、Rust sidecar、Sparkle helper 在 Hardened Runtime + Library Validation 下的完整兼容性。
4. **[未确认]** Sparkle delta 对 Electrobun ASAR、自解压 wrapper 和每次签名时间戳造成的二进制变化能达到怎样的真实压缩率；“支持 delta”不等于 C2 的 delta 一定小。
5. **[未确认]** 产品是否计划公开二进制但保持源码私有；这决定对象存储、公开 binary repo 和下载授权设计。
6. **[未确认]** Intel macOS、Windows、Linux 的发布时间与支持等级；当前 CI 只能证明 Apple Silicon packaging。
7. **[未确认]** Sparkle 2.9.6 在 C2 所选最低 macOS 版本上的产品兼容范围；应以真实部署目标和该版本 release notes / build target 复核。

## 最终建议

**采用 Sparkle 2.9.6 作为 macOS updater，Electrobun 继续负责应用壳和打包，但不使用 1.18.1 内置 apply 路径。** 这是一个“多一个很窄的原生 seam，换取成熟的签名、feed、delta、UI、版本和安装语义”的选择。

实施顺序不可倒置：

1. Developer ID + Hardened Runtime + notarization；
2. Sparkle helper 的 fail-closed spike；
3. signed archive + signed appcast + public HTTPS hosting；
4. beta 两跳升级、故障注入、key rotation 和 forward rollback；
5. 最后才接入 stable 自动检查。

在这些门槛之前，最安全的产品行为是显示当前版本与官方手动下载入口，而不是“先能自动更新、以后再补签名”。
