const fs = require('node:fs');
const path = require('node:path');
const { DADOS_DIR, loadAll, ensureDir, isBill } = require('./store');

const { connectWhatsApp } = require('./whatsapp');

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

function message(values) {
  const [month, value, usage, valueDelta, usageDelta] = values;
  return [
    'Conta de luz · ' + month,
    'Valor: ' + value,
    'Consumo: ' + usage,
    'Variação em relação ao mês anterior: ' + valueDelta + ' e ' + usageDelta,
  ].join('\n');
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
    console.log(latest ? message(parameters(latest, bills)) : 'Nenhuma fatura disponível.');
    return;
  }
  if (mode === '--pair') {
    const phone = process.argv[3];
    if (phone && !/^\d{8,15}$/.test(phone)) throw new Error('Informe o telefone com DDI e DDD, somente dígitos.');
    const socket = await connectWhatsApp({ pair: true, phone, onCode: (code) => console.log('Código de pareamento: ' + code) });
    socket.end();
    console.log('WhatsApp pareado.');
    return;
  }
  if (mode !== '--init' && mode !== '--send') throw new Error('Use --preview, --init ou --send.');
  ensureDir(DADOS_DIR);
  const lockPath = statePath + '.lock';
  const lock = fs.openSync(lockPath, 'wx');
  let socket;
  try {
    if (!fs.existsSync(statePath)) {
      if (mode === '--pair') {
    const phone = process.argv[3];
    if (phone && !/^\d{8,15}$/.test(phone)) throw new Error('Informe o telefone com DDI e DDD, somente dígitos.');
    const socket = await connectWhatsApp({ pair: true, phone, onCode: (code) => console.log('Código de pareamento: ' + code) });
    socket.end();
    console.log('WhatsApp pareado.');
    return;
  }
  if (mode !== '--init') throw new Error('Execute npm run alerts -- --init primeiro.');
      saveState(Object.fromEntries(bills.map((bill) => [key(bill), 'historico'])));
      console.log('Histórico registrado. Próximas faturas ficam disponíveis para envio.');
      return;
    }
    if (mode === '--init') throw new Error('O histórico de avisos já foi inicializado.');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    for (const bill of bills) {
      if (Object.hasOwn(state, key(bill))) continue;
      socket ??= await connectWhatsApp();
      const result = await socket.sendMessage(socket.user.id, { text: message(parameters(bill, bills)) });
      if (!result?.key?.id) throw new Error('O WhatsApp não confirmou o envio.');
      state[key(bill)] = 'aceito';
      saveState(state);
      console.log('Aviso enviado para ' + bill.referencia);
    }
  } finally {
    socket?.end();
    fs.closeSync(lock);
    fs.unlinkSync(lockPath);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
