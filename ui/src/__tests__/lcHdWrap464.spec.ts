/**
 * 四百六十四批：Lucene 工具行窄容器换行策略——lc-hd-r（视图切换/分页/导出）
 * 此前无 flex-wrap，窄容器（聚焦面/窄屏）下溢出截断；415 dt-actions 同款：
 * 容器可换行（row-gap 保持节奏）、子项 nowrap 不逐字断。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('Lucene 工具行换行策略（464 批）', () => {
  it('lc-hd-r 容器可换行+子项 nowrap', () => {
    /* 五百二十七批同步更新：gap/row-gap 收 --sp 半档（6px→--sp-1h、4px→--sp-1），换行语义不变 */
    expect(v).toContain('.lc-hd-r { display: flex; gap: var(--sp-1h); flex-wrap: wrap; row-gap: var(--sp-1); align-items: center; }');
    expect(v).toContain('.lc-hd-r > * { white-space: nowrap; flex-shrink: 0; }');
  });
});
