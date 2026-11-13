const fs = require('fs');
const path = require('path');
const { DADOS_DIR, JSON_PATH, CSV_PATH } = require('./config');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function loadAll() {
  try {
    return JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function keyOf(rec) {
  return `${rec.uc || 'UC'}|${rec.referencia || rec.numero_fatura || rec.arquivo}`;
}

function isBill(rec) {
  return Boolean(rec.uc && rec.referencia &&
    (rec.consumo_kwh != null || rec.valor_total != null));
}

function upsert(records) {
  ensureDir(DADOS_DIR);
  const all = loadAll().filter(isBill);
  const map = new Map(all.map((r) => [keyOf(r), r]));
  for (const r of records) map.set(keyOf(r), r);
  const merged = Array.from(map.values()).sort((a, b) => (a.referencia || '').localeCompare(b.referencia || ''));
  fs.writeFileSync(JSON_PATH, JSON.stringify(merged, null, 2), 'utf8');
  writeCsv(merged);
  return merged;
}

function csvEscape(v) {
  if (v == null) return '';
  const s = Array.isArray(v) || typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function writeCsv(rows) {
  const headers = [
    'uc', 'referencia', 'vencimento', 'emissao', 'valor_total', 'consumo_kwh',
    'leitura_anterior', 'leitura_atual', 'numero_fatura', 'linha_digitavel', 'arquivo'
  ];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push(headers.map((h) => csvEscape(r[h])).join(','));
  }
  // BOM para melhor compatibilidade com Excel em pt-BR/Windows
  fs.writeFileSync(CSV_PATH, '\ufeff' + lines.join('\n'), 'utf8');
}

module.exports = { loadAll, upsert, isBill, JSON_PATH, CSV_PATH, ensureDir, DADOS_DIR };
