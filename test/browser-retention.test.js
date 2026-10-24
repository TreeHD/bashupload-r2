import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/upload.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');

function browser() {
  const fields = {
    oneTimeDownload: { checked: false },
    useExpiration: { checked: false },
    setExpirationBtn: { getAttribute: () => '600' },
  };
  const document = {
    getElementById: id => fields[id] || { addEventListener() {}, style: {} },
    addEventListener() {},
  };
  const context = vm.createContext({
    document, window: { location: { origin: 'https://upload.example' } }, console
  });
  vm.runInContext(source, context);
  vm.runInContext('serverConfig = { defaultExpirationSeconds: 7200 }', context);
  return { context, fields };
}

test('one-time selection exists and is unchecked by default', () => {
  assert.match(html, /id="oneTimeDownload" class="checkbox-input"/);
  assert.match(html, /id="defaultRetentionInfo"/);
});

test('browser uses env-derived default without any special headers', () => {
  const { context } = browser();
  assert.equal(vm.runInContext('selectedRetentionSeconds()', context), 7200);
  const headers = [];
  context.req = { setRequestHeader: (key, value) => headers.push([key, value]) };
  vm.runInContext('applyRetentionHeaders(req)', context);
  assert.equal(headers.length, 0);
});

test('browser supports explicit custom duration or once-only override', () => {
  const { context, fields } = browser();
  const headers = [];
  context.req = { setRequestHeader: (key, value) => headers.push([key, value]) };
  fields.useExpiration.checked = true;
  assert.equal(vm.runInContext('selectedRetentionSeconds()', context), 600);
  vm.runInContext('applyRetentionHeaders(req)', context);
  assert.equal(headers[0][0], 'X-Expiration-Seconds');
  assert.equal(headers[0][1], '600');
  fields.oneTimeDownload.checked = true;
  assert.equal(vm.runInContext('selectedRetentionSeconds()', context), null);
  vm.runInContext('applyRetentionHeaders(req)', context);
  assert.equal(headers[1][0], 'X-One-Time-Download');
  assert.equal(headers[1][1], 'true');
});

test('server default zero preserves legacy once-only without opting in', () => {
  const { context } = browser();
  vm.runInContext('serverConfig = { defaultExpirationSeconds: 0 }', context);
  assert.equal(vm.runInContext('selectedRetentionSeconds()', context), null);
});
