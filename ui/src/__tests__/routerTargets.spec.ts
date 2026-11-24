/**
 * R130 三十八批：路由目标有效性守卫（真机烟测抓出的死链回归门）。
 * 事故：三十四批 DslQueryView「索引工作台」按钮 push('/index')、IndexHubView「托管重建」
 * goto('/adhoc')——两个路由实际是 /indices 与 /adhoc-rebuild，字面量笔误直接白屏。
 * vue-tsc 锁不了字符串路由，单测 mock router 也测不出（mock 上任何 path 都通）；
 * 只有真机点击才暴露。本守卫静态扫描全站 push/goto 字面量目标，逐一比对 router.ts
 * 的真实路由集合（含 redirect 与 LEGACY_QUERY_PATHS）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (/\.(vue|ts)$/.test(f)) out.push(p);
  }
  return out;
}

const srcRoot = join(__dirname, '..');

/* 1) 路由集合：router.ts 的 path: '...' 字面量 + legacy 键 */
const routerSrc = readFileSync(join(srcRoot, 'router.ts'), 'utf-8');
const routes = new Set<string>();
for (const m of routerSrc.matchAll(/path:\s*'([^']+)'/g)) routes.add(m[1]);
const queryHubSrc = readFileSync(join(srcRoot, 'utils/queryHub.ts'), 'utf-8');
for (const m of queryHubSrc.matchAll(/'\/[a-z0-9-]+':/g)) routes.add(m[1].slice(0, -1));
/* 动态段与通配 */
routes.add('/forbidden');

/* 2) 调用点：push('..') / push({ path: '..' }) / goto('..') */
const callRe = /(?:\.push\(\s*|goto\(\s*)(?:'([^']+)'|\{\s*path:\s*'([^']+)')/g;
const calls: Array<{ loc: string; target: string }> = [];
for (const p of walk(join(srcRoot, 'views')).concat(walk(join(srcRoot, 'components')))) {
  if (p.replace(/\\/g, '/').includes('__tests__')) continue;
  const s = readFileSync(p, 'utf-8');
  for (const m of [...s.matchAll(callRe)]) {
    const target = m[1] ?? m[2];
    if (!target || !target.startsWith('/')) continue;
    const line = s.slice(0, m.index).split('\n').length;
    calls.push({ loc: `${p.replace(/\\/g, '/').split('/src/')[1]}:${line}`, target });
  }
}

describe('路由目标有效性（三十八批）', () => {
  it('测试自检：路由集合覆盖已知核心路由', () => {
    for (const must of ['/indices', '/adhoc-rebuild', '/search', '/overview']) {
      expect(routes.has(must), `路由表应含 ${must}`).toBe(true);
    }
    expect(calls.length).toBeGreaterThanOrEqual(20);
  });

  it('全部 push/goto 字面量目标必须存在于路由表', () => {
    /* path?query 拼接形式合法：剥 query 后比对 */
    const bad = calls.filter(c => !routes.has(c.target.split('?')[0]));
    expect(bad.map(c => `${c.loc} → 死路由 ${c.target}`)).toEqual([]);
  });

  it('三十四批事故的两个修正点保持在位', () => {
    const dq = readFileSync(join(srcRoot, 'views/DslQueryView.vue'), 'utf-8');
    const ih = readFileSync(join(srcRoot, 'views/IndexHubView.vue'), 'utf-8');
    expect(dq.includes("router.push('/indices')")).toBe(true);
    expect(ih.includes("goto('/adhoc-rebuild')")).toBe(true);
  });
});
