/* providers.js — browser-side adapters for four LLM APIs.
   Every provider below returns CORS headers, so this runs with no backend.
   Normalised shape out of callModel():
     { text, toolCalls:[{name,args}], usage:{in,out}, raw, request } */

const PROVIDERS = {
  groq: {
    label: 'Groq',
    kind: 'openai',
    endpoint: () => 'https://api.groq.com/openai/v1/chat/completions',
    keyUrl: 'https://console.groq.com/keys',
    keyHint: 'starts with gsk_ · free tier, fast, good default for demos',
    models: [
      'openai/gpt-oss-120b',
      'openai/gpt-oss-20b',
      'groq/compound',
      'qwen/qwen3.8-27b',
      'moonshotai/kimi-k2-instruct'
    ]
  },
  openai: {
    label: 'OpenAI',
    kind: 'openai',
    endpoint: () => 'https://api.openai.com/v1/chat/completions',
    keyUrl: 'https://platform.openai.com/api-keys',
    keyHint: 'starts with sk- · project keys work fine',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o']
  },
  anthropic: {
    label: 'Anthropic',
    kind: 'anthropic',
    endpoint: () => 'https://api.anthropic.com/v1/messages',
    keyUrl: 'https://console.anthropic.com/settings/keys',
    keyHint: 'starts with sk-ant- · sent with the direct-browser-access header',
    models: ['claude-sonnet-5', 'claude-haiku-4-5-20251001', 'claude-opus-5']
  },
  gemini: {
    label: 'Google Gemini',
    kind: 'gemini',
    endpoint: (m) => 'https://generativelanguage.googleapis.com/v1beta/models/' +
                     encodeURIComponent(m) + ':generateContent',
    keyUrl: 'https://aistudio.google.com/apikey',
    keyHint: 'AI Studio key · free tier available',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-pro']
  }
};

function estTokens(s) { return Math.ceil((s || '').length / 4); }

/* ---------- request builders ---------- */

function buildOpenAI({ model, system, user, tools, maxTokens, temperature }) {
  const body = {
    model,
    messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    max_tokens: maxTokens,
    temperature
  };
  if (tools && tools.length) {
    body.tools = tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));
    body.tool_choice = 'auto';
  }
  return body;
}

function buildAnthropic({ model, system, user, tools, maxTokens, temperature }) {
  const body = {
    model,
    system,
    messages: [{ role: 'user', content: user }],
    max_tokens: maxTokens,
    temperature
  };
  if (tools && tools.length) {
    body.tools = tools.map(t => ({
      name: t.name, description: t.description, input_schema: t.parameters
    }));
  }
  return body;
}

function buildGemini({ system, user, tools, maxTokens, temperature }) {
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: 'user', parts: [{ text: user }] }],
    generationConfig: { maxOutputTokens: maxTokens, temperature }
  };
  if (tools && tools.length) {
    body.tools = [{
      functionDeclarations: tools.map(t => ({
        name: t.name, description: t.description, parameters: t.parameters
      }))
    }];
  }
  return body;
}

/* ---------- response parsers ---------- */

function parseOpenAI(json) {
  const msg = (json.choices && json.choices[0] && json.choices[0].message) || {};
  const calls = (msg.tool_calls || []).map(c => {
    let args = {};
    try { args = JSON.parse(c.function.arguments || '{}'); }
    catch (e) { args = { _unparsed: c.function.arguments }; }
    return { name: c.function.name, args };
  });
  const u = json.usage || {};
  return {
    text: msg.content || '',
    toolCalls: calls,
    usage: { in: u.prompt_tokens || 0, out: u.completion_tokens || 0 }
  };
}

function parseAnthropic(json) {
  let text = '';
  const calls = [];
  (json.content || []).forEach(b => {
    if (b.type === 'text') text += b.text;
    if (b.type === 'tool_use') calls.push({ name: b.name, args: b.input || {} });
  });
  const u = json.usage || {};
  return {
    text,
    toolCalls: calls,
    usage: { in: u.input_tokens || 0, out: u.output_tokens || 0 }
  };
}

function parseGemini(json) {
  let text = '';
  const calls = [];
  const cand = (json.candidates || [])[0] || {};
  ((cand.content && cand.content.parts) || []).forEach(p => {
    if (typeof p.text === 'string') text += p.text;
    if (p.functionCall) calls.push({ name: p.functionCall.name, args: p.functionCall.args || {} });
  });
  const u = json.usageMetadata || {};
  return {
    text,
    toolCalls: calls,
    usage: { in: u.promptTokenCount || 0, out: u.candidatesTokenCount || 0 }
  };
}

/* ---------- error surfacing ---------- */

function readableError(status, bodyText) {
  let detail = bodyText;
  try {
    const j = JSON.parse(bodyText);
    detail = (j.error && (j.error.message || j.error.status)) || j.message || bodyText;
  } catch (e) { /* leave raw */ }

  const map = {
    401: 'Key rejected. Check the key and that it matches the provider you selected.',
    403: 'Key is valid but not allowed to use this model or region.',
    404: 'Model id not found for this key. Try a different model in Settings.',
    413: 'Payload too large — shorten the untrusted content.',
    429: 'Rate limited or out of credit. Wait a moment, or use a different key.'
  };
  const hint = map[status] || (status >= 500 ? 'Provider-side error. Retry.' : '');
  return { status, hint, detail: String(detail).slice(0, 600) };
}

/* ---------- the one call everything goes through ---------- */

async function callModel(opts) {
  const { provider, apiKey, model } = opts;
  const p = PROVIDERS[provider];
  if (!p) throw { status: 0, hint: 'Unknown provider.', detail: provider };
  if (!apiKey) throw { status: 0, hint: 'No API key saved. Open Settings and add one.', detail: '' };
  if (!model) throw { status: 0, hint: 'No model selected. Open Settings.', detail: '' };

  const args = {
    model,
    system: opts.system,
    user: opts.user,
    tools: opts.tools || [],
    maxTokens: opts.maxTokens || 1024,
    temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.4
  };

  let url = p.endpoint(model);
  const headers = { 'content-type': 'application/json' };
  let body;

  if (p.kind === 'openai') {
    headers['authorization'] = 'Bearer ' + apiKey;
    body = buildOpenAI(args);
  } else if (p.kind === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
    headers['anthropic-dangerous-direct-browser-access'] = 'true';
    body = buildAnthropic(args);
  } else {
    url += '?key=' + encodeURIComponent(apiKey);
    body = buildGemini(args);
  }

  let res;
  try {
    res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  } catch (e) {
    throw {
      status: 0,
      hint: 'Network or CORS failure. If you opened this file directly, serve it over http instead (see README).',
      detail: String(e)
    };
  }

  const raw = await res.text();
  if (!res.ok) throw readableError(res.status, raw);

  let json;
  try { json = JSON.parse(raw); }
  catch (e) { throw { status: res.status, hint: 'Provider returned non-JSON.', detail: raw.slice(0, 400) }; }

  const parsed = p.kind === 'openai' ? parseOpenAI(json)
              : p.kind === 'anthropic' ? parseAnthropic(json)
              : parseGemini(json);

  if (!parsed.usage.out) parsed.usage.out = estTokens(parsed.text);
  parsed.raw = json;
  parsed.request = body;
  return parsed;
}
