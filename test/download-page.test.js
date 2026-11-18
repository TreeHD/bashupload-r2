import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';

function setup() {
  const objects = new Map();
  const pending = [];
  const getCalls = [];

  const R2_BUCKET = {
    async put(key, body, options) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, {
        bytes, uploaded: new Date(),
        customMetadata: options.customMetadata,
        httpMetadata: options.httpMetadata,
      });
      return { size: bytes.length };
    },
    async get(key) {
      getCalls.push(key);
      const item = objects.get(key);
      if (!item) return null;
      return {
        body: item.bytes,
        httpEtag: '"etag"',
        writeHttpMetadata(headers) {
          headers.set('Content-Type', item.httpMetadata.contentType);
        },
      };
    },
    async head(key) {
      const item = objects.get(key);
      if (!item) return null;
      return {
        uploaded: item.uploaded,
        size: item.bytes.length,
        customMetadata: item.customMetadata,
      };
    },
    async list({ prefix, limit }) {
      const keys = [...objects.keys()].filter(key => key.startsWith(prefix));
      return {
        objects: keys.slice(0, limit).map(key => ({ key })),
        truncated: keys.length > limit,
      };
    },
    async delete(key) {
      objects.delete(key);
    },
  };

  const env = { R2_BUCKET, PASSWORD: '', DEFAULT_EXPIRATION_SECONDS: '3600' };
  const ctx = { waitUntil(promise) { pending.push(promise); } };
  return { objects, getCalls, pending, env, ctx };
}

function addFile(objects, key, contents, metadata = { oneTime: 'false' }) {
  const bytes = new TextEncoder().encode(contents);
  objects.set(key, {
    bytes, uploaded: new Date(),
    customMetadata: metadata,
    httpMetadata: { contentType: 'text/plain' },
  });
}

test('six-character share URL shows a page without downloading; button forces attachment', async () => {
  const { env, ctx, objects, getCalls } = setup();
  const upload = await worker.fetch(new Request('https://files.example/fff.txt', {
    method: 'PUT',
    body: 'file contents',
    headers: { 'Content-Type': 'text/plain' },
  }), env, ctx);
  assert.equal(upload.status, 200);
  const fileUrl = (await upload.text()).match(/https:\/\/[^\s]+/)[0];
  const key = decodeURIComponent(new URL(fileUrl).pathname.slice(1));
  const id = key.split('/')[0];
  assert.match(id, /^[a-z0-9]{6}$/);

  const page = await worker.fetch(new Request('https://files.example/' + id), env, ctx);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('Content-Type'), /text\/html/);
  assert.equal(page.headers.get('Cache-Control'), 'no-store');
  const html = await page.text();
  assert.match(html, /fff\.txt/);
  assert.match(html, new RegExp('/' + id + '/fff\\.txt\\?download=1'));
  assert.ok(objects.has(key));
  assert.equal(getCalls.filter(call => call === key).length, 0, 'landing page must not GET file content');

  const downloaded = await worker.fetch(new Request(fileUrl + '?download=1'), env, ctx);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers.get('Content-Disposition'), /^attachment;/);
  assert.match(downloaded.headers.get('Content-Disposition'), /fff.txt/);
  assert.equal(await downloaded.text(), 'file contents');
  assert.ok(objects.has(key), 'reusable file should remain available');

  const original = await worker.fetch(new Request(fileUrl), env, ctx);
  assert.equal(original.headers.get('Content-Disposition'), null, 'original URL remains unchanged');
});

test('landing page does not consume a one-time download', async () => {
  const { objects, env, ctx, pending } = setup();
  const key = 'abc123/once.txt';
  addFile(objects, key, 'one-time contents', { oneTime: 'true' });

  const page = await worker.fetch(new Request('https://files.example/abc123'), env, ctx);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /One-time download/);
  assert.equal(pending.length, 0);
  assert.ok(objects.has(key));

  const download = await worker.fetch(
    new Request('https://files.example/abc123/once.txt?download=1'), env, ctx);
  assert.equal(download.status, 200);
  assert.equal(await download.text(), 'one-time contents');
  await Promise.all(pending);
  assert.equal(objects.has(key), false);
});

test('twelve-character multipart IDs and nested Unicode filenames are supported', async () => {
  const { objects, env, ctx } = setup();
  addFile(objects, '012345abcdef/資料夾/報告 #1.txt', 'report');
  const page = await worker.fetch(new Request('https://files.example/012345abcdef/'), env, ctx);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /資料夾\/報告 #1\.txt/);
  assert.match(html, /%E8%B3%87%E6%96%99%E5%A4%BE\/%E5%A0%B1%E5%91%8A%20%231\.txt\?download=1/);
  const url = 'https://files.example/012345abcdef/' +
    '%E8%B3%87%E6%96%99%E5%A4%BE/%E5%A0%B1%E5%91%8A%20%231.txt?download=1';
  const download = await worker.fetch(new Request(url), env, ctx);
  assert.equal(download.status, 200);
  assert.match(download.headers.get('Content-Disposition'), /%E5%A0%B1%E5%91%8A%20%231.txt/);
});

test('expired files are not offered for download', async () => {
  const { objects, env, ctx } = setup();
  addFile(objects, 'abcdef/expired.txt', 'old', {
    oneTime: 'false',
    expirationTime: new Date(Date.now() - 60_000).toISOString(),
  });
  const response = await worker.fetch(new Request('https://files.example/abcdef'), env, ctx);
  assert.equal(response.status, 404);
  assert.ok(!objects.has('abcdef/expired.txt'));
});

test('share landing requires the same authorization as a direct file URL', async () => {
  const { objects, env, ctx } = setup();
  env.PASSWORD = 'secret';
  addFile(objects, 'abc123/private.txt', 'private content');

  const denied = await worker.fetch(new Request('https://files.example/abc123'), env, ctx);
  assert.equal(denied.status, 401);
  assert.doesNotMatch(await denied.text(), /private\.txt/);

  const headers = { Authorization: 'Basic ' + btoa('user:secret') };
  const allowed = await worker.fetch(new Request('https://files.example/abc123', { headers }), env, ctx);
  assert.equal(allowed.status, 200);
  assert.match(await allowed.text(), /private\.txt/);
});

test('unknown share ID returns 404 rather than an empty download page', async () => {
  const { env, ctx } = setup();
  const response = await worker.fetch(new Request('https://files.example/abc123'), env, ctx);
  assert.equal(response.status, 404);
});
