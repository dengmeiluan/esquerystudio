/**
 * ColFilterPopover 输入焦点环对齐全站档（源码锚）：
 * 值内搜索（.cfp-kw，搜索/包含文本两处共用类）与区间双输入（.cfp-range-in）的 :focus
 * 此前只有 border-color 变化（outline: none），对比度弱于全站 .inp/.ipt 输入档
 * （theme.css 的 :focus = border-color + box-shadow: var(--focus-ring)）。
 * 锁定两类输入的 :focus 必须带 box-shadow: var(--focus-ring)，防样式漂移回退。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/ColFilterPopover.vue'), 'utf-8');
const css = src.split('<style scoped>')[1] ?? '';

describe('ColFilterPopover 输入焦点环（源码锚）', () => {
  it('.cfp-kw 与 .cfp-range-in 的 :focus 带 box-shadow: var(--focus-ring)（对齐全站输入档）', () => {
    expect(css, '.cfp-kw:focus 缺 focus-ring').toMatch(
      /\.cfp-kw:focus \{[^}]*border-color: var\(--ac\);[^}]*box-shadow: var\(--focus-ring\);[^}]*\}/,
    );
    expect(css, '.cfp-range-in:focus 缺 focus-ring').toMatch(
      /\.cfp-range-in:focus \{[^}]*border-color: var\(--ac\);[^}]*box-shadow: var\(--focus-ring\);[^}]*\}/,
    );
  });
});
