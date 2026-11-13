const fs = require('fs');
const { authenticate } = require('@google-cloud/local-auth');
const { google } = require('googleapis');
const { CREDENTIALS_PATH, TOKEN_PATH, SCOPES } = require('./config');

async function loadSavedCredentialsIfExist() {
  try {
    const content = fs.readFileSync(TOKEN_PATH, 'utf8');
    const credentials = JSON.parse(content);
    return google.auth.fromJSON(credentials);
  } catch {
    return null;
  }
}

async function saveCredentials(client) {
  const content = fs.readFileSync(CREDENTIALS_PATH, 'utf8');
  const keys = JSON.parse(content);
  const key = keys.installed || keys.web;
  if (!key) throw new Error('credentials.json inválido: esperado campo "installed" ou "web".');
  const payload = JSON.stringify({
    type: 'authorized_user',
    client_id: key.client_id,
    client_secret: key.client_secret,
    refresh_token: client.credentials.refresh_token,
  });
  fs.writeFileSync(TOKEN_PATH, payload, 'utf8');
}

async function authorize() {
  let client = await loadSavedCredentialsIfExist();
  if (client) return client;
  if (!fs.existsSync(CREDENTIALS_PATH)) {
    throw new Error(
      `Arquivo de credenciais não encontrado: ${CREDENTIALS_PATH}\n` +
        'Crie um OAuth Client ID (Aplicativo para computador/Desktop) no Google Cloud e salve como credentials.json.'
    );
  }
  client = await authenticate({ scopes: SCOPES, keyfilePath: CREDENTIALS_PATH });
  if (client.credentials) await saveCredentials(client);
  return client;
}

async function getGmail() {
  const auth = await authorize();
  return google.gmail({ version: 'v1', auth });
}

if (require.main === module) {
  authorize()
    .then(() => console.log(`Autenticado. Token salvo em: ${TOKEN_PATH}`))
    .catch((err) => {
      console.error(err.message || err);
      process.exit(1);
    });
}

module.exports = { authorize, getGmail };
