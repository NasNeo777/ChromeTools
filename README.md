# DeepSeek 工具箱

由 DeepSeek 驱动的浏览器小工具集合。设计成可扩展结构 —— 共用一套 DeepSeek 配置，每个工具是独立模块。

**当前工具（YouTube + 哔哩哔哩，三种模式）：**
- 📝 **总结为中文文档** —— 抓取字幕，一键生成结构化中文笔记。
- 🌐 **翻译原文** —— 逐句全文翻译，保留时间戳，不做总结。
- 🔍 **批判性分析** —— 公允评估博主说得是否有道理：先肯定合理之处，再指出存疑/夸大；逐条评估论据强度，识别「巴纳姆效应、抬高讨好、制造焦虑、诉诸虚假权威」等手法（区分正常修辞与操纵），匹配国际经典骗局原型，核查科学依据，给可信度 + 价值双评分。
- 💬 **评论印证** —— 读取热门评论 + 视频文字稿一起分析：判断评论能否**佐证**视频，并主动识别「粉丝附和（≠独立印证）、回音室、刷屏/控评、幸存者偏差、高赞≠正确」等陷阱，重视质疑声而非一味吹捧。

> 抓字幕/评论的逻辑按平台分开（`content-youtube.js` / `content-bilibili.js`），四种模式只是交给 DeepSeek 的提示词不同，因此两个平台都同时拥有这四种能力。同一视频的字幕与评论会缓存，切换模式不重复抓取。

## 安装（开发者模式）
1. Chrome 打开 `chrome://extensions/`
2. 右上角开启「开发者模式」
3. 「加载已解压的扩展程序」→ 选择本文件夹
4. 点扩展图标，填入 **DeepSeek API Key**（https://platform.deepseek.com/api_keys ），保存

## YouTube 视频总结 · 用法
1. 打开任意**有字幕(CC)**的 YouTube 视频
2. 点标题下的「📝 总结为中文文档」
3. 右侧面板出现总结，可复制或下载 .md

> 没有字幕轨道的视频无法获取文字稿，会提示更换。

## 哔哩哔哩视频总结 · 用法
1. **先登录 B 站**（字幕列表接口需要登录态）
2. 打开任意**有字幕（含 AI 字幕）**的视频页 `bilibili.com/video/...`
3. 点**右下角浮动**的「📝 总结」/「🌐 翻译」/「🔍 批判性分析」/「💬 评论印证」

> B 站页面由 Vue 渲染，工具条做成右下角浮动（挂在 `document.body`），不插入 B 站的 DOM 树，避免触发 Vue 重渲染报错而连带影响评论 / 右栏加载。

> 很多 B 站视频本身没有字幕；未登录或无字幕时会给出提示。分 P 视频会按当前 `?p=` 抓取对应分集。

## 项目结构
| 文件 | 作用 |
|------|------|
| `manifest.json` | MV3 配置 |
| `tools.js` | **工具注册表**（共享给 popup），新增工具改这里 |
| `popup.html` / `popup.js` | 工具箱首页：通用配置 + 动态渲染工具卡片 |
| `background.js` | Service Worker：调用 DeepSeek（平台无关，流式输出） |
| `content-core.js` | **平台无关的共享层**：按钮 / 面板 / 进度 / 流式渲染 / Port |
| `content-youtube.js` | YouTube 适配器：抓取文字稿 |
| `content-bilibili.js` | 哔哩哔哩适配器：抓取字幕 |
| `content.css` | 注入页面的样式（两平台共用） |

## 如何新增一个工具
1. 在 `tools.js` 的 `DS_TOOLS` 数组追加一项（`id / name / icon / desc / match / options`），弹窗会自动渲染卡片和它的设置项。
2. 若是新增「视频总结」类平台，只需写一个适配器（参考 `content-bilibili.js`）：实现 `getTranscript / getVideoId / isVideoPage / placeBar / steps`，最后 `DSSummarizer.register(...)`；再在 `manifest.json` 的 `content_scripts` 加一段 `["content-core.js", "content-你的平台.js"]` 的 `matches`。面板、进度、流式输出、DeepSeek 调用全部复用，无需改动。
3. 若是全新形态的工具，可在 `background.js` 的消息路由里加分支处理它的请求。
4. 通用的 `apiKey / model` 已经全局共享，工具私有设置存同一个 `chrome.storage.sync`。

## 隐私与接口
- API Key 仅存浏览器本地（`chrome.storage.sync`），不上传第三方
- 网络请求统一由后台 Service Worker 发出，绕过页面 CORS
- DeepSeek 为 OpenAI 兼容接口：`POST https://api.deepseek.com/chat/completions`
