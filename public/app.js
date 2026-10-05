const $app = document.getElementById('app');
const S = { ws: null, pid: null, code: null, name: localStorage.getItem('name') || '', st: null, themes: [], mix: 0,
  pick: { theme: 'mix', rounds: 10, seconds: 30 }, ready: [], reacts: {}, custom: [], found: [], round: null, results: null, final: null, offset: 0, tick: null };
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const toast = (m) => { const t = document.getElementById('toast'); t.textContent = m; t.className = 'show'; setTimeout(() => (t.className = ''), 3000); };
const isHost = () => S.st && S.st.hostId === S.pid;

function connect(first) {
  S.ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
  S.ws.onopen = () => {
    const saved = JSON.parse(sessionStorage.getItem('sess') || 'null');
    if (saved) S.ws.send(JSON.stringify({ type: 'join', code: saved.code, pid: saved.pid, name: saved.name }));
    else if (first) home();
  };
  S.ws.onclose = () => setTimeout(() => connect(false), 1500);
  S.ws.onmessage = (e) => handle(JSON.parse(e.data));
}
const send = (o) => S.ws && S.ws.readyState === 1 && S.ws.send(JSON.stringify(o));

function handle(m) {
  if (m.type === 'error') {
    toast(m.message);
    if (!S.st) { sessionStorage.removeItem('sess'); home(); }
  } else if (m.type === 'joined') {
    S.pid = m.pid; S.code = m.code;
    sessionStorage.setItem('sess', JSON.stringify({ pid: m.pid, code: m.code, name: S.name }));
  } else if (m.type === 'state') {
    S.st = m;
    if (m.phase === 'lobby') lobby();
    else if (m.phase === 'results') { /* aguarda mensagem results */ }
  } else if (m.type === 'round') {
    S.offset = m.now - Date.now(); S.round = m; roundView(m.answer || '');
  } else if (m.type === 'results') {
    S.offset = m.now - Date.now(); S.results = m; S.ready = []; S.reacts = {}; resultsView(m);
  } else if (m.type === 'ready') { S.ready = m.ready; updateReady();
  } else if (m.type === 'reacts') { S.reacts = m.reacts; updateReacts(); if (m.last) floatEmoji(m.last); }
  else if (m.type === 'final') { finalView(m); }
  else if (m.type === 'ack') { const el = document.getElementById('ack'); if (el) el.textContent = '✔ Resposta registrada: ' + m.text; }
}

function stopTick() { clearInterval(S.tick); S.tick = null; }
function countdown(endsAt, total, cb) {
  stopTick();
  const upd = () => {
    const left = Math.max(0, Math.ceil((endsAt - (Date.now() + S.offset)) / 1000));
    const t = document.getElementById('time'), b = document.getElementById('bar');
    if (t) { t.textContent = left; t.classList.toggle('low', left <= 5); }
    if (b) b.style.width = Math.min(100, (left / total) * 100) + '%';
    if (cb) cb(left);
  };
  upd(); S.tick = setInterval(upd, 250);
}

async function loadThemes() {
  const r = await (await fetch('/api/themes')).json();
  S.themes = r.themes; S.mix = r.mix;
}

function home() {
  stopTick(); S.st = null;
  $app.innerHTML = `<div class="card"><h2>Bem-vindo!</h2>
    <p class="muted">Cada rodada traz um TOP 100. No tempo da rodada, escreva um item da lista — quanto mais baixo no ranking, mais pontos você ganha (posição 90 = 90 pts, posição 1 = 1 pt).</p>
    <input id="name" maxlength="16" placeholder="Seu nome" value="${esc(S.name)}">
    <div class="row" style="margin-top:12px"><button class="go" id="mk">Criar sala</button></div>
    <h3>ou entre em uma sala</h3>
    <div class="row"><input id="cd" maxlength="4" placeholder="CÓDIGO" style="text-transform:uppercase"><button id="jn">Entrar</button></div></div>`;
  const nm = () => { S.name = document.getElementById('name').value.trim(); localStorage.setItem('name', S.name); return S.name; };
  document.getElementById('mk').onclick = () => nm() ? createView() : toast('Digite seu nome.');
  document.getElementById('jn').onclick = () => {
    if (!nm()) return toast('Digite seu nome.');
    send({ type: 'join', code: document.getElementById('cd').value, name: S.name });
  };
}

async function createView() {
  await loadThemes();
  const themeBtns = [{ id: 'mix', emoji: '🎲', name: 'Misto (todos os temas)', available: S.mix }, ...S.themes]
    .map((t) => `<button class="theme ${S.pick.theme === t.id ? 'sel' : ''}" data-t="${t.id}">${t.emoji} ${esc(t.name)}<small>${t.available} perguntas inéditas</small></button>`).join('');
  $app.innerHTML = `<div class="card"><h2>Nova sala</h2><h3>Tema</h3><div class="grid">${themeBtns}</div>
    <h3>🔎 Ou busque rankings na internet (Wikipédia, em tempo real)</h3>
    <div class="row"><input id="q" placeholder="Ex.: filmes de maior bilheteria, jogadores com mais gols…"><button id="qb" style="flex:none">Buscar</button></div>
    <div id="found"></div>
    ${S.pick.custom.length ? `<p class="ok">Tema personalizado (${S.pick.custom.length} rankings = ${S.pick.custom.length} rodadas): ${S.pick.custom.map((c, i) => `<button class="chip sel" data-rm="${i}">${esc(c.title)} ✕</button>`).join(' ')} <button class="chip" id="clr">limpar</button></p>` : ''}
    <h3>Rodadas</h3><div class="chips">${[10, 20, 30, 40, 50].map((n) => `<button class="chip ${S.pick.rounds === n ? 'sel' : ''}" data-r="${n}">${n}</button>`).join('')}</div>
    <h3>Tempo por rodada</h3><div class="chips">${[10, 15, 20, 30].map((n) => `<button class="chip ${S.pick.seconds === n ? 'sel' : ''}" data-s="${n}">${n}s</button>`).join('')}</div>
    <div class="row" style="margin-top:18px"><button class="sec" id="bk">Voltar</button><button class="go" id="ok">Criar sala</button></div></div>`;
  $app.querySelectorAll('[data-t]').forEach((b) => (b.onclick = () => { S.pick.theme = b.dataset.t; createView(); }));
  $app.querySelectorAll('[data-r]').forEach((b) => (b.onclick = () => { S.pick.rounds = +b.dataset.r; createView(); }));
  $app.querySelectorAll('[data-s]').forEach((b) => (b.onclick = () => { S.pick.seconds = +b.dataset.s; createView(); }));
  document.getElementById('bk').onclick = home;
  searchUi();
  document.getElementById('ok').onclick = () => send(S.pick.custom.length ? { type: 'create', name: S.name, theme: 'custom', custom: S.pick.custom, rounds: S.pick.rounds, seconds: S.pick.seconds } : { type: 'create', name: S.name, theme: S.pick.theme, rounds: S.pick.rounds, seconds: S.pick.seconds });
}

function searchUi() {
  const box = document.getElementById('found');
  const draw = () => {
    box.innerHTML = S.found.map((r, i) => `<div class="hit"><div><b>${esc(r.title)}</b> <small class="muted">(${r.lang}.wikipedia)</small><br><small class="muted">1º ${esc(r.preview[0])} · 2º ${esc(r.preview[1])} · … · 100º ${esc(r.last)}</small></div><button class="chip" data-add="${i}">+ Adicionar</button></div>`).join('');
    box.querySelectorAll('[data-add]').forEach((b) => (b.onclick = () => {
      const r = S.found[+b.dataset.add];
      if (!S.pick.custom.some((c) => c.page === r.page && c.lang === r.lang)) S.pick.custom.push({ lang: r.lang, page: r.page, title: r.title });
      createView();
    }));
  };
  const go = async () => {
    const q = document.getElementById('q').value.trim();
    if (q.length < 3) return toast('Digite ao menos 3 letras.');
    box.innerHTML = '<p class="muted">Buscando na internet…</p>';
    try { S.found = (await (await fetch('/api/search?q=' + encodeURIComponent(q))).json()).results; } catch { S.found = []; }
    if (!S.found.length) box.innerHTML = '<p class="bad">Nenhum ranking de 100 itens encontrado. Tente outras palavras (ex.: "list of ..." em inglês).</p>'; else draw();
  };
  document.getElementById('qb').onclick = go;
  document.getElementById('q').onkeydown = (e) => { if (e.key === 'Enter') go(); };
  $app.querySelectorAll('[data-rm]').forEach((b) => (b.onclick = () => { S.pick.custom.splice(+b.dataset.rm, 1); createView(); }));
  const c = document.getElementById('clr'); if (c) c.onclick = () => { S.pick.custom = []; createView(); };
  if (S.found.length) draw();
}

function themeLabel(id) {
  if (id === 'custom') return '🔎 Personalizado';
  if (id === 'mix') return '🎲 Misto';
  const t = S.themes.find((x) => x.id === id);
  return t ? `${t.emoji} ${t.name}` : id;
}

async function lobby() {
  stopTick();
  if (!S.themes.length) await loadThemes();
  const st = S.st;
  $app.innerHTML = `<div class="card"><p class="muted" style="text-align:center">Código da sala — compartilhe com os amigos</p><div class="code">${st.code}</div>
    <p style="text-align:center">${themeLabel(st.theme)} · ${st.totalRounds} rodadas · ${st.seconds}s por rodada</p></div>
    <div class="card"><h2>Jogadores (${st.players.length})</h2><div class="players">${st.players.map((p) => `<span class="pl">${p.id === st.hostId ? '👑 ' : ''}${esc(p.name)}</span>`).join('')}</div>
    <div style="margin-top:18px">${isHost() ? '<button class="go" id="st">Começar jogo</button>' : '<p class="muted">Aguardando o anfitrião começar…</p>'}</div></div>`;
  const b = document.getElementById('st'); if (b) b.onclick = () => send({ type: 'start' });
}

function roundView(prefill) {
  const m = S.round;
  $app.innerHTML = `<div class="card"><p class="muted" style="text-align:center">Rodada ${m.round} de ${m.totalRounds}</p>
    <div class="title">${esc(m.title)}</div>
    <div class="timer" id="time">${m.total}</div><div class="bar"><i id="bar"></i></div>
    <div class="row"><input id="ans" autocomplete="off" maxlength="80" placeholder="Escreva sua resposta e aperte Enter…" value="${esc(prefill)}"><button class="go" id="sd" style="flex:none">Enviar</button></div>
    <p id="ack" class="ok">${prefill ? '✔ Resposta registrada: ' + esc(prefill) : ''}</p>
    <p class="muted">Dica: você pode trocar de resposta até o tempo acabar. A última vale. Posição mais alta no ranking = mais pontos!</p></div>`;
  const inp = document.getElementById('ans');
  const go = () => send({ type: 'answer', text: inp.value });
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
  document.getElementById('sd').onclick = go;
  inp.focus();
  countdown(m.endsAt, m.total, (left) => { if (left === 0) { const v = inp.value; if (v) send({ type: 'answer', text: v }); inp.disabled = true; } });
}

function resultsView(m) {
  const list = (a, low) => a.map((i) => `<tr><td><span class="rk ${low ? 'low' : ''}">${i.rank}º</span>${esc(i.name)}</td></tr>`).join('');
  const rank = S.st ? S.st.players : [];
  $app.innerHTML = `<div class="card"><p class="muted" style="text-align:center">Fim da rodada ${m.round} de ${m.totalRounds}</p><div class="title">${esc(m.title)}</div>
    <h3>Respostas da rodada</h3><table><tr><th>Jogador</th><th>Resposta</th><th>Posição</th><th>Pontos</th><th>Reagir</th></tr>
    ${m.results.map((r) => `<tr><td>${esc(r.name)}</td><td>${r.answer ? esc(r.answer) : '<span class="muted">—</span>'}${r.matched && r.matched !== r.answer ? ` <span class="muted">(${esc(r.matched)})</span>` : ''}</td>
    <td>${r.rank ? r.rank + 'º' : '<span class="bad">fora do TOP</span>'}</td><td class="pts">+${r.points}</td><td>${reactCell(r.id)}</td></tr>`).join('')}</table></div>
    <div class="two"><div class="card"><h3>🏆 10 primeiras posições</h3><table>${list(m.top)}</table></div>
    <div class="card"><h3>🔻 10 últimas posições</h3><table>${list(m.bottom, true)}</table></div></div>
    <div class="card"><h3>Placar geral</h3><table>${rank.map((p, i) => `<tr><td>${i + 1}º</td><td>${esc(p.name)}</td><td class="pts">${p.score} pts</td></tr>`).join('')}</table>
    <div id="rd"></div></div>`;
  stopTick();
  $app.querySelectorAll('[data-rt]').forEach((b) => (b.onclick = () => send({ type: 'react', target: b.dataset.rt, emoji: b.dataset.re })));
  updateReady(); updateReacts();
}

function finalView(m) {
  stopTick();
  const medals = ['🥇', '🥈', '🥉'];
  $app.innerHTML = `<div class="card"><h2 style="text-align:center">🏁 Fim de jogo!</h2>${m.reason ? `<p class="bad" style="text-align:center">${esc(m.reason)}</p>` : ''}
    <table>${m.ranking.map((p, i) => `<tr><td class="medal">${medals[i] || i + 1 + 'º'}</td><td>${esc(p.name)}</td><td class="pts">${p.score} pts</td></tr>`).join('')}</table>
    <div class="row" style="margin-top:16px">${isHost() ? '<button class="go" id="again">Jogar de novo na mesma sala</button>' : ''}<button class="sec" id="leave">Sair</button></div></div>`;
  const a = document.getElementById('again'); if (a) a.onclick = () => send({ type: 'restart', theme: S.st.theme, rounds: S.st.totalRounds, seconds: S.st.seconds });
  document.getElementById('leave').onclick = () => { sessionStorage.removeItem('sess'); location.reload(); };
}

connect(true);

const EMO = { like: '👍', dislike: '👎', laugh: '😂', angry: '😡', heart: '❤️', think: '🤔' };
function reactCell(id) {
  return `<div class="reacts">${Object.keys(EMO).map((k) => `<button class="rb" data-rt="${id}" data-re="${k}" title="${k}"><span class="em e-${k}">${EMO[k]}</span><b data-c="${id}:${k}"></b></button>`).join('')}</div>`;
}
function updateReacts() {
  document.querySelectorAll('[data-c]').forEach((b) => {
    const [id, k] = b.dataset.c.split(':');
    const n = (S.reacts[id] || {})[k] || 0;
    b.textContent = n || '';
  });
}
function floatEmoji(l) {
  const btn = document.querySelector(`[data-rt="${l.target}"][data-re="${l.emoji}"]`);
  if (!btn) return;
  const r = btn.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fly';
  el.textContent = EMO[l.emoji];
  el.style.left = r.left + r.width / 2 - 14 + 'px';
  el.style.top = r.top + 'px';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1500);
}
function updateReady() {
  const box = document.getElementById('rd');
  if (!box || !S.st || !S.results) return;
  const pl = S.st.players.filter((p) => p.connected);
  const done = pl.filter((p) => S.ready.includes(p.id)), wait = pl.filter((p) => !S.ready.includes(p.id));
  const mine = S.ready.includes(S.pid);
  box.innerHTML = `<button class="go" id="nxt" ${mine ? 'disabled' : ''}>${mine ? 'Aguardando os outros…' : S.results.last ? 'Ver resultado final' : 'Próxima rodada'}</button>
    <p class="ok">✔ Já clicaram: ${done.length ? done.map((p) => esc(p.name)).join(', ') : '—'}</p>
    <p class="bad">⏳ Faltam clicar: ${wait.length ? wait.map((p) => esc(p.name)).join(', ') : '—'}</p>`;
  const b = document.getElementById('nxt'); if (b) b.onclick = () => send({ type: 'ready' });
}