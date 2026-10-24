import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const script = readFileSync(new URL('../public/upload.js', import.meta.url), 'utf8');

test('quick start contains replaceable examples and is initialized on page load', () => {
  assert.match(html, /id="quickStartFileCommand"/);
  assert.match(html, /id="quickStartTextCommand"/);
  assert.doesNotMatch(html.match(/<h2[^>]*>Quick Start<\/h2>[\s\S]*?<\/div>\s*<\/div>/)?.[0] || '',
    /bashupload\.app/);
  assert.match(script, /switchLanguage\(currentLang\);\s*updateQuickStartCommands\(\);/);
});

for (const origin of [
  'https://upload.treexhd.me',
  'https://db75e0dc-bashupload-r2.treexhd.workers.dev',
  'http://localhost:8787',
]) {
  test('quick start uses the current browser origin: ' + origin, () => {
    const elements = new Map();
    function element(id) {
      if (!elements.has(id)) elements.set(id, { textContent: '', addEventListener() {} });
      return elements.get(id);
    }
    const context = vm.createContext({
      window: { location: { origin } },
      document: { getElementById: element, addEventListener() {} },
      console,
    });
    vm.runInContext(script, context);
    vm.runInContext('updateQuickStartCommands()', context);
    assert.equal(elements.get('quickStartFileCommand').textContent,
      `$ curl "${origin}" -T file.txt`);
    assert.equal(elements.get('quickStartTextCommand').textContent,
      `$ curl "${origin}" -d "your text content"`);
  });
}
