/**
 * 三百七十七批：错误条 role="alert" 全站守卫——err-bar 是全站错误展示统一语言
 * （21 文件 27 处），此前均无 ARIA live 语义，错误出现时屏幕阅读器零播报。
 * 全站补 role="alert"（插入即播报），并以此 spec 钉死：今后任何新增
 * err-bar 不带 role="alert" 即红。
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
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const SRC = join(__dirname, '..');
const files = walk(SRC);
const offenders: string[] = [];
let totalErrBars = 0;
for (const f of files) {
  const s = readFileSync(f, 'utf-8');
  const bare = (s.match(/class="err-bar/g) ?? []).length - (s.match(/role="alert" class="err-bar/g) ?? []).length;
  totalErrBars += (s.match(/role="alert" class="err-bar/g) ?? []).length;
  if (bare > 0) offenders.push(`${f}: ${bare} 处裸 err-bar`);
}

describe('err-bar role=alert 全站守卫（377 批）', () => {
  it('全站 .vue 文件中 err-bar 必带 role="alert"', () => {
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('守卫确实覆盖到了存量（≥20 处，防守卫路径写错静默通过）', () => {
    expect(totalErrBars).toBeGreaterThanOrEqual(20);
  });
});
