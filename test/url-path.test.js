import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../src/index.js';
import { decodeObjectKey, encodeObjectKey } from '../src/url-path.js';

function mockEnvironment() {
  const objects = new Map();
  const bucket = {
    async put(key, body, options) {
      const bytes = new Uint8Array(await new Response(body).arrayBuffer());
      objects.set(key, {
        bytes,
        httpMetadata: options.httpMetadata,
        customMetadata: options.customMetadata,
      });
      return { size: bytes.byteLength };
    },
    async get(key) {
      const item = objects.get(key);
      if (!item) return null;
      return {
        body: item.bytes,
        httpEtag: '"test-etag"',
        writeHttpMetadata(headers) {
          headers.set('Content-Type', item.httpMetadata.contentType);
        },
      };
    },
    async head(key) {
      const item = objects.get(key);
      return item ? { customMetadata: item.customMetadata } : null;
    },
    async delete(key) {
      objects.delete(key);
    },
  };
  return { env: { R2_BUCKET: bucket, PASSWORD: '' }, objects };
}

const exampleFileName = '資訊揭露與投資人保護_證券市場發展季刊(2019) (2).pdf';

for (const key of [
  `fi372q/${exampleFileName}`,
  'abcdef/report#final?version=2&done=50%.pdf',
  'abcdef/a+b c[1] and %20.txt',
  'abcdef/資料夾/第二層/file (3).txt',
]) {
  test(`R2 object key survives URL encode/decode: ${key}`, () => {
    const encoded = encodeObjectKey(key);
    assert.equal(decodeObjectKey(new URL(`https://files.example/${encoded}`).pathname), key);
    assert.ok(!encoded.includes('#'));
    assert.ok(!encoded.includes('?'));
  });
}

for (const name of [
  exampleFileName,
  'report#final?version=2&done=50%.pdf',
  'a+b c[1] and %20.txt',
  'plain-file.pdf',
]) {
  test(`PUT, generated link and GET all use the same R2 key: ${name}`, async () => {
    const { env, objects } = mockEnvironment();
    const body = `contents of ${name}`;
    // Simulates the correctly escaped path produced by the browser uploader.
    const uploadUrl = `https://files.example/${encodeURIComponent(name)}`;
    const upload = await worker.fetch(new Request(uploadUrl, {
      method: 'PUT',
      body,
      headers: {
        'Content-Type': 'application/pdf',
        'X-Expiration-Seconds': '3600',
      },
    }), env, { waitUntil() {} });

    assert.equal(upload.status, 200);
    const [key] = objects.keys();
    assert.ok(key.endsWith(`/${name}`));

    const uploadText = await upload.text();
    const downloadUrl = uploadText.match(/https:\/\/[^\s]+/)[0];
    assert.equal(downloadUrl, `https://files.example/${encodeObjectKey(key)}`);

    const downloaded = await worker.fetch(new Request(downloadUrl), env, { waitUntil() {} });
    assert.equal(downloaded.status, 200);
    assert.equal(await downloaded.text(), body);
    assert.ok(objects.has(key), 'expiring multi-download files are not removed by GET');
  });
}

test('older unescaped Chinese download links still resolve to the correct R2 key', async () => {
  const { env, objects } = mockEnvironment();
  const key = `fi372q/${exampleFileName}`;
  objects.set(key, {
    bytes: new TextEncoder().encode('legacy content'),
    httpMetadata: { contentType: 'application/pdf' },
    customMetadata: { oneTime: 'false', expirationTime: new Date(Date.now() + 60000).toISOString() },
  });
  const legacyUrl = `https://files.example/${key}`;
  const result = await worker.fetch(new Request(legacyUrl), env, { waitUntil() {} });
  assert.equal(result.status, 200);
  assert.equal(await result.text(), 'legacy content');
});

test('malformed percent escapes result in a 400 instead of a server error', async () => {
  const { env } = mockEnvironment();
  const result = await worker.fetch(new Request('https://files.example/abcdef/bad%ZZ.pdf'), env, { waitUntil() {} });
  assert.equal(result.status, 400);
});
