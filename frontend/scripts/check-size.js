import fs from 'node:fs';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const distDir = path.resolve('dist');
const manifestPath = path.join(distDir, '.vite', 'manifest.json');
const initialGzipBudgetBytes = 200 * 1024;
const initialRawSafetyLimitBytes = 400 * 1024;
const perChunkGzipLimitBytes = 200 * 1024;

if (!fs.existsSync(manifestPath)) {
  console.error('Vite build manifest is missing. Run npm run build first.');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const entries = Object.entries(manifest).filter(([, chunk]) => chunk.isEntry && chunk.file.endsWith('.js'));
if (!entries.length) {
  console.error('No JavaScript entrypoint found in the Vite build manifest.');
  process.exit(1);
}

const initialKeys = new Set();
function addStaticImports(key) {
  if (initialKeys.has(key)) return;
  const chunk = manifest[key];
  if (!chunk) throw new Error(`Vite manifest references missing chunk key: ${key}`);
  initialKeys.add(key);
  for (const importedKey of chunk.imports || []) addStaticImports(importedKey);
}
for (const [key] of entries) addStaticImports(key);

const entryFiles = entries.map(([key]) => manifest[key].file);
const chunks = [...new Set([...initialKeys].map((key) => manifest[key].file))]
  .filter((file) => file.endsWith('.js'))
  .map((file) => {
    const filepath = path.join(distDir, file);
    if (!fs.existsSync(filepath)) throw new Error(`Manifest JavaScript file is missing: ${file}`);
    const contents = fs.readFileSync(filepath);
    return { file, raw: contents.length, gzip: gzipSync(contents).length };
  });

const initialRaw = chunks.reduce((total, chunk) => total + chunk.raw, 0);
const initialGzip = chunks.reduce((total, chunk) => total + chunk.gzip, 0);
const initialFiles = new Set(chunks.map((chunk) => chunk.file));
const generatedFiles = new Set(Object.values(manifest).map(({ file }) => file).filter((file) => file.endsWith('.js')));
const generatedChunks = [...generatedFiles].map((file) => {
  const contents = fs.readFileSync(path.join(distDir, file));
  return { file, raw: contents.length, gzip: gzipSync(contents).length };
});

console.log('JavaScript chunks (INITIAL = entrypoint and transitive static imports; LAZY = dynamic routes/features):');
for (const entry of entryFiles) console.log(`Entrypoint: ${entry}`);
for (const chunk of generatedChunks) {
  console.log(`  ${initialFiles.has(chunk.file) ? 'INITIAL' : 'LAZY'} ${chunk.file}: ${chunk.raw} bytes raw, ${chunk.gzip} bytes gzip`);
}
console.log(`Initial total: ${initialRaw} bytes raw, ${initialGzip} bytes gzip`);
console.log(`Initial gzip budget: ${initialGzipBudgetBytes} bytes; raw safety limit: ${initialRawSafetyLimitBytes} bytes`);

let failed = false;
if (initialGzip > initialGzipBudgetBytes) {
  console.error(`FAIL: initial JavaScript exceeds the gzip budget by ${initialGzip - initialGzipBudgetBytes} bytes.`);
  failed = true;
}
if (initialRaw > initialRawSafetyLimitBytes) {
  console.error(`FAIL: initial JavaScript exceeds the raw safety limit by ${initialRaw - initialRawSafetyLimitBytes} bytes.`);
  failed = true;
}
for (const chunk of generatedChunks) {
  if (chunk.gzip > perChunkGzipLimitBytes) {
    console.error(`FAIL: generated chunk ${chunk.file} exceeds ${perChunkGzipLimitBytes} bytes gzip.`);
    failed = true;
  }
}
if (failed) process.exit(1);
console.log('PASS: initial JavaScript is within both size limits.');
