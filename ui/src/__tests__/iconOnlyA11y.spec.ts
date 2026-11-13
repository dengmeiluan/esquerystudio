/**
 * R130 一百四十九批：icon-only 按钮可达性守卫（46 批人工核实后的机器化固件）。
 * 规则：<button> 无可见文本（无 {{ }} 动态文本、无静态文字）时必须带 aria-label
 * （屏幕阅读器不读 title）。大块容器按钮（>2000 字符）跳过。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walkVue(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkVue(p));
    else if (name.endsWith('.vue')) out.push(p);
  }
  return out;
}

const root = join(__dirname, '..');
const files = walkVue(root);
const bad: string[] = [];

for (const fp of files) {
  const src = readFileSync(fp, 'utf-8');
  const btnRe = /<button\b/g;
  let m: RegExpExecArray | null;
  while ((m = btnRe.exec(src))) {
    const start = m.index;
    const end = src.indexOf('</button>', start);
    if (end === -1) continue;
    const seg = src.slice(start, end);
    if (seg.length > 2000) continue;
    if (seg.includes('aria-label')) continue;
    if (seg.includes('{{')) continue; // 动态文本按钮
    const inner = seg.slice(seg.indexOf('>') + 1)
      .replace(/<[^>]*>/g, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .trim();
    if (inner) continue; // 有静态可见文本
    const line = src.slice(0, start).split('\n').length;
    bad.push(`${fp.replace(root + '/', '')}:${line}`);
  }
}

describe('icon-only 按钮可达性（149 批）', () => {
  it('全站无「无 aria-label 且无可见文本」的按钮', () => {
    expect(bad).toEqual([]);
  });
});
