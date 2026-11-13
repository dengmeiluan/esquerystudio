/**
 * R130 第九十九批：收藏导入跳过条目诚实化（九十批的漏段）——坏条目（缺 kind/title）
 * 此前被 forEach 静默跳过，提示里的 N 与文件条目数对不上且用户不知道少了。
 * 修：skipped 计数入回执。锁定（静态）：skipped 计数 + 回执含跳过段。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/FavoritesView.vue'), 'utf-8');

describe('收藏导入跳过诚实化（九十九批）', () => {
  it('skipped 计数在场且回执含跳过段', () => {
    expect(src).toMatch(/let skipped = 0;/);
    expect(src).toMatch(/skipped\+\+/);
    expect(src).toContain('跳过坏条目 ${skipped} 条（缺 kind/title）');
  });

  it('跳过条件仍是缺 kind/title（与 addFavorite 契约一致）', () => {
    expect(src).toMatch(/if \(x && x\.kind && x\.title\) \{/);
  });
});
