// tools.js —— 工具集合注册表（共享给 popup）
// 以后新增工具：在 TOOLS 数组里加一项即可。每个工具可声明自己的额外设置项。
// 这个文件同时被 popup.html 以普通 <script> 引入，向 window 暴露 DS_TOOLS。

window.DS_TOOLS = [
  {
    id: "yt-summary",
    name: "YouTube 视频总结 / 翻译",
    icon: "📝",
    desc: "在视频页可「总结为中文文档」「翻译原文」「批判性分析」（核查是否有理/有无依据/是否话术）或「评论印证」（结合热评判断评论能否佐证视频，并识别粉丝附和与刷屏控评），可复制 / 下载。",
    // 该工具在哪些页面生效（用于在弹窗里提示）
    match: "https://www.youtube.com/watch*",
    // 工具私有设置项 -> 渲染成下拉框，键名即存储到 chrome.storage.sync 的字段
    options: [
      {
        key: "style",
        label: "总结风格",
        default: "structured",
        choices: [
          { value: "structured", label: "结构化文档（概述+要点+详细）" },
          { value: "brief", label: "精炼摘要" },
          { value: "bullets", label: "要点清单" }
        ]
      },
      {
        key: "language",
        label: "输出语言",
        default: "中文",
        choices: [
          { value: "中文", label: "中文（简体）" },
          { value: "繁體中文", label: "繁體中文" },
          { value: "English", label: "English" }
        ]
      }
    ]
  },
  {
    id: "bili-summary",
    name: "哔哩哔哩视频总结 / 翻译",
    icon: "📺",
    desc: "在 B 站视频页可「总结为中文文档」「翻译原文」「批判性分析」或「评论印证」。复用上方的总结风格 / 输出语言设置。需登录 B 站且视频有字幕（含 AI 字幕）。",
    match: "https://www.bilibili.com/video/*"
    // 不重复声明 style / language：与 YouTube 工具共用同一组存储字段
  }
  // 下一个工具示例（占位，未实现）：
  // {
  //   id: "page-translate",
  //   name: "整页翻译",
  //   icon: "🌐",
  //   desc: "把当前网页正文翻译成中文。",
  //   match: "<all_urls>",
  //   options: [...]
  // }
];

// 全局共享设置（所有工具公用 DeepSeek 凭证）
window.DS_GLOBAL_DEFAULTS = {
  apiKey: "",
  model: "deepseek-chat"
};
