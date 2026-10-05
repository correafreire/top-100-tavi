const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const fonte = require('./fonte');

const PORT = process.env.PORT || 3000;
const TIMES = [10, 15, 20, 30];
const EMOJIS = ['like', 'dislike', 'laugh', 'angry', 'heart', 'think'];
const PUBLIC = path.join(__dirname, 'public');
const USED_FILE = path.join(__dirname, 'data', 'used.json');

const THEMES = [
  ['mundo', '🌎', 'Mundo & Viagens'], ['brasil', '🇧🇷', 'Brasil'], ['filmes', '🎬', 'Filmes'], ['series', '📺', 'Séries'],
  ['musica', '🎵', 'Música'], ['esportes', '⚽', 'Esportes'], ['comida', '🍔', 'Comidas & Bebidas'], ['carros', '🚗', 'Carros & Motos'],
  ['games', '🎮', 'Games'], ['tecnologia', '💻', 'Tecnologia'], ['internet', '🌐', 'Internet'], ['redes', '📱', 'Redes Sociais'],
  ['nostalgia80', '📼', 'Nostalgia anos 80/90/2000'], ['infancia', '🧸', 'Nostalgia da Infância'], ['nostinternet', '🖥️', 'Nostalgia da Internet'],
  ['nostalgiatv', '📺', 'Nostalgia da TV'], ['nostalgiatec', '💿', 'Nostalgia Tecnológica'], ['humor', '😂', 'Humor & Cultura Pop'],
  ['historia', '🧠', 'História & Curiosidades'], ['animais', '🐅', 'Animais & Natureza'], ['personagens', '🎭', 'Personagens'],
  ['economia', '💰', 'Economia'], ['streams', '▶️', 'Streams · Spotify, Netflix e outras'],
].map(([id, emoji, name]) => ({ id, emoji, name }));
// temas antigos das listas já existentes
const ALIAS = { nostalgia: 'nostalgia80', diferentes: 'historia' };

// ---------- normalização e correspondência ----------
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' e ').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const STOP = new Set(['o', 'a', 'os', 'as', 'de', 'do', 'da', 'dos', 'das', 'e', 'the', 'um', 'uma']);
const core = (s) => norm(s).split(' ').filter((w) => !STOP.has(w)).join(' ');

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

function matchAnswer(list, text) {
  const q = core(text);
  if (q.length < 2) return -1;
  let idx = list.cores.indexOf(q);
  if (idx >= 0) return idx;
  const tol = q.length <= 4 ? 0 : q.length <= 8 ? 1 : 2;
  let best = -1, bestD = 99;
  if (tol) list.cores.forEach((c, i) => { const d = lev(q, c); if (d <= tol && d < bestD) { best = i; bestD = d; } });
  if (best >= 0) return best;
  if (q.length >= 4) {
    const qw = q.split(' ');
    const hits = [];
    list.cores.forEach((c, i) => {
      const cw = c.split(' ');
      if (qw.every((w) => cw.includes(w))) hits.push(i);
    });
    if (hits.length === 1) return hits[0];
  }
  return -1;
}

// ---------- banco de perguntas ----------
function loadLists() {
  const lists = [];
  for (const f of fs.readdirSync(path.join(__dirname, 'data')).filter((f) => f.endsWith('.js'))) {
    for (const [theme0, title, raw] of require(path.join(__dirname, 'data', f))) {
      const theme = ALIAS[theme0] || theme0;
      const seen = new Set();
      const items = [];
      for (const it of raw.split('|').map((s) => s.trim()).filter(Boolean)) {
        const k = core(it);
        if (!seen.has(k)) { seen.add(k); items.push(it); }
      }
      const final = items.slice(0, 100);
      if (final.length < 100) continue;
      lists.push({ id: `${theme}:${norm(title)}`, theme, title, items: final, cores: final.map(core) });
    }
  }
  return lists;
}
const LISTS = loadLists();
const CATALOG = require('./data/fontes').map(([theme0, title, kind, a, b]) => { const theme = ALIAS[theme0] || theme0; return { id: `w:${theme}:${norm(title)}`, theme, title, remote: true, spec: kind === 'sparql' ? { kind, key: a } : { kind, lang: a, page: b } }; });
const failed = new Set();

let used = new Set();
try { used = new Set(JSON.parse(fs.readFileSync(USED_FILE, 'utf8'))); } catch { /* primeiro uso */ }
const saveUsed = () => fs.writeFileSync(USED_FILE, JSON.stringify([...used]));
const sources = (theme) => [...LISTS, ...CATALOG].filter((l) => !used.has(l.id) && !failed.has(l.id) && (theme === 'mix' || l.theme === theme));
const available = (theme) => sources(theme);

const buildList = (id, theme, title, items) => ({ id, theme, title, items, cores: items.map(core) });

// Sorteia uma lista inédita; as da internet são buscadas em tempo real (com cache de 30 dias).
async function pickList(theme, custom) {
  let pool = custom
    ? custom.filter((c) => !used.has(c.id) && !failed.has(c.id))
    : sources(theme);
  while (pool.length) {
    const l = pool[crypto.randomInt(pool.length)];
    pool = pool.filter((x) => x !== l);
    if (!l.remote) { used.add(l.id); saveUsed(); return l; }
    try {
      const d = await fonte.fetchCached(l.id, l.spec);
      if (d) { used.add(l.id); saveUsed(); return buildList(l.id, l.theme, l.title, d.items); }
    } catch (e) { console.log('falha ao buscar', l.page, e.message); }
    failed.add(l.id);
  }
  return null;
}
// ---------- salas ----------
const rooms = new Map();
const send = (ws, msg) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const genCode = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  let code;
  do { code = Array.from({ length: 4 }, () => c[crypto.randomInt(c.length)]).join(''); } while (rooms.has(code));
  return code;
};

const ranking = (room) => [...room.players.values()].sort((a, b) => b.score - a.score)
  .map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected }));

function roomState(room) {
  return {
    type: 'state', code: room.code, hostId: room.hostId, phase: room.phase, theme: room.theme,
    totalRounds: room.totalRounds, round: room.round, players: ranking(room), seconds: room.seconds,
  };
}
const broadcast = (room, msg) => room.players.forEach((p) => send(p.ws, msg));
const broadcastState = (room) => broadcast(room, roomState(room));

async function startRound(room) {
  clearTimeout(room.timer);
  if (room.starting) return;
  if (room.round >= room.totalRounds) return endGame(room);
  room.starting = true;
  let list;
  try { list = await pickList(room.theme, room.custom); } finally { room.starting = false; }
  if (!list) return endGame(room, 'Acabaram as perguntas inéditas desse tema!');
  room.round++;
  room.list = list;
  room.phase = 'round';
  room.endsAt = Date.now() + room.seconds * 1000;
  room.players.forEach((p) => { p.answer = ''; });
  broadcastState(room);
  broadcast(room, { type: 'round', round: room.round, totalRounds: room.totalRounds, title: list.title, endsAt: room.endsAt, total: room.seconds, now: Date.now() });
  room.timer = setTimeout(() => finishRound(room), room.seconds * 1000 + 300);
}

function finishRound(room) {
  clearTimeout(room.timer);
  const list = room.list;
  const results = [...room.players.values()].map((p) => {
    const idx = p.answer ? matchAnswer(list, p.answer) : -1;
    const points = idx >= 0 ? idx + 1 : 0;
    p.score += points;
    return { id: p.id, name: p.name, answer: p.answer, matched: idx >= 0 ? list.items[idx] : null, rank: idx >= 0 ? idx + 1 : null, points };
  }).sort((a, b) => b.points - a.points);
  const n = list.items.length;
  room.phase = 'results';
  room.ready = new Set();
  room.reacts = {};
  broadcastState(room);
  broadcast(room, room.lastResults = {
    type: 'results', round: room.round, totalRounds: room.totalRounds, title: list.title, results,
    top: list.items.slice(0, 10).map((name, i) => ({ rank: i + 1, name })),
    bottom: list.items.slice(Math.max(10, n - 10)).map((name, i) => ({ rank: Math.max(10, n - 10) + i + 1, name })),
    size: n, now: Date.now(),
    last: room.round >= room.totalRounds,
  });
}

function sendReady(room) {
  broadcast(room, { type: 'ready', ready: [...room.ready] });
  const waiting = [...room.players.values()].filter((p) => p.connected && !room.ready.has(p.id));
  if (!waiting.length) startRound(room);
}

function endGame(room, reason) {
  clearTimeout(room.timer);
  room.phase = 'final';
  broadcastState(room);
  broadcast(room, { type: 'final', reason: reason || null, ranking: ranking(room) });
}

function removeIfEmpty(room) {
  if ([...room.players.values()].every((p) => !p.connected)) {
    room.cleanup = setTimeout(() => {
      if ([...room.players.values()].every((p) => !p.connected)) { clearTimeout(room.timer); rooms.delete(room.code); }
    }, 5 * 60 * 1000);
  }
}

function resendCurrent(room, p) {
  send(p.ws, roomState(room));
  if (room.phase === 'round') send(p.ws, { type: 'round', round: room.round, totalRounds: room.totalRounds, title: room.list.title, endsAt: room.endsAt, total: room.seconds, now: Date.now(), answer: p.answer });
  if (room.phase === 'results' && room.lastResults) {
    send(p.ws, { ...room.lastResults, now: Date.now() });
    send(p.ws, { type: 'ready', ready: [...room.ready] });
    send(p.ws, { type: 'reacts', reacts: room.reacts });
  }
  if (room.phase === 'final') send(p.ws, { type: 'final', ranking: ranking(room) });
}

// ---------- servidor HTTP ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  if (url === '/api/themes') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({
      themes: THEMES.map((t) => ({ ...t, available: available(t.id).length })).filter((t) => t.available > 0),
      mix: available('mix').length,
    }));
  }
  if (url === '/api/search') {
    res.setHeader('Content-Type', 'application/json');
    const q = new URL(req.url, 'http://x').searchParams.get('q') || '';
    if (q.trim().length < 3) return res.end(JSON.stringify({ results: [] }));
    return fonte.search(q.trim().slice(0, 80)).then((results) => res.end(JSON.stringify({ results })), () => res.end(JSON.stringify({ results: [], error: true })));
  }
  const file = path.normalize(path.join(PUBLIC, url === '/' ? 'index.html' : url));
  if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end('Not found'); }
  res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});

const wss = new WebSocketServer({ server });
wss.on('connection', (ws) => {
  let room = null, me = null;
  const err = (message) => send(ws, { type: 'error', message });

  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const name = String(m.name || '').trim().slice(0, 16);

    if (m.type === 'create' || m.type === 'join') {
      if (!name) return err('Digite seu nome.');
      if (m.type === 'create') {
        let custom = null;
        if (m.theme === 'custom' && Array.isArray(m.custom)) {
          custom = m.custom.slice(0, 50).filter((c) => c && ['pt', 'en'].includes(c.lang) && typeof c.page === 'string' && typeof c.title === 'string')
            .map((c) => ({ id: `c:${c.lang}:${norm(c.page)}`, theme: 'custom', title: c.title.slice(0, 120), remote: true, spec: { kind: 'wiki', lang: c.lang, page: c.page.slice(0, 200) } }))
            .filter((c) => !used.has(c.id));
          if (!custom.length) return err('Esses rankings já foram usados. Busque outros.');
        }
        const theme = custom ? 'custom' : m.theme === 'mix' || THEMES.some((t) => t.id === m.theme) ? m.theme : 'mix';
        const rounds = custom ? custom.length : [10, 20, 30, 40, 50].includes(m.rounds) ? m.rounds : 10;
        const seconds = TIMES.includes(m.seconds) ? m.seconds : 30;
        room = { code: genCode(), hostId: null, phase: 'lobby', theme, custom, totalRounds: rounds, seconds, round: 0, players: new Map(), timer: null };
        rooms.set(room.code, room);
      } else {
        room = rooms.get(String(m.code || '').toUpperCase().trim());
        if (!room) { return err('Sala não encontrada.'); }
        clearTimeout(room.cleanup);
      }
      const prev = m.pid && room.players.get(m.pid);
      if (prev) { me = prev; me.ws = ws; me.connected = true; if (name) me.name = name; }
      else {
        if (room.phase !== 'lobby') { room = null; return err('O jogo dessa sala já começou.'); }
        if (room.players.size >= 20) { room = null; return err('Sala cheia (máx. 20).'); }
        if ([...room.players.values()].some((p) => p.name.toLowerCase() === name.toLowerCase())) { room = null; return err('Já existe alguém com esse nome na sala.'); }
        me = { id: crypto.randomUUID(), name, score: 0, ws, connected: true, answer: '' };
        room.players.set(me.id, me);
        if (!room.hostId) room.hostId = me.id;
      }
      send(ws, { type: 'joined', pid: me.id, code: room.code });
      resendCurrent(room, me);
      broadcastState(room);
      return;
    }

    if (!room || !me) return;
    if (m.type === 'start' && me.id === room.hostId && room.phase === 'lobby') {
      const avail = room.custom ? room.custom.filter((c) => !used.has(c.id)).length : available(room.theme).length;
      if (!avail) return err('Não há mais perguntas inéditas nesse tema. Escolha outro.');
      return startRound(room);
    }
    if (m.type === 'ready' && room.phase === 'results') { room.ready.add(me.id); return sendReady(room); }
    if (m.type === 'react' && room.phase === 'results' && EMOJIS.includes(m.emoji) && room.players.has(m.target)) {
      const t = (room.reacts[m.target] = room.reacts[m.target] || {});
      t[m.emoji] = (t[m.emoji] || 0) + 1;
      broadcast(room, { type: 'reacts', reacts: room.reacts, last: { target: m.target, emoji: m.emoji, from: me.name } });
      return;
    }
    if (m.type === 'answer' && room.phase === 'round' && Date.now() <= room.endsAt + 800) {
      me.answer = String(m.text || '').trim().slice(0, 80);
      send(ws, { type: 'ack', text: me.answer });
    }
    if (m.type === 'restart' && me.id === room.hostId && room.phase === 'final') {
      room.phase = 'lobby'; room.round = 0;
      room.players.forEach((p) => { p.score = 0; p.answer = ''; });
      if (m.theme) room.theme = m.theme === 'mix' || THEMES.some((t) => t.id === m.theme) ? m.theme : room.theme;
      if (!room.custom && [10, 20, 30, 40, 50].includes(m.rounds)) room.totalRounds = m.rounds;
      if (TIMES.includes(m.seconds)) room.seconds = m.seconds;
      broadcastState(room);
    }
  });

  ws.on('close', () => {
    if (!room || !me || me.ws !== ws) return;
    me.connected = false;
    if (room.phase === 'lobby') {
      room.players.delete(me.id);
      if (room.hostId === me.id) room.hostId = [...room.players.keys()][0] || null;
    } else if (room.hostId === me.id) {
      const next = [...room.players.values()].find((p) => p.connected);
      if (next) room.hostId = next.id;
    }
    broadcastState(room);
    if (room.phase === 'results') sendReady(room);
    removeIfEmpty(room);
  });
});

server.listen(PORT, () => {
  console.log(`Top 100 TAVI rodando em http://localhost:${PORT}`);
  console.log(`${LISTS.length} listas carregadas, ${available('mix').length} ainda inéditas.`);
});
