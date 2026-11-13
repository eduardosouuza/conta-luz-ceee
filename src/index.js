const fs = require('fs');
const path = require('path');
const { getGmail } = require('./auth');
const { downloadAttachments } = require('./gmail');
const { parsePdf } = require('./parser');
const { upsert, loadAll, isBill } = require('./store');
const { generateAndSave } = require('./report');
const { ANEXOS_DIR } = require('./config');

function walkPdfs(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkPdfs(full));
    else if (/\.pdf$/i.test(entry.name)) out.push(full);
  }
  return out;
}

async function syncFromGmail() {
  console.log('Autenticando no Gmail...');
  const gmail = await getGmail();
  console.log('Buscando anexos PDF...');
  const saved = await downloadAttachments(gmail);
  console.log(`Anexos encontrados/baixados: ${saved.length}`);
  return saved.map((s) => s.filePath);
}

async function parseAll(paths) {
  const results = [];
  for (const p of paths) {
    try {
      const rec = await parsePdf(p);
      if (!isBill(rec)) {
        console.warn(`Fatura não identificada: ${path.basename(p)}`);
        continue;
      }
      results.push(rec);
      console.log(`Extraído: ${path.basename(p)} -> ref ${rec.referencia || 'n/d'} | ${rec.consumo_kwh ?? 'n/d'} kWh | R$ ${rec.valor_total ?? 'n/d'}`);
    } catch (e) {
      console.warn(`Falha ao processar ${p}: ${e.message}`);
      process.exitCode = 1;
    }
  }
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const localOnly = args.includes('--local');
  const importIdx = args.indexOf('--import');
  const importPath = importIdx >= 0 ? args[importIdx + 1] : null;
  if (importIdx >= 0 && (!importPath || importPath.startsWith('--'))) {
    throw new Error('Informe o caminho do PDF após --import.');
  }

  let pdfPaths = [];

  if (importPath) {
    if (!fs.existsSync(importPath)) {
      console.error(`Arquivo não encontrado: ${importPath}`);
      process.exit(1);
    }
    pdfPaths = [path.resolve(importPath)];
    console.log(`Importando PDF local: ${pdfPaths[0]}`);
  } else if (localOnly) {
    pdfPaths = walkPdfs(ANEXOS_DIR);
    console.log(`Modo local: ${pdfPaths.length} PDFs em anexos/`);
  } else {
    try {
      pdfPaths = await syncFromGmail();
    } catch (e) {
      console.error(`Erro no Gmail: ${e.message}`);
      console.error('Dica: rode "npm run auth" após configurar credentials.json, ou use --local para processar anexos já baixados.');
      process.exit(1);
    }
  }

  if (!pdfPaths.length) {
    console.log('Nenhum PDF para processar.');
  } else {
    const parsed = await parseAll(pdfPaths);
    if (importPath && !parsed.length) process.exitCode = 1;
    if (parsed.length || localOnly) {
      const merged = upsert(parsed);
      console.log(`Base atualizada: ${merged.length} fatura(s) em dados/contas.json e dados/contas.csv`);
    }
  }

  console.log('\n' + '='.repeat(60) + '\n');
  const report = generateAndSave(loadAll());
  console.log(report);
  console.log('\nRelatório gerado em dados/relatorio.md');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
