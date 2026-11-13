const path = require('node:path');
const qrTerminal = require('qrcode-terminal');
const { DADOS_DIR } = require('./config');

async function connectWhatsApp({ pair = false, phone, onCode = console.log } = {}) {
  const { makeWASocket, Browsers, DisconnectReason, useMultiFileAuthState } = await import('baileys');
  const { state, saveCreds } = await useMultiFileAuthState(path.join(DADOS_DIR, 'whatsapp-session'));
  if (!pair && !state.creds.registered) throw new Error('Execute npm run alerts -- --pair.');

  for (let attempt = 0; attempt < 2; attempt++) {
    const socket = makeWASocket({
      auth: state,
      browser: Browsers.macOS('Chrome'),
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });
    let saved = Promise.resolve();
    socket.ev.on('creds.update', () => { saved = saved.then(saveCreds); });

    try {
      const outcome = await new Promise((resolve, reject) => {
        let codeRequested = false;
        const timer = setTimeout(() => finish(reject, new Error('Tempo de conexão esgotado.')), 120_000);
        function finish(callback, value) {
          clearTimeout(timer);
          socket.ev.off('connection.update', update);
          callback(value);
        }
        function update({ connection, lastDisconnect, qr }) {
          if (connection === 'open') finish(resolve, 'open');
          if (connection === 'close') finish(resolve, lastDisconnect?.error?.output?.statusCode);
          if (pair && qr && !state.creds.registered && !codeRequested) {
            codeRequested = true;
            if (phone) {
              socket.requestPairingCode(phone).then(onCode, (error) => finish(reject, error));
            } else {
              qrTerminal.generate(qr, { small: true });
              codeRequested = false;
            }
          }
        }
        socket.ev.on('connection.update', update);
      });
      await saved;
      if (outcome === 'open') return socket;
      if (outcome !== DisconnectReason.restartRequired) {
        throw new Error('WhatsApp encerrou a conexão (código ' + (outcome ?? 'desconhecido') + ').');
      }
    } catch (error) {
      socket.end();
      throw error;
    }
  }
  throw new Error('WhatsApp solicitou nova conexão. Execute o comando novamente.');
}

module.exports = { connectWhatsApp };
