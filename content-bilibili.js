// content-bilibili.js —— 哔哩哔哩适配器
// 在 bilibili.com 同源环境（带 Cookie，携带正确 Referer）抓取视频字幕，交给 content-core.js。
// 流程：解析 bvid → view 接口拿标题/cid → player/wbi/v2（WBI 签名）拿字幕列表 → 下载字幕 JSON。
//
// 关键点：
//  - B 站现已对接口强制 WBI 签名，未签名的请求会触发「风控(-412)」，
//    不仅自己拿不到数据，还可能连累页面其它接口（如评论）短时被限流。
//  - 字幕 CDN(aisubtitle.hdslb.com) 返回 ACAO:*，下载时绝不能带 credentials，否则 CORS 直接 Failed to fetch。
//  - 字幕（含 AI 字幕）列表通常需要「登录」B 站才能拿到。

(function () {
  "use strict";

  // ---------- MD5（WBI 签名需要；输入均为 ASCII） ----------
  function md5(s) {
    function sa(x, y) { const l = (x & 0xffff) + (y & 0xffff); return (((x >> 16) + (y >> 16) + (l >> 16)) << 16) | (l & 0xffff); }
    function rl(n, c) { return (n << c) | (n >>> (32 - c)); }
    function cmn(q, a, b, x, s, t) { return sa(rl(sa(sa(a, q), sa(x, t)), s), b); }
    function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
    function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
    function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
    function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }
    function core(x, len) {
      x[len >> 5] |= 0x80 << (len % 32);
      x[(((len + 64) >>> 9) << 4) + 14] = len;
      let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;
      for (let i = 0; i < x.length; i += 16) {
        const oa = a, ob = b, oc = c, od = d;
        a = ff(a, b, c, d, x[i], 7, -680876936); d = ff(d, a, b, c, x[i + 1], 12, -389564586);
        c = ff(c, d, a, b, x[i + 2], 17, 606105819); b = ff(b, c, d, a, x[i + 3], 22, -1044525330);
        a = ff(a, b, c, d, x[i + 4], 7, -176418897); d = ff(d, a, b, c, x[i + 5], 12, 1200080426);
        c = ff(c, d, a, b, x[i + 6], 17, -1473231341); b = ff(b, c, d, a, x[i + 7], 22, -45705983);
        a = ff(a, b, c, d, x[i + 8], 7, 1770035416); d = ff(d, a, b, c, x[i + 9], 12, -1958414417);
        c = ff(c, d, a, b, x[i + 10], 17, -42063); b = ff(b, c, d, a, x[i + 11], 22, -1990404162);
        a = ff(a, b, c, d, x[i + 12], 7, 1804603682); d = ff(d, a, b, c, x[i + 13], 12, -40341101);
        c = ff(c, d, a, b, x[i + 14], 17, -1502002290); b = ff(b, c, d, a, x[i + 15], 22, 1236535329);
        a = gg(a, b, c, d, x[i + 1], 5, -165796510); d = gg(d, a, b, c, x[i + 6], 9, -1069501632);
        c = gg(c, d, a, b, x[i + 11], 14, 643717713); b = gg(b, c, d, a, x[i], 20, -373897302);
        a = gg(a, b, c, d, x[i + 5], 5, -701558691); d = gg(d, a, b, c, x[i + 10], 9, 38016083);
        c = gg(c, d, a, b, x[i + 15], 14, -660478335); b = gg(b, c, d, a, x[i + 4], 20, -405537848);
        a = gg(a, b, c, d, x[i + 9], 5, 568446438); d = gg(d, a, b, c, x[i + 14], 9, -1019803690);
        c = gg(c, d, a, b, x[i + 3], 14, -187363961); b = gg(b, c, d, a, x[i + 8], 20, 1163531501);
        a = gg(a, b, c, d, x[i + 13], 5, -1444681467); d = gg(d, a, b, c, x[i + 2], 9, -51403784);
        c = gg(c, d, a, b, x[i + 7], 14, 1735328473); b = gg(b, c, d, a, x[i + 12], 20, -1926607734);
        a = hh(a, b, c, d, x[i + 5], 4, -378558); d = hh(d, a, b, c, x[i + 8], 11, -2022574463);
        c = hh(c, d, a, b, x[i + 11], 16, 1839030562); b = hh(b, c, d, a, x[i + 14], 23, -35309556);
        a = hh(a, b, c, d, x[i + 1], 4, -1530992060); d = hh(d, a, b, c, x[i + 4], 11, 1272893353);
        c = hh(c, d, a, b, x[i + 7], 16, -155497632); b = hh(b, c, d, a, x[i + 10], 23, -1094730640);
        a = hh(a, b, c, d, x[i + 13], 4, 681279174); d = hh(d, a, b, c, x[i], 11, -358537222);
        c = hh(c, d, a, b, x[i + 3], 16, -722521979); b = hh(b, c, d, a, x[i + 6], 23, 76029189);
        a = hh(a, b, c, d, x[i + 9], 4, -640364487); d = hh(d, a, b, c, x[i + 12], 11, -421815835);
        c = hh(c, d, a, b, x[i + 15], 16, 530742520); b = hh(b, c, d, a, x[i + 2], 23, -995338651);
        a = ii(a, b, c, d, x[i], 6, -198630844); d = ii(d, a, b, c, x[i + 7], 10, 1126891415);
        c = ii(c, d, a, b, x[i + 14], 15, -1416354905); b = ii(b, c, d, a, x[i + 5], 21, -57434055);
        a = ii(a, b, c, d, x[i + 12], 6, 1700485571); d = ii(d, a, b, c, x[i + 3], 10, -1894986606);
        c = ii(c, d, a, b, x[i + 10], 15, -1051523); b = ii(b, c, d, a, x[i + 1], 21, -2054922799);
        a = ii(a, b, c, d, x[i + 8], 6, 1873313359); d = ii(d, a, b, c, x[i + 15], 10, -30611744);
        c = ii(c, d, a, b, x[i + 6], 15, -1560198380); b = ii(b, c, d, a, x[i + 13], 21, 1309151649);
        a = ii(a, b, c, d, x[i + 4], 6, -145523070); d = ii(d, a, b, c, x[i + 11], 10, -1120210379);
        c = ii(c, d, a, b, x[i + 2], 15, 718787259); b = ii(b, c, d, a, x[i + 9], 21, -343485551);
        a = sa(a, oa); b = sa(b, ob); c = sa(c, oc); d = sa(d, od);
      }
      return [a, b, c, d];
    }
    function s2b(str) { const bin = []; for (let i = 0; i < str.length * 8; i += 8) bin[i >> 5] |= (str.charCodeAt(i / 8) & 0xff) << (i % 32); return bin; }
    function b2h(arr) { const h = "0123456789abcdef"; let str = ""; for (let i = 0; i < arr.length * 4; i++) str += h.charAt((arr[i >> 2] >> ((i % 4) * 8 + 4)) & 0xf) + h.charAt((arr[i >> 2] >> ((i % 4) * 8)) & 0xf); return str; }
    return b2h(core(s2b(s), s.length * 8));
  }

  // ---------- WBI 签名 ----------
  const MIXIN_TAB = [46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52];
  let mixinKeyCache = null;

  async function getMixinKey() {
    if (mixinKeyCache) return mixinKeyCache;
    const nav = await apiJson("https://api.bilibili.com/x/web-interface/nav");
    const img = nav?.data?.wbi_img?.img_url || "";
    const sub = nav?.data?.wbi_img?.sub_url || "";
    const keyOf = (u) => u.slice(u.lastIndexOf("/") + 1).split(".")[0];
    const raw = keyOf(img) + keyOf(sub);
    if (!raw) return "";
    let mixin = "";
    for (const i of MIXIN_TAB) mixin += raw[i] || "";
    mixinKeyCache = mixin.slice(0, 32);
    return mixinKeyCache;
  }

  async function wbiQuery(params) {
    const mixin = await getMixinKey();
    const q = { ...params, wts: Math.floor(Date.now() / 1000) };
    const query = Object.keys(q).sort()
      .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(String(q[k]).replace(/[!'()*]/g, ""))}`)
      .join("&");
    if (!mixin) return query; // 拿不到密钥时退回不签名（兜底）
    return `${query}&w_rid=${md5(query + mixin)}`;
  }

  // ---------- URL 解析 ----------
  function parseId() {
    const m = location.pathname.match(/\/video\/(BV[0-9A-Za-z]+|av\d+)/i);
    return m ? m[1] : null;
  }
  function getPart() {
    const p = parseInt(new URLSearchParams(location.search).get("p") || "1", 10);
    return Number.isFinite(p) && p > 0 ? p : 1;
  }
  function getVideoId() {
    const id = parseId();
    return id ? `${id}#p${getPart()}` : null;
  }

  function fmtSec(sec) {
    const s = Math.floor(sec || 0);
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, "0")}`;
  }

  // creds: "include" 用于 api.bilibili.com（需 Cookie）；"omit" 用于字幕 CDN（ACAO:* 不能带 Cookie）
  async function apiJson(url, creds = "include") {
    const resp = await fetch(url, { credentials: creds });
    return await resp.json().catch(() => ({}));
  }

  // view 接口结果缓存：getTranscript 与 getComments 共用，少打一次接口、少一分风控风险
  let viewCache = null; // { id, data }
  async function getViewData(rawId) {
    if (viewCache && viewCache.id === rawId) return viewCache.data;
    const idParam = /^av/i.test(rawId) ? `aid=${rawId.slice(2)}` : `bvid=${rawId}`;
    const view = await apiJson(`https://api.bilibili.com/x/web-interface/view?${idParam}`);
    if (view.code !== 0 || !view.data) {
      const hint = view.code === -412 ? "（触发了 B 站风控，请过几分钟、刷新页面再试）" : "";
      throw new Error(`读取视频信息失败：${view.message || view.code}${hint}`);
    }
    viewCache = { id: rawId, data: view.data };
    return view.data;
  }

  async function getTranscript(_id, report) {
    report(1, "读取视频信息…");
    const rawId = parseId();
    if (!rawId) throw new Error("未能从链接解析出视频号（BV/av）。");

    const d = await getViewData(rawId);
    const meta = { title: d.title || "", author: d.owner?.name || "" };
    const aid = d.aid;

    const part = getPart();
    const cid = (d.pages && d.pages[part - 1] && d.pages[part - 1].cid) || d.cid;

    report(2, "获取字幕列表…", meta);
    // WBI 签名版（官方标准做法，避免风控）；失败再兜底普通版
    const signed = await wbiQuery({ aid, cid });
    let subs = await fetchSubtitleList(`https://api.bilibili.com/x/player/wbi/v2?${signed}`);
    if (!subs.length) {
      subs = await fetchSubtitleList(`https://api.bilibili.com/x/player/v2?aid=${aid}&cid=${cid}`);
    }

    if (!subs.length) {
      throw new Error(
        "没拿到字幕列表。可能原因：① 该视频确实没有字幕（含 AI 字幕）；② 未登录哔哩哔哩（字幕列表需登录态）。" +
        "请先确认已登录 B 站、且播放器右下角「字幕」可开启，再试。"
      );
    }

    // 优先人工中文，其次任意中文，再次 AI 中文，最后任意
    const pick =
      subs.find((s) => /^zh/i.test(s.lan) && !/^ai/i.test(s.lan)) ||
      subs.find((s) => /zh|中文/i.test(s.lan_doc || "")) ||
      subs.find((s) => /^ai-zh/i.test(s.lan)) ||
      subs[0];

    const subUrl = pick.subtitle_url?.startsWith("//") ? "https:" + pick.subtitle_url : pick.subtitle_url;
    if (!subUrl) throw new Error("字幕地址为空。");

    report(3, `下载字幕（${pick.lan_doc || pick.lan}）…`, meta);
    // CDN 返回 ACAO:*，必须用 omit，否则 CORS 报 Failed to fetch
    const subData = await apiJson(subUrl, "omit");
    const rows = (subData.body || [])
      .map((it) => ({ time: fmtSec(it.from), text: (it.content || "").replace(/\s+/g, " ").trim() }))
      .filter((r) => r.text);

    if (!rows.length) throw new Error("字幕内容为空。");

    const transcript = rows.map((r) => `[${r.time}] ${r.text}`).join("\n");
    report(3, `字幕就绪：${transcript.length} 字，准备交给 DeepSeek…`, meta);
    return { transcript, meta };
  }

  async function fetchSubtitleList(url) {
    try {
      const data = await apiJson(url);
      return data?.data?.subtitle?.subtitles || [];
    } catch (e) {
      return [];
    }
  }

  // ---------- 读取评论（热门排序，带点赞数；供「评论印证」用） ----------
  async function getComments(_id, report) {
    report("读取视频信息…");
    const rawId = parseId();
    if (!rawId) throw new Error("未能从链接解析出视频号（BV/av）。");
    const d = await getViewData(rawId);
    const aid = d.aid;
    const total = d.stat?.reply || 0;

    report("读取热门评论…");
    // WBI 签名版热评接口；失败兜底老接口
    const q = await wbiQuery({ oid: aid, type: 1, mode: 3, plat: 1, web_location: 1315875 });
    let data = await apiJson(`https://api.bilibili.com/x/v2/reply/wbi/main?${q}`);
    let replies = [...(data?.data?.top_replies || []), ...(data?.data?.replies || [])];
    if (!replies.length) {
      const old = await apiJson(`https://api.bilibili.com/x/v2/reply?type=1&oid=${aid}&sort=2&ps=30&pn=1`);
      replies = [...(old?.data?.upper?.top ? [old.data.upper.top] : []), ...(old?.data?.replies || [])];
    }

    const rows = [];
    for (const r of replies.slice(0, 50)) {
      const msg = (r?.content?.message || "").replace(/\s+/g, " ").trim();
      if (!msg) continue;
      const like = r?.like || 0;
      const rc = r?.rcount || 0;
      rows.push(`[赞${like}${rc ? ` · ${rc}回复` : ""}] ${msg}`);
    }
    if (!rows.length) return "";

    const header = total
      ? `（该视频共约 ${total} 条评论，以下为按热度排序的前 ${rows.length} 条，方括号内为点赞数/回复数）\n`
      : `（以下为热门评论，方括号内为点赞数/回复数）\n`;
    return header + rows.join("\n");
  }

  // 注意：B 站视频页是 Vue 渲染的，若把工具条 insertBefore 进它管理的标题容器，
  // 评论区加载触发 Vue 重渲染时会因「外来节点」抛 HierarchyRequestError，连带打断
  // 评论 / 右栏的渲染。所以这里不实现 placeBar —— 让核心层 fallback 成挂在
  // document.body 上的浮动工具条（body 不归 Vue 管，绝对安全）。

  window.DSSummarizer.register({
    name: "bilibili",
    isVideoPage: () => /(^|\.)bilibili\.com$/.test(location.hostname) && /^\/video\//.test(location.pathname),
    getVideoId,
    getTranscript,
    getComments,
    steps: () => ["读取视频信息", "获取字幕列表", "下载字幕"]
  });
})();
