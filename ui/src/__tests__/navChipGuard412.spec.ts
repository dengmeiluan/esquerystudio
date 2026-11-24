/**
 * 四百一十二批：跳转芯片族全站死链守卫——「快速联动/快速跳转」是核心交互承诺
 * （305 行→文档/319 索引芯片/328 Snapshots→DevTools/335 送入沙盒等）。
 * 复验：59 处 query 对象形态跳转、11 个目标路由全部在册，零死链。
 * 本 spec 把扫描固化为门禁：今后任何 router.push({ path: 'X' }) 的 X 不在路由表即红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === '__tests__' || name === 'node_modules') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.vue') || name.endsWith('.ts')) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, '..');
const routerSrc = readFileSync(join(SRC, 'router.ts'), 'utf-8');
const routerPaths = new Set((routerSrc.match(/path: '([^'?]+)'/g) ?? []).map(s => s.slice(7, -1)));

describe('跳转芯片死链守卫（412 批）', () => {
  it('全站 query 对象跳转的目标路由全部在册', () => {
    const offenders: string[] = [];
    let total = 0;
    for (const f of walk(SRC)) {
      const s = readFileSync(f, 'utf-8');
      for (const m of s.matchAll(/push\(\{\s*path: '([/?a-z0-9/_-]+)'/g)) {
        total++;
        const target = m[1].split('?')[0];
        if (!routerPaths.has(target)) offenders.push(`${f}: ${m[1]}`);
      }
    }
    expect(total, '扫描必须覆盖到存量（防正则失效静默通过）').toBeGreaterThanOrEqual(40);
    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
