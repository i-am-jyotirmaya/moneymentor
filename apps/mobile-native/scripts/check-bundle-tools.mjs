import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// npm's production graph includes native build/test tooling. Inspect the actual
// Metro source maps before treating an advisory as absent from app JavaScript.
const tools = ['braces', 'node-forge', 'sprintf-js', 'uuid'];
const report = [];
async function mapsIn(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await mapsIn(path));
    else if (entry.name.endsWith('.map')) result.push(path);
  }
  return result;
}
function sourcesIn(map) {
  return [...(map.sources ?? []), ...(map.sections ?? []).flatMap(section => sourcesIn(section.map))];
}
for (const platform of ['android', 'ios']) {
  const files = await mapsIn(`dist/${platform}`);
  if (!files.length) throw Error(`No ${platform} Metro source maps were generated.`);
  const sources = new Set();
  for (const file of files) {
    for (const source of sourcesIn(JSON.parse(await readFile(file, 'utf8')))) sources.add(source.replaceAll('\\', '/'));
  }
  if (!sources.size) throw Error(`The ${platform} source maps contain no module paths.`);
  const matches = [...sources].filter(source => tools.some(name => source.includes(`/node_modules/${name}/`) || source.startsWith(`node_modules/${name}/`)));
  report.push({ platform, maps: files.length, sourceCount: sources.size, advisoryModules: matches });
}
await writeFile('bundle-dependency-review.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report));
if (report.some(platform => platform.advisoryModules.length)) throw Error('Review advisory dependencies present in the native JavaScript bundle.');
