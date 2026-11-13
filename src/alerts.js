const fs = require('node:fs');
const path = require('node:path');
const { DADOS_DIR, loadAll, ensureDir, isBill } = require('./store');

const statePath = path.join(DADOS_DIR, 'avisos-whatsapp.json');
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const key = (bill) => bill.uc + '|' + bill.referencia;

function parameters(bill, bills) {
  const date = new Date(bill.referencia + '-01T12:00:00Z');
  date.setUTCMonth(date.getUTCMonth() - 1);
  const previous = bills.find((item) =>
    item.uc === bill.uc && item.referencia === date.toISOString().slice(0, 7));
  const delta = (field, format) => {
    if (bill[field] == null || previous?.[field] == null) return 'indisponível';
    const difference = bill[field] - previous[field];
    return (difference > 0 ? '+' : '') + format(difference);
  };
  const usage = (amount) => amount + ' kWh';
  return [
    bill.referencia,
    bill.valor_total == null ? 'indisponível' : money.format(bill.valor_total),
    bill.consumo_kwh == null ? 'indisponível' : usage(bill.consumo_kwh),
    delta('valor_total', (amount) => money.format(amount)),
    delta('consumo_kwh', usage),
  ];
}

async function sendTemplate(values) {
  const { WA_API_VERSION, WA_PHONE_ID, WA_TOKEN, WA_TO, WA_TEMPLATE } = process.env;
  if (!/^v\d+\.\d+$/.test(WA_API_VERSION || '') || !/^\d+$/.test(WA_PHONE_ID || '') ||
      !/^\d{8,15}$/.test(WA_TO || '') || !WA_TOKEN || !WA_TEMPLATE) {
    throw new Error('Preencha as variáveis WA_* no arquivo .env.');
  }
  const response = await fetch(`https://graph.facebook.com/${WA_API_VERSION}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + WA_TOKEN, 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: WA_TO,
      type: 'template',
      template: {
        name: WA_TEMPLATE,
        language: { code: 'pt_BR' },
        components: [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }],
      },
    }),
  });
  const result = await response.json();
  if (!response.ok || !result.messages?.[0]?.id) {
    throw new Error(`Meta não aceitou o aviso (HTTP ${response.status}, código ${result.error?.code ?? 'indisponível'}).`);
  }
}

function saveState(state) {
  const temporary = statePath + '.tmp';
  fs.writeFileSync(temporary, JSON.stringify(state, null, 2));
  fs.renameSync(temporary, statePath);
}

async function main() {
  const mode = process.argv[2] || '--preview';
  const bills = loadAll().filter(isBill).sort((a, b) => a.referencia.localeCompare(b.referencia));
  if (mode === '--preview') {
    const latest = bills.at(-1);
    console.log(latest ? parameters(latest, bills).join(' | ') : 'Nenhuma fatura disponível.');
    return;
  }
  if (mode !== '--init' && mode !== '--send') throw new Error('Use --preview, --init ou --send.');
  ensureDir(DADOS_DIR);
  const lockPath = statePath + '.lock';
  const lock = fs.openSync(lockPath, 'wx');
  try {
    if (!fs.existsSync(statePath)) {
      if (mode !== '--init') throw new Error('Execute npm run alerts -- --init primeiro.');
      saveState(Object.fromEntries(bills.map((bill) => [key(bill), 'historico'])));
      console.log('Histórico registrado. Próximas faturas ficam disponíveis para envio.');
      return;
    }
    if (mode === '--init') throw new Error('O histórico de avisos já foi inicializado.');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    for (const bill of bills) {
      if (Object.hasOwn(state, key(bill))) continue;
      await sendTemplate(parameters(bill, bills));
      state[key(bill)] = 'aceito';
      saveState(state);
      console.log('Aviso aceito pela Meta para ' + bill.referencia);
    }
  } finally {
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
