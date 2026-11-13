import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1090：SQL 工具行窄宽度可读性。
 * 真实浏览器 1024×768 实测：右组控件被压缩，「宽容模式」「列式」折成单字竖排。
 * 修法=允许 hd/右组整体换行 + 标签整词不折；1440 一行时零变化。 */
describe('1090 SQL 工具行窄档换行', () => {
  it('工具行与右组允许换行，标签不拆字', () => {
    expect(src).toContain('.sq-card-hd { flex-wrap: wrap; row-gap: var(--sp-1); }');
    expect(src).toContain('.sq-card-hd-r { flex: 1 1 0; min-width: 0; flex-wrap: wrap; row-gap: var(--sp-1h); justify-content: flex-end; }');
    expect(src).toContain('.sq-fs { white-space: nowrap; }');
    expect(src).toContain('.sq-fs.sq-tog { flex-shrink: 0; }');
  });

  it('原 toolrow 单行锁（flattenWave544 逐字锚）保持不动', () => {
    expect(src).toContain('.sq-card-hd { display: flex; align-items: center; justify-content: space-between; padding: var(--sp-2) var(--sp-3); border-bottom: 1px solid var(--border); font-size: var(--fs-sm); font-weight: 650; }');
  });
});
