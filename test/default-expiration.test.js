import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';
import { getDefaultExpirationSeconds, resolveUploadExpiration } from '../src/expiration.js';

function mockR2() {
  const objects = new Map();
  let number = 0;
  const bucket = {
    async put(key, body, options) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      const obj = { key, bytes, customMetadata: options.customMetadata, httpMetadata: options.httpMetadata, uploaded: new Date() };
      objects.set(key, obj);
      return { size: bytes.byteLength };
    },
    async get(key) {
      const obj = objects.get(key);
      if (!obj) return null;
      return {
        body: obj.bytes,
        customMetadata: obj.customMetadata,
        httpEtag: '"etag"',
        writeHttpMetadata(headers) { headers.set('Content-Type', obj.httpMetadata.contentType); },
      };
    },
    async head(key) {
      const obj = objects.get(key);
      return obj ? { customMetadata: obj.customMetadata, uploaded: obj.uploaded } : null;
    },
    async delete(key) { objects.delete(key); },
    async list() { return { objects: [...objects.values()].map(({ key }) => ({ key })), truncated: false }; },
  };
  const env = {
    R2_BUCKET: bucket, PASSWORD: '',
    DEFAULT_EXPIRATION_SECONDS: '7200',
    MAX_AGE_FOR_MULTIDOWNLOAD: '86400',
    MAX_UPLOAD_SIZE: '5368709120',
    MAX_AGE: '3600',
  };
  return { env, objects };
}

const clock = new Date('2026-10-24T00:00:00Z').getTime();

test('default retention configuration is one hour when unset', () => {
  assert.equal(getDefaultExpirationSeconds({}), 3600);
  assert.equal(resolveUploadExpiration({}, {}), 3600);
  assert.equal(resolveUploadExpiration({ DEFAULT_EXPIRATION_SECONDS: '0' }, {}), null);
  assert.equal(resolveUploadExpiration({ DEFAULT_EXPIRATION_SECONDS: '7200' }, { oneTime: true }), null);
  assert.equal(resolveUploadExpiration({ DEFAULT_EXPIRATION_SECONDS: '7200' }, { expirationSeconds: '600' }), 600);
});

test('invalid default, explicit retention and conflicting options are rejected', () => {
  assert.throws(() => getDefaultExpirationSeconds({ DEFAULT_EXPIRATION_SECONDS: '100000' }), /DEFAULT_EXPIRATION_SECONDS/);
  assert.throws(() => resolveUploadExpiration({}, { expirationSeconds: 'nope' }), /X-Expiration-Seconds/);
  assert.throws(() => resolveUploadExpiration({}, { expirationSeconds: 0 }), /Expiration must/);
  assert.throws(() => resolveUploadExpiration({}, { oneTime: true, expirationSeconds: 3600 }), /Cannot request/);
});

async function send(env, method, headers = {}) {
  return worker.fetch(new Request('https://upload.example/example.txt', {
    method, body: 'test content', headers
  }), env, { waitUntil() {} });
}

test('curl PUT defaults to reusable 2-hour file, visible through config and download', async () => {
  const { env, objects } = mockR2();
  const cfg = await worker.fetch(new Request('https://upload.example/api/config'), env, { waitUntil() {} });
  const config = await cfg.json();
  assert.equal(config.defaultExpirationSeconds, 7200);
  const result = await send(env, 'PUT', { 'Content-Type': 'text/plain' });
  assert.equal(result.status, 200);
  assert.match(await result.text(), /multiple times/);
  const [item] = objects.values();
  assert.equal(item.customMetadata.oneTime, 'false');
  assert.equal(item.customMetadata.expirationSeconds, '7200');
  assert.ok(Date.parse(item.customMetadata.expirationTime) > Date.now() + 7190_000);

  const downloadUrl = 'https://upload.example/' + item.key;
  const download = await worker.fetch(new Request(downloadUrl), env, { waitUntil() {} });
  assert.equal(download.status, 200);
  assert.equal(download.headers.get('X-Expiration-Download'), 'true');
  assert.ok(objects.has(item.key));
});

test('POST text upload inherits the default and can be downloaded repeatedly', async () => {
  const { env, objects } = mockR2();
  const response = await send(env, 'POST', { 'Content-Type': 'text/plain' });
  assert.equal(response.status, 200);
  const [file] = objects.values();
  assert.equal(file.customMetadata.oneTime, 'false');
  assert.equal(file.customMetadata.expirationSeconds, '7200');
});

test('explicit once-only header and explicit expiration both override the default', async () => {
  const { env, objects } = mockR2();
  let response = await send(env, 'PUT', { 'X-One-Time-Download': 'true' });
  assert.equal(response.status, 200);
  let stored = [...objects.values()].at(-1);
  assert.equal(stored.customMetadata.oneTime, 'true');
  assert.equal(stored.customMetadata.expirationTime, undefined);
  response = await send(env, 'PUT', { 'X-Expiration-Seconds': '1800' });
  assert.equal(response.status, 200);
  stored = [...objects.values()].at(-1);
  assert.equal(stored.customMetadata.oneTime, 'false');
  assert.equal(stored.customMetadata.expirationSeconds, '1800');
});

test('default zero uses one-time and contradictory headers return HTTP 400 without storage', async () => {
  const { env, objects } = mockR2();
  env.DEFAULT_EXPIRATION_SECONDS = '0';
  const response = await send(env, 'PUT');
  assert.equal(response.status, 200);
  assert.equal([...objects.values()][0].customMetadata.oneTime, 'true');
  const mismatch = await send(env, 'PUT', {
    'X-One-Time-Download': 'true', 'X-Expiration-Seconds': '3600'
  });
  assert.equal(mismatch.status, 400);
  assert.equal(objects.size, 1);
});

test('expired default-retention objects are deleted by scheduled cleanup', async () => {
  const { env, objects } = mockR2();
  const upload = await send(env, 'PUT');
  assert.equal(upload.status, 200);
  const [file] = objects.values();
  file.customMetadata.expirationTime = new Date(clock).toISOString();
  await worker.scheduled({}, env, { waitUntil() {} });
  assert.equal(objects.size, 0);
});
