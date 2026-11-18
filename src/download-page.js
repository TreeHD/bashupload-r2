import { encodeObjectKey } from './url-path.js';
import { resolveExpirationTime } from './multipart.js';

// Regular uploads use six base36 characters; multipart uploads use twelve hex characters.
const SHARE_ID = /^(?:[a-z0-9]{6}|[a-f0-9]{12})$/;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const power = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return (bytes / 1024 ** power).toFixed(power === 0 ? 0 : 1) + ' ' + units[power];
}

// The filename is only used after the visitor explicitly clicks Download.
// Keep normal file URLs unchanged (including inline text/image previews).
export function attachmentDisposition(key) {
  const filename = key.split('/').pop() || 'download';
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, char =>
    '%' + char.charCodeAt(0).toString(16).toUpperCase());
  return "attachment; filename*=UTF-8''" + encoded;
}

// Called only when the exact R2 key does not exist. Returns null for unrelated paths.
export async function maybeServeDownloadPage(env, path) {
  const id = path.endsWith('/') ? path.slice(0, -1) : path;
  if (!SHARE_ID.test(id)) return null;

  const listed = await env.R2_BUCKET.list({ prefix: id + '/', limit: 1000 });
  if (listed.truncated) {
    return new Response('Too many files under this share ID\n', { status: 409 });
  }

  const files = [];
  for (const item of listed.objects) {
    // Metadata-only lookup: opening this page must never count as a download.
    const info = await env.R2_BUCKET.head(item.key);
    if (!info) continue;

    const expiration = resolveExpirationTime(info);
    const expiresAt = expiration ? Date.parse(expiration) : NaN;
    if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
      await env.R2_BUCKET.delete(item.key);
      continue;
    }

    files.push({
      key: item.key,
      name: item.key.slice(id.length + 1),
      size: info.size,
      oneTime: !info.customMetadata?.oneTime || info.customMetadata.oneTime === 'true',
      expiresAt: Number.isFinite(expiresAt) ? new Date(expiresAt).toISOString() : null,
    });
  }

  if (files.length === 0) {
    return new Response('File not found\n', {
      status: 404,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const entries = files.map(file => {
    const details = [];
    const size = formatSize(file.size);
    if (size) details.push(size);
    if (file.oneTime) {
      details.push('⚠️ 僅能下載一次 / One-time download');
    } else if (file.expiresAt) {
      details.push('到期時間 / Expires: ' + file.expiresAt.replace('T', ' ').replace('.000Z', ' UTC'));
    }
    const href = '/' + encodeObjectKey(file.key) + '?download=1';
    return '<section class="file">' +
      '<div class="file-info"><div class="filename">' + escapeHtml(file.name) + '</div>' +
      '<div class="meta">' + escapeHtml(details.join(' · ')) + '</div></div>' +
      '<a class="download" href="' + escapeHtml(href) + '">下載檔案 / Download</a>' +
      '</section>';
  }).join('');

  const html = '<!doctype html><html lang="zh-Hant"><head>' +
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<title>檔案下載 / File download</title>' +
    '<style>' +
    '*{box-sizing:border-box}body{margin:0;min-height:100vh;background:#f5f7fb;color:#1e293b;' +
    'font:16px/1.6 system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;' +
    'display:flex;align-items:center;justify-content:center;padding:24px}' +
    'main{width:100%;max-width:660px;background:white;border:1px solid #e2e8f0;border-radius:18px;' +
    'padding:32px;box-shadow:0 10px 30px #0f172a0d}' +
    'h1{font-size:24px;margin:0 0 6px}.subtitle{color:#64748b;margin:0 0 24px}' +
    '.file{display:flex;align-items:center;justify-content:space-between;gap:18px;' +
    'padding:18px 0;border-top:1px solid #e2e8f0;flex-wrap:wrap}' +
    '.file-info{min-width:0;flex:1 1 250px}.filename{font-weight:650;overflow-wrap:anywhere}' +
    '.meta{font-size:13px;color:#64748b;margin-top:5px}' +
    '.download{display:inline-block;text-align:center;background:#2563eb;color:white;' +
    'text-decoration:none;font-weight:600;padding:11px 18px;border-radius:9px;white-space:nowrap}' +
    '.download:hover{background:#1d4ed8}.download:focus-visible{outline:3px solid #93c5fd;outline-offset:3px}' +
    '@media(max-width:520px){main{padding:24px}.download{width:100%}}' +
    '</style></head><body><main><h1>檔案下載</h1>' +
    '<p class="subtitle">File download · ' + escapeHtml(id) + '</p>' +
    entries + '</main></body></html>';

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    },
  });
}
