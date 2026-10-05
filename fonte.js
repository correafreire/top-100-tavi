// Busca rankings na Wikipédia em tempo real e extrai os 100 primeiros itens.
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const CACHE_DIR = path.join(__dirname, 'data', 'cache');
const TTL = 30 * 24 * 3600 * 1000;
const UA = { 'User-Agent': 'TAVI-TOP-100/1.0 (jogo educativo)' };
fs.mkdirSync(CACHE_DIR, { recursive: true });

const RANK_H = /^(#|n[ºo°.]?|pos\.?|posi[cç][aã]o|rank|ranking|classifica[cç][aã]o|lugar|place|no\.?|ord\.?)$/i;
const NAME_H = /(t[ií]tulo|title|film|filme|nome|name|pa[ií]s|country|cidade|city|artista|artist|jogo|game|song|m[uú]sica|single|[aá]lbum|album|banda|band|jogador|player|piloto|driver|clube|club|esta[cç][aã]o|s[eé]rie|series|program|show|marca|brand|ve[ií]culo|carro|car|model|esp[eé]cie|animal|livro|book|obra|work|site|aplicativo|app|canal|channel|personagem|character|praia|beach|monumento|landmark|local|site|est[aá]dio|stadium|equipe|team|atleta|athlete|autor|author|nome)/i;

const clean = (s) => String(s)
  .replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').replace(/[†‡*♦]+$/g, '').trim()
  .replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastReq = 0;
async function getJson(url) {
  for (let i = 0; i < 5; i++) {
    const wait = lastReq + 350 - Date.now();
    lastReq = Date.now() + Math.max(0, wait);
    if (wait > 0) await sleep(wait);
    const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(20000) });
    if (r.status === 429) { await sleep(2000 * (i + 1)); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  throw new Error('limite de requisições');
}

async function pageHtml(lang, page) {
  const u = `https://${lang}.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(page)}&prop=text&redirects=1&format=json&formatversion=2`;
  const j = await getJson(u);
  if (!j.parse) throw new Error('página não encontrada');
  return { html: j.parse.text, title: j.parse.title };
}

function tableRows($, t) {
  const rows = [];
  $(t).find('tr').each((_, tr) => {
    const cells = $(tr).children('th,td').map((__, c) => {
      const $c = $(c).clone();
      $c.find('sup,style,.reference,small').remove();
      return { th: c.tagName === 'th', text: clean($c.text()) };
    }).get();
    if (cells.length) rows.push(cells);
  });
  return rows;
}

function extractTable($, t, col) {
  const rows = tableRows($, t);
  if (rows.length < 20) return null;
  const hi = rows.findIndex((r) => r.every((c) => c.th));
  if (hi < 0) return null;
  const head = rows[hi].map((c) => c.text);
  let ci = -1;
  if (col) ci = head.findIndex((h) => h.toLowerCase().includes(String(col).toLowerCase()));
  if (ci < 0) ci = head.findIndex((h) => NAME_H.test(h) && !RANK_H.test(h));
  if (ci < 0) ci = head.findIndex((h) => !RANK_H.test(h));
  if (ci < 0) return null;
  const items = [];
  for (const r of rows.slice(hi + 1)) {
    if (r.length !== head.length) {
      // linhas com th de ranking à esquerda e menos células por rowspan: alinhar pela direita
      if (r.length > head.length || r.length < head.length - 1) continue;
    }
    const cell = r.length === head.length ? r[ci] : r[ci - (head.length - r.length)];
    if (cell && cell.text && cell.text.length <= 70 && !/^\d+([.,]\d+)?$/.test(cell.text)) items.push(cell.text);
  }
  return items;
}

function extractLists($) {
  let best = [];
  $('ol').each((_, ol) => {
    const items = $(ol).children('li').map((__, li) => {
      const $li = $(li).clone();
      $li.find('sup,ul,ol,style').remove();
      const a = $li.find('a').first().text();
      const txt = clean($li.text()).split(/\s[–—-]\s|,\s\d{4}|\s\(\d{4}/)[0];
      return clean(txt.length <= 70 ? txt : a);
    }).get().filter(Boolean);
    if (items.length > best.length) best = items;
  });
  return best;
}

const dedupe = (arr) => {
  const seen = new Set();
  return arr.filter((x) => { const k = x.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
};

// Retorna { title, items } com até 100 itens, ou null se a página não tem um ranking de 100.
async function extract(lang, page, col) {
  const { html, title } = await pageHtml(lang, page);
  const $ = cheerio.load(html);
  $('.references,.reflist,.mw-references-wrap,.navbox,.hatnote,.sidebar').remove();
  let best = [];
  $('table.wikitable').each((_, t) => {
    const it = extractTable($, t, col);
    if (it && it.length > best.length) best = it;
  });
  if (best.length < 100) {
    // junta tabelas consecutivas com o mesmo cabeçalho (rankings divididos em partes)
    const parts = [];
    $('table.wikitable').each((_, t) => { const it = extractTable($, t, col); if (it) parts.push(it); });
    const all = [].concat(...parts);
    if (dedupe(all).length >= 100 && parts.length <= 6) best = all;
  }
  if (best.length < 100) { const l = extractLists($); if (l.length > best.length) best = l; }
  best = dedupe(best);
  return best.length >= 100 ? { title, items: best.slice(0, 100) } : null;
}

const WD_LABEL = 'SERVICE wikibase:label { bd:serviceParam wikibase:language "pt-br,pt,en". }';
const wdQuery = (cls, prop, sl, max = 1e15, extra = '') => `SELECT ?item ?itemLabel (MAX(?x) AS ?v) WHERE { ?item wdt:${'P31'} wd:${cls}; wdt:${prop} ?x; wikibase:sitelinks ?sl. FILTER(?sl>=${sl} && ?x<${max}) ${extra} ${WD_LABEL} } GROUP BY ?item ?itemLabel ORDER BY DESC(?v) LIMIT 250`;
const SPARQL = {
  bilheteria: wdQuery('Q11424', 'P2142', 40, 3.5e9),
  bilheteria_animacao: wdQuery('Q202866', 'P2142', 30, 3e9),
  cidades_br: wdQuery('Q3184121', 'P1082', 5),
  jogos_vendas: wdQuery('Q7889', 'P2664', 20),
  carros_velocidade: wdQuery('Q3231690', 'P2052', 15, 500),
};

async function sparql(key) {
  const q = SPARQL[key];
  if (!q) throw new Error('consulta desconhecida');
  const r = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: { ...UA, Accept: 'application/sparql-results+json' }, signal: AbortSignal.timeout(60000) });
  if (!r.ok) throw new Error('Wikidata HTTP ' + r.status);
  const items = dedupe((await r.json()).results.bindings.map((b) => clean(b.itemLabel.value)).filter((x) => x && !/^Q\d+$/.test(x) && x.length <= 70));
  return items.length >= 100 ? { title: key, items: items.slice(0, 100) } : null;
}

const cachePath = (id) => path.join(CACHE_DIR, id.replace(/[^a-z0-9]+/gi, '_').slice(0, 120) + '.json');

// spec: { kind: 'wiki', lang, page, col } ou { kind: 'sparql', key }
async function fetchCached(id, spec) {
  const f = cachePath(id);
  try {
    const c = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (Date.now() - c.at < TTL) return c.data;
  } catch { /* sem cache */ }
  const data = spec.kind === 'sparql' ? await sparql(spec.key) : await extract(spec.lang, spec.page, spec.col);
  if (data) fs.writeFileSync(f, JSON.stringify({ at: Date.now(), data }));
  return data;
}
// Busca livre: procura páginas de lista na Wikipédia (pt e en) e valida as que têm 100+ itens.
async function search(q, langs = ['pt', 'en'], limit = 8) {
  const out = [];
  for (const lang of langs) {
    const u = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&srlimit=${limit}&format=json`;
    let hits = [];
    try { hits = (await getJson(u)).query.search; } catch { continue; }
    const res = await Promise.all(hits.map(async (h) => {
      try {
        const d = await extract(lang, h.title);
        return d && { lang, page: h.title, title: d.title, preview: d.items.slice(0, 3), last: d.items[99] };
      } catch { return null; }
    }));
    out.push(...res.filter(Boolean));
  }
  return out;
}

module.exports = { extract, fetchCached, search };
