/* Shared provider profiles. Legacy DeepSeek credentials remain valid. */
(function (root) {
  'use strict';
  const providers = {
    deepseek: { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', models: ['deepseek-flash', 'deepseek-v4-pro'], docs: 'https://platform.deepseek.com/api_keys', protocol: 'openai' },
    kimi: { name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', model: 'kimi-k3.1-pro', models: ['kimi-k3.1-pro'], docs: 'https://platform.kimi.com/console/api-keys', protocol: 'openai' },
    mimo: { name: 'MiMo', baseUrl: 'https://api.xiaomimimo.com/v1', model: 'mimo-v2.5-pro', models: ['mimo-v2.5-pro', 'mimo-v2.5'], docs: 'https://platform.xiaomimimo.com', protocol: 'openai' },
    openai: { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-5-mini'], docs: 'https://platform.openai.com/api-keys', protocol: 'openai' },
    claude: { name: 'Claude', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-6', models: ['claude-sonnet-4-6', 'claude-opus-4-6'], docs: 'https://platform.claude.com', protocol: 'anthropic' },
    custom: { name: '其他 · OpenAI 兼容', baseUrl: '', model: '', models: [], docs: '', protocol: 'openai' }
  };
  function profiles(settings = {}) {
    const result = { ...(settings.providers || {}) };
    for (const [id, p] of Object.entries(providers)) {
      result[id] = { apiKey: '', model: p.model, baseUrl: p.baseUrl, ...(result[id] || {}) };
    }
    if (!settings.providers?.deepseek) {
      result.deepseek.apiKey = settings.apiKey || '';
      result.deepseek.model = settings.model || providers.deepseek.model;
    }
    const oldNames = { 'deepseek-chat': 'deepseek-flash', 'deepseek-reasoner': 'deepseek-v4-pro', 'deepseek-v4-flash': 'deepseek-flash', 'deepseek-v4-flash-vision-exp': 'deepseek-flash' };
    const legacy = result.deepseek.model;
    if (Object.hasOwn(oldNames, legacy)) {
      result.deepseek = { ...result.deepseek, legacyModel: result.deepseek.legacyModel || legacy, model: oldNames[legacy] };
    }
    return result;
  }
  function resolve(settings = {}) {
    const id = Object.hasOwn(providers, settings.provider) ? settings.provider : 'deepseek';
    return { ...settings, provider: id, ...profiles(settings)[id], providerName: providers[id].name, protocol: providers[id].protocol };
  }
  function endpoint(value, protocol) {
    let url;
    try { url = new URL(value); } catch { throw new Error('请填写完整的 HTTPS API Base URL。'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('API 地址必须使用 HTTPS，且不能包含账号、参数或锚点。');
    const path = url.pathname.replace(/\/+$/, '').replace(/\/(chat\/completions|messages)$/, '');
    return url.origin + path + (protocol === 'anthropic' ? '/messages' : '/chat/completions');
  }
  function request(messages, settings, temperature) {
    const s = resolve(settings);
    if (!s.apiKey?.trim()) throw new Error(`请先配置 ${s.providerName} API Key。`);
    if (!s.model?.trim()) throw new Error('请填写模型 ID。');
    const headers = { 'Content-Type': 'application/json' };
    let body;
    if (s.protocol === 'anthropic') {
      headers['x-api-key'] = s.apiKey;
      headers['anthropic-version'] = '2023-06-01';
      headers['anthropic-dangerous-direct-browser-access'] = 'true';
      body = { model: s.model, stream: true, max_tokens: 8192,
        system: messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n'),
        messages: messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })) };
    } else {
      headers.Authorization = `Bearer ${s.apiKey}`;
      body = { model: s.model, stream: true, messages };
      // Reasoning models can reject arbitrary sampling parameters; use their defaults.
      if (s.provider === 'deepseek' && s.model === 'deepseek-flash') {
        body.thinking = { type: 'disabled' };
        body.temperature = temperature;
      } else if (s.provider === 'deepseek' && s.model === 'deepseek-v4-pro') {
        body.thinking = { type: 'enabled' };
      }
    }
    return { url: endpoint(s.baseUrl, s.protocol), headers, body, providerName: s.providerName };
  }
  function event(data) {
    if (data.error || data.type === 'error') throw new Error(data.error?.message || '模型服务返回错误，请重试。');
    const reason = data.choices?.[0]?.finish_reason || data.delta?.stop_reason;
    if (reason === 'length' || reason === 'max_tokens') throw new Error('模型输出达到长度上限，请减少题数或缩短内容后重试。');
    if (reason === 'content_filter' || reason === 'refusal') throw new Error('模型未能处理这段内容，请检查资料后重试。');
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') return data.delta.text || '';
    return data.choices?.[0]?.delta?.content || '';
  }
  root.AIProviders = { providers, profiles, resolve, endpoint, request, event };
  if (typeof module !== 'undefined') module.exports = root.AIProviders;
})(globalThis);
