<div align="center">

# 🧰 DeepSeek 工具箱

### 在 YouTube / 哔哩哔哩 视频页，一键调用 AI —— 看懂它，更看透它

<p>
  <img alt="platform" src="https://img.shields.io/badge/平台-YouTube%20%2B%20哔哩哔哩-ff4d4f">
  <img alt="manifest" src="https://img.shields.io/badge/Chrome-MV3-4285F4">
  <img alt="engine" src="https://img.shields.io/badge/引擎-DeepSeek-7c3aed">
  <img alt="stream" src="https://img.shields.io/badge/输出-流式实时-22c55e">
</p>

<p><i>打开视频 · 点一下按钮 · 右侧面板实时生成结果</i></p>

<img src="screenshots/critique.png" alt="批判性分析示意" width="820">

</div>

---

## ✨ 它能做什么

> 同一个视频，四种看法。抓取逻辑按平台适配，差异只在交给 DeepSeek 的提示词，**两个平台都同时拥有这四种能力**。

<table>
<tr>
<td width="50%" valign="top">

### 📝 总结成中文笔记
抓取视频字幕，一键生成**结构化中文要点**。冗长的讲座、播客，几秒钟读完核心。

</td>
<td width="50%" valign="top">

### 🌐 逐句翻译原文
**保留时间戳**的全文翻译，逐句对照，不做删减总结，适合精读外语视频。

</td>
</tr>
<tr>
<td width="50%" valign="top">

### 🔍 批判性分析
公允评估博主**说得对不对**：先肯定合理处，再点出夸大与存疑；逐条评估论据强度，识别「巴纳姆效应、制造焦虑、诉诸虚假权威、稻草人」等话术（区分正常修辞与操纵），匹配经典骗局原型，核查科学依据，给出**可信度 + 价值双评分**。

</td>
<td width="50%" valign="top">

### 💬 评论印证
读取热门评论 + 字幕**一起分析**：判断评论能否真正**佐证**视频，主动识别「粉丝附和 ≠ 独立印证、回音室、刷屏控评、幸存者偏差、高赞 ≠ 正确」等陷阱，重视质疑声而非一味吹捧。

</td>
</tr>
</table>

---

## 📸 实际效果

<div align="center">

<table>
<tr>
<td align="center" width="50%">
<img src="screenshots/panel.png" width="400"><br>
<sub><b>侧边流式面板</b> · 结果边生成边显示</sub>
</td>
<td align="center" width="50%">
<img src="screenshots/scores.png" width="400"><br>
<sub><b>多维度评分</b> · 可信度 / 价值 / 论据强度一目了然</sub>
</td>
</tr>
</table>

</div>

---

## 🚀 安装（开发者模式）

1. Chrome 打开 `chrome://extensions/`
2. 右上角开启 **「开发者模式」**
3. 点 **「加载已解压的扩展程序」** → 选择本文件夹
4. 点扩展图标，填入 **DeepSeek API Key**（[获取地址](https://platform.deepseek.com/api_keys)），保存

## 🎬 用法

<details open>
<summary><b>YouTube</b></summary>

1. 打开任意**有字幕(CC)** 的 YouTube 视频
2. 点标题下方的 **「📝 总结 / 🌐 翻译 / 🔍 分析 / 💬 评论」**
3. 右侧面板出现结果，可复制或下载 `.md`

> 没有字幕轨道的视频无法获取文字稿，会提示更换。
</details>

<details>
<summary><b>哔哩哔哩</b></summary>

1. **先登录 B 站**（字幕列表接口需要登录态）
2. 打开任意**有字幕（含 AI 字幕）** 的视频页 `bilibili.com/video/...`
3. 点**右下角浮动**的工具条按钮

> B 站页面由 Vue 渲染，工具条做成右下角浮动（挂在 `document.body`），不插入 B 站 DOM 树，避免触发 Vue 重渲染而影响评论 / 右栏加载。<br>
> 很多 B 站视频本身没有字幕；未登录或无字幕时会给出提示。分 P 视频按当前 `?p=` 抓取对应分集。
</details>

---

## 🏗️ 项目结构

可扩展架构 —— 共用一套 DeepSeek 配置，每个工具是独立模块；同一视频的字幕与评论会缓存，切换模式不重复抓取。

| 文件 | 作用 |
|------|------|
| `manifest.json` | MV3 配置 |
| `tools.js` | **工具注册表**（共享给 popup），新增工具改这里 |
| `popup.html` / `popup.js` | 工具箱首页：通用配置 + 动态渲染工具卡片 |
| `background.js` | Service Worker：调用 DeepSeek（平台无关，流式输出） |
| `content-core.js` | **平台无关共享层**：按钮 / 面板 / 进度 / 流式渲染 / Port |
| `content-youtube.js` | YouTube 适配器：抓取文字稿 |
| `content-bilibili.js` | 哔哩哔哩适配器：抓取字幕 |
| `content.css` | 注入页面的样式（两平台共用） |

## 🔧 如何新增一个工具

1. 在 `tools.js` 的 `DS_TOOLS` 数组追加一项（`id / name / icon / desc / match / options`），弹窗会自动渲染卡片和设置项。
2. **新增平台**：写一个适配器（参考 `content-bilibili.js`），实现 `getTranscript / getVideoId / isVideoPage / placeBar / steps`，最后 `DSSummarizer.register(...)`；再在 `manifest.json` 的 `content_scripts` 加一段 `["content-core.js", "content-你的平台.js"]` 的 `matches`。面板、进度、流式输出、DeepSeek 调用全部复用。
3. **全新形态工具**：在 `background.js` 的消息路由里加分支处理。
4. 通用的 `apiKey / model` 已全局共享，工具私有设置存同一个 `chrome.storage.sync`。

## 🔒 隐私与接口

- 🔐 API Key 仅存浏览器本地（`chrome.storage.sync`），**不上传第三方**
- 🌐 网络请求统一由后台 Service Worker 发出，绕过页面 CORS
- 🔌 DeepSeek 为 OpenAI 兼容接口：`POST https://api.deepseek.com/chat/completions`

<div align="center">
<sub>由 DeepSeek 驱动 · 为理性观看而生</sub>
</div>
