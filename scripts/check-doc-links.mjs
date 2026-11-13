#!/usr/bin/env node
/* Relative-link guard for the public documentation set.
 *
 * Only local links are checked. External URLs are owned by their sites and are covered by the
 * periodic link budget in CI, not by this fast, deterministic gate.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const roots = [
  'README.md',
  'README_EN.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'SUPPORT.md',
  'GOVERNANCE.md',
  'CODE_OF_CONDUCT.md',
  'CHANGELOG.md',
  'docs',
  'extensions',
];
const skipDirs = new Set(['node_modules', 'target', 'dist', '.tmp', '.git']);

function collect(entry, out = []) {
  const path = join(root, entry);
  if (!existsSync(path)) return out;
  if (statSync(path).isDirectory()) {
    for (const child of readdirSync(path)) {
      if (skipDirs.has(child)) continue;
      collect(join(entry, child), out);
    }
    return out;
  }
  if (/\.(md|mdx)$/i.test(path)) out.push(entry);
  return out;
}

const files = roots.flatMap((entry) => collect(entry));
const failures = [];

for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  let fenced = false;
  for (let lineNo = 0; lineNo < text.length; lineNo += 1) {
    const line = text[lineNo];
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) continue;
    for (const match of line.matchAll(/\]\(([^)\s]+)\)/g)) {
      const raw = match[1];
      if (!raw || raw.startsWith('#') || /^(https?:|mailto:|tel:)/i.test(raw)) continue;
      const target = decodeURIComponent(raw.split('#')[0].split('?')[0]);
      if (!target) continue;
      const absolute = resolve(dirname(join(root, file)), target);
      if (!existsSync(absolute)) {
        failures.push(`${file}:${lineNo + 1} -> ${raw}`);
      }
    }
  }
}

if (failures.length) {
  console.error(`[docs-links] ${failures.length} broken relative link(s):`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}
console.log(`[docs-links] checked ${files.length} Markdown files; all relative links resolve`);
