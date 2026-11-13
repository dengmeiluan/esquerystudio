/**
 * 二百七十三批：滚动条 token 化+表格容器 hover 增亮。
 * 此前 thumb 色硬编码双份（dark/light 各写一遍十六进制），hover 增亮缺失；
 * 收口为 --scroll-thumb/--scroll-thumb-hover 双 token+表格容器 :hover 增亮。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const theme = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

describe('滚动条 token 化（273 批）', () => {
  it('双 token 定义+light 覆盖+引用收口', () => {
    expect(theme).toContain('--scroll-thumb: #2c2f38');
    expect(theme).toContain('--scroll-thumb-hover: #3a3d47');
    expect(theme).toMatch(/\[data-theme="light"\] \{ --scroll-thumb: #cbd0d9/);
    expect(theme).not.toMatch(/scrollbar-thumb \{ background: #2c2f38/);
    expect(theme).toContain('scrollbar-color: var(--scroll-thumb) transparent');
  });
  it('表格容器 hover 增亮', () => {
    expect(theme).toMatch(/\.rt-wrap:hover::-webkit-scrollbar-thumb/);
    expect(theme).toMatch(/\.qrt-wrap:hover::-webkit-scrollbar-thumb/);
  });
});
