# 隐私政策 · Privacy Policy

**扩展名称：AI工具箱（原 DeepSeek 工具箱）**

**适用版本：1.7.0 · 更新日期：2026-11-02**

[中文版](#中文版) · [English](#english)

## 中文版

### 1. 适用范围与基本说明

本政策说明 AI工具箱浏览器扩展如何读取、使用、传输和保存数据。扩展用于理解和学习当前网页或视频内容，提供总结、翻译、分析、追问、练习出题与批改，以及基于自定义提示词的内容生成。

AI 请求由您的浏览器直接发送到您选择并配置的接口，不经过开发者运营的内容中转服务器。本扩展不内置广告、使用情况统计或行为追踪代码，也不要求注册开发者提供的独立账号。

安装或加载扩展后，内容脚本会识别当前页面类型并展示功能入口，设置面板也会读取当前活动标签页的网址以显示工具可用性。扩展不会仅因访问页面而自动提取正文或将内容发送至 AI 服务商；正文、字幕、评论的读取及 AI 请求由您主动运行相应功能触发。

### 2. 处理哪些数据、用于什么功能

| 数据类别 | 内容和用途 |
| --- | --- |
| API 配置与使用偏好 | 您填写的各服务商 API Key、模型 ID、API Base URL、所选服务商、总结风格和输出语言，用于记住配置与调用对应服务 |
| 网页内容与来源信息 | 当前页面可提取的正文，以及按功能需要附带的标题、网址、站点或作者信息，用于网页理解、出题、自定义生成和追问 |
| 视频相关内容 | YouTube 或哔哩哔哩的视频信息与字幕；在评论印证模式下额外读取的热门评论，用于笔记、翻译、分析与学习 |
| 自定义工具 | 您设置的按钮名称、提示词、适用范围和启用状态，用于展示工具按钮并执行对应文本任务 |
| 练习、作答与对话 | 题目、参考答案、评分要点、原文依据、您的作答、追问及部分历史结果，用于生成练习、批改与继续对话 |
| 复制和导出内容 | 您主动复制的生成结果，或主动下载的结果文档、试卷和答案，用于在本机继续使用 |

选择题按参考答案在浏览器中判分，未作答题目本地记零。需要 AI 评估的填空和问答会将对应题目、参考答案、评分要点、作答及来源文字发送至所选服务商。如果全部题目均可本地判分，该次批改不会发起 AI 请求。

普通网页的提取会过滤表单控件、表单区域、可编辑区域、隐藏元素，以及部分导航等非正文区域；不读取跨域 iframe、视频画面或未加载的链接内容。正文过长时会截断并标注范围。过滤并不意味着可读正文不含个人信息：页面上展示的姓名、联系信息、私人通信、业务资料或敏感网址仍可能属于被提取的内容。请在运行功能前确认您有权处理并发送这些资料。

本扩展不使用浏览历史 API 建立访问记录，不通过扩展功能读取密码输入值，也不将数据用于广告画像、出售或与当前功能无关的用途。

### 3. 请求发送给谁

当前支持 DeepSeek、Kimi、MiMo、OpenAI、Claude，以及用户自行配置的 OpenAI Chat Completions 兼容接口。只有当前选定配置的 API Key 会作为认证信息发送给该配置的目标地址，其他服务商的 Key 不会随请求一并发送。

下列链接是服务商的公开入口，具体的数据处理、保留、账号权限、服务区域和费用以其当时公布的条款与控制台说明为准：

- [DeepSeek](https://platform.deepseek.com/)
- [Kimi](https://platform.kimi.com/)
- [MiMo](https://platform.xiaomimimo.com/)
- [OpenAI](https://platform.openai.com/)
- [Claude / Anthropic](https://platform.claude.com/)

您可以修改任何服务商的 API Base URL。修改后，对应 Key 和请求资料会发送到您填写的地址；内置服务商名称并不保证修改后的地址仍属于该服务商。请仅填写您信任的 HTTPS 接口。接收方还可能获得建立网络连接所需的技术信息，如请求来源 IP；其处理由接收方负责。

读取视频字幕和评论时，扩展会向对应视频平台及资源域名发起请求。部分请求使用浏览器已有的平台登录态；扩展没有单独导出平台 Cookie，也不会将这些登录凭证作为 AI 请求参数发送。AI 接口请求不携带浏览器 Cookie。

开发者无法通过本扩展管理已发送到第三方服务的数据，也不代替第三方承诺其保留期限、是否用于训练或能否删除。您需要依据自己的账号类型、地区及服务设置确认这些事项。

### 4. 数据保存在哪里、保存多久

| 存放位置 | 保存的数据 | 保留方式 |
| --- | --- | --- |
| `chrome.storage.sync` | 各家 API Key、模型与接口地址、所选服务商、总结风格、语言，以及旧 DeepSeek 配置的兼容字段 | 跨浏览器重启保留；启用 Chrome 同步时可能同步到同一账号的其他设备 |
| `chrome.storage.local` | 自定义工具的名称、提示词、适用范围和启用状态 | 保存在当前浏览器配置中，不由本扩展自动跨设备同步 |
| 当前页面内存 | 已读取的正文、字幕、评论缓存，生成结果、对话、试卷和作答 | 不自动写入持久化学习记录；通常随完整刷新或关闭页面释放，站内不重新加载的导航可能暂留上一次结果 |
| 系统剪贴板与下载文件 | 您主动复制或导出的内容 | 由操作系统、浏览器及您自行管理，不会因关闭或卸载扩展而自动删除 |

API Key 使用浏览器扩展存储保存，本扩展未对其实施额外的应用层加密，也不提供密码管理器级别的保护。请妥善管理浏览器账号和设备访问权限。Chrome 同步由浏览器提供，受浏览器设置与 Google 的相关规则影响；同步关闭或离线不代表设备上没有本地配置。

编辑、停用或删除自定义工具会更新菜单，但已生成的对话可在页面内存中继续保留当时使用的提示词上下文，直到页面生命周期结束。

### 5. 您如何管理和删除数据

您可以在扩展设置中更换所选服务商、修改并保存 Key、模型和接口地址，也可以编辑、停用或删除自定义工具。停用工具只隐藏其入口，不删除保存的提示词；删除工具不会自动删除既有导出文件、已生成的页面对话或已经发送到服务商的数据。

如需清除当前页面中的结果和作答，可完整刷新或关闭该页面。请先导出需要保留的内容。卸载扩展会清除该浏览器配置中的扩展存储；同步副本的处理还取决于浏览器同步状态，必要时请在其他设备与浏览器同步设置中核对。

卸载扩展、删除配置或关闭页面都不会撤销服务商颁发的 API Key。如需阻止该 Key 继续使用，请在对应服务商的控制台撤销或轮换。已发送数据的查询或删除请求应向接收它的服务商提出；本地下载文件和剪贴板内容需自行清理。

### 6. 权限与安全措施

当前版本声明 `storage`、`activeTab`，以及 HTTP/HTTPS 主机访问范围。`storage` 用于配置和自定义工具；活动页信息用于在设置面板提示工具可用性；网站访问用于展示入口、按需提取正文、访问视频平台接口，以及请求您配置的 AI 服务。

AI 接口地址必须使用 HTTPS，AI 请求不跟随重定向。所有执行的扩展脚本均随安装包提供；自定义提示词属于文本配置，不是可执行插件。模型输出按允许的文档标签和属性展示，不执行其中的脚本或加载其中的远程资源。这些措施不能保证设备、浏览器或所配置的第三方服务绝对安全。

普通 HTTP 网页本身的传输安全由该网站决定，扩展使用 HTTPS 请求 AI 并不使原网页变为安全站点。

### 7. 反馈、变更与联系

功能反馈可通过 [GitHub Issues](https://github.com/NasNeo777/ChromeTools/issues) 提交。隐私问题可联系 [bigbugbbb@gmail.com](mailto:bigbugbbb@gmail.com)。如果您主动发送邮件或提交 Issue，开发者会收到您自行提供的内容；公开 Issue 对其他人可见，请勿在其中提交完整 API Key、私人正文或其他敏感资料。

本政策会随功能和数据处理方式变化更新，并标明更新日期。历史版本仅用于记录，当前政策适用于本文注明的扩展版本。

## English

### 1. Scope and overview

This policy describes how the AI Toolbox browser extension, formerly DeepSeek Toolbox, reads, uses, transmits and stores data. It helps users understand and learn from the current page or video through summaries, translation, analysis, follow-up chat, quizzes, grading and custom prompt tools.

AI requests go directly from your browser to the endpoint you select and configure, without a developer-operated content relay. The extension contains no advertising, usage analytics or behavioral tracking code and requires no separate developer-operated account.

When loaded, content scripts identify the page type and display a launcher. The settings popup also checks the active tab URL to indicate available tools. Visiting a page alone does not trigger extraction of its body or transmission to an AI provider. Reading page text, video transcripts or comments, and making AI requests, are triggered by your use of the corresponding features.

### 2. Data processed and its purposes

| Data | Purpose |
| --- | --- |
| Provider settings and preferences | API keys, model IDs, base URLs, selected provider, summary style and language are used to remember settings and authenticate API calls |
| Page text and source metadata | Extracted text and, where applicable, titles, URLs, site or author information support page understanding, quizzes, custom generation and chat |
| Video content | Video information and transcripts support video tools; popular comments are additionally retrieved for comment analysis |
| Custom tools | Tool names, prompts, scopes and enabled states define menu buttons and text-generation tasks |
| Exercises and conversations | Questions, reference answers, rubrics, source evidence, submitted answers, follow-up questions and selected prior results support quizzes, grading and chat |
| Copied or exported results | Content you choose to copy or download supports further use outside the extension |

Multiple-choice answers and unanswered questions are scored locally. When AI grading is needed, the relevant short-answer or fill-in questions, reference answers, rubrics, submitted answers and source text are sent to the selected provider. A grading submission handled entirely by local scoring makes no AI request.

Page extraction filters out form controls, form areas, editable regions, hidden elements and some navigation content. It does not read cross-origin frames, video pixels or unloaded links. Long source text can be truncated with a notice. Filtering does not guarantee that extracted text contains no personal information: visible names, contact details, private communications, business information or sensitive URLs may be included. Confirm that you are entitled to process and transmit the material before running a feature.

The extension does not use the browsing history API to build a visit log, read password input values through its features, or use data for advertising profiles, sale or purposes unrelated to the requested features.

### 3. Recipients and third-party services

Supported providers are [DeepSeek](https://platform.deepseek.com/), [Kimi](https://platform.kimi.com/), [MiMo](https://platform.xiaomimimo.com/), [OpenAI](https://platform.openai.com/) and [Claude / Anthropic](https://platform.claude.com/), together with user-configured OpenAI Chat Completions-compatible endpoints. Only the key belonging to the currently selected configuration is sent as authentication to its configured destination; keys from other configurations are not included.

You can change the base URL of any provider profile. The corresponding key and request data will then be sent to that address. A built-in provider label does not establish ownership of a modified endpoint. Use only HTTPS endpoints you trust. Recipients may also receive technical information needed for the connection, such as the requesting IP address.

Video features make requests to the relevant platform and resource hosts. Some requests use your existing browser login session on that platform. The extension does not separately export platform cookies or include those login credentials in AI request parameters. AI requests omit browser cookies.

Third-party processing, retention, account access, service region and charges depend on that provider's current terms and your account settings. The developer cannot manage data after it reaches a third party and makes no promise on that party's behalf about retention, training use or deletion.

### 4. Storage and retention

| Location | Data and retention |
| --- | --- |
| `chrome.storage.sync` | Provider keys, models, endpoints, selected provider, preferences and legacy DeepSeek compatibility fields persist across restarts and may sync to other devices on the same Chrome account |
| `chrome.storage.local` | Custom tool names, prompts, scopes and enabled states persist in the current browser profile without automatic cross-device synchronization by this extension |
| Page memory | Extracted content, caches, results, chats, quizzes and answers are not automatically stored as persistent learning records; they generally remain until a full reload or tab closure, and may persist during navigation that does not reload the document |
| Clipboard and downloads | Copied content and exported files are controlled by your operating system, browser and your own actions, and are not automatically deleted when the extension is closed or uninstalled |

Keys are stored using browser extension storage. The extension adds no application-level encryption and does not provide password-manager-level protection. Protect access to your browser account and devices. Chrome synchronization is governed by browser settings and Google's applicable rules; disabled sync or an offline browser does not mean there are no local settings.

Editing, disabling or deleting a custom tool updates its menu entry. An existing conversation can retain the original prompt snapshot in page memory for the rest of the page lifecycle.

### 5. Your controls and deletion

You can change the selected provider, replace and save credentials or endpoints, and edit, disable or delete custom tools. Disabling a tool hides its entry without deleting the saved prompt. Deleting it does not erase prior exports, existing page conversations or data already sent to a provider.

A full reload or tab closure clears the current page state; export anything you wish to retain first. Uninstalling removes extension storage from that browser profile. Handling of synchronized copies also depends on browser sync state, so check other devices and synchronization settings as needed.

Uninstalling, deleting settings or closing a tab does not revoke a provider-issued API key. Revoke or rotate it in the provider's console when necessary. Requests about data already transmitted must be directed to its recipient. Clear local downloads and clipboard content yourself.

### 6. Permissions and security measures

Version 1.7.0 declares `storage`, `activeTab` and HTTP/HTTPS host access. Storage supports settings and custom tools; active-page information supports tool availability indicators; website access supports the launcher, requested text extraction, video platform requests and calls to configured AI services.

AI endpoints must use HTTPS and AI requests do not follow redirects. Executable extension scripts are packaged with the extension. Custom prompts are text settings, not executable plugins. Generated documents are rendered through an allowed set of tags and attributes without executing embedded scripts or loading embedded remote resources. These measures do not guarantee absolute security of your device, browser or third-party endpoint.

An ordinary HTTP page's transport security depends on that website. Sending AI requests over HTTPS does not secure the original page connection.

### 7. Contact and changes

For feature feedback, use [GitHub Issues](https://github.com/NasNeo777/ChromeTools/issues). For privacy questions, email [bigbugbbb@gmail.com](mailto:bigbugbbb@gmail.com). If you voluntarily email or submit an issue, the developer receives the content you choose to include. Public issues are visible to others; never include full API keys, private page text or sensitive information.

This policy will be updated when features or data handling change, with the revision date shown above. Historical versions are retained for reference; this policy describes the extension version identified in this document.
