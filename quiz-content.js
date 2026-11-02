/* Practice UI. All generated and student content is rendered as text. */
(function () {
  'use strict';
  const Q = globalThis.DSQuiz, e = Q.escape;
  let root, context, quiz = null, answers = [], results = null, busy = false, error = '';
  let videoId = null;
  let config = { difficulty: 'medium', count: 6, types: ['choice', 'short', 'blank'] };
  const difficultyNames = { easy: '简单', medium: '中等', hard: '困难' };
  function button(label, id, primary = false) { return `<button type="button" class="ds-practice-btn${primary ? ' ds-primary' : ''}" id="${id}">${label}</button>`; }
  function mount(node, ctx) {
    const sameVideo = videoId === ctx.videoId;
    if (!sameVideo) { quiz = null; answers = []; results = null; error = ''; }
    videoId = ctx.videoId;
    root = node; context = { ...ctx, ...(sameVideo && quiz ? { meta: context?.meta, transcript: context?.transcript } : {}) };
    render();
  }
  function on(id, event, fn) { root.querySelector('#' + id)?.addEventListener(event, fn); }
  function render() {
    root.innerHTML = `<div class="ds-practice"><div class="ds-eyebrow">VIDEO PRACTICE / 视频练习</div><div class="ds-practice-intro"><h2>${quiz ? results ? '看看你掌握了多少。' : '把看懂，变成学会。' : '为这段视频，出一份试卷。'}</h2><p>${quiz ? e(context.meta?.title || '基于当前视频字幕') : '从字幕提取知识点，用练习检验理解。'}</p></div><ol class="ds-practice-stages" aria-label="练习进度"><li class="${!quiz ? 'current' : ''}">01 设置</li><li class="${quiz && !results ? 'current' : ''}">02 作答</li><li class="${results ? 'current' : ''}">03 批改</li></ol><div class="ds-practice-error" role="alert" ${error ? '' : 'hidden'}>${e(error)}</div>${busy ? `<div class="ds-practice-loading" role="status" aria-live="polite"><strong>${quiz ? '正在逐题批改' : '正在准备你的试卷'}</strong><p id="ds-quiz-progress">${quiz ? '按参考答案与评分要点评估，请稍候…' : '读取字幕并整理知识点，请稍候…'}</p><div class="ds-skeleton"></div><div class="ds-skeleton short"></div><div class="ds-skeleton"></div></div>` : quiz ? paperView() : setupView()}</div>`;
    if (busy) return;
    if (!quiz) {
      root.querySelectorAll('[data-difficulty]').forEach(b => b.addEventListener('click', () => { config.difficulty = b.dataset.difficulty; render(); }));
      root.querySelectorAll('[data-type]').forEach(b => b.addEventListener('change', () => { config.types = [...root.querySelectorAll('[data-type]:checked')].map(b => b.dataset.type); }));
      on('ds-quiz-count', 'change', ev => { config.count = Number(ev.target.value); });
      on('ds-quiz-generate', 'click', generate);
    } else {
      root.querySelectorAll('[data-answer]').forEach(input => input.addEventListener('input', () => {
        answers[Number(input.dataset.answer)] = input.value;
        const status = root.querySelector('#ds-answered');
        if (status) status.textContent = `${answers.filter(a => a.trim()).length} / ${quiz.questions.length} 已作答`;
      }));
      on('ds-quiz-submit', 'click', grade);
      on('ds-quiz-reset', 'click', () => { quiz = null; results = null; answers = []; error = ''; render(); });
      on('ds-quiz-retry', 'click', () => { results = null; error = ''; render(); });
      on('ds-export-paper', 'click', () => download(false));
      on('ds-export-answers', 'click', () => download(true));
    }
  }
  function setupView() {
    return `<fieldset class="ds-fieldset"><legend>练习难度</legend><div class="ds-difficulty">${Object.entries(Q.difficulties).map(([key, desc]) => `<button type="button" data-difficulty="${key}" aria-pressed="${config.difficulty === key}" class="${config.difficulty === key ? 'selected' : ''}"><strong>${difficultyNames[key]}</strong><span>${desc}</span></button>`).join('')}</div></fieldset><fieldset class="ds-fieldset"><legend>题型 <span>可多选</span></legend><div class="ds-types">${Object.entries(Q.types).map(([key, name]) => `<label><input type="checkbox" data-type="${key}" ${config.types.includes(key) ? 'checked' : ''}>${name}</label>`).join('')}</div></fieldset><div class="ds-count-row"><div><label for="ds-quiz-count">题目数量</label><p>每题 10 分，覆盖所选题型</p></div><select id="ds-quiz-count">${[3,4,5,6,8,10,12].map(n => `<option value="${n}" ${config.count === n ? 'selected' : ''}>${n} 题</option>`).join('')}</select></div>${button('生成练习', 'ds-quiz-generate', true)}<p class="ds-practice-note">使用已配置的 DeepSeek 模型。字幕将用于出题，提交后作答将用于批改。</p>`;
  }
  function paperView() {
    const total = results ? Math.round(results.reduce((sum, r) => sum + r.score, 0) * 10) / 10 : 0;
    return `${results ? `<div class="ds-score" role="status"><div><span>本次得分</span><strong>${total}<small> / ${quiz.questions.length * 10}</small></strong></div><p>客观题自动判分<br>填空与问答由 AI 按要点评估</p></div><p class="ds-practice-note">AI 批改仅供学习参考，可对照参考答案和字幕依据复核。</p>` : ''}<div class="ds-paper-toolbar"><span id="ds-answered">${answers.filter(a => a.trim()).length} / ${quiz.questions.length} 已作答</span><div>${button('导出试卷', 'ds-export-paper')}${button('导出答案', 'ds-export-answers')}</div></div>${quiz.questions.map((q, i) => {
      const r = results?.find(r => r.id === q.id);
      return `<section class="ds-question"><div class="ds-question-meta"><span>${String(i + 1).padStart(2, '0')} / ${Q.types[q.type]}</span><span>${r ? r.score + ' / ' : ''}10 分</span></div><h3>${e(q.prompt)}</h3>${q.type === 'choice' ? `<fieldset class="ds-options"><legend class="ds-sr-only">第 ${q.id} 题选项</legend>${q.options.map((o, j) => `<label class="${answers[i] === 'ABCD'[j] ? 'chosen' : ''}"><input type="radio" name="ds-question-${i}" data-answer="${i}" value="${'ABCD'[j]}" ${answers[i] === 'ABCD'[j] ? 'checked' : ''} ${results ? 'disabled' : ''}><span>${'ABCD'[j]}</span><span>${e(o)}</span></label>`).join('')}</fieldset>` : `<label class="ds-answer-label" for="ds-answer-${i}">你的答案</label><textarea id="ds-answer-${i}" data-answer="${i}" rows="${q.type === 'blank' ? 2 : 4}" maxlength="12000" placeholder="${q.type === 'blank' ? '填写空缺内容' : '写下你的理解与推理过程'}" ${results ? 'readonly' : ''}>${e(answers[i] || '')}</textarea>`}${r ? `<div class="ds-feedback"><strong>${r.score === 10 ? '已掌握' : r.score === 0 ? '需要复习' : '部分掌握'}</strong><p>${e(r.feedback)}</p><details><summary>参考答案与字幕依据</summary><p>参考答案：${e(q.answer)}</p><p>评分要点：${e(q.rubric.join('；'))}</p><p>${e(q.explanation)}</p><blockquote>${e(q.evidence)}</blockquote></details></div>` : ''}</section>`;
    }).join('')}<div class="ds-practice-footer">${results ? button('修改答案再练', 'ds-quiz-retry', true) : button('提交并自动批改', 'ds-quiz-submit', true)}${button('重新设置', 'ds-quiz-reset')}</div>${!results ? '<p class="ds-practice-note">未作答题目按 0 分计。提交后显示解析；导出答案会包含参考解答。</p>' : ''}`;
  }
  async function generate() {
    try { Q.config(config); } catch (err) { error = err.message; render(); return; }
    busy = true; error = ''; render();
    try {
      const data = await context.load();
      context.meta = { ...data.meta, url: context.url };
      context.transcript = data.transcript;
      const result = await request({ type: 'QUIZ_GENERATE', config, transcript: data.transcript });
      quiz = Q.paper(result.quiz, config); answers = Array(quiz.questions.length).fill(''); results = null;
    } catch (err) { error = err.message; }
    finally { busy = false; render(); if (!error) root.scrollTop = 0; }
  }
  async function grade() {
    busy = true; error = ''; render();
    try {
      const result = await request({ type: 'QUIZ_GRADE', quiz, answers, transcript: context.transcript });
      results = Q.grades(result, quiz.questions);
    } catch (err) { error = err.message; }
    finally { busy = false; render(); if (!error) root.scrollTop = 0; }
  }
  function request(message) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const port = chrome.runtime.connect({ name: 'summarize' });
      const timer = setTimeout(() => finish(new Error('请求超时，请重试。你的作答已保留。')), 240000);
      function finish(err, value) {
        if (settled) return;
        settled = true; clearTimeout(timer); port.disconnect();
        if (err) reject(err); else resolve(value);
      }
      port.onMessage.addListener(m => {
        if (m.type === 'error') finish(new Error(m.error));
        else if (m.type === 'quiz-result' || m.type === 'quiz-grade') finish(null, m);
        else if (m.type === 'quiz-progress') {
          const progress = root.querySelector('#ds-quiz-progress');
          if (progress) progress.textContent = `正在${quiz ? '批改答案' : '生成题目'}，已接收 ${m.chars} 字符…`;
        }
      });
      port.onDisconnect.addListener(() => { const reason = chrome.runtime.lastError?.message; if (!settled) finish(new Error(reason || '连接中断，请重试。你的作答已保留。')); });
      try { port.postMessage(message); } catch (err) { finish(err); }
    });
  }
  function download(withAnswers) {
    const blob = new Blob([Q.exportHTML(quiz, context.meta, withAnswers)], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = (context.meta.title || '视频练习').replace(/[\\/:*?"<>|]/g, '_').slice(0, 70) + (withAnswers ? '-答案' : '-试卷') + '.html';
    a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  window.DSPractice = { mount, get busy() { return busy; } };
})();
