/**
 * 三百五十批：esquerystudio_qb_split 迁移后遗留键清除——
 * 此前迁移只读不删，localStorage 键永久残留（ 10）。
 * 854 批锁同步更新：removeItem 裸写合并 removeStoredRaw 单源（写防御域收官），
 * 断言字面随单源形态更新，锁语义不变（遗留键清除行为在场）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../composables/useLayoutPreferences.ts'), 'utf-8');

describe('遗留迁移键清除（350 批）', () => {
  it('迁移后 removeItem 遗留键', () => {
    expect(v).toContain("removeStoredRaw(localStorage, 'esquerystudio_qb_split')");
    expect(v).toMatch(/if \(legacyRaw != null \|\| migrated\) \{[\s\S]*?removeStoredRaw/);
  });
});
