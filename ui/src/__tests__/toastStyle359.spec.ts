/**
 * 三百五十九批：成功 toast 句式统一——去句中句号/半角标点混排（hint 分隔用全角「；」）。
 * 覆盖 AdhocRebuildView/PainlessLabView/XmigrateView 三重灾文件。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('成功 toast 句式统一（359 批）', () => {
  it('AdhocRebuildView：句中句号清零+半角逗号全角化', () => {
    const s = read('../views/AdhocRebuildView.vue');
    expect(s).not.toMatch(/notify\('success'[^)]*。/);
    expect(s).toContain("',进入审编步'".replace(',', '，'));
  });
  it('PainlessLabView：注入提示句式统一', () => {
    const s = read('../views/PainlessLabView.vue');
    expect(s).toContain('已注入，跳转 UpdateByQuery 面板…');
  });
  it('XmigrateView：启动提示无半角冒号+空格混排', () => {
    const s = read('../views/XmigrateView.vue');
    expect(s).not.toMatch(/'迁移已启动： '/);
  });
});
