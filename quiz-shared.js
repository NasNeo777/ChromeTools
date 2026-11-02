/* Shared, dependency-free quiz contract for the worker, content script and tests. */
(function (root) {
  'use strict';
  const difficulties = { easy: '原文复述', medium: '理解对比', hard: '应用验算/代码判错' };
  const types = { choice: '选择题', short: '问答题', blank: '填空题' };
  function config(value) {
    if (!value || !Object.hasOwn(difficulties, value.difficulty) || !Number.isInteger(value.count) || value.count < 3 || value.count > 12 || !Array.isArray(value.types) || !value.types.length || value.types.length > value.count || value.types.some(t => !Object.hasOwn(types, t)) || new Set(value.types).size !== value.types.length) throw new Error('请检查难度、题型及题数（3–12 题）。');
    return { difficulty: value.difficulty, count: value.count, types: [...value.types] };
  }
  function parse(raw) {
    try { return JSON.parse(String(raw).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
    catch { throw new Error('AI 返回格式不完整，请重试。'); }
  }
  function text(value, max = 12000) { return typeof value === 'string' && value.trim().length > 0 && value.length <= max; }
  function paper(value, options) {
    const c = config(options);
    if (!Array.isArray(value?.questions) || value.questions.length !== c.count) throw new Error('出题数量不符，请重新生成。');
    const questions = value.questions.map((q, i) => {
      if (!c.types.includes(q.type) || !text(q.prompt) || !text(q.answer) || !text(q.explanation) || !text(q.evidence) || !Array.isArray(q.rubric) || !q.rubric.length || q.rubric.length > 10 || q.rubric.some(r => !text(r, 2000))) throw new Error('题目缺少答案、评分要点或原文依据，请重试。');
      if (q.type === 'choice' && (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => !text(o, 4000)) || new Set(q.options).size !== 4 || !/^[A-D]$/.test(q.answer))) throw new Error('选择题选项或答案无效，请重试。');
      if (q.type === 'blank' && (q.prompt.match(/_{4}/g) || []).length !== 1) throw new Error('填空题必须有且仅有一个空缺，请重试。');
      return { id: i + 1, type: q.type, prompt: q.prompt, options: q.type === 'choice' ? q.options : [], answer: q.answer, explanation: q.explanation, evidence: q.evidence, rubric: q.rubric, points: 10 };
    });
    if (c.types.some(t => !questions.some(q => q.type === t))) throw new Error('未包含全部所选题型，请重试。');
    return { questions, config: c };
  }
  function localGrade(q, answer) {
    if (!String(answer || '').trim()) return { id: q.id, score: 0, feedback: '未作答。' };
    if (q.type === 'choice') return { id: q.id, score: answer === q.answer ? 10 : 0, feedback: answer === q.answer ? '回答正确。' : '选项不正确，请查看解析。' };
    return null;
  }
  function grades(value, questions) {
    if (!Array.isArray(value?.results) || value.results.length !== questions.length) throw new Error('批改结果不完整，请重试；你的作答已保留。');
    return questions.map(q => {
      const matches = value.results.filter(r => r.id === q.id);
      const r = matches[0];
      if (matches.length !== 1 || !Number.isFinite(r.score) || r.score < 0 || r.score > 10 || !text(r.feedback, 6000)) throw new Error('批改分数或题号无效，请重试。');
      return { id: q.id, score: Math.round(r.score * 10) / 10, feedback: r.feedback };
    });
  }
  const escape = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function exportHTML(quiz, meta, answers = false) {
    const e = escape;
    return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${e(meta.title || '视频练习')} · ${answers ? '答案' : '试卷'}</title><style>body{max-width:800px;margin:40px auto;padding:0 24px;font:15px/1.8 system-ui,sans-serif;color:#242927}h1{font-size:26px}h2{font-size:17px}section{break-inside:avoid;border-top:1px solid #ddd;padding:16px 0}p{white-space:pre-wrap;overflow-wrap:anywhere}.meta{color:#626b66}.space{height:100px;border-bottom:1px solid #ddd}@media print{body{margin:0}section{break-inside:avoid}}</style><h1>${e(meta.title || '视频练习')} · ${answers ? '参考答案' : '试卷'}</h1><p class="meta">${e(difficulties[quiz.config.difficulty])} · ${quiz.questions.length} 题 · 共 ${quiz.questions.length * 10} 分</p>${meta.url && /^https:\/\//.test(meta.url) ? `<p class="meta">内容来源：${e(meta.url)}</p>` : ''}${answers ? '' : '<p>姓名：________________　日期：________________</p>'}${quiz.questions.map(q => `<section><h2>${q.id}. ${e(types[q.type])} · 10 分</h2><p>${e(q.prompt)}</p>${q.options.map((o, i) => `<p>${'ABCD'[i]}. ${e(o)}</p>`).join('')}${answers ? `<p><b>参考答案：</b>${e(q.answer)}</p><p><b>评分要点：</b>${e(q.rubric.join('；'))}</p><p><b>解析：</b>${e(q.explanation)}</p><p class="meta">原文依据：${e(q.evidence)}</p>` : '<div class="space"></div>'}</section>`).join('')}</html>`;
  }
  root.DSQuiz = { difficulties, types, config, parse, paper, localGrade, grades, escape, exportHTML };
  if (typeof module !== 'undefined') module.exports = root.DSQuiz;
})(globalThis);
