// uso: node scripts/check.js data/arquivo.js  -> valida listas (100 itens únicos, sem "|" no título)
const path = require('path');
const norm = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' e ').replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const rows = require(path.resolve(process.argv[2]));
let bad = 0;
for (const [theme, title, raw] of rows) {
  const items = raw.split('|').map((s) => s.trim()).filter(Boolean);
  const uniq = new Set(items.map(norm));
  const ok = items.length === 100 && uniq.size === 100;
  if (!ok) { bad++; console.log(`✗ [${theme}] ${title}: ${items.length} itens, ${uniq.size} únicos`); }
}
console.log(`${rows.length} listas, ${bad} com problema`);
process.exit(bad ? 1 : 0);
