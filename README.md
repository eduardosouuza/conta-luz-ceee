# conta-luz-ceee

Automação em Node.js para baixar faturas de energia (CEEE/Equatorial) do Gmail, extrair consumo/valores e gerar um resumo de gastos (ex.: "quanto gastei a mais").

## O que faz
- **Gmail (API + OAuth2)**: busca e baixa anexos PDF (`npm run sync`).
- **Extração**: lê o PDF e extrai UC, referência (mês), vencimento, valor, consumo (kWh), leituras e o histórico mensal quando presente na fatura (parser ajustado ao layout CEEE/Equatorial).
- **Organização**: consolida em `dados/contas.json` e `dados/contas.csv` (sem duplicar por UC+referência).
- **Resumo**: gera `dados/relatorio.md` com tabela por mês e comparações — Δ vs mês anterior, vs média dos meses anteriores, vs mesmo mês do ano anterior, R$/kWh e maiores/menores meses. **Os cálculos são feitos em código (sem API de IA).**

> IA só seria útil como fallback para PDFs escaneados/imagem ou layouts de outras distribuidoras. Para o layout atual, a extração determinística é suficiente.

## Pré-requisitos
- Node.js 18+ e npm
- Conta Google (Gmail) com as faturas

## Instalação
```bash
cd "C:\Users\eduar\OneDrive\Documentos\Projetos-web\conta-luz-ceee"
npm install
```

## Configurar Gmail API (OAuth2)
1. Acesse [Google Cloud Console](https://console.cloud.google.com/) e crie/selecione um projeto.
2. Ative a **Gmail API** (APIs e serviços → Biblioteca → Gmail API).
3. Configure a **Tela de consentimento OAuth** (tipo Externo para conta pessoal; adicione seu e-mail como usuário de teste).
4. Crie credenciais: **Credenciais → Criar credenciais → ID do cliente OAuth → Tipo: Aplicativo para computador (Desktop)**.
5. Baixe o JSON e salve como `credentials.json` na raiz do projeto (`conta-luz-ceee/credentials.json`).
6. Autentique (abre o navegador na primeira vez):
```bash
npm run auth
```
Isso gera `token.json` (não compartilhe `credentials.json` nem `token.json`).

## Uso
- Sincronizar do Gmail, extrair e gerar relatório:
```bash
npm run sync
```
- Reprocessar PDFs já baixados (sem acessar o Gmail):
```bash
npm run sync -- --local
```
- Importar um PDF específico (ex.: teste com a fatura de exemplo):
```bash
npm run sync -- --import "C:\Users\eduar\Downloads\CEEE Grupo Equatorial - Fatura - 10112026.PDF"
```
- Só regenerar o relatório a partir dos dados já consolidados:
```bash
npm run report
```

## Configuração
Edite `src/config.js`:
- `GMAIL_QUERY`: filtro de busca (padrão: anexos PDF de Equatorial/CEEE/conta de energia/luz). Ajuste `from:`/`subject:` se necessário.
- Pastas de saída: `anexos/` (PDFs por mês) e `dados/` (CSV/JSON/relatório).

## Estrutura
```
conta-luz-ceee/
  src/
    config.js   # caminhos e query do Gmail
    auth.js     # OAuth2
    gmail.js    # busca e download de anexos
    parser.js   # extração de campos do PDF (CEEE/Equatorial)
    store.js    # consolidação JSON/CSV
    report.js   # resumo e comparações de gasto
    index.js    # orquestração (sync/import/local)
  anexos/       # PDFs baixados
  dados/        # contas.json, contas.csv, relatorio.md
```

## Observações
- Os PDFs ficam em `anexos/YYYY-MM/`; o `.gitignore` evita versionar anexos, dados e credenciais.
- Se sua concessionária mudar o layout do PDF, ajuste as regex/âncoras em `src/parser.js`.
- Agendamento (opcional): use o Agendador de Tarefas do Windows para rodar `npm run sync` periodicamente.

## Painel e WhatsApp

No Node.js 22 ou superior, rode `npm run web` e abra `http://127.0.0.1:3000`. O painel lê o JSON a cada visita e reaproveita `collectMonthly` de `src/report.js`. Essa função combina faturas e histórico de consumo. O servidor transforma o resultado em HTML e o CSS empilha os gráficos em telas pequenas.

O painel escuta apenas no computador. Para usar com dados reais pelo celular, sirva a porta local por um proxy HTTPS privado com autenticação, acessível ao celular. O computador precisa ficar ligado enquanto servir a página. Para demonstrar o projeto no portfólio, rode `npm run web -- --demo`. O modo demonstração usa três registros fictícios. Mantenha `dados/`, PDFs, tokens e `.env` fora do repositório público.

O arquivo `src/alerts.js` compara a fatura com o mês anterior da mesma unidade, monta os parâmetros e envia um template pela [API oficial do WhatsApp Business](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview). O registro local dos avisos usa unidade consumidora e referência como chave. Uma resposta aceita pela API é gravada no disco, permitindo que a próxima execução pule o aviso já registrado. Uma interrupção entre o aceite da Meta e a gravação local pode causar reenvio. O aceite da API indica que a Meta recebeu a solicitação de envio.

1. Rode `npm run alerts -- --preview` para ver os dados que iriam na mensagem.
2. Configure o número remetente no WhatsApp Business, adicione seu número como destinatário e crie um template de utilidade em português do Brasil. Use cinco parâmetros posicionais no corpo, como no exemplo abaixo. Aguarde a aprovação da Meta.
3. Copie `.env.example` para `.env`. Preencha a versão Graph API escolhida no console da Meta, o ID do telefone remetente, o token, o telefone destinatário com código de país e o nome do template.
4. Rode `npm run alerts -- --init` uma vez com a base atual. Isso marca as faturas existentes como histórico.
5. Depois de configurar o template e as credenciais, execute `powershell -NoProfile -File scripts/sync-and-notify.ps1`. Para verificar diariamente, agende esse script no Agendador de Tarefas do Windows usando o caminho absoluto. Ele só tenta avisar após uma sincronização bem-sucedida. O token OAuth do Gmail em modo de teste precisa ser renovado a cada sete dias.

```text
Sua fatura de energia de {{1}} está disponível.
Valor total: {{2}}
Consumo: {{3}}
Variação de valor em relação ao mês anterior: {{4}}
Variação de consumo em relação ao mês anterior: {{5}}
```
