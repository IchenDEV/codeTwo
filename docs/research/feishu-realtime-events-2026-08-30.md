# 飞书消息、云文档与多维表格实时事件调研

> 日期：2026-08-30  
> 范围：飞书能力只以开放平台官方文档与官方 SDK 文档为依据；另审计当前 C2/Feishu 插件源码以判断接入缺口。不代表权限已经在目标租户获批，也不代表实时同步已经实现。

证据标记：`[事实]` 为飞书官方资料直接支持；`[源码审计]` 为当前本地实现的可见行为；`[推断]` 为基于官方事件边界与当前 C2 插件协议作出的工程判断。

## 结论

1. **新消息实时事件存在。** 事件标识为 `im.message.receive_v1`，企业自建应用可通过飞书官方 SDK 建立 WebSocket 长连接接收，不需要公网回调地址。
2. **它不是“以当前用户身份监听该用户所有会话”的事件。** 官方把 `im.message.receive_v1` 列为应用身份事件，前提是启用机器人能力；能收到的是用户发给机器人的单聊，以及机器人所在群内、权限允许范围内的消息。它不能实时镜像当前用户与同事之间的普通私聊。
3. **飞书的一键智能体默认模板已经配置 WebSocket、接收消息、reaction 增删以及机器人进出群事件。** 但当前 Feishu 插件明确使用 `preset: false`，没有继承这些默认事件；必须先通过 `addons` 增量补齐事件与应用身份权限，再在 Runtime 中启动官方 `WSClient`。
4. **云文档和多维表格支持按资源订阅，且支持用户身份订阅。** 但必须对每个目标文档/多维表格调用订阅 API；只有资源拥有者或管理者能订阅。普通“可查看/可编辑但不是管理者”的资源无法靠该接口保证实时更新。
5. **产品语义必须诚实区分。** 飞书侧边栏里的红点可以表示“C2 自上次查看后收到的新事件”，但不能冒充飞书客户端的全局未读数；任意联系人私聊和只读文档都没有官方事件覆盖。

## 能力矩阵

| 资源 | 官方实时事件 | 订阅身份 | 主要覆盖范围 | 关键限制 |
|---|---|---|---|---|
| 新消息 | `im.message.receive_v1` | 应用身份 | 发给机器人的单聊；机器人所在群中 @ 机器人或权限允许的群消息 | 不能监听用户与同事的普通私聊；需要机器人能力和消息权限 |
| reaction 新增/删除 | `im.message.reaction.created_v1` / `im.message.reaction.deleted_v1` | 应用身份 | 应用可见消息上的 reaction | 一键智能体应用已默认订阅 |
| 文档内容变更 | `drive.file.edit_v1` | 应用或用户身份，先按文件订阅 | `docx`、`sheet`、`bitable`、`slides` 等被订阅资源 | 事件只给资源标识和操作人等元数据，需要重新读取正文 |
| 多维表格记录变更 | `drive.file.bitable_record_changed_v1` | 应用或用户身份，先按 Base 订阅 | 新增、删除、修改记录及前后字段值 | 公式字段值变化不触发，事件体也不包含公式字段值 |
| 多维表格字段变更 | `drive.file.bitable_field_changed_v1` | 应用或用户身份，先按 Base 订阅 | 新增、删除、修改字段 | 同时还会触发 `drive.file.edit_v1`，消费端必须去重/合并 |
| 文件夹中新建文件 | `drive.file.created_in_folder_v1` | 应用或用户身份，先按文件夹订阅 | 被订阅文件夹中的新文件 | 只覆盖“创建”，不代替对子文档内容变更的逐文件订阅 |

## 1. 消息事件的真实边界

### 存在实时接收事件

`[事实]` [接收消息](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)事件的标识是 `im.message.receive_v1`，支持企业自建应用和商店应用。事件体包含：

- `message_id`、`chat_id`、`chat_type`；
- 创建/更新时间；
- 消息类型和序列化后的内容；
- 发送者、@ 提及和话题 ID。

官方同时提示：特殊情况下会重复推送，消息消费应使用 `message_id` 去重，而不是依赖 `event_id`。

### 不是用户身份的“全量收件箱”

`[事实]` 消息事件页面要求应用开启机器人能力，权限按以下范围决定实际推送内容：

- 机器人单聊：`im:message.p2p_msg:readonly`（或历史权限 `im:message.p2p_msg`）；
- 群内 @ 机器人：`im:message.group_at_msg:readonly`，如需同时接收其他机器人 @ 当前机器人则使用 `im:message.group_at_msg.include_bot:readonly`；
- 群内全部用户消息：`im:message.group_msg` 或页面列出的只读权限 `im:message.group_msg:readonly`；包含其他机器人消息时使用 `im:message.group_msg.include_bot:read`。

`[事实]` [事件概述](https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM)说明，大多数事件使用应用身份订阅；需要或支持用户身份订阅的业务明确列为云文档、日历和邮箱，IM 消息不在其中。飞书的[一键创建智能体应用配置](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/overview)也明确把 `im.message.receive_v1` 以及 reaction、机器人进出群事件全部列为**应用身份**事件。

`[推断]` 因此，给现有 OAuth 登录补一个用户权限，不能把 `im.message.receive_v1` 变成当前用户所有聊天的事件流。若 C2 当前通过用户 API 展示了普通联系人会话，这些会话仍只能在打开/聚焦时做增量读取，不能声称已获得全量实时推送。

### 一键创建应用已经提供的能力

`[事实]` 官方一键创建智能体应用默认使用 WebSocket 长连接，并预置：

- `im.message.receive_v1`；
- `im.message.reaction.created_v1`；
- `im.message.reaction.deleted_v1`；
- `im.chat.member.bot.added_v1`；
- `im.chat.member.bot.deleted_v1`；
- `drive.notice.comment_add_v1`。

默认权限覆盖机器人单聊、群内 @ 机器人、消息读取/发送、reaction 读写等，但没有默认申请“群内所有消息”权限。需要额外权限或事件时，[Node.js 一键创建应用文档](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/scan-to-create-an-app-in-one-click-nodejs)允许通过 `addons.scopes` 和 `addons.events.items.tenant/user` 增量申请，并要求用户扫码确认；`addons` 不能删除基础模板中的权限。

### 当前 Feishu 插件还没有订阅这些事件

`[源码审计]` 当前社区插件的 `encodeRegistrationAddons()` 使用 `preset: false`，只传入 `scopes`，没有传入 `events`。它申请了“以用户身份读取聊天历史”的用户权限，但应用身份权限只有发送消息等基础项。按照官方身份边界，这些用户权限不能代替 `im.message.receive_v1` 的应用身份事件配置。

因此现有应用需要通过同一注册/更新流程增量补齐：

- `addons.events.items.tenant`：至少包含 `im.message.receive_v1`、`im.message.reaction.created_v1`、`im.message.reaction.deleted_v1`；
- `addons.scopes.tenant`：至少包含机器人单聊、群 @ 机器人和 reaction 读取所需权限；
- 若确定需要机器人所在群内的全部消息，再单独申请对应群消息权限，不应默认扩大范围。

`[推断]` 已创建应用不能只升级本地插件代码；飞书端的权限/事件配置也必须经过一次用户扫码确认。确认成功后，长连接本身才有事件可收。

## 2. 云文档和多维表格事件

### 必须先订阅具体资源

`[事实]` [订阅云文档事件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/subscribe)是一个按 `file_token` 调用的 API，支持 `tenant_access_token` 或 `user_access_token`。调用成功、且开发者后台已添加相应事件后，资源变化才会被推送。

约束如下：

- 仅文档拥有者和文档管理者可以订阅；
- 应用身份订阅只能覆盖应用本身作为拥有者或管理者的资源；
- 用户身份订阅只能覆盖该用户作为拥有者或管理者的资源；
- 对普通文档、电子表格和多维表格只能一次订阅该类型下的所有相关文档事件，不能选择其中某几个事件；
- 文件夹可单独使用 `file.created_in_folder_v1` 订阅文件创建。

`[推断]` C2 最合理的触发时机是：用户 pin 文档/Base，或首次打开一个可管理资源时执行订阅；unpin 时调用官方取消订阅接口。不能在登录时尝试订阅用户全部可见文档。

### 文档变更是“失效通知”，不是正文增量

`[事实]` [文件编辑事件](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/event/file-edited) `drive.file.edit_v1` 返回 `file_type`、`file_token`、操作人列表和订阅者列表，不包含被编辑的文档块或正文 diff。

`[推断]` 收到事件后应把对应资源标记为 stale；如果资源正在屏幕中展示，立即调用读取 API 重新获取内容；若资源未打开，只更新摘要/更新时间并推迟正文读取。这样是事件驱动的 read-after-event，不是周期轮询。

### Base 可以消费更细的事件

`[事实]` [多维表格记录变更](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/events/bitable_record_changed)会提供 `table_id`、`revision`、操作人、变更记录 ID、`record_added` / `record_deleted` / `record_edited` 以及变更前后字段值。限制是公式字段值变化不触发事件，事件体也不带公式字段值。

`[事实]` [多维表格字段变更](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/events/bitable_field_changed)会提供字段新增、删除、修改及 Base revision。字段变更还会同时产生 `drive.file.edit_v1`。

`[推断]` Base 列表可优先增量 upsert；出现 revision 跳跃、公式字段、解析失败或字段结构变化时，再按 Base/table 做一次定向重读。

## 3. 投递方式和可靠性

`[事实]` [事件概述](https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM)提供两种方式：

1. **WebSocket 长连接**：使用飞书官方服务端 SDK，由客户端主动连接开放平台；只要求本机能访问公网，不要求公网 IP、域名或回调服务器。
2. **Webhook**：开放平台向开发者提供的公网地址发送 HTTP POST。

`[事实]` [使用长连接接收事件](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/request-url-configuration-case)还有以下限制：

- 只支持企业自建应用；商店应用必须使用 Webhook；
- 处理函数需要在 3 秒内完成且不能抛异常；
- 每个应用最多 50 条连接；
- 多 client 是集群消费，**不是广播**，同一事件只会随机投递给其中一个 client。

`[事实]` 事件投递是“至少一次”。处理失败时会按 15 秒、5 分钟、1 小时、6 小时重试，最多 4 次；即使成功也可能重复，因此需要幂等。v2 事件可用 `event_id` 去重；消息事件官方进一步要求以 `message_id` 做业务幂等。

`[推断]` 桌面插件应快速解析、持久化 event envelope 后立即返回，把正文读取、头像下载和 UI 渲染放到异步队列。长连接的鉴权与加密由官方 SDK 处理。为了处理断线、应用退出以及文档事件不含正文，仍需在重连或窗口重新激活时做一次**定向对账**；这不是定时轮询，而是恢复路径。

`[推断]` 同一飞书 App ID 在多台 C2 客户端同时建立长连接时，事件会被随机分流，不能保证每台机器都显示同一红点。若产品要求多设备一致，需要单一事件所有者加持久化同步，或使用服务端 Webhook 接收后向各设备广播；不能直接启动多个本地 `WSClient` 当作广播。

## 4. 对 C2 插件模型的影响

当前 C2 插件协议已经允许 Runtime 通过 `event/emit` 向 Host 发送通知，但存在两个不适合直接承载飞书实时数据的边界：

- Runtime 目前由首次命令调用惰性启动；没有启动就没有飞书 WebSocket，登录完成后也收不到后台新事件；
- 当前 JSON event bus 是 host-wide，飞书消息正文和文档内容属于敏感数据，不应直接广播到通用总线。

建议增加一个 Host 管理的、所有权与 realm 隔离的 Connector 事件通道，而不是让飞书插件私设 UI 或让 Renderer 直接连接飞书：

```text
飞书 WebSocket
    │ 应用身份事件
    ▼
Feishu plugin runtime
    │ connector/event（typed、bundle-owned、user realm）
    ▼
C2 connector event router
    ├─ 幂等库：event_id / message_id / resource revision
    ├─ 会话缓存：消息 upsert、reaction、撤回
    ├─ 资源缓存：stale 标记、定向重新读取
    └─ UI store：列表摘要、红点、当前详情即时更新
```

建议的最小 Host 契约：

- `connection.activate` 成功且插件 Enabled + Trusted 后，Host 保持用户 realm Runtime 存活；
- Runtime 发出 `connector/event`，envelope 至少包含 `connectorId`、`connectionId`、`kind`、`sourceEventId`、`occurredAt`、`resourceKey`、`payload`；
- Host 验证事件只能来自拥有该 Connector 的 Bundle，并只路由到同一用户 realm；
- 消息使用 `message_id` upsert，文档使用 `file_token` 标记 stale，Base 使用 `file_token + table_id + revision`；
- 红点采用 C2 本地 `lastSeenAt/lastSeenMessageId`，并在界面中避免宣称它是飞书全局未读数；
- 禁用、取消信任、退出登录或卸载插件时，Host 必须停止 WS Runtime 并清除订阅路由；资源的远端取消订阅可在用户明确 unpin/断开连接时执行。

## 5. 推荐落地顺序

1. **补齐应用配置**：当前插件使用 `preset: false`，通过注册/更新 `addons` 增量申请消息、reaction 和文档/Base 所需权限与事件，让用户扫码确认。
2. **消息 MVP**：启动官方 Node `WSClient`，消费 `im.message.receive_v1` 和 reaction 增删事件；先覆盖机器人单聊和 @ 机器人群聊。
3. **Host 实时通道**：实现 realm-private `connector/event`、幂等持久化、连接状态和 Runtime 常驻生命周期；再接红点与当前对话即时更新。
4. **文档/Base**：pin/打开时以用户身份调用云文档订阅 API；接入 `drive.file.edit_v1`、Base 记录/字段变更和定向 read-after-event。
5. **恢复与降级**：断线重连、事件重复、revision 跳跃、权限被收回时做定向对账；只读文档与普通联系人会话使用“打开时刷新”，不要伪装成实时。
6. **再评估全群消息**：只有确有产品需求且管理员接受隐私范围时，增量申请群内全部消息权限；默认保持最小权限。

## 官方来源

- [一键创建飞书智能体应用](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/overview)
- [Node.js 扫码一键创建应用与 addons](https://open.feishu.cn/document/mcp_open_tools/integrating-agents-with-feishu/scan-to-create-an-app-in-one-click-nodejs)
- [事件概述：订阅身份、投递方式、重试和幂等](https://open.feishu.cn/document/ukTMukTMukTM/uUTNz4SN1MjL1UzM)
- [使用 WebSocket 长连接接收事件](https://open.feishu.cn/document/ukTMukTMukTM/uYDNxYjL2QTM24iN0EjN/event-subscription-configure-/request-url-configuration-case)
- [接收消息 `im.message.receive_v1`](https://open.feishu.cn/document/server-docs/im-v1/message/events/receive)
- [订阅云文档事件](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/subscribe)
- [文件编辑 `drive.file.edit_v1`](https://open.feishu.cn/document/ukTMukTMukTM/uUDN04SN0QjL1QDN/event/file-edited)
- [多维表格记录变更](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/events/bitable_record_changed)
- [多维表格字段变更](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/events/bitable_field_changed)
- [文件夹下文件创建](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/reference/drive-v1/file/events/created_in_folder)
