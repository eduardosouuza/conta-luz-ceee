const http = require('node:http');
const { loadAll } = require('./store');
const { collectMonthly } = require('./report');

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function render(records, demo = false) {
  const months = collectMonthly(records).slice(-12);
  const latest = months.at(-1);
  const previous = months.at(-2);
  const value = (amount) => Number.isFinite(amount) ? money.format(amount) : '—';
  const usage = (amount) => Number.isFinite(amount) ? amount + ' kWh' : '—';
  const difference = (field, format) => {
    if (!Number.isFinite(latest?.[field]) || !Number.isFinite(previous?.[field])) return '';
    const delta = latest[field] - previous[field];
    return (delta > 0 ? '+' : '') + format(delta) + ' vs. ' + previous.referencia;
  };
  const chart = (title, field, format) => {
    const max = Math.max(1, ...months.map((month) => month[field] ?? 0));
    const rows = months.map((month) => `
      <li><time>${month.referencia}</time>
      <span class="track" aria-hidden="true"><i style="width:${100 * (month[field] ?? 0) / max}%"></i></span>
      <strong>${format(month[field])}</strong></li>`).join('');
    return `<section class="panel"><h2>${title}</h2><ul>${rows}</ul></section>`;
  };
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex"><title>Conta de Luz · CEEE</title>
  <style>
  *{box-sizing:border-box}body{margin:0;background:#f3f6f1;color:#16332a;font:16px Inter,system-ui,sans-serif}
  main{max-width:1050px;margin:auto;padding:28px 18px 48px}header{background:#123c31;color:#fff;padding:clamp(22px,5vw,48px);border-radius:24px}
  h1{font-size:clamp(2rem,7vw,4rem);margin:6px 0 12px;line-height:1.05}h2{margin:0 0 18px;font-size:1.12rem}
  header p{margin:0;color:#bde6cd}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;margin-top:16px}
  .panel{background:white;border:1px solid #dbe6de;border-radius:18px;padding:20px}.metric{font-size:clamp(1.5rem,5vw,2.7rem);display:block}
  small{color:#456356}ul{list-style:none;margin:0;padding:0}li{display:grid;grid-template-columns:4.3rem minmax(0,1fr) 6rem;align-items:center;gap:8px;margin:10px 0;font-size:.82rem}
  li strong{text-align:right;font-variant-numeric:tabular-nums}.track{height:9px;background:#edf3ee;border-radius:9px;overflow:hidden}
  i{display:block;height:100%;background:#318360;border-radius:9px}footer{margin-top:18px;color:#456356;font-size:.85rem}
  @media(max-width:650px){.charts{grid-template-columns:1fr}.panel{padding:14px}}
  </style></head><body><main>
  <header><p>${demo ? 'Demonstração · Dados fictícios' : 'CEEE Equatorial'}</p><h1>Conta de Luz</h1><p>${latest ? monthName.format(new Date(latest.referencia + '-01T12:00:00Z')) : 'Nenhuma fatura importada'}</p></header>
  <div class="grid">
    <section class="panel"><h2>Último valor</h2><strong class="metric">${value(latest?.valor_total)}</strong><small>${difference('valor_total', value)}</small></section>
    <section class="panel"><h2>Último consumo</h2><strong class="metric">${usage(latest?.consumo_kwh)}</strong><small>${difference('consumo_kwh', usage)}</small></section>
  </div>
  <div class="grid charts">${chart('Valor por mês', 'valor_total', value)}${chart('Consumo por mês', 'consumo_kwh', usage)}</div>
  <footer>Até 12 meses de histórico. O traço indica que o dado está indisponível.</footer>
  </main></body></html>`;
}

const port = Number(process.env.PORT || 3000);
const demo = process.argv.includes('--demo');
const demoRecords = [
  { referencia: '2026-09', consumo_kwh: 175, valor_total: 188.20 },
  { referencia: '2026-10', consumo_kwh: 194, valor_total: 219.50 },
  { referencia: '2026-11', consumo_kwh: 181, valor_total: 201.35 },
];
if (process.argv.includes('--export-demo')) {
  const fs = require('node:fs');
  fs.mkdirSync('dist', { recursive: true });
  fs.writeFileSync('dist/index.html', render(demoRecords, true));
  fs.copyFileSync(require('node:path').join(__dirname, '..', 'privacidade.html'), 'dist/privacidade.html');
} else {
http.createServer((req, res) => {
  if (req.method !== 'GET' || req.url !== '/') {
    res.writeHead(404).end();
    return;
  }
  try {
    const records = demo ? demoRecords : loadAll().filter((record) =>
      /^\d{4}-(0[1-9]|1[0-2])$/.test(record.referencia));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(render(records, demo));
  } catch {
    res.writeHead(500).end('Não foi possível carregar as faturas.');
  }
}).listen(port, '127.0.0.1', () => console.log('Painel em http://127.0.0.1:' + port));
}
