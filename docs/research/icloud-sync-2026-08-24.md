# C2 设备同步方案调研：配对设备先行，iCloud 暂停

> 日期：2026-08-24
> 范围：当前 Electrobun macOS 桌面端；Apple 官方资料为主要依据；不代表已取得 Apple Developer 团队、容器或签名资产。

证据标记：`[事实]` 为 Apple 官方资料直接支持；`[源码审计]` 为当前 C2 或固定 Electrobun tag 的可见行为；`[推断]` 为基于这些事实的工程判断；`[未确认]` 需要账号、签名产物或真实设备验证。未加标记的条目是建议，不冒充已完成实现。

## 结论

**采用“本地优先、统一合并引擎、可替换传输”的设备同步方案；当前先启用已配对 C2 设备通道，iCloud 实现保留但从产品和默认运行路径屏蔽：**

1. 会话、消息和 memory 继续以本地 SQLite 为离线真相源；同步时生成可合并的设备快照，不移动或传输正在使用的 `codetwo.db`；
2. 小型、非敏感偏好以后可独立接 `NSUbiquitousKeyValueStore`（下称 KVS），但不能用 KVS 承载会话正文或 memory；
3. iCloud Documents 仅用于用户可见、可导出的 Markdown/归档文件，不作为 live database；
4. React/WKWebView 不直接接 iCloud。沿用现有 typed RPC，把 Apple API 放在独立签名、独立 provision 的 macOS helper；
5. 在 Apple Developer 容器、provisioning profile 和最终产物签名验证完成前，不启用或展示 iCloud，同样不能声称“真实 iCloud 已可用”。
6. Pure Bun Remote host 使用同一个设备同步 document、tombstone 和冲突引擎；配对、持久凭据、撤销和在线状态通过 `remote.*` 命令管理。

Apple 对三种存储的定位本身支持这个拆分：小偏好用 KVS、文件用 iCloud Documents、复杂对象/关系用 CloudKit。[Apple：Deciding whether CloudKit is right for your app](https://developer.apple.com/documentation/cloudkit/deciding-whether-cloudkit-is-right-for-your-app) · [Apple：Configuring iCloud services](https://developer.apple.com/documentation/xcode/configuring-icloud-services)

## 本次实现

本次交付默认关闭的设备同步预览，并把已配对 C2 设备作为当前生产传输：

- 设置页由用户明确开启；启动后、每五分钟、手动点击和退出前同步；失败不阻断本地读写；
- Remote 的一次性链接只把短期 token 放在 URL fragment；兑换后服务端只保存 bearer 的 SHA-256 hash，客户端凭据文件使用 `0600`，撤销后下一次请求立即返回 401；
- 会话和项目等可变行按各自 `updated_at` 做确定性 last-write-wins；同时间戳继续按稳定内容排序；transcript part 通过稳定 `sync_id` 组成 append-only set；项目和 memory 删除通过 tombstone 传播；快照内容 hash 作为条件版本，陈旧写入返回 409 后由同一同步服务重读、合并并重试；
- 同步会话、项目列表、transcript 和 L1/L2 memory；项目文件、worktree identity、ACP session、L3 派生 profile、memory evidence pointer、automation、插件、凭据和终端历史留在本机；
- iCloud/CloudKit helper、adapter 与构建能力保留，便于后续取得真实签名资产后继续验证；当前 host 不构造该 adapter，设置页也不展示 iCloud。

### 统一设备同步 seam

同步模块不再把产品能力命名为“Cloud sync”。`DeviceSyncService` 只负责本地快照、合并、导入、重试和状态；`DeviceSyncTransport` adapter 负责发现远端 replicas 并以版本条件写回。一次读取可以返回多个 replica，因此同一轮合并可同时吸收多台已配对 C2 设备的离线变化，冲突规则不会散落到 iCloud 和 Remote 两套实现中。

当前 adapters 与边界：

| adapter | replica 身份 | 当前状态 | 约束 |
|---|---|---|---|
| iCloud / CloudKit | `icloud:private-v1` | adapter 保留；产品与默认运行路径已屏蔽 | 恢复前仍需 private database、change tag、provisioning、entitlement 与真实双机验证 |
| 已配对 C2 设备 | `paired:<server-id>` | Pure Bun 生产 HTTP adapter 已启用 | 只接受同一 sync schema 的完整 C2 客户端；不把 T3/浏览器遥控页面误当持久副本 |

**[源码审计]** Electrobun Pure Bun host 已实现 `remote.start`、`remote.devices`、`remote.pairing_link`、`remote.pair_device` 与 `remote.revoke_device`。C2 sync 作为 `c2` 协议接入现有 `BunRemoteServer`，与已经可用的 T3/legacy 共用同一个 listener、一次性 token、持久 bearer hash、撤销和端点发现；同步模块只提供当前 `BunDatabase` 的快照 handler 与出站 peer，不另起网络服务、Rust engine/store 或第二个 `codetwo.db` 所有者。用户开启网络访问后 listener 状态和端口会持久化，正常退出不把它误写成关闭。

配对设备传输不得同步一次性 pairing link、bearer token、WebSocket ticket 或凭据。设备离线只是该 replica 暂时不可达；本地写继续成功，重新上线后仍通过同一 document merge 与 tombstone 传播收敛。

### 已完成的真实通道验证

**[验证]** 使用生产 `BunRemoteServer`、`PairedDeviceSyncRuntime` 与 `PairedDeviceSyncTransport`，在两个独立临时 data directory 和两份真实 SQLite 上通过实际 loopback TCP 完成：c2/T3/legacy capability 共存、一次性链接兑换与重放拒绝、listener 和凭据重启恢复、服务端只落 bearer hash、双向首轮同步、离线并发 transcript 合并、同时间戳确定性冲突、memory 删除传播、陈旧版本 409、撤销后 401，以及无 peer 时 fail closed。该验证没有使用 in-memory/fake transport。

**[边界]** 这证明了真实网络栈和两个隔离 C2 数据实例，不等于两台物理 Mac、跨 LAN/Tailnet 防火墙、睡眠唤醒或不稳定网络已验证；这些仍列在后续设备矩阵中。当前 LAN endpoint 仍是 bearer 保护的明文 HTTP，正式承载敏感会话前必须补传输加密或只允许可信加密 overlay；loopback 结果不能证明 LAN 抗窃听/中间人安全。

这个单 record/asset 设计减少了首个版本的 CloudKit schema 和恢复面，但不是无限扩展方案。上线前应设定 payload 上限；数据量接近 `CKAsset`/配额边界时，按本文后续方案迁移到 custom zone 的分实体 records 与 `CKSyncEngine`。账号切换隔离、云端副本删除和用户导出也仍是正式发布前的必需项。

### Apple 侧配置

每个 channel 需要独立 explicit helper App ID 和 container，例如 release 使用：

```text
Helper bundle ID: dev.codetwo.app.cloud-sync
Container:        iCloud.dev.codetwo.app
Database:         Private
Record type:      CodeTwoSyncState
Fields:           payload (Asset), revision (Int64), schemaVersion (Int64), updatedAt (Date/Time)
```

构建变量：

```text
CODETWO_ICLOUD_HELPER_PROVISIONING_PROFILE=/absolute/path/to/profile.provisionprofile
CODETWO_ICLOUD_HELPER_SIGNING_IDENTITY="Developer ID Application: …"
CODETWO_ICLOUD_ENVIRONMENT=Production
```

development 首次写入可创建 schema；release 前必须把 container schema 部署到 production，并用解包后的最终 `.app` 核对 helper 的 `embedded.provisionprofile`、entitlements、签名链和 notarization。

## 当前 C2 数据边界

### 本地数据现状

- Electrobun Bun host 的数据目录是 `Utils.paths.appData/<bundle identifier>`，数据库是 `codetwo.db`：[desktop main](../../apps/desktop/src/electrobun/index.ts) · [Bun database](../../apps/desktop/src/electrobun/host/database.ts)。
- SQLite 目前包含 `sessions`、`parts`、`projects`、`memories`、memory policy/receipt、`automations` 和 `automation_runs`。其中包含消息正文、绝对路径、worktree 身份、provider/model、记忆内容和 automation prompt，不能被当作一个普通“偏好文件”。
- host 目录还有 `keymap.json`、`plugin-config.json`、插件 bundle 和插件数据。插件可执行代码、provider/tool 配置及项目级插件数据不应被整体上传。
- WebView `localStorage` 中的稳定数据主要是：
  - `codetwo.language`；
  - `codetwo.appearance.v1`；
  - `codetwo.terminal`；
  - composer/dock/rail 尺寸、折叠态和 document mode；
  - `codetwo.browser.tabs.v1`（含 URL）。

### 建议的数据分类

| 当前数据 | 首版是否同步 | iCloud 载体 | 原因 |
|---|---:|---|---|
| 语言、主题模式、UI/代码字体 ID | 后续 | KVS | 小、非敏感、不同 Mac 复用价值高；不属于本次内容同步 |
| terminal 字体和字号 | 后续可选 | KVS | 小且可迁移；`scrollback` 属设备资源策略，保留本地 |
| dock/rail/composer 尺寸、折叠态 | 否 | 本地 | 跟屏幕尺寸和当前窗口相关 |
| browser tabs/URL | 否 | 本地 | 可能含敏感 URL，且是设备级运行态 |
| 同步开关 | 否 | 本地 | 新设备不应因为云端值而自动开始上传 |
| keymap | 后续 | KVS 或 CloudKit record | 需先定义冲突和未知 action 的兼容规则 |
| 会话元数据、pin/archive/title | 是（预览） | CloudKit private DB asset | 结构化、需要删除传播和冲突合并 |
| transcript parts | 是、明确 opt-in | CloudKit private DB asset | 体量大且敏感；同步后也不等于 provider session 可跨机续跑 |
| memory | 是、同一 opt-in | CloudKit private DB asset | 高敏感；正式发布仍需导出、云端删除和账号切换策略 |
| `cwd`、project path | 是（预览限制） | CloudKit private DB asset | 当前用于保留会话和 memory 的项目关联；另一台 Mac 路径可能无效，正式版需稳定 project ID 与本地映射 |
| worktree identity、ACP session id | 否 | 本地 | 属于设备和 provider 运行身份，不能跨机复用 |
| automations | 首版否 | 本地 | prompt、路径和权限绑定本机；跨机执行会扩大副作用 |
| 插件 bundle、插件数据、token/secret | 否 | 本地/Keychain | 不应通过偏好同步分发代码或凭据 |
| 用户主动导出的 `.md`/归档包 | 可选 | iCloud Documents | 是真正的用户文档，而不是 live database |

## 三种 Apple 方案

### 1. KVS：只同步小偏好

**[事实]** `NSUbiquitousKeyValueStore` 面向设置、配置和小型 app state；每个 app 最多 1024 个 key、全部 value 共 1 MB、单 value 最多 1 MB。值必须是 property-list 类型。无 iCloud 账号时写入只留在本机；远端变化通过 `didChangeExternallyNotification` 通知。[Apple API](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore)

**[事实]** Apple 明确禁止在 KVS 放个人或敏感信息，因为系统会以未加密形式写到磁盘。[Apple API](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore)

**[事实]** KVS 是最终收敛而非“立即同步”。`synchronize()` 只提示 iCloud 有新数据，不会强迫其他设备立刻拉取，通常更新频率也只有每分钟数次。[Apple：synchronize()](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore/synchronize%28%29)

**[事实]** 冲突时服务端值可能先覆盖本地 pending value，应用必须监听外部变化并有意识地决定是否更新本地偏好；一次写入单个 value 是原子的。[Apple archived iCloud Design Guide](https://developer.apple.com/library/archive/documentation/General/Conceptual/iCloudDesignGuide/Chapters/DesigningForKey-ValueDataIniCloud.html)

**[建议]** 首版按独立语义组存三个 versioned dictionary，而不是复制整个 `localStorage`：

```text
preferences.language.v1
preferences.appearance.v1
preferences.terminal.v1
```

每组包含 `schemaVersion` 和允许字段白名单。不要同步任意 key，也不要依赖设备时钟做唯一冲突排序。初次启用时先读云端：云端已有字段优先，云端缺失字段才从本地 seed；之后采用每组 last accepted value，并把 change notification 投影回 UI。

### 2. iCloud Documents：只放真实文档

**[事实]** iCloud Documents 通过 ubiquity container 同步文件；Apple 将它定位为 document/image 等文件，不是结构化对象数据库。[Apple：Configuring iCloud services](https://developer.apple.com/documentation/xcode/configuring-icloud-services)

**[事实]** iCloud 或其他共享空间里的文件读写必须使用 file coordination；`NSFileCoordinator` 负责在多个进程/对象之间协调 read、write、move 和 delete。[Apple：Shared data](https://developer.apple.com/documentation/technologyoverviews/shared-data) · [NSFileCoordinator](https://developer.apple.com/documentation/foundation/nsfilecoordinator)

**[事实]** 两台离线设备同时写同一文件会产生 `NSFileVersion` conflict；系统选择一个 current version，但应用仍需发现并解决其他冲突版本。[Apple：NSFileVersion](https://developer.apple.com/documentation/foundation/nsfileversion) · [Designing for Documents in iCloud](https://developer.apple.com/library/archive/documentation/General/Conceptual/iCloudDesignGuide/Chapters/DesigningForDocumentsIniCloud.html)

**[推断]** 把活跃 `codetwo.db`（及其 SQLite transaction/journal 行为）直接搬进 ubiquity container，会把行级业务冲突退化成整文件 conflict，并要求所有访问都进入 file coordinator。它无法提供 session/part/memory 的可解释合并和删除传播，因此不采用。

### 3. CloudKit private DB：结构化数据的长期方案

**[事实]** private database 默认只有当前 iCloud 用户可访问，不在 Developer Portal 显示，存储计入用户自己的 iCloud quota；没有已登录 iCloud 账号时 private DB 操作失败。[Apple：privateCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase) · [CKContainer](https://developer.apple.com/documentation/cloudkit/ckcontainer)

**[事实]** Apple 对复杂模型推荐 `CKSyncEngine` 或更底层的 `CKDatabase`/operations。后者要求应用自行处理 schedule、conflict、账号变化、通知和 server change token。[Apple decision guide](https://developer.apple.com/documentation/cloudkit/deciding-whether-cloudkit-is-right-for-your-app)

**[事实]** `CKSyncEngine` 自动调度 push/pull 并重试 network/rate-limit 等 transient error，但应用仍要持久化它的 opaque serialized state，并自行处理 `serverRecordChanged` 等业务错误和 iCloud 账号变化。[Apple：CKSyncEngine](https://developer.apple.com/documentation/cloudkit/cksyncengine-4b4w9) · [CKSyncEngine.State](https://developer.apple.com/documentation/cloudkit/cksyncengine-5sie5/state-swift.class)

**[事实]** Apple 官方 sample 要求 macOS 14+、真实 Mac 和有效 Apple Developer membership；remote notifications 不能只靠 simulator 证明。[Apple sample-cloudkit-sync-engine](https://github.com/apple/sample-cloudkit-sync-engine)

**[建议]** 若 C2 明确最低系统为 macOS 14+，第二阶段用一个 private custom zone 和 `CKSyncEngine`；否则要么提高 deployment target，要么为旧系统实现 `CKFetchRecordZoneChangesOperation` + persisted change token。当前仓库没有声明最低 macOS 版本，因此此选择尚未成立。

## 推荐 native bridge

```text
React / WKWebView
       │ 现有 typed `call` RPC
       ▼
Electrobun Bun main（策略、白名单、local cache）
       │ C ABI / JSONL
       ▼
macOS iCloud bridge（Foundation / CloudKit）
       │
       ├─ NSUbiquitousKeyValueStore（MVP）
       └─ CKSyncEngine + private custom zone（后续）
```

Electrobun 官方架构明确规定 webview 通过 event/RPC bridge 与 privileged main process 通信，page JavaScript 不直接持有 native API；其 native wrapper 本身也通过 FFI 接 native layer。[Electrobun architecture](https://framework.blackboard.sh/electrobun/guides/architecture/overview/) · [Electroview typed RPC](https://framework.blackboard.sh/electrobun/apis/browser/electroview-class/)

### 首选：同进程 Objective-C/Swift dylib

- 复用当前 `native/window-effects` + Bun `dlopen` 的窄 native seam；
- bridge 只暴露 versioned JSON/C ABI：`status`、`readPreferences`、`writePreferenceGroup`、`removePreferenceGroup`、`drainEvents`；
- native side 串行化 Apple API 访问；Bun 轮询/拉取 event，避免把任意 native thread callback 直接打入 JS；
- renderer 只收到已校验的同步状态和偏好变化，不接 container ID、profile 或任意 CloudKit operation。

**[推断]** 同进程 bridge 可让真正执行 Apple API 的 app process 使用主 executable entitlement，减少另一个 App ID/profile。但这必须用最终 Electrobun bundle 做 entitlement/runtime 验证，不能仅由 FFI 单测证明。

### 备选：独立 app-like Swift helper

若 in-process bridge 在 Electrobun main-thread/runtime 中不稳定，可把 helper 包装成 `CodeTwoICloudHelper.app`，通过 JSON-lines 或 XPC 与 Bun 通信。它需要独立 bundle ID、App ID、entitlements、provisioning profile 和由内到外签名。Apple 明确说 standalone executable 无处嵌入授权 restricted entitlement 的 profile；需要 app-like structure。[Apple TN3125](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles)

### 不选 CloudKit JS

CloudKit JS 可访问 private database，但 web app 需要配置 container/API token，并通过 CloudKit web authentication 让用户登录；它不会自动继承当前 Mac 已登录的 iCloud account。[Apple：CloudKit JS](https://developer.apple.com/documentation/cloudkitjs/cloudkit) · [CloudKit.Database](https://developer.apple.com/documentation/cloudkitjs/cloudkit.database)

这会在 native Mac app 内引入第二套 Apple ID 登录和 token surface，因此不作为 iCloud-first 桌面体验。

## Container、entitlement 与签名门槛

### Apple 侧资产

生产实现至少需要：

1. 有效 Apple Developer Program 团队和明确的 Team ID；
2. 为 release identifier `dev.codetwo.app` 注册 explicit App ID，并启用 iCloud；
3. 创建 production container，例如 `iCloud.dev.codetwo.app`；
4. dev/nightly 使用独立 container，避免测试数据或 development schema 接触 production；
5. 重新生成匹配 capability 的 development、Developer ID distribution 或 Mac App Store profile；
6. CloudKit 上线前把 development schema deploy 到 production。

iCloud container 需要 Account Holder/Admin 创建，而且创建后不能删除或重命名，应先定稿 identifier。[Apple：Create an iCloud container](https://developer.apple.com/help/account/identifiers/create-an-icloud-container) · [Enabling CloudKit](https://developer.apple.com/documentation/cloudkit/enabling-cloudkit-in-your-app)

### Entitlements

| 能力 | 必要 entitlement |
|---|---|
| KVS | `com.apple.developer.ubiquity-kvstore-identifier = $(TeamIdentifierPrefix)<bundle-id>`；以 profile 实际授权值为准 |
| CloudKit | `com.apple.developer.icloud-container-identifiers`；`com.apple.developer.icloud-services = [CloudKit]`；`com.apple.developer.icloud-container-environment` |
| CKSyncEngine push | `com.apple.developer.aps-environment`（development / production 由 profile 决定） |
| iCloud Documents | 上述 container identifiers 加 `com.apple.developer.ubiquity-container-identifiers`；services 含 `CloudDocuments`；必要时配置 `NSUbiquitousContainers` |

直接依据：[Configuring iCloud services](https://developer.apple.com/documentation/xcode/configuring-icloud-services) · [KVS entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.ubiquity-kvstore-identifier) · [iCloud services entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.icloud-services) · [container environment](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.icloud-container-environment) · [macOS APS entitlement](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.aps-environment)

KVS-only MVP 不需要提前打开 CloudKit/Push；第二阶段再最小化增加对应 entitlement。

### Developer ID

**[事实]** Apple 当前 macOS capability matrix 把 CloudKit、iCloud Documents、KVS 和 Push Notifications 都列为 Developer ID 支持能力；无付费 program 的 Apple Developer 列不支持这些 iCloud 能力。[Apple：Supported capabilities (macOS)](https://developer.apple.com/help/account/reference/supported-capabilities-macos)

**[事实]** iCloud 属 restricted entitlement。外部构建系统不能只写 entitlement 再 codesign：必须嵌入匹配分发通道的 distribution provisioning profile，macOS 位置是 `MyApp.app/Contents/embedded.provisionprofile`，随后再签名。Apple 还要求 entitlement 只应用到真正需要它的 main executable，不要应用到 library。[Apple：Creating distribution-signed code for macOS](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/) · [TN3125](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles)

**[官方资料冲突 / 未确认]** 同一时期的 `NSUbiquitousKeyValueStore` API 页仍保留“必须通过 App Store 或 Mac App Store 分发”的注记，但当前 capability matrix 明确列出 Developer ID 支持 KVS。[KVS API](https://developer.apple.com/documentation/foundation/nsubiquitouskeyvaluestore) · [macOS capability matrix](https://developer.apple.com/help/account/reference/supported-capabilities-macos) 因此 Developer ID + KVS 必须作为真实 signed spike 验证；在此之前不能把 capability matrix 当作运行成功证据。若实际不可用，偏好也改用 CloudKit private records。

Developer ID 生产包仍需 Hardened Runtime、secure timestamp、Developer ID Application 签名和 notarization；Apple 要求所有 nested executable 有效签名，并建议从内到外签。[Apple notarization](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution) · [distribution signing](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)

### Electrobun 1.18.1 缺口

**[源码审计]** 调研开始时的 C2 `electrobun.config.ts` 只有 microphone/speech entitlements，codesign/notarize 又由环境变量控制；当时仓库没有嵌入 `embedded.provisionprofile` 的步骤。

固定 tag 源码显示：

- config 只有通用 `entitlements` record 和 `codesign`/`notarize`，没有 provisioning profile 选项：[Electrobun v1.18.1 config type](https://github.com/blackboardsh/electrobun/blob/v1.18.1/package/src/bun/ElectrobunConfig.ts#L250-L312)；
- CLI 会把同一个 entitlements file 用到多个 executable/helper 和最终 app，而 Apple 要求 restricted entitlement 按 executable/profile 边界处理：[Electrobun v1.18.1 signing source](https://github.com/blackboardsh/electrobun/blob/v1.18.1/package/src/cli/index.ts#L5003-L5247)；
- `postBuild` 在最终 app codesign 之前执行，因此可在这个阶段嵌入 profile/专用 helper；但必须验证 `postWrap` 和最终分发 wrapper 没有破坏 entitlement/profile：[Electrobun v1.18.1 build source](https://github.com/blackboardsh/electrobun/blob/v1.18.1/package/src/cli/index.ts#L3434-L3436) · [signing call](https://github.com/blackboardsh/electrobun/blob/v1.18.1/package/src/cli/index.ts#L3705-L3728)。

**结论：不要直接把 iCloud entitlement 填进现有通用 `build.mac.entitlements` 后就交付。** 需要先补 per-executable signing/profile seam，或使用独立 app-like helper 并单独 provision/sign。

### Mac App Store / TestFlight

- Mac App Store 使用 Apple Distribution/Mac App Store provisioning profile，App Store 会在分发流程验证 provisioning；Mac App Store 还要求 App Sandbox。C2 目前需要访问任意 worktree、Git、PTY、插件和子进程，全面 sandbox 化是独立架构项目，不应为了 iCloud MVP 顺带开启。[Apple：Configuring the macOS App Sandbox](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox) · [App Store profile](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/)
- TestFlight 总是要求 profile；CloudKit TestFlight/App Store build 使用 production environment。不要用 development container 的成功替代 production 验证。[Apple TN3125](https://developer.apple.com/documentation/technotes/tn3125-inside-code-signing-provisioning-profiles) · [Deploying schema](https://developer.apple.com/documentation/cloudkit/deploying-an-icloud-container-s-schema)
- 现阶段优先 Developer ID 路径，不为 iCloud 同步引入 App Sandbox/App Store 迁移。

## 离线、合并、冲突和删除

### 通用原则

- **本地写先成功。** iCloud unavailable、未登录、quota、限流或网络故障不能阻止本地偏好/数据写入。
- **云端是复制目标，不是启动依赖。** 启动先显示本地状态，再异步 apply cloud delta。
- **只有确认成功后才显示“已同步”。** pending、retrying、account unavailable 和 quota 必须保留为可观察状态。
- **同步开关关闭时不上传。** 关闭后保留本地数据；“删除云端副本”是独立、明确的 destructive action。

### KVS MVP

- 注册 `didChangeExternallyNotification`；仅接受白名单 key 和可解码 schema；
- 外部删除映射为对应偏好恢复默认，但不要删除 local-only 字段；
- quota violation 保留本地值并显示同步失败，不循环重试相同 oversized payload；
- 不提供承诺立即生效的“Sync now”；若有按钮，文案只能表达“请求同步”，因为 `synchronize()` 不是强制跨设备 flush；
- 对语言、appearance、terminal 三个组分别合并，避免一次 layout 变化覆盖语言；
- unknown newer `schemaVersion` 只读已知字段，绝不把旧客户端默认值回写覆盖新 schema。

### CloudKit phase

- 使用稳定 record ID 和一个 private custom zone；本地 SQLite 增加 `sync_state`、outbox/pending delete 和 tombstone，而不是上传数据库文件；
- `CKSyncEngine` serialized state 必须和本地 replica 同事务或可恢复地持久化；state 丢失时完整 re-fetch/reconcile；
- fetched modification 合并到本地，fetched deletion 删除/标记本地对象。Apple event 明确分别提供 modifications 和 deletions。[Apple：FetchedRecordZoneChanges](https://developer.apple.com/documentation/cloudkit/cksyncenginefetchedrecordzonechangesevent)
- save 使用 record change tag。`serverRecordChanged` 返回 ancestor/client/server 三份记录，应用应合并到最新 server record 后重试，不能无条件 `saveAllKeys` 覆盖。[Apple：serverRecordChanged](https://developer.apple.com/documentation/cloudkit/ckerror/code/serverrecordchanged) · [ifServerRecordUnchanged](https://developer.apple.com/documentation/cloudkit/ckmodifyrecordsoperation/recordsavepolicy/ifserverrecordunchanged)
- 删除传播同时保留 versioned tombstone/known-set 对账，防止 change token 丢失或长期离线设备把旧对象静默复活；tombstone GC 要有明确 retention 和全设备/服务端水位依据。
- push 只是“可能有变化”的提示，真实变化仍按 sync state/change token 拉取；不要把 notification payload 当数据库事实。

### 账号变化

`CKSyncEngine` 会报告 sign-in、sign-out 和 account switch，但如何处理已有本地数据由应用决定；Apple 列出隔离、合并、删除或询问用户四种选择。[Apple：account sign-in](https://developer.apple.com/documentation/cloudkit/cksyncengineaccountchangetype/signin)

C2 的安全默认：

1. sign-out：暂停同步、保留本地数据，不静默删除；
2. switch account：隔离旧账号的 sync state，暂停上传，要求用户选择“保留仅本地 / 合并到当前账号 / 使用当前账号云端副本”；
3. 不把 A 账号未上传的 transcript/memory 自动写进 B 账号；
4. KVS 同样把 account/server change 当外部变更，不用一个全局“cloud wins”覆盖所有本地状态。

## Schema 和隐私

CloudKit development/production 是分离环境；部署 schema 只复制 record type、field 和 index，不复制 records。production schema 的演进基本只增不减：已上线 field/type 不能删除或改类型。[Apple：Deploying schema](https://developer.apple.com/documentation/cloudkit/deploying-an-icloud-container-s-schema) · [Designing for CloudKit](https://developer.apple.com/library/archive/documentation/General/Conceptual/iCloudDesignGuide/DesigningforCloudKit/DesigningforCloudKit.html)

每个 record 都应有 `schemaVersion`；迁移只新增字段或新 record type；修改旧记录时基于 fetched server record 保留未知字段。旧客户端遇到更高 schema 不应写回默认值。

隐私基线：

- private DB，不使用 public DB；private data 默认仅用户可访问且不在 developer portal 可见。[Apple：privateCloudDatabase](https://developer.apple.com/documentation/cloudkit/ckcontainer/privateclouddatabase)
- KVS 绝不放 transcript、memory、URL、路径或 secret；
- transcript/memory 若未来同步，使用独立 opt-in，并把正文放 `encryptedValues`；CloudKit encrypted fields 会在设备侧加密后保存，private/shared database 可用，但 encrypted field 不可索引，且必须作为新 field 引入。[Apple：Encrypting User Data](https://developer.apple.com/documentation/cloudkit/encrypting-user-data) · [encryptedValues](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues)
- 不把“private database”宣传成无条件端到端加密；是否只有用户掌握 key 还取决于 encrypted field 和用户是否开启 Advanced Data Protection。[Apple：encryptedValues](https://developer.apple.com/documentation/cloudkit/ckrecord/encryptedvalues)
- CloudKit 数据属于用户，产品要提供查看/导出和删除入口。[Apple：Providing User Access to CloudKit Data](https://developer.apple.com/documentation/cloudkit/providing-user-access-to-cloudkit-data)

## 分阶段 MVP

| 阶段 | 内容 | 退出标准 |
|---|---|---|
| P0：provisioning spike | 定稿 container/App IDs；生成 dev + Developer ID profiles；补 per-executable signing/profile；最小 native bridge 只返回 account/KVS status | 最终 `.app` 中 profile 与 entitlement 匹配；ad-hoc/错误 profile/错误 Team ID fail closed；Developer ID notarized app 能在另一台 Mac 读取同一账号测试 key |
| P1：偏好同步 MVP | 本地 opt-in；language/appearance/terminal 三组白名单；通知、initial merge、quota/offline/status；非 macOS adapter 保持 local-only | 两台真实 Mac 往返；离线双改；关闭/重开；删除；无 iCloud；quota；账号切换；重启均不丢本地设置 |
| P2：CloudKit local replica | 明确最低 macOS；private custom zone；SQLite sync state/outbox/tombstone；先同步低敏感实体（建议 session title/pin/archive 的只读历史投影） | 双设备增删改、token/state 丢失、冲突、限流、账号切换、production schema 均通过；不承诺跨机 provider session resume |
| P3：高敏感数据 opt-in | transcript/memory 独立开关、encrypted fields、导出和云端删除 | 加密 schema 已 production deploy；用户可导出/删除；旧客户端和 keychain reset 故障演练通过 |
| P4：iCloud Documents（可选） | 用户主动导出 Markdown/归档到 ubiquity container | file coordination、离线 conflict、rename/delete、download placeholder 和 conflict UI 真实验证；仍不放 live SQLite |

P1 产品状态最少区分：`off`、`unavailable`、`syncing`、`upToDate`、`attentionRequired`。同步失败时 app 继续本地工作；只有真实 Apple callback/operation completion 才能推进为 `upToDate`。

## 验证矩阵

### 无 Apple 账号也能做

- 两个隔离 C2 data directory 通过真实 TCP 往返、重启、撤销、409 冲突和 401 鉴权；
- fake KVS/CloudKit adapter 的 multi-device deterministic tests；
- schema decode、unknown version、白名单、oversize、删除和 merge 单测；
- 本地写成功 + cloud outbox 失败/重试；
- account switch policy 状态机；
- bridge RPC validation、malformed native JSON、native process/library unavailable；
- build script 对 missing profile、identifier mismatch、非 production environment 的 fail-fast 测试。

### 必须有 Apple Developer 资产和真实设备

- 注册/关联 iCloud container 与三个 App ID；
- development/production provisioning 和 entitlement 授权；
- Developer ID + KVS 的官方资料冲突实测；
- CloudKit production schema deployment；
- APNs/CKSyncEngine remote notifications；
- 两台 Mac 同账号、两账号切换、iCloud Drive 关闭、quota/网络/限流；
- 最终 `.app`、self-extracting wrapper、DMG 的 nested signing、notarization、stapling 和 Gatekeeper；
- Mac App Store/TestFlight 只能在决定采用相应分发通道后验证。

产物验收至少包括：

```bash
security cms -D -i C2.app/Contents/embedded.provisionprofile
codesign -d --entitlements - --xml C2.app
codesign --verify --deep --strict --verbose=4 C2.app
spctl --assess --type execute --verbose=4 C2.app
xcrun stapler validate C2.app
```

还要比较 profile `Entitlements` allowlist、最终 code-signature claimed entitlements、Team ID、application identifier、container ID 和 Development/Production 环境，不能只看命令 exit 0。

## 尚未确认

1. 当前 Apple Developer team、Team ID、App IDs、container 和证书/profile 的真实状态；
2. C2 最低 macOS 版本，因而 `CKSyncEngine` 是否可作为唯一实现；
3. Electrobun 1.18.1 的 actual main executable entitlement 是否能让同进程 FFI bridge 稳定访问 KVS/CloudKit；
4. Developer ID + KVS 在 Apple 两份相互冲突的当前文档下的真实运行行为；
5. Electrobun self-extracting wrapper 安装后，profile/entitlement 是否完整保留在真正运行的 inner app；
6. 用户究竟希望同步“偏好”“历史可读副本”还是“跨机继续 agent session”；三者的数据与冲突模型不同，P2 前必须定产品契约；
7. App Store/TestFlight 是否是实际发布目标；当前建议只承诺 Developer ID 路线。

## 最终建议

当前先继续验证配对设备通道：补两台物理 Mac 的 LAN/Tailnet、休眠/断网/重连、大数据量和版本升级矩阵。iCloud adapter 继续保留，但在 Apple Developer 资产、真实签名、CloudKit 环境和双机证据齐全前维持屏蔽。不要传输 live SQLite、浏览器 tab、插件、credential 或终端历史，也不要用 loopback 结果冒充物理双机验证。

P0 若证明 Developer ID KVS 不可用，则不切到 iCloud Documents，而是直接用 CloudKit private DB 的小 `Preference` records；其余 local-first、白名单、账号隔离和 native bridge 设计保持不变。
