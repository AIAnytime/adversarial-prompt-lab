/* app.js — routing, theme, settings, and the lab runner. Pure client-side. */
(function () {
  'use strict';

  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const LS = {
    provider: 'pp.provider', key: 'pp.key.', model: 'pp.model.', theme: 'pp.theme'
  };
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  /* ── theme ─────────────────────────────────────────── */
  function applyTheme(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function currentTheme() {
    const stored = store.get(LS.theme);
    if (stored) return stored;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(store.get(LS.theme));
  $('#themeBtn').addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    store.set(LS.theme, next);
    applyTheme(next);
  });

  /* ── settings state ────────────────────────────────── */
  const cfg = {
    get provider() { return store.get(LS.provider) || 'groq'; },
    set provider(v) { store.set(LS.provider, v); },
    get key() { return store.get(LS.key + this.provider) || ''; },
    set key(v) { v ? store.set(LS.key + this.provider, v) : store.del(LS.key + this.provider); },
    get model() { return store.get(LS.model + this.provider) || PROVIDERS[this.provider].models[0]; },
    set model(v) { store.set(LS.model + this.provider, v); }
  };

  function refreshKeyPill() {
    const pill = $('#keyPill');
    if (cfg.key) {
      pill.textContent = PROVIDERS[cfg.provider].label + ' ✓';
      pill.classList.add('ok');
      pill.title = 'Using ' + PROVIDERS[cfg.provider].label + ' · ' + cfg.model;
    } else {
      pill.textContent = 'no key';
      pill.classList.remove('ok');
      pill.title = 'No API key saved — open Settings';
    }
  }

  /* ── routing ───────────────────────────────────────── */
  function nav(view) {
    $$('.view').forEach(v => v.classList.toggle('is-on', v.id === 'view-' + view));
    $$('.tab').forEach(t => {
      const on = t.dataset.nav === view;
      t.classList.toggle('is-on', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-nav]');
    if (t) { e.preventDefault(); nav(t.dataset.nav); }
  });

  /* ── settings view ─────────────────────────────────── */
  function buildSettings() {
    const prov = $('#setProvider');
    prov.innerHTML = '';
    Object.keys(PROVIDERS).forEach(id => {
      const o = el('option'); o.value = id; o.textContent = PROVIDERS[id].label;
      prov.appendChild(o);
    });

    function syncFromCfg() {
      prov.value = cfg.provider;
      $('#setKey').value = cfg.key;
      $('#setModel').value = cfg.model;
      const p = PROVIDERS[cfg.provider];
      $('#keyHint').innerHTML = p.keyHint + ' · <a href="' + p.keyUrl + '" target="_blank" rel="noopener">get a key ↗</a>';
      const dl = $('#modelList'); dl.innerHTML = '';
      p.models.forEach(m => { const o = el('option'); o.value = m; dl.appendChild(o); });
      $('#testOut').textContent = '';
      $('#testOut').className = 'test-out';
    }
    syncFromCfg();

    prov.addEventListener('change', () => { cfg.provider = prov.value; syncFromCfg(); refreshKeyPill(); });

    $('#saveBtn').addEventListener('click', () => {
      cfg.provider = prov.value;
      cfg.key = $('#setKey').value.trim();
      cfg.model = ($('#setModel').value.trim() || PROVIDERS[cfg.provider].models[0]);
      refreshKeyPill();
      const out = $('#testOut'); out.className = 'test-out ok';
      out.textContent = 'Saved to this browser. Nothing was sent anywhere.';
    });

    $('#clearBtn').addEventListener('click', () => {
      cfg.key = '';
      $('#setKey').value = '';
      refreshKeyPill();
      const out = $('#testOut'); out.className = 'test-out';
      out.textContent = 'Key forgotten for ' + PROVIDERS[cfg.provider].label + '.';
    });

    $('#testBtn').addEventListener('click', async () => {
      cfg.provider = prov.value;
      const key = $('#setKey').value.trim();
      const model = $('#setModel').value.trim() || PROVIDERS[cfg.provider].models[0];
      const out = $('#testOut');
      out.className = 'test-out'; out.innerHTML = '<span class="spinner"></span>Testing ' + esc(model) + '…';
      try {
        const r = await callModel({
          provider: cfg.provider, apiKey: key, model,
          system: 'You are a test. Reply with the single word: pong.',
          user: 'ping', maxTokens: 16, temperature: 0
        });
        out.className = 'test-out ok';
        out.textContent = '✓ Connected. Model replied: "' + (r.text || '').trim().slice(0, 40) + '"';
      } catch (err) {
        out.className = 'test-out bad';
        out.innerHTML = '✗ ' + esc(err.hint || 'Failed') +
          (err.detail ? '<br><code style="font-size:12px">' + esc(err.detail) + '</code>' : '');
      }
    });
  }

  /* ── learn view ────────────────────────────────────── */
  let activeCat = 'all';
  function buildLearn() {
    const filter = $('#catFilter');
    filter.innerHTML = '';
    const mkBtn = (id, label) => {
      const b = el('button', 'cat-btn' + (activeCat === id ? ' is-on' : ''), label);
      b.addEventListener('click', () => { activeCat = id; buildLearn(); });
      return b;
    };
    filter.appendChild(mkBtn('all', 'All'));
    CATS.forEach(([id, label]) => filter.appendChild(mkBtn(id, label)));

    const grid = $('#learnGrid');
    grid.innerHTML = '';
    LABS.filter(l => activeCat === 'all' || l.cat === activeCat).forEach(lab => {
      const card = el('div', 'lcard');
      const catLabel = (CATS.find(c => c[0] === lab.cat) || [,''])[1];
      card.innerHTML =
        '<div class="lcard-top">' +
          '<span class="pill">' + esc(catLabel) + '</span>' +
          '<span class="pill era' + (lab.era === '2023' ? ' old' : '') + '">' + lab.era + '</span>' +
        '</div>' +
        '<h3>' + esc(lab.title) + '</h3>' +
        '<p class="tag">' + esc(lab.tag) + '</p>';
      const act = el('div', 'lcard-act');
      const run = el('button', 'btn btn-sm btn-primary', 'Run this lab');
      run.addEventListener('click', () => { nav('lab'); openLab(lab.id); });
      const read = el('button', 'btn btn-sm', 'Read');
      read.addEventListener('click', () => { nav('lab'); openLab(lab.id); });
      act.appendChild(run); act.appendChild(read);
      card.appendChild(act);
      grid.appendChild(card);
    });
  }

  /* ── lab view ──────────────────────────────────────── */
  let currentLabId = null;
  const histories = {}; // labId -> [{breached}]

  function buildLabList() {
    const list = $('#labList');
    list.innerHTML = '';
    CATS.forEach(([cid, clabel]) => {
      const inCat = LABS.filter(l => l.cat === cid);
      if (!inCat.length) return;
      list.appendChild(el('div', 'lab-cat-head', esc(clabel)));
      inCat.forEach(lab => {
        const b = el('button', 'lab-item' + (lab.id === currentLabId ? ' is-on' : ''));
        b.innerHTML = '<span class="n">' + lab.era + '</span><span class="t">' + esc(lab.title) + '</span>';
        b.addEventListener('click', () => openLab(lab.id));
        list.appendChild(b);
      });
    });
  }

  function openLab(id) {
    currentLabId = id;
    buildLabList();
    const lab = LABS.find(l => l.id === id);
    if (!lab) return;
    const sc = lab.scenario;
    const catLabel = (CATS.find(c => c[0] === lab.cat) || [,''])[1];
    const main = $('#labMain');
    main.innerHTML = '';

    // title
    const head = el('div', 'lab-title');
    head.innerHTML =
      '<div class="tags"><span class="pill">' + esc(catLabel) + '</span>' +
      '<span class="pill era' + (lab.era === '2023' ? ' old' : '') + '">' + lab.era + '</span></div>' +
      '<h2>' + esc(lab.title) + '</h2>';
    main.appendChild(head);

    // explanation panel
    const exp = el('div', 'panel');
    exp.innerHTML =
      '<div class="panel-head"><h3>How it works</h3></div>' +
      '<div class="explain">' +
        '<div class="ex-cell"><h4>Mechanism</h4><p>' + lab.explain.how + '</p></div>' +
        '<div class="ex-cell"><h4>Example</h4><p>' + lab.explain.example + '</p></div>' +
        '<div class="ex-cell"><h4>Root cause</h4><p>' + lab.explain.exploits + '</p></div>' +
        '<div class="ex-cell"><h4>Defense</h4><p>' + lab.explain.defend + '</p></div>' +
      '</div>';
    main.appendChild(exp);

    // sandbox panel
    const box = el('div', 'panel');
    const toolsHtml = (sc.tools && sc.tools.length)
      ? '<div class="tool-strip">' + sc.tools.map(t => {
          const danger = /delete|exfiltrate|post|send|save_memory|read_file/.test(t.name);
          return '<span class="tool-chip' + (danger ? ' danger' : '') + '">' + esc(t.name) + '()</span>';
        }).join('') + '</div>'
      : '';

    box.innerHTML =
      '<div class="panel-head"><h3>Sandbox agent</h3><span class="sub" id="agentModel"></span></div>' +
      '<div class="panel-body">' +
        toolsHtml +
        '<div class="field"><span class="lab-label">Agent system prompt (defense is OFF here)</span>' +
          '<textarea id="sysBox" readonly rows="4"></textarea></div>' +
        '<div class="field"><span class="lab-label">' +
          (sc.payloadReadonly ? 'Attack surface (read-only — attack is in the tool description above)' : 'Untrusted content you control — edit it, this is the attack') +
          '</span><textarea id="payloadBox" rows="7"' + (sc.payloadReadonly ? ' readonly' : '') + '></textarea></div>' +
      '</div>' +
      '<div class="run-bar">' +
        '<label class="switch"><input type="checkbox" id="defToggle"> <b>Defense</b>&nbsp;— apply the mitigation</label>' +
        '<button class="btn btn-primary btn-sm" id="runBtn">Run attack</button>' +
        '<span class="run-note"><a id="gotoSettings">no key set</a></span>' +
      '</div>';
    main.appendChild(box);

    const sysBox = $('#sysBox', box);
    const payloadBox = $('#payloadBox', box);
    const defToggle = $('#defToggle', box);
    sysBox.value = sc.system(false);
    payloadBox.value = sc.defaultPayload;
    defToggle.addEventListener('change', () => {
      sysBox.value = sc.system(defToggle.checked);
      $('.lab-label', sysBox.parentElement).textContent =
        'Agent system prompt (defense is ' + (defToggle.checked ? 'ON' : 'OFF') + ' here)';
    });
    $('#gotoSettings', box).addEventListener('click', () => nav('settings'));

    const runNote = $('.run-note', box);
    function syncNote() {
      const model = cfg.key ? cfg.model : null;
      $('#agentModel').textContent = model ? (PROVIDERS[cfg.provider].label + ' · ' + model) : 'no model';
      runNote.innerHTML = cfg.key
        ? 'runs on your key · <a id="gotoSettings2">' + esc(PROVIDERS[cfg.provider].label) + '</a>'
        : '<a id="gotoSettings3">add an API key →</a>';
      const g2 = $('#gotoSettings2', box); if (g2) g2.onclick = () => nav('settings');
      const g3 = $('#gotoSettings3', box); if (g3) g3.onclick = () => nav('settings');
    }
    syncNote();

    // result mount
    const resultMount = el('div');
    resultMount.id = 'resultMount';
    main.appendChild(resultMount);

    $('#runBtn', box).addEventListener('click', () => runLab(lab, {
      defended: defToggle.checked,
      payload: payloadBox.value,
      mount: resultMount
    }));
  }

  async function runLab(lab, o) {
    const sc = lab.scenario;
    const mount = o.mount;
    if (!cfg.key) { nav('settings'); return; }

    mount.innerHTML =
      '<div class="panel"><div class="panel-body dim" style="padding:18px">' +
      '<span class="spinner"></span>Sending the attack to ' + esc(PROVIDERS[cfg.provider].label) +
      ' (' + esc(cfg.model) + ')…</div></div>';

    let result;
    try {
      result = await callModel({
        provider: cfg.provider,
        apiKey: cfg.key,
        model: cfg.model,
        system: sc.system(o.defended),
        user: sc.userTemplate(o.payload),
        tools: sc.tools || [],
        maxTokens: sc.maxTokens || 900,
        temperature: 0.5
      });
    } catch (err) {
      mount.innerHTML =
        '<div class="panel"><div class="err-box"><b>Request failed (' + esc(String(err.status || '—')) + ')</b>' +
        esc(err.hint || 'Unknown error') +
        (err.detail ? '<br><code>' + esc(err.detail) + '</code>' : '') + '</div></div>';
      return;
    }

    const verdict = sc.judge(result, o.defended);

    // record history
    const h = histories[lab.id] || (histories[lab.id] = []);
    h.push({ breached: verdict.breached, defended: o.defended });

    // build result panel
    const panel = el('div', 'panel');
    const vClass = verdict.breached ? 'breached' : 'held';
    const badge = verdict.breached ? 'Breached' : 'Held';

    let checksHtml = '';
    (verdict.checks || []).forEach(c => {
      // invert checks describe a *desired* outcome (green when true).
      // normal checks describe attack behavior (red when true).
      const bad = c.invert ? !c.hit : c.hit;
      const mark = c.invert
        ? (c.hit ? 'held' : 'FAILED')
        : (c.hit ? 'FIRED' : 'blocked');
      checksHtml += '<div class="check ' + (bad ? 'hit' : 'miss') + '">' +
        '<span class="mark">' + mark + '</span>' +
        '<span class="lbl">' + esc(c.label) + (c.value ? ' — <b>' + esc(c.value) + '</b>' : '') + '</span></div>';
    });

    const toolCallsHtml = (result.toolCalls && result.toolCalls.length)
      ? '<details class="wire"><summary>Tool calls the model made (' + result.toolCalls.length + ')</summary>' +
        '<pre>' + esc(JSON.stringify(result.toolCalls, null, 2)) + '</pre></details>'
      : '';

    const usage = result.usage || {};
    panel.innerHTML =
      '<div class="verdict ' + vClass + '">' +
        '<span class="verdict-badge">' + badge + '</span>' +
        '<span class="verdict-txt">' + esc(verdict.summary) + '</span>' +
      '</div>' +
      '<div class="checks">' + checksHtml + '</div>' +
      '<div class="panel-head" style="border-top:1px solid var(--line)"><h3>Model output</h3>' +
        '<span class="sub">' + (o.defended ? 'defense ON' : 'defense OFF') +
        ' · ' + (usage.in || 0) + '→' + (usage.out || 0) + ' tok</span></div>' +
      '<pre class="out">' + (esc(result.text) || '<span style="color:var(--tx-3)">(no text — model responded only with tool calls)</span>') + '</pre>' +
      toolCallsHtml +
      '<details class="wire"><summary>Raw request sent to the API</summary>' +
        '<pre>' + esc(JSON.stringify(result.request, null, 2)) + '</pre></details>';

    // history chips
    const histBar = el('div', 'history');
    histBar.innerHTML = '<span style="font-family:\'IBM Plex Mono\',monospace;font-size:11px;color:var(--tx-3)">runs:</span>';
    h.slice(-12).forEach((run, i) => {
      const chip = el('span', 'hchip ' + (run.breached ? 'breached' : 'held'),
        (run.defended ? '🛡 ' : '') + (run.breached ? 'breached' : 'held'));
      histBar.appendChild(chip);
    });

    mount.innerHTML = '';
    mount.appendChild(panel);
    mount.appendChild(histBar);
  }

  /* ── boot ──────────────────────────────────────────── */
  buildSettings();
  buildLearn();
  buildLabList();
  refreshKeyPill();

  const start = (location.hash || '#learn').slice(1);
  nav(['learn', 'lab', 'settings'].includes(start) ? start : 'learn');
})();
