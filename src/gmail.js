const fs = require('fs');
const path = require('path');
const { GMAIL_QUERY, ANEXOS_DIR } = require('./config');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function decodeBase64Url(data) {
  const normalized = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64');
}

function findPdfParts(payload, acc = []) {
  if (!payload) return acc;
  const { filename, body, mimeType, parts } = payload;
  if (body && body.attachmentId && filename && /\.pdf$/i.test(filename)) {
    acc.push({ filename, attachmentId: body.attachmentId, mimeType });
  }
  if (Array.isArray(parts)) {
    for (const p of parts) findPdfParts(p, acc);
  }
  return acc;
}

function getHeader(headers, name) {
  const h = (headers || []).find((x) => (x.name || '').toLowerCase() === name.toLowerCase());
  return h ? h.value : '';
}

function refFromDate(internalDate) {
  const d = new Date(Number(internalDate));
  if (Number.isNaN(d.getTime())) return 'desconhecida';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

async function listMessages(gmail, q = GMAIL_QUERY) {
  const msgs = [];
  let pageToken;
  do {
    const res = await gmail.users.messages.list({ userId: 'me', q, pageToken, maxResults: 100 });
    if (res.data.messages) msgs.push(...res.data.messages);
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return msgs;
}

async function downloadAttachments(gmail, options = {}) {
  const query = options.query || GMAIL_QUERY;
  ensureDir(ANEXOS_DIR);
  const messages = await listMessages(gmail, query);
  const saved = [];

  for (const { id } of messages) {
    const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
    const headers = msg.data.payload?.headers || [];
    const subject = getHeader(headers, 'Subject');
    const from = getHeader(headers, 'From');
    const date = getHeader(headers, 'Date');
    const ref = refFromDate(msg.data.internalDate);
    const parts = findPdfParts(msg.data.payload);

    for (const part of parts) {
      const att = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: id,
        id: part.attachmentId,
      });
      const buf = decodeBase64Url(att.data.data);
      const dir = path.join(ANEXOS_DIR, ref);
      ensureDir(dir);
      const safeName = part.filename.replace(/[<>:"/\\|?*]+/g, '_');
      const base = `${id}_${safeName}`;
      const filePath = path.join(dir, base);
      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, buf);
      }
      saved.push({ filePath, filename: safeName, messageId: id, subject, from, date, ref });
    }
  }

  return saved;
}

module.exports = { downloadAttachments, listMessages };
