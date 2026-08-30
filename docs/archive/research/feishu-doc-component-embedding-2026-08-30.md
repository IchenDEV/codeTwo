# 飞书云文档组件与普通文档 iframe 的桌面内嵌研究

- 研究日期：2026-08-30
- 目标场景：CodeTwo macOS 桌面应用中的文档查看与编辑
- 证据范围：飞书开放平台官方文档、官方云文档组件 SDK 1.0.13、飞书官方站点实际响应头
- 结论标签：`官方文档`、`官方 SDK 源码`、`官方响应头`、`工程推断`、`未确认`

## 结论

主方案应使用飞书官方 `DocComponentSdk`，默认采用**用户身份鉴权**，只把 `docs`、`docx`、`wiki`、`sheets` URL 交给组件。CodeTwo 的宿主/Core 负责 OAuth、token、ticket 和签名，渲染层只拿短时、一次性的组件鉴权参数。组件挂载失败时，回退到 CodeTwo 自己的只读内容视图或“在飞书中打开”。

不建议直接写 `<iframe src="普通飞书文档 URL">`。官方没有把普通文档页面定义成嵌入接口；当前 SDK 会先校验 URL，再为 iframe 生成带加密组件会话与功能配置的 URL；在旧文档或未取得加密会话等分支中还会使用 `/component/...` 路由。SDK 随后建立鉴权、错误处理和消息通道。普通 URL 在未登录环境中会进入飞书登录重定向链，桌面 WebView 中的行为会依赖会话和 cookie，不能作为稳定产品契约。

多维表格 Base 与 Slides 不在 SDK 1.0.13 接受的 URL 类型内，不能伪装成“云文档组件支持”。它们应继续走 CodeTwo 的 OpenAPI/自有渲染，或者跳转飞书。

## 方案对比

| 维度 | 官方云文档组件 | 普通文档 URL 直接 iframe |
| --- | --- | --- |
| 官方接入契约 | 有：SDK、鉴权、挂载、功能配置、事件与错误码均有文档 | 未找到官方支持文档 |
| 身份 | 用户身份或应用身份 | 依赖普通网页登录态与文档自身跳转 |
| 权限语义 | 用户身份遵循该用户的文档读写权限；应用身份需预先获得文档权限 | 页面行为，不是开放平台内嵌权限契约 |
| 编辑能力 | 用户身份且用户有权限时可读写；可配置只读 | 不应据浏览器偶然可打开而承诺 |
| 类型 | SDK 1.0.13 接受 `docs`、`docx`、`wiki`、`sheets` | 普通页面可能能打开更多类型，但不是受支持的组件能力 |
| 宿主控制 | 可隐藏头部、标题、分享、评论、目录等，可选择链接在宿主打开 | 没有官方宿主控制 API |
| 错误恢复 | `onAuthError`、`onError`、`onMountTimeout` 和稳定错误码 | 登录跳转、页面改版和 cookie 问题难以区分 |
| CodeTwo 适配 | 推荐 | 不推荐 |

## 1. 支持的文档类型与读写能力

### 1.1 类型边界

当前接入文档没有给出一张显式的类型矩阵，因此以官方 SDK 1.0.13 的实际 URL 校验为准。SDK 内置的正则是：

```text
^((?:docsource:|nativerequest:|https?:\/\/)[^\s]+)\/(docs|docx|wiki|sheets)\/([^\s]{20,})
```

由此得到：

| 类型 | URL 路径 | SDK 1.0.13 |
| --- | --- | --- |
| 旧版文档 | `/docs/<token>` | 支持 |
| 新版文档 | `/docx/<token>` | 支持 |
| 知识库节点 | `/wiki/<token>` | 支持 |
| 电子表格 | `/sheets/<token>` | 支持 |
| 多维表格 | `/base/<token>` | 不支持，进入 `NOT_SUPPORT = -100` |
| Slides | `/slides/<token>` | 不支持 |
| 文件、文件夹等其他 Drive URL | 其他路径 | 不支持 |

来源：飞书官方 [DocComponentSdk 1.0.13](https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/docComponentSdk/lib/1.0.13.js)，访问于 2026-08-30。核验文件长度 238,143 bytes，SHA-256 为 `5a829a7aae1696e4c1478691c03fca2dd4588f807dd025c6e74c8030e2391050`。

`wiki` 被 SDK 接受，只能证明知识库 URL 是合法入口；官方文档没有给出 Wiki、Docs、Sheets 之间完整的编辑特性差异表。因此 CodeTwo 上线前仍需分别做真实租户的读、写、评论和权限不足测试。

### 1.2 读写能力

- `官方文档` 用户身份：组件以当前登录用户身份打开文档；用户没有该文档的读写权限时，无法操作。换言之，组件不会绕过 ACL。
- `官方文档` 应用身份：组件以应用身份打开文档，不检查当前登录用户权限，但应用必须预先获得该文档权限；访问量限制为 100 次/分钟，并且不支持编辑、评论、点赞。
- `官方文档` 功能配置提供 `extensions.content.readonly`，CodeTwo 可以显式切到只读。
- `官方文档` 组件要求应用申请 `drive:drive`，身份类型应与组件鉴权身份一致。成员名片和搜索能力另外需要用户身份权限 `component:user_profile`、`component:selector`。

来源：[开始使用](https://open.feishu.cn/document/uYjL24iN/uYDO3YjL2gzN24iN3cjN/introduction)、[组件 SDK 鉴权流程](https://open.feishu.cn/document/uYjL24iN/uUDO3YjL1gzN24SN4cjN)、[功能配置](https://open.feishu.cn/document/uYjL24iN/uYDO3YjL2gzN24iN3cjN/feature-config)，均访问于 2026-08-30。

应用类型还有一条硬限制：网页组件只适用于企业自建应用，暂不支持商店应用。官方同时说明组件适用于普通 Web 页面，不建议在小程序 WebView 使用。macOS 的 WKWebView/Electrobun 不等同于小程序 WebView，但官方文档也没有明确为它背书，所以真机 WebView 验证仍是发布门槛。

## 2. SDK、初始化与挂载

当前官方 SDK：

```html
<script src="https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/docComponentSdk/lib/1.0.13.js"></script>
```

基本初始化：

```js
const component = new window.DocComponentSdk({
  src: documentUrl,
  mount: document.querySelector('#doc-pos'),
  auth: {
    openId,
    signature,
    appId,
    timestamp,
    nonceStr,
    url,
    jsApiList: ['DocsComponent'],
  },
  onAuthError: refreshAndRemount,
  onError: showDocumentError,
  onMountTimeout: showTimeoutFallback,
});

await component.start();
// 挂载成功后才能调用：
component.setFeatureConfig(featureConfig);
component.invoke(eventName, ...args);
component.register(eventName, handler);

// 页面切换或插件卸载：
component.destroy();
```

组件容器必须有固定高度。官方明确警告：不设固定高度会全量加载文档并造成性能问题。

CodeTwo 建议的功能配置：隐藏与桌面壳重复的头部、标题、分享和全屏入口；需要只读预览时设置 `readonly`；将超链接和图片预览配置为 `outer`，由宿主统一处理新窗口与下载。配置必须在挂载成功后调用，或者作为初始化 `config` 传入。

来源：[开始使用](https://open.feishu.cn/document/uYjL24iN/uYDO3YjL2gzN24iN3cjN/introduction)、[功能配置](https://open.feishu.cn/document/uYjL24iN/uYDO3YjL2gzN24iN3cjN/feature-config)，访问于 2026-08-30。

## 3. 鉴权、签名与用户授权

### 3.1 推荐的用户身份链路

1. CodeTwo 发起飞书网页 OAuth，取得一次性授权码 `code`。
2. Core/宿主用 `code` 换取 `user_access_token`，保存 token 与 refresh token；不要把应用密钥放进渲染层。
3. Core 调用 `POST https://open.feishu.cn/open-apis/jssdk/ticket/get`，`Authorization: Bearer <user_access_token>`，取得有效期 7,200 秒的 `jsapi_ticket`。
4. Core 按固定顺序拼接：

   ```text
   jsapi_ticket=<ticket>&noncestr=<nonce>&timestamp=<ms>&url=<embedding-page-url>
   ```

   然后计算 SHA-1 签名。
5. 将 `openId`、`signature`、`appId`、`timestamp`、`nonceStr`、`url`、`jsApiList: ['DocsComponent']` 作为短时参数传给渲染层并创建组件。

签名中的 `url` 是**承载组件的页面 URL**，不是被打开的飞书文档 URL；必须去掉 `?`、`#` 及其后内容。`nonceStr`、`timestamp`、`url` 必须与签名输入完全相同。签名自时间戳起有效 10 分钟，并且只能鉴权一次；不能复用一个签名反复挂载。

官方要求获取 ticket 的步骤放在服务端，以降低泄漏风险。对 CodeTwo 而言，Core/宿主就是这条安全边界。

来源：[组件 SDK 鉴权流程](https://open.feishu.cn/document/uYjL24iN/uUDO3YjL1gzN24SN4cjN)，访问于 2026-08-30。

### 3.2 OAuth 重定向 URL

- `redirect_uri` 必须 URL 编码。
- 接收 OAuth 回调的 HTTP GET 地址必须预先加入开发者后台“安全设置”的重定向 URL 列表；只有列表内地址会通过安全校验。
- OAuth 返回的 `code` 有效期 5 分钟且只能使用一次；必须校验原样返回的 `state`，官方明确说明它可用于防止 CSRF。
- 需要 refresh token 时，授权范围中要包含 `offline_access`。

对桌面应用的含义：开发和生产回调地址都应明确、稳定并各自登记。官方只文档化了 HTTP(S) GET 回调，没有找到对 `file:`、Electrobun 私有 scheme 或任意动态端口回调的承诺。CodeTwo 若要使用自定义 scheme，应先在真实应用配置与真实 macOS 构建中验证；保守方案是已登记的 HTTPS 回调页完成 OAuth 后再安全地唤回桌面应用。

来源：[获取授权码](https://open.feishu.cn/document/common-capabilities/sso/api/obtain-oauth-code)、[第三方网站免登](https://open.feishu.cn/document/ukTMukTMukTM/uETOwYjLxkDM24SM5AjN)，访问于 2026-08-30。

## 4. Origin、cookie、CORS、CSP 与 X-Frame-Options

### 4.1 Web origin

`官方文档` 组件鉴权把签名绑定到承载页 URL，且忽略 query/hash。这要求 CodeTwo 给组件页面一个稳定的 HTTP(S) URL，并用同一个规范化结果完成签名和初始化。页面路径或 origin 改变后应重新签名。

`工程推断` 若 CodeTwo 自己设置了 CSP，至少要允许：

- `script-src` 加载 `https://sf1-scmcdn-cn.feishucdn.com`；
- `frame-src` 加载实际租户的 `https://<tenant>.feishu.cn` 组件路由；
- 宿主网络策略访问 `https://open.feishu.cn` OAuth、OpenAPI 与 ticket 接口。

这是 CodeTwo 自身的策略配置，不是飞书替宿主自动放开的权限。

### 4.2 官方响应头核验

2026-08-30 对官方资源进行无登录请求，得到：

| 资源 | 结果 | 与嵌入有关的响应头 |
| --- | --- | --- |
| SDK 1.0.13 | `200 application/javascript` | `Access-Control-Allow-Origin: *`；`Cache-Control: max-age=2592000` |
| 由官方 SDK 路由规则与官方示例 token 构造的组件路由 `https://bytedance.feishu.cn/component/docx/RVx9dHXxMonmtVxTA3UcjHunnCu` | `200 text/html` | 本次响应未出现 `X-Frame-Options`、CSP 或 ACAO；`Cache-Control: no-store` |
| 官方 demo 文档普通 URL `https://guochangyu.feishu.cn/docs/doccnrCCzAskD8m6DDB9sO17IUg?br=master` | `302` 到 `accounts.feishu.cn` 登录页 | 本次首个响应未出现 `X-Frame-Options` 或 CSP；`Cache-Control: no-store` |

普通 URL 的登录重定向链设置了多个 `.feishu.cn` / `feishu.cn` 域 cookie，样本包含 `Secure`，部分包含 `HttpOnly`；本次样本的 `Set-Cookie` 未出现显式 `SameSite`。这些只是当日响应事实，不是稳定兼容承诺。直接 iframe 因而会把能否显示文档绑定到 WebView 的飞书登录会话、cookie 分区和后续登录页行为。

两个边界必须分清：

1. 没有观察到 `X-Frame-Options` 或 `frame-ancestors`，只能说明**这次响应没有显式用这些头阻止 iframe**，不能推出普通文档 URL 获得官方支持。
2. SDK 脚本允许跨 origin 加载，不等于文档 HTML 支持跨 origin XHR。官方组件的工作方式是 iframe 加 SDK 消息通道，官方没有提供把普通文档 HTML 当作 CORS API 抓取或反向代理的契约。

来源：[SDK 1.0.13](https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/docComponentSdk/lib/1.0.13.js)、[官方组件文档中的示例文档](https://bytedance.feishu.cn/docx/RVx9dHXxMonmtVxTA3UcjHunnCu)、[官方组件 demo](https://open.feishu.cn/web-component/docs-component/?source=open_platform) 及其使用的[示例文档](https://guochangyu.feishu.cn/docs/doccnrCCzAskD8m6DDB9sO17IUg?br=master)，响应头均核验于 2026-08-30。

## 5. 组件是否只是 iframe

是，但“使用 iframe”不等于“普通文档 URL 直接 iframe”。

`官方 SDK 源码` 明确执行 `document.createElement("iframe")`，设置 `allowFullscreen` 与 `allow="fullscreen; clipboard-read *; clipboard-write *; local-network-access *"`，把 iframe 挂入 `mount` 节点，并在 `destroy()` 时移除。SDK 还会：

- 校验 URL 只属于 `docs|docx|wiki|sheets`；
- 生成带加密组件会话、功能配置和挂载信息的 iframe URL；在旧文档或未取得加密会话等分支中使用 `/component/<type>/<token>` 路由；
- 附加鉴权会话、功能配置、主题、尺寸等参数；
- 建立宿主与 iframe 的消息通道和握手；
- 代理错误、链接、图片预览、下载、遮罩、尺寸与主题更新；
- 提供 `start`、`destroy`、`setFeatureConfig`、`invoke`、`register` 等稳定 API。

因此，官方组件的价值不是消灭 iframe，而是把 iframe 变成一个受支持、可鉴权、可配置、可诊断的集成边界。绕过 SDK 会同时失去这个边界。

来源：飞书官方 [DocComponentSdk 1.0.13](https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/docComponentSdk/lib/1.0.13.js)，访问于 2026-08-30。

## 6. 失败与离线降级

官方组件定义了以下主要错误：无权限 `4`、已删除 `1002`、找不到 `1004`、网络错误 `-8`、后端请求失败 `1`、URL 不支持 `-100`、加载失败 `-500`。官方还要求鉴权失败后重新鉴权。

CodeTwo 推荐行为：

| 情况 | 处理 |
| --- | --- |
| `onAuthError` / 签名过期 | Core 刷新 token/ticket、生成新签名，只重挂载一次；仍失败则进入错误态 |
| 无权限 `4` | 显示真实权限错误与“申请权限 / 在飞书中打开”，不要自动换应用身份绕过用户 ACL |
| 删除 `1002` / 找不到 `1004` | 显示资源失效，允许从 CodeTwo pin/最近列表移除 |
| 网络 `-8` / 请求失败 `1` / 挂载超时 | 显示断网或加载失败；若已有 OpenAPI/Markdown 缓存则显示带“可能已过期”标记的只读快照；提供重试和外部打开 |
| 不支持 `-100` | Base、Slides 等转到 CodeTwo 自有渲染或外部打开，不尝试普通 iframe |
| 离线 | 不初始化组件；只显示本地缓存的只读快照和最后同步时间 |

只读快照与离线策略是 `工程推断`：官方组件文档没有承诺离线能力，也没有提供离线缓存 API。缓存内容必须明确标注陈旧状态，并继续遵守本地数据保护和用户登出清理策略。

## 7. CodeTwo 的明确决策

### 主方案

1. 企业自建飞书应用。
2. 用户身份 OAuth，申请最小必要的 `drive:drive` 与 `offline_access`；成员卡片/搜索按需申请额外 scope。
3. Core 保存并刷新 token、获取 ticket、签名；渲染层不持有 app secret。
4. 对 `docs|docx|wiki|sheets` 使用官方 `DocComponentSdk 1.0.13`。
5. 用官方 feature config 去除与 CodeTwo 重复的 chrome，并让外链/预览回到宿主管理。
6. 用官方错误回调驱动恢复和降级；离线只显示带时间戳的只读缓存。
7. 在真实 macOS 打包应用中验证登录、第三方 cookie/会话、读写、评论、链接、下载、深色模式、销毁重挂载和多租户域名。

### 不建议方案

- 直接 iframe 普通飞书文档 URL。
- 注入或复制飞书登录 cookie、反向代理或重写飞书文档 HTML。
- 把应用身份作为默认交互身份；它没有编辑、评论、点赞且有 100 次/分钟限制。
- 把 Base、Slides 宣称为云文档组件支持类型。
- 把 app secret、长期 user token 或 ticket 生成逻辑放进 renderer/plugin UI。
- 遇到用户无权限时悄悄切到应用身份，绕过用户可见的 ACL 语义。

## 8. 仍不确定、必须验证的事项

1. 官方文档没有明确认证 macOS WKWebView/Electrobun；需要真实打包应用验证，而不是只在 Vite 浏览器中通过。
2. SDK 接受 Wiki 与 Sheets URL，但没有给出各类型完整功能矩阵；编辑、评论、分享和复杂内容应逐类型验收。
3. 官方没有把普通文档页面的 CSP、X-Frame-Options、cookie 属性作为公开稳定契约；响应头探测不能替代组件 API。
4. 官方 OAuth 文档未确认 CodeTwo 私有 scheme 是否可作为回调 URL；默认按已登记 HTTPS 回调设计。
5. 飞书与 Lark 国际版的 SDK CDN、账号域名、租户域和 OAuth 配置可能不同；本报告验证的是飞书中国站路径。
6. Base 需要独立的官方组件或 CodeTwo 自有 OpenAPI 渲染方案；截至本次核验，Docs 组件 1.0.13 不接受 `/base/`。

## 官方来源清单

| 来源 | URL | 访问日期 | 用途 |
| --- | --- | --- | --- |
| 云文档组件：开始使用 | https://open.feishu.cn/document/uYjL24iN/uYDO3YjL2gzN24iN3cjN/introduction | 2026-08-30 | 应用类型、权限、SDK、初始化、错误码 |
| 组件 SDK 鉴权流程 | https://open.feishu.cn/document/uYjL24iN/uUDO3YjL1gzN24SN4cjN | 2026-08-30 | 用户/应用身份、ticket、签名、时效 |
| 云文档组件功能配置 | https://open.feishu.cn/document/uYjL24iN/uYDO3YjL2gzN24iN3cjN/feature-config | 2026-08-30 | 只读、头部、链接、图片、评论等宿主控制 |
| 获取授权码 | https://open.feishu.cn/document/common-capabilities/sso/api/obtain-oauth-code | 2026-08-30 | redirect URL、state、PKCE、scope、offline_access |
| 第三方网站免登 | https://open.feishu.cn/document/ukTMukTMukTM/uETOwYjLxkDM24SM5AjN | 2026-08-30 | OAuth 总流程、重定向 URL 配置 |
| DocComponentSdk 1.0.13 | https://sf1-scmcdn-cn.feishucdn.com/obj/feishu-static/docComponentSdk/lib/1.0.13.js | 2026-08-30 | 类型校验、iframe、组件路由、消息通道、响应头 |
| 官方组件 demo | https://open.feishu.cn/web-component/docs-component/?source=open_platform | 2026-08-30 | 官方组件入口与示例文档 |
