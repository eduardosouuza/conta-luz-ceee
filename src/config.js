const path = require('path');

const ROOT = path.join(__dirname, '..');

module.exports = {
  ROOT,
  // Coloque o credentials.json (OAuth Client ID - Desktop) na raiz do projeto
  CREDENTIALS_PATH: path.join(ROOT, 'credentials.json'),
  TOKEN_PATH: path.join(ROOT, 'token.json'),
  ANEXOS_DIR: path.join(ROOT, 'anexos'),
  DADOS_DIR: path.join(ROOT, 'dados'),
  JSON_PATH: path.join(ROOT, 'dados', 'contas.json'),
  CSV_PATH: path.join(ROOT, 'dados', 'contas.csv'),
  REPORT_PATH: path.join(ROOT, 'dados', 'relatorio.md'),
  // Ajuste o filtro conforme seus e-mails (remetente/assunto)
  GMAIL_QUERY: 'has:attachment filename:pdf (equatorial OR ceee OR "conta de luz" OR "conta de energia")',
  SCOPES: ['https://www.googleapis.com/auth/gmail.readonly'],
};
