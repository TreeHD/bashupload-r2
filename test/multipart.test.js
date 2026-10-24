import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';
import {
  handleMultipart,
  MULTIPART_PART_SIZE,
  MULTIPART_SESSION_PREFIX,
  cleanupMultipartSession,
  resolveExpirationTime,
} from '../src/multipart.js';

const PART_SIZE = 5 * 1024 * 1024;
const FILE_NAME = '資訊揭露與投資人保護 (2)#final?.pdf';

function environment() {
  const files = new Map();
  const uploads = new Map();
  let counter = 0;

  const R2_BUCKET = {
    async put(key, value, options = {}) {
      const data = new Uint8Array(await new Response(value).arrayBuffer());
      const object = {
        bytes: data,
        uploaded: new Date(),
        httpMetadata: options.httpMetadata || {},
        customMetadata: options.customMetadata || {},
      };
      files.set(key, object);
      return { size: data.byteLength };
    },
    async get(key) {
      const value = files.get(key);
      if (!value) return null;
      return {
        body: value.bytes,
        uploaded: value.uploaded,
        customMetadata: value.customMetadata,
        httpEtag: '"fake-etag"',
        writeHttpMetadata(h) {
          h.set('Content-Type', value.httpMetadata.contentType || 'application/octet-stream');
        },
        async json() { return JSON.parse(new TextDecoder().decode(value.bytes)); },
      };
    },
    async head(key) {
      const value = files.get(key);
      return value ? { uploaded: value.uploaded, customMetadata: value.customMetadata } : null;
    },
    async delete(key) { files.delete(key); },
    async createMultipartUpload(key, options) {
      const uploadId = 'upload-' + ++counter;
      const state = { key, options, parts: new Map() };
      uploads.set(uploadId, state);
      return this.resumeMultipartUpload(key, uploadId);
    },
    resumeMultipartUpload(key, uploadId) {
      const get = () => {
        const state = uploads.get(uploadId);
        if (!state || state.key !== key) throw new Error('Unknown upload');
        return state;
      };
      return {
        uploadId,
        async uploadPart(partNumber, body) {
          const bytes = new Uint8Array(await new Response(body).arrayBuffer());
          const etag = 'etag-' + partNumber + '-' + bytes.length;
          get().parts.set(partNumber, { bytes, etag });
          return { partNumber, etag };
        },
        async complete(parts) {
          const state = get();
          for (const part of parts) {
            assert.equal(part.etag, state.parts.get(part.partNumber)?.etag);
          }
          const byteArrays = parts.map(p => state.parts.get(p.partNumber).bytes);
          const size = byteArrays.reduce((n, bytes) => n + bytes.length, 0);
          const combined = new Uint8Array(size);
          let offset = 0;
          for (const bytes of byteArrays) {
            combined.set(bytes, offset);
            offset += bytes.length;
          }
          await R2_BUCKET.put(key, combined, state.options);
          uploads.delete(uploadId);
          return { key, size, httpEtag: '"completed"' };
        },
        async abort() {
          get();
          uploads.delete(uploadId);
        },
      };
    },
  };
  const env = {
    R2_BUCKET, PASSWORD: '', MAX_UPLOAD_SIZE: String(PART_SIZE * 3),
    MAX_AGE_FOR_MULTIDOWNLOAD: '86400',
  };
  return { env, files, uploads };
}

async function api(env, path, method, payload, password, opts = {}) {
  const headers = password ? { Authorization: password } : {};
  if (method !== 'PUT') headers['Content-Type'] = 'application/json';
  if (method === 'PUT') headers['Content-Length'] = String(payload.byteLength);
  const body = method === 'PUT' ? payload : JSON.stringify(payload);
  return handleMultipart(
    new Request('https://upload.example' + path, { method, headers, body }),
    env,
    { partSize: PART_SIZE, ...opts },
  );
}

async function init(env, expirationSeconds = 120, extra = {}) {
  const response = await api(env, '/api/multipart/init', 'POST', {
    name: FILE_NAME, size: PART_SIZE + 13, expirationSeconds,
    type: 'application/pdf', ...extra,
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function sendParts(env, session) {
  const part1 = await api(env, '/api/multipart/part?sessionId=' + session.sessionId +
    '&partNumber=1', 'PUT', new Uint8Array(PART_SIZE));
  assert.equal(part1.status, 200);
  const part2 = await api(env, '/api/multipart/part?sessionId=' + session.sessionId +
    '&partNumber=2', 'PUT', new Uint8Array(13));
  assert.equal(part2.status, 200);
  return [await part1.json(), await part2.json()];
}

test('default chunk is exactly 90 MiB', () => {
  assert.equal(MULTIPART_PART_SIZE, 94_371_840);
});

test('Unicode URL, multipart size, expiration and GET work end-to-end', async () => {
  const { env, files, uploads } = environment();
  const session = await init(env);
  assert.equal(session.partSize, PART_SIZE);
  assert.equal(session.partCount, 2);
  assert.equal(uploads.size, 1);

  const parts = await sendParts(env, session);
  const complete = await api(env, '/api/multipart/complete', 'POST', {
    sessionId: session.sessionId,
    parts: parts.reverse(), // completion accepts out-of-order browser part results
  });
  assert.equal(complete.status, 200);
  const result = await complete.json();
  assert.equal(result.size, PART_SIZE + 13);
  assert.ok(result.url.includes('%E8%B3%87'));
  assert.ok(result.url.includes('%23final%3F.pdf'));
  const key = decodeURIComponent(new URL(result.url).pathname.substring(1));
  assert.ok(files.has(key));
  assert.ok(!files.has(MULTIPART_SESSION_PREFIX + session.sessionId));
  assert.equal(uploads.size, 0);

  const stored = files.get(key);
  assert.equal(stored.customMetadata.oneTime, 'false');
  assert.equal(stored.customMetadata.expirationSeconds, '120');
  const expiry = resolveExpirationTime(stored);
  assert.ok(new Date(expiry).getTime() > Date.now() + 119_000);

  const downloaded = await worker.fetch(new Request(result.url), env, { waitUntil() {} });
  assert.equal(downloaded.status, 200);
  assert.equal((await downloaded.arrayBuffer()).byteLength, PART_SIZE + 13);
});

test('one-time metadata preserved', async () => {
  const { env, files } = environment();
  const session = await init(env, null, { oneTime: true });
  const parts = await sendParts(env, session);
  const complete = await api(env, '/api/multipart/complete', 'POST', { sessionId: session.sessionId, parts });
  assert.equal(complete.status, 200);
  const result = await complete.json();
  const stored = files.get(decodeURIComponent(new URL(result.url).pathname.slice(1)));
  assert.equal(stored.customMetadata.oneTime, 'true');
  assert.equal(resolveExpirationTime(stored), null);
});

test('wrong-size chunks, invalid session, incorrect part lists are rejected', async () => {
  const { env, files } = environment();
  const session = await init(env);
  const internalUrl = 'https://upload.example/' + MULTIPART_SESSION_PREFIX + session.sessionId;
  const internal = await worker.fetch(new Request(internalUrl), env, { waitUntil() {} });
  assert.equal(internal.status, 404);

  const wrong = await api(env, '/api/multipart/part?sessionId=' + session.sessionId + '&partNumber=1',
    'PUT', new Uint8Array(18));
  assert.equal(wrong.status, 413);

  const missing = await api(env, '/api/multipart/part?sessionId=bad&partNumber=1',
    'PUT', new Uint8Array(13));
  assert.equal(missing.status, 404);

  const badList = await api(env, '/api/multipart/complete', 'POST', {
    sessionId: session.sessionId, parts: [{ partNumber: 1, etag: 'whatever' }],
  });
  assert.equal(badList.status, 400);
  assert.equal(files.size, 1);
});

test('abort removes multipart state and internal R2 session', async () => {
  const { env, files, uploads } = environment();
  const session = await init(env);
  const abort = await api(env, '/api/multipart/abort', 'DELETE', { sessionId: session.sessionId });
  assert.equal(abort.status, 200);
  assert.equal(uploads.size, 0);
  assert.equal(files.size, 0);
});

test('cron cleanup aborts abandoned uploads', async () => {
  const { env, files, uploads } = environment();
  const session = await init(env);
  await cleanupMultipartSession(env, MULTIPART_SESSION_PREFIX + session.sessionId);
  assert.equal(uploads.size, 0);
  assert.equal(files.size, 0);
});

test('max total size and expiration duration are enforced before creating multipart state', async () => {
  const { env, uploads } = environment();
  const tooLarge = await api(env, '/api/multipart/init', 'POST',
    { name: 'big.dat', size: PART_SIZE * 4 });
  assert.equal(tooLarge.status, 413);
  const badExpiration = await api(env, '/api/multipart/init', 'POST',
    { name: 'bad.dat', size: PART_SIZE + 1, expirationSeconds: 86401 });
  assert.equal(badExpiration.status, 400);
  assert.equal(uploads.size, 0);
});

test('existing PASSWORD applies to multipart endpoints', async () => {
  const { env } = environment();
  env.PASSWORD = 'my-secret';
  const denied = await api(env, '/api/multipart/init', 'POST',
    { name: FILE_NAME, size: PART_SIZE + 13 });
  assert.equal(denied.status, 401);
  const accepted = await api(env, '/api/multipart/init', 'POST',
    { name: FILE_NAME, size: PART_SIZE + 13 }, 'my-secret');
  assert.equal(accepted.status, 200);
});

test('cross-origin multipart upload is refused', async () => {
  const { env } = environment();
  const response = await handleMultipart(new Request('https://upload.example/api/multipart/init', {
    method: 'POST',
    headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'test', size: PART_SIZE + 1 }),
  }), env, { partSize: PART_SIZE });
  assert.equal(response.status, 403);
});

test('uploadPart receives the untouched, fixed-length incoming request stream', async () => {
  const { env } = environment();
  const session = await init(env);
  const partBody = new Uint8Array(13);
  const request = new Request(
    'https://upload.example/api/multipart/part?sessionId=' + session.sessionId + '&partNumber=2',
    { method: 'PUT', headers: { 'Content-Length': '13' }, body: partBody },
  );
  const incomingStream = request.body;
  const originalResume = env.R2_BUCKET.resumeMultipartUpload.bind(env.R2_BUCKET);
  let inspected = false;
  env.R2_BUCKET.resumeMultipartUpload = (key, id) => {
    const upload = originalResume(key, id);
    const originalPart = upload.uploadPart;
    upload.uploadPart = async (partNumber, body) => {
      assert.strictEqual(body, incomingStream, 'Worker must not wrap the original request.body');
      inspected = true;
      return originalPart(partNumber, body);
    };
    return upload;
  };
  const response = await handleMultipart(request, env, { partSize: PART_SIZE });
  assert.equal(response.status, 200);
  assert.ok(inspected);
});

test('multipart part requires explicit byte length so it cannot bypass chunk limits', async () => {
  const { env } = environment();
  const session = await init(env);
  const response = await handleMultipart(new Request(
    'https://upload.example/api/multipart/part?sessionId=' + session.sessionId + '&partNumber=2',
    { method: 'PUT', body: new Uint8Array(13) },
  ), env, { partSize: PART_SIZE });
  assert.equal(response.status, 411);
  assert.match((await response.json()).error, /Content-Length/);
});

test('R2 errors are returned with failing chunk number rather than generic HTTP 400', async () => {
  const { env } = environment();
  const session = await init(env);
  env.R2_BUCKET.resumeMultipartUpload = () => ({
    async uploadPart() { throw new Error('Fake R2 failure (10013)'); },
  });
  const response = await api(env,
    '/api/multipart/part?sessionId=' + session.sessionId + '&partNumber=2',
    'PUT', new Uint8Array(13));
  assert.equal(response.status, 400);
  assert.ok((await response.json()).error.includes('Chunk 2: Fake R2 failure (10013)'));
});

test('multipart requests with no expiration use DEFAULT_EXPIRATION_SECONDS', async () => {
  const { env, files } = environment();
  env.DEFAULT_EXPIRATION_SECONDS = '7200';
  const response = await api(env, '/api/multipart/init', 'POST', {
    name: FILE_NAME, size: PART_SIZE + 13, type: 'application/pdf'
  });
  assert.equal(response.status, 200);
  const session = await response.json();
  const parts = await sendParts(env, session);
  const complete = await api(env, '/api/multipart/complete', 'POST', {
    sessionId: session.sessionId, parts
  });
  assert.equal(complete.status, 200);
  const result = await complete.json();
  const key = decodeURIComponent(new URL(result.url).pathname.slice(1));
  assert.equal(files.get(key).customMetadata.oneTime, 'false');
  assert.equal(files.get(key).customMetadata.expirationSeconds, '7200');
});

test('multipart default of zero restores one-time uploads, but explicit expiry still works', async () => {
  const { env, files } = environment();
  env.DEFAULT_EXPIRATION_SECONDS = '0';
  const makeSession = async (expirationSeconds) => {
    const request = { name: FILE_NAME, size: PART_SIZE + 13 };
    if (expirationSeconds !== undefined) request.expirationSeconds = expirationSeconds;
    const response = await api(env, '/api/multipart/init', 'POST', request);
    assert.equal(response.status, 200);
    const session = await response.json();
    const parts = await sendParts(env, session);
    const completion = await api(env, '/api/multipart/complete', 'POST', {
      sessionId: session.sessionId, parts
    });
    const { url } = await completion.json();
    return files.get(decodeURIComponent(new URL(url).pathname.slice(1))).customMetadata;
  };
  const defaultMetadata = await makeSession(undefined);
  assert.equal(defaultMetadata.oneTime, 'true');
  assert.equal(defaultMetadata.expirationSeconds, undefined);
  const overridden = await makeSession(600);
  assert.equal(overridden.oneTime, 'false');
  assert.equal(overridden.expirationSeconds, '600');
});

test('multipart rejects combining one-time and explicit expiration', async () => {
  const { env } = environment();
  const response = await api(env, '/api/multipart/init', 'POST', {
    name: FILE_NAME, size: PART_SIZE + 13, oneTime: true, expirationSeconds: 7200,
  });
  assert.equal(response.status, 400);
});
