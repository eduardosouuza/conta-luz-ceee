const fs = require('fs');
const path = require('path');
const { loadAll } = require('./store');
const { REPORT_PATH, DADOS_DIR } = require('./config');

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }

function fmtBRL(v) {
  if (v == null || !Number.isFinite(v)) return 'n/d';
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
function fmtNum(v, d = 2) {
  if (v == null || !Number.isFinite(v)) return 'n/d';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function pct(a, b) {
  if (a == null || b == null || b === 0) return null;
  return ((a - b) / b) * 100;
}
function fmtPct(v) {
  if (v == null || !Number.isFinite(v)) return 'n/d';
  const sign = v > 0 ? '+' : '';
  return `${sign}${fmtNum(v, 1)}%`;
}

function collectMonthly(records) {
  // Consolida por referência (YYYY-MM) usando registros das faturas;
  // se houver histórico de consumo embutido na fatura mais recente, complementa meses faltantes.
  const byRef = new Map();
  for (const r of records) {
    if (r.referencia) {
      byRef.set(r.referencia, {
        referencia: r.referencia,
        valor_total: r.valor_total ?? null,
        consumo_kwh: r.consumo_kwh ?? null,
        uc: r.uc || null,
        fonte: 'fatura',
      });
    }
    if (Array.isArray(r.historico_consumo)) {
      for (const h of r.historico_consumo) {
        if (!h || !h.referencia) continue;
        if (!byRef.has(h.referencia)) {
          byRef.set(h.referencia, { referencia: h.referencia, valor_total: null, consumo_kwh: h.consumo_kwh ?? null, uc: r.uc || null, fonte: 'historico' });
        } else {
          const cur = byRef.get(h.referencia);
          if ((cur.consumo_kwh == null) && h.consumo_kwh != null) cur.consumo_kwh = h.consumo_kwh;
        }
      }
    }
  }
  return Array.from(byRef.values()).sort((a, b) => a.referencia.localeCompare(b.referencia));
}

function buildReport(records) {
  const months = collectMonthly(records);
  const lines = [];
  const now = new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
  lines.push('# Resumo de contas de luz (CEEE/Equatorial)');
  lines.push('');
  lines.push(`Gerado em: ${now}`);
  lines.push(`Registros de fatura: ${records.length} | Meses consolidados: ${months.length}`);
  lines.push('');

  if (!months.length) {
    lines.push('Nenhum dado encontrado. Execute a sincronização ou importe PDFs.');
    return { text: lines.join('\n'), months: [] };
  }

  // Tabela de meses
  lines.push('## Consumo e valores por mês');
  lines.push('');
  lines.push('| Mês | Consumo (kWh) | Valor (R$) | R$/kWh | Fonte |');
  lines.push('|---|---:|---:|---:|---|');
  for (const m of months) {
    const rpk = (m.valor_total != null && m.consumo_kwh) ? (m.valor_total / m.consumo_kwh) : null;
    lines.push(`| ${m.referencia} | ${m.consumo_kwh ?? 'n/d'} | ${m.valor_total != null ? fmtBRL(m.valor_total) : 'n/d'} | ${rpk != null ? fmtBRL(rpk) : 'n/d'} | ${m.fonte} |`);
  }
  lines.push('');

  const withValue = months.filter((m) => m.valor_total != null);
  const withKwh = months.filter((m) => m.consumo_kwh != null);
  const latest = months[months.length - 1];
  const prev = months.length >= 2 ? months[months.length - 2] : null;

  lines.push('## Quanto você gastou a mais/menos (último mês consolidado)');
  lines.push('');
  lines.push(`Mês de referência: **${latest.referencia}** (consumo ${latest.consumo_kwh ?? 'n/d'} kWh, valor ${latest.valor_total != null ? fmtBRL(latest.valor_total) : 'n/d'})`);
  lines.push('');

  const comparisons = [];

  if (prev) {
    if (latest.valor_total != null && prev.valor_total != null) {
      const diff = latest.valor_total - prev.valor_total;
      comparisons.push(`- Vs mês anterior (${prev.referencia}): ${diff >= 0 ? 'a mais' : 'a menos'} ${fmtBRL(Math.abs(diff))} (${fmtPct(pct(latest.valor_total, prev.valor_total))})`);
    }
    if (latest.consumo_kwh != null && prev.consumo_kwh != null) {
      const diff = latest.consumo_kwh - prev.consumo_kwh;
      comparisons.push(`- Consumo vs mês anterior: ${diff >= 0 ? '+' : ''}${diff} kWh (${fmtPct(pct(latest.consumo_kwh, prev.consumo_kwh))})`);
    }
  }

  // Média 12 meses (valor e kWh) excluindo o último para comparar "a mais que a média"
  const last12Val = withValue.slice(-13, -1); // até 12 anteriores ao último
  if (latest.valor_total != null && last12Val.length) {
    const avg = last12Val.reduce((s, m) => s + m.valor_total, 0) / last12Val.length;
    const diff = latest.valor_total - avg;
    comparisons.push(`- Vs média de valor (${last12Val.length} meses anteriores): ${diff >= 0 ? 'a mais' : 'a menos'} ${fmtBRL(Math.abs(diff))} que a média ${fmtBRL(avg)} (${fmtPct(pct(latest.valor_total, avg))})`);
  }
  const last12Kwh = withKwh.slice(-13, -1);
  if (latest.consumo_kwh != null && last12Kwh.length) {
    const avg = last12Kwh.reduce((s, m) => s + m.consumo_kwh, 0) / last12Kwh.length;
    const diff = latest.consumo_kwh - avg;
    comparisons.push(`- Vs média de consumo (${last12Kwh.length} meses anteriores): ${diff >= 0 ? '+' : ''}${fmtNum(diff, 0)} kWh vs média ${fmtNum(avg, 1)} kWh (${fmtPct(pct(latest.consumo_kwh, avg))})`);
  }

  // Mesmo mês do ano anterior
  if (latest.referencia) {
    const [y, mm] = latest.referencia.split('-').map(Number);
    const prevYearRef = `${y - 1}-${String(mm).padStart(2, '0')}`;
    const same = months.find((m) => m.referencia === prevYearRef);
    if (same) {
      if (latest.valor_total != null && same.valor_total != null) {
        const diff = latest.valor_total - same.valor_total;
        comparisons.push(`- Vs mesmo mês do ano anterior (${same.referencia}): ${diff >= 0 ? 'a mais' : 'a menos'} ${fmtBRL(Math.abs(diff))} (${fmtPct(pct(latest.valor_total, same.valor_total))})`);
      }
      if (latest.consumo_kwh != null && same.consumo_kwh != null) {
        const diff = latest.consumo_kwh - same.consumo_kwh;
        comparisons.push(`- Consumo vs ${same.referencia}: ${diff >= 0 ? '+' : ''}${diff} kWh (${fmtPct(pct(latest.consumo_kwh, same.consumo_kwh))})`);
      }
    }
  }

  if (!comparisons.length) {
    lines.push('Dados insuficientes para comparações (é preciso valor/consumo do mês atual e de meses anteriores).');
  } else {
    for (const c of comparisons) lines.push(c);
  }
  lines.push('');

  // Extremos
  lines.push('## Destaques');
  lines.push('');
  if (withValue.length) {
    const maxV = withValue.reduce((a, b) => (a.valor_total > b.valor_total ? a : b));
    const minV = withValue.reduce((a, b) => (a.valor_total < b.valor_total ? a : b));
    lines.push(`- Maior valor: ${fmtBRL(maxV.valor_total)} em ${maxV.referencia}`);
    lines.push(`- Menor valor: ${fmtBRL(minV.valor_total)} em ${minV.referencia}`);
  }
  if (withKwh.length) {
    const maxK = withKwh.reduce((a, b) => (a.consumo_kwh > b.consumo_kwh ? a : b));
    const minK = withKwh.reduce((a, b) => (a.consumo_kwh < b.consumo_kwh ? a : b));
    lines.push(`- Maior consumo: ${maxK.consumo_kwh} kWh em ${maxK.referencia}`);
    lines.push(`- Menor consumo: ${minK.consumo_kwh} kWh em ${minK.referencia}`);
  }
  const totalValor = withValue.reduce((s, m) => s + m.valor_total, 0);
  if (withValue.length) {
    lines.push(`- Soma dos valores registrados: ${fmtBRL(totalValor)} (${withValue.length} faturas com valor)`);
  }
  lines.push('');

  return { text: lines.join('\n'), months };
}

function generateAndSave(records) {
  ensureDir(DADOS_DIR);
  const recs = records || loadAll();
  const { text } = buildReport(recs);
  fs.writeFileSync(REPORT_PATH, '\ufeff' + text, 'utf8');
  return text;
}

if (require.main === module) {
  const text = generateAndSave();
  console.log(text);
  console.log(`\nRelatório salvo em: ${REPORT_PATH}`);
}

module.exports = { buildReport, generateAndSave, collectMonthly };
