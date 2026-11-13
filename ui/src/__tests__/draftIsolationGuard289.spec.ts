/**
 * 二百八十九批：跨页草稿隔离守卫。
 * useScopedDraft 键按 route/target 维度隔离（39/52 批口径）——审计全站调用点：
 * 每个 route 维度草稿必须显式给 route（或缺省走 route.path），禁止裸共享键串页。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (p.includes('__tests__')) continue;
    const st = require('node:fs').statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (p.endsWith('.vue') || p.endsWith('.ts')) acc.push(p);
  }
  return acc;
}

describe('跨页草稿隔离守卫（289 批）', () => {
  it('useScopedDraft 调用必须显式声明隔离维度（route/index/target 之一）', () => {
    const bad: string[] = [];
    for (const f of walk(join(SRC, 'views')).concat(walk(join(SRC, 'components')))) {
      const s = readFileSync(f, 'utf-8');
      for (const m of s.matchAll(/useScopedDraft\('([^']+)'/g)) {
        const tail = s.slice(m.index ?? 0, (m.index ?? 0) + 200);
        /* Scope 变量形态（如 adhocScope = { route: 'adhoc' }）同样合格 */
        if (!/route:|index:|target:|tab:|Scope[,)]|: \{\}/.test(tail)) bad.push(`${f} → ${m[1]}`);
      }
    }
    expect(bad, '草稿键缺隔离维度:\n' + bad.join('\n')).toEqual([]);
  });
});
