import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function files(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const name = path.join(directory, entry.name);
    return entry.isDirectory() ? files(name) : /\.tsx?$/.test(name) ? [name] : [];
  });
}
const universal = files(path.resolve(app, '../../packages/finance-core/src'));
const native = files(path.join(app, 'src'));
for (const filename of [...universal, ...native]) {
  const source = readFileSync(filename, 'utf8');
  assert.doesNotMatch(source, /(?:from|import)\s*['"][^'"]*(?:next\/|react-dom|@capacitor|apps\/web|\.\.\/web)[^'"]*['"]/, filename);
  assert.doesNotMatch(source, /\b(?:window|document|localStorage|sessionStorage)\s*[.([]/, filename);
}
for (const filename of universal) assert.doesNotMatch(readFileSync(filename, 'utf8'), /(?:from|import)\s*['"](?:node:|react|react-native|expo)/, filename);
console.log(`Native/domain dependency boundaries verified (${native.length + universal.length} source files).`);
