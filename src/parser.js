const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

function brToNumber(s) {
  if (s == null) return null;
  const n = String(s).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

function monthAbbrToRef(abbr, fallbackYear) {
  const map = {
    JAN: '01', FEV: '02', MAR: '03', ABR: '04', MAI: '05', JUN: '06',
    JUL: '07', AGO: '08', SET: '09', OUT: '10', NOV: '11', DEZ: '12',
  };
  const m = /^([A-Z]{3})\/(\d{2})$/i.exec((abbr || '').trim());
  if (!m) return null;
  const mm = map[m[1].toUpperCase()];
  if (!mm) return null;
  const yy = Number(m[2]);
  let year = 2000 + yy;
  if (fallbackYear && year > fallbackYear + 1) year -= 100;
  return `${year}-${mm}`;
}

function parseHistory(text, fallbackYear) {
  const monthRe = /\b(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/(\d{2})\b/g;
  let m;
  let firstIdx = -1;
  while ((m = monthRe.exec(text))) { firstIdx = m.index; break; }
  if (firstIdx < 0) return [];

  const pageIdx = text.indexOf('Página', firstIdx);
  const slice = text.slice(firstIdx, pageIdx > firstIdx ? pageIdx : firstIdx + 1200);

  const monthTokens = (slice.match(/\b(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\/\d{2}\b/gi) || []);
  const ativoIdx = slice.search(/\bAtivo\b/i);
  let values = [];
  if (ativoIdx >= 0) {
    const after = slice.slice(ativoIdx + 5).split(/\n/)[0] || slice.slice(ativoIdx + 5);
    values = (after.match(/\b\d{1,5}\b/g) || []).map((x) => Number(x));
  }

  const len = Math.min(monthTokens.length, values.length);
  const hist = [];
  for (let i = 0; i < len; i++) {
    const ref = monthAbbrToRef(monthTokens[i], fallbackYear);
    if (ref) hist.push({ referencia: ref, consumo_kwh: values[i] });
  }
  return hist;
}

function extractFields(text) {
  const get = (re) => {
    const m = re.exec(text);
    return m ? m[1].trim() : null;
  };

  // UC: geralmente aparece concatenada à referência "821.371.010-4411/2026" ou após beneficiário
  let uc = null;
  const ucWithRef = /(\d{3}\.\d{3}\.\d{3}-\d{2})(\d{2}\/\d{4})/.exec(text);
  if (ucWithRef) uc = ucWithRef[1];
  if (!uc) {
    const ucLabel = /UNIDADE CONSUMIDORA[^\d]*(\d{3}\.\d{3}\.\d{3}-\d{2})/i.exec(text);
    if (ucLabel) uc = ucLabel[1];
  }
  if (!uc) {
    const all = text.match(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g) || [];
    uc = all.find((v) => v !== '601.306.700-73') || all[0] || null;
  }

  let referencia = null;
  if (ucWithRef) {
    referencia = `${ucWithRef[2].slice(3)}-${ucWithRef[2].slice(0, 2)}`;
  } else {
    const refLabel = /REFERÊNCIA[^\n]*?(\d{2}\/\d{4})/i.exec(text) || /(?:\n|^)(\d{2}\/20\d{2})\s*(?:\n|Conta)/.exec(text);
    if (refLabel) referencia = `${refLabel[1].slice(3)}-${refLabel[1].slice(0, 2)}`;
  }

  const vencimento = get(/VENCIMENTO\s*\nPAGÁVEL[^\n]*\n?[^\d]*(\d{2}\/\d{2}\/\d{4})/i)
    || get(/R\$\s*[\d.,]+\s*\n?(\d{2}\/\d{2}\/\d{4})\s*\n?\d{3}\./)
    || get(/\b(\d{2}\/\d{2}\/\d{4})\b(?=\s*\n821\.|[\s\S]{0,40}Conta de Energia)/);
  const emissao = get(/DATA DE EMISSÃO:\s*(\d{2}\/\d{2}\/\d{4})/i) || get(/(\d{2}\/\d{2}\/\d{4})(?=\s*\nPague através do PIX)/i);

  const valorTotal = get(/R\$\s*([\d\.]+,\d{2})\s*\d{2}\/\d{2}\/\d{4}\s*\n\d{3}\./)
    || get(/VALOR DOCUMENTO[\s\S]*?R\$\s*([\d\.]+,\d{2})/i)
    || get(/\(=\)\s*VALOR COBRADO[\s\S]*?R\$\s*([\d\.]+,\d{2})/i);

  const consumo = get(/ATIVO TOTAL[^\n]*?(\d{1,5})\s*kWh/i)
    || get(/Consumo TE \(kWh\)\s*(\d{1,5})/i);

  let leituraAnterior = null;
  let leituraAtual = null;
  const leiturasBlock = /ATIVO TOTAL\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)\s*([0-9]{1,3}(?:\.[0-9]{3})+|[0-9]+)/i.exec(text);
  if (leiturasBlock) {
    leituraAnterior = brToNumber(leiturasBlock[1]);
    leituraAtual = brToNumber(leiturasBlock[2]);
  }

  const numeroFatura = get(/N[ºo°]\s*da\s*Fatura\s*(\d+)/i) || get(/NOSSO NÚMERO\s*\n\d{2}\/\d{2}\/\d{4}(\d+)/i);
  const linhaDigitavel = get(/\b(\d{5}\.\d{5}\s*\d{5}\.\d{6}\s*\d{5}\.\d{6}\s*\d\s*\d{14})\b/);

  const refYear = referencia ? Number(referencia.slice(0, 4)) : new Date().getFullYear();
  const historico = parseHistory(text, refYear);

  return {
    uc,
    referencia,
    vencimento,
    emissao,
    valor_total: brToNumber(valorTotal),
    consumo_kwh: consumo ? Number(consumo) : null,
    leitura_anterior: leituraAnterior,
    leitura_atual: leituraAtual,
    numero_fatura: numeroFatura,
    linha_digitavel: linhaDigitavel ? linhaDigitavel.replace(/\s+/g, ' ').trim() : null,
    historico_consumo: historico,
  };
}

async function parsePdf(filePath) {
  const buf = fs.readFileSync(filePath);
  const data = await pdfParse(buf);
  const text = data.text || '';
  const fields = extractFields(text);
  return {
    ...fields,
    arquivo: path.basename(filePath),
    arquivo_path: filePath,
    extraido_em: new Date().toISOString(),
  };
}

module.exports = { parsePdf, extractFields, parseHistory, brToNumber };
