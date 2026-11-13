/**
 * 919 批（轨6 走查批 AliasesView）：样式卫生双锚——
 * ① .alv-fi 规则在 scoped style 里双定义（680/789 两处逐字相同，后则纯冗余），
 *   锁「单一定义」防回流；
 * ② .alv-danger:hover 的 color 走 var(--err, var(--err)) fallback 自指形态
 *   （--err 已在 theme.css 定义，fallback 恒不参与=噪声写法），锁无自指 fallback。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/AliasesView.vue'), 'utf-8');

describe('AliasesView 样式卫生（919 批）', () => {
  it('.alv-fi 规则单一定义（无重复声明块）', () => {
    const defs = src.match(/^\.alv-fi \{[^}]*\}$/gm) || [];
    expect(defs.length).toBe(1);
  });

  it('.alv-danger 色值无自指 fallback（--err 单源已定义）', () => {
    expect(src).not.toContain('var(--err, var(--err))');
    expect(src).toMatch(/\.alv-danger:hover \{ color: var\(--err\); \}/);
  });
});
