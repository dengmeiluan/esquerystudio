/**
 * 四百六十四批：WCAG 对比度自动审计——明暗双主题的主要文字/背景组合硬校验：
 * 正文级（tx0/fg on bg0/bg1/bg2/panel）≥ 4.5:1（WCAG AA 正文）；
 * 次要级（tx1 on bg 系，tx2 作辅助说明 on bg0/bg1）≥ 3:1（大字/辅助）。
 * 主题 token 单点解析 theme.css（:root 暗色默认 + :root[data-theme="light"] 亮色），
 * 调色不再「目测合适」，任何 token 改动对比度不达标即红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

function parseVars(block: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)) vars[m[1]] = m[2];
  return vars;
}

function resolve(name: string, vars: Record<string, string>, depth = 0): string {
  const raw = vars[name];
  if (!raw || depth > 4) return raw ?? '';
  const ref = raw.match(/^var\(--([\w-]+)\)$/);
  return ref ? resolve(ref[1], vars, depth + 1) : raw;
}

function lum(hex: string): number {
  const n = hex.replace('#', '');
  const rgb = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function ratio(fgHex: string, bgHex: string): number {
  const a = lum(fgHex), b = lum(bgHex);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function themeVars(block: string): Record<string, string> {
  const m = block.match(/\{([\s\S]*?)\n\}/);
  return m ? parseVars(m[1]) : {};
}

/* :root 块=暗色默认；:root[data-theme="light"] 块=亮色（正则逐块提取，边界与顺序无关） */
const dark = themeVars(css.replace(/:root\[data-theme="light"\][\s\S]*$/, ''));
const light = themeVars(css.slice(css.indexOf(':root[data-theme="light"')));

/** 正文级组合：4.5:1 */
const BODY: [string, string, string][] = [
  ['dark', 'tx0', 'bg0'], ['dark', 'tx0', 'bg1'], ['dark', 'tx0', 'bg2'],
  ['light', 'tx0', 'bg0'], ['light', 'tx0', 'bg1'], ['light', 'tx0', 'bg2'],
];
/** 次要级组合：3:1（辅助说明/大字） */
const SOFT: [string, string, string][] = [
  ['dark', 'tx1', 'bg0'], ['dark', 'tx1', 'bg1'], ['dark', 'tx1', 'bg2'],
  ['dark', 'tx2', 'bg0'], ['dark', 'tx2', 'bg1'], ['dark', 'tx2', 'bg2'],
  ['light', 'tx1', 'bg0'], ['light', 'tx1', 'bg1'], ['light', 'tx1', 'bg2'],
  ['light', 'tx2', 'bg0'], ['light', 'tx2', 'bg1'], ['light', 'tx2', 'bg2'],
];

describe('WCAG 对比度审计（464 批）', () => {
  it('正文级组合 ≥ 4.5:1（明暗双主题）', () => {
    const offenders: string[] = [];
    for (const [theme, fg, bg] of BODY) {
      const vars = theme === 'dark' ? dark : light;
      const r = ratio(resolve(fg, vars), resolve(bg, vars));
      if (r < 4.5) offenders.push(`${theme} ${fg} on ${bg}: ${r.toFixed(2)}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('次要级组合 ≥ 3:1（明暗双主题）', () => {
    const offenders: string[] = [];
    for (const [theme, fg, bg] of SOFT) {
      const vars = theme === 'dark' ? dark : light;
      const r = ratio(resolve(fg, vars), resolve(bg, vars));
      if (r < 3) offenders.push(`${theme} ${fg} on ${bg}: ${r.toFixed(2)}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('双主题变量都解析到了（防选择器漂移静默空对象）', () => {
    expect(Object.keys(dark).length).toBeGreaterThanOrEqual(10);
    expect(Object.keys(light).length).toBeGreaterThanOrEqual(10);
  });
});
