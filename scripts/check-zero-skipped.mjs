#!/usr/bin/env node
/**
 * 零跳过门禁：测试报告与测试源码都不允许出现 skip/Assume/@Ignore。
 *
 * 跳过不是通过。任何环境缺依赖都应当让构建失败并在 CI 里修，而不是用
 * assumeTrue / it.skipIf 把未验证伪装成绿色。此门禁扫描：
 *   1) surefire XML 的 skipped 计数（Java）；
 *   2) vitest 并行汇总的 counts.skipped（UI）；
 *   3) 测试源码里的 Assume / @Ignore / it.skip / describe.skip / skipIf。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
let javaTests = 0;
let javaReports = 0;

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    let st;
    try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const reportRoots = ['target', 'platform/target', 'modules/console/target', 'apps/server/target'];
for (const entry of readdirSync(root)) {
  if (entry === 'examples') {
    const examples = join(root, entry);
    for (const name of readdirSync(examples)) reportRoots.push(join('examples', name, 'target'));
  }
}
for (const rel of reportRoots) {
  const dir = join(root, rel, 'surefire-reports');
  if (!existsSync(dir)) continue;
  for (const file of walk(dir)) {
    if (!file.endsWith('.xml')) continue;
    const text = readFileSync(file, 'utf8');
    const m = text.match(/<testsuite\b[^>]*\bskipped="(\d+)"/);
    if (!m) continue;
    javaReports++;
    javaTests += Number((text.match(/<testsuite\b[^>]*\btests="(\d+)"/) || [0, 0])[1]);
    if (Number(m[1]) > 0) problems.push(`${file}: ${m[1]} skipped`);
  }
}

const summaryPath = join(root, 'ui', '.tmp', 'vitest-parallel', 'summary.json');
let uiTests = 0;
let uiSkipped = null;
if (existsSync(summaryPath)) {
  try {
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    uiTests = Number(summary?.counts?.tests || 0);
    uiSkipped = Number(summary?.counts?.skipped || 0);
    if (uiSkipped > 0) problems.push(`ui/.tmp/vitest-parallel/summary.json: ${uiSkipped} skipped`);
  } catch (e) {
    problems.push(`ui summary unreadable: ${e.message}`);
  }
} else {
  problems.push('ui/.tmp/vitest-parallel/summary.json missing (run npm test)');
}

const javaSources = [];
for (const rel of ['modules', 'apps', 'platform', 'examples']) {
  javaSources.push(...walk(join(root, rel)).filter(p => extname(p) === '.java' && p.includes(`${join('src', 'test')}`)));
}
for (const file of javaSources) {
  const text = readFileSync(file, 'utf8');
  if (/org\.junit\.Assume|Assume\.assume|@Ignore\b/.test(text)) {
    problems.push(`${file}: contains a Java skip mechanism (Assume/@Ignore)`);
  }
}
const uiTestsDir = join(root, 'ui', 'src', '__tests__');
for (const file of walk(uiTestsDir).filter(p => extname(p) === '.ts')) {
  const text = readFileSync(file, 'utf8');
  if (/\b(it|test|describe)\.(skip|skipIf)\s*\(|\b(it|test|describe)\.skipIf\b/.test(text)) {
    problems.push(`${file}: contains a UI skip mechanism (.skip/.skipIf)`);
  }
}

if (problems.length) {
  console.error('[zero-skipped] FAIL');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`[zero-skipped] OK — Java ${javaReports} reports / ${javaTests} tests, UI ${uiTests} tests, 0 skipped`);
