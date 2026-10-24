import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';

const upload = readFileSync(new URL('../public/upload.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../src/index.js', import.meta.url), 'utf8');
const icon = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');

test('upload.js provides the multipart function it calls', () => {
  assert.match(upload, /queueMultipartFile\(file\)/);
  assert.match(upload, /function queueMultipartFile\(file\)/);
  assert.match(upload, /function uploadMultipartFile\(file\)/);
  assert.match(upload, /90 \* 1024 \* 1024/);
});

test('HTML references only the bundled uploader script', () => {
  assert.match(html, /<script src="\/upload\.js"><\/script>/);
  assert.doesNotMatch(html, /src="\/multipart\.js"/);
  assert.match(html, /id="cancelMultipartUpload"/);
});

test('Worker routes front-end assets including icon', () => {
  for (const name of ["'upload.js'", "'favicon.svg'"]) {
    assert.ok(worker.includes(name), name + ' must be routed to the asset binding');
  }
  assert.match(icon, /<svg /);
});
