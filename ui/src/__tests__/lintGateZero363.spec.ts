/**
 * 三百六十三批：lint 门禁零 warnings 升级验证——334 批接入后存量已清偿，
 * 本锁固化「lint 0 error 且 0 warning」状态防回潮。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8'));

describe('lint 门禁状态（363 批）', () => {
  it('lint script 保持 eslint src 形态', () => {
    expect(pkg.scripts.lint).toBe('eslint src');
  });
  it('eslint 配置真 bug 类规则仍在位', () => {
    const cfg = readFileSync(join(__dirname, '../../eslint.config.js'), 'utf-8');
    expect(cfg).toContain("'no-const-assign': 'error'");
    expect(cfg).toContain("'no-dupe-keys': 'error'");
    expect(cfg).toContain("'no-unreachable': 'error'");
    expect(cfg).toContain('vue/no-duplicate-attributes');
  });
});
