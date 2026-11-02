// tools.js —— 工具集合注册表（共享给 popup）
// 以后新增工具：在 TOOLS 数组里加一项即可。每个工具可声明自己的额外设置项。
// 这个文件同时被 popup.html 以普通 <script> 引入，向 window 暴露 DS_TOOLS。

window.DS_TOOLS = [
  {
    id: "yt-summary",
    name: "YouTube 视频学习",
    icon: "01",
    desc: "笔记、翻译、批判性分析与评论印证。新增视频练习：选择、问答、填空，自动批改并导出试卷和答案。",
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
    name: "哔哩哔哩视频学习",
    icon: "02",
    desc: "同样支持笔记、翻译、分析和视频练习。共用模型与输出设置；请登录 B 站，并选择有字幕的视频。",
    match: "https://www.bilibili.com/video/*"
    // 不重复声明 style / language：与 YouTube 工具共用同一组存储字段
  },
  {
    id: "page-learning", name: "网页理解与出题", icon: "03",
    desc: "自动读取文章和页面正文，生成摘要、理解脉络与练习。支持追问、自动批改，分别导出试卷与答案。",
    match: "<all_urls>"
  }
];

// 全局共享设置（所有工具公用 DeepSeek 凭证）
window.DS_GLOBAL_DEFAULTS = {
  provider: "deepseek",
  providers: {},
  apiKey: "",
  model: "deepseek-flash"
};
