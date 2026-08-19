# 架构

Code2 由一个 Rust 核心和三个前端组成。核心不感知具体 UI；各前端通过精简的提交/事件接口驱动它。

## 分层结构

```text
                       crates/core（Rust 库：核心逻辑，不含 UI）
   ┌──────────────────────────────────────────────────────────────────────┐
   │  acp        通过 stdio 连接 ACP（JSON-RPC 对等端与线协议类型）       │
   │  engine     驱动提供方，将操作转换为事件                             │
   │  provider   后端启动配置与可用性注册表                               │
   │  session    会话、消息与内容片段模型                                 │
   │  store      SQLite 持久化（会话与记录）                              │
   │  memory     项目级 L0–L3 捕获、搜索与回忆                            │
   │  skill      技能库、市场与“文档→提示词”编译器                        │
   │  permission 按工具和 glob 执行询问/允许/拒绝，并支持多种模式          │
   │  git        状态、检查点、差异、提交与推送                           │
   │  worktree   每个会话对应一个 git worktree                            │
   │  browser    将浏览器标注转为提示词上下文                             │
   │  keymap     跨界面共享快捷键                                         │
   │  pty        内嵌终端 PTY                                             │
   └───────────▲───────────────────────▲──────────────────────▲───────────┘
        Tauri 桌面端              ratatui TUI          codetwo-server（远程）
     （React + BlockNote）        （crates/tui）          （Axum WebSocket）
```

## SQ/EQ 接口

前端不会直接操作 ACP。前端写入 **Op**（如 `NewSession`、`Prompt`、`Cancel`、`AnswerPermission`、`SetPermissionMode`、`SetModel`），并消费 **Event** 流（如 `AgentText`、`ToolCall`、`PermissionRequest`、`TurnEnded`、`Error`）。详见 [Op / Event 协议（英文）](/reference/protocol)。

- **桌面端**通过 Tauri command 转发 Op，并通过 channel 接收 Event。
- **TUI** 在进程内调用引擎，并在绘制循环中渲染 Event。
- **服务端**从 WebSocket 客户端接收 Op，再向客户端广播 Event。

这就是 Code2 的 Submission Queue / Event Queue 模式：一个智能体循环，对应多种渲染界面。

## 引擎

引擎管理会话，为每个会话启动并初始化提供方，同时实现 ACP 客户端回调。它把 `session/update` 转换为 Event；遇到 `session/request_permission` 时，则依据权限策略自动回答，或暂停请求并向 UI 发出 `PermissionRequest`，等待 UI 使用 `AnswerPermission` 回应。

引擎会在收到第一条提示词时延迟创建 ACP 会话，使文档中的 MCP 服务器能随 `session/new` 一起挂载；每轮任务开始前还会自动为工作区创建检查点。

## ACP 客户端

ACP 客户端是一个精简、独立的 JSON-RPC 2.0 对等端，运行在异步字节流之上。生产环境使用子进程 stdio，测试环境使用内存双工流。手写的线协议类型让 Code2 不依赖任何单一适配器版本；未知更新会被记录并忽略，而不会导致程序崩溃。

## 持久化

Code2 使用一个 SQLite 数据库（`~/.codetwo/codetwo.db` 或平台数据目录），以数据行存储会话，以有序内容片段列表存储会话记录。只要不同界面打开的是同一个数据库文件，会话列表与历史记录就可以共享。

数据库还保存与提供方无关的[项目记忆（英文）](/guide/memory)。原始 L0 证据留在会话记录中；L2 事件即时生成，稳定的 L1/L3 知识则从延迟候选队列中整合。会话读写策略和外部上下文来源共同限制学习行为。每个加入当前任务、但不写入持久化用户记录的受限不可信回忆块，都会生成可检查的任务回执。单一提供方会话内部仍以提供方原生 ACP 上下文作为连续性的来源。

## 测试

高风险核心流程可以完全离线测试：ACP 提示词循环和权限暂停机制使用内存双工流连接模拟智能体；git 与 PTY 测试调用真实 `git` 和 shell；服务端测试执行真实 WebSocket 握手。整个过程不需要安装提供方程序，也不需要网络。
