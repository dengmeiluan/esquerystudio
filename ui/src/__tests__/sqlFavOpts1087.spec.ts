import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { replayFavorite } from '../utils/favReplay';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1087：SQL 收藏的执行选项也是现场——时区影响日期结果、page_timeout 影响能否跑完、
 * columnar 影响响应形态、fetch_size 影响取数量。只回放 SQL 文本会让「收藏时能跑对」
 * 在回放时变样。旧收藏仅有 fetchSize 时也降级还原。 */
describe('1087 SQL 收藏执行选项', () => {
  beforeEach(() => sessionStorage.clear());

  it('收藏写入执行选项（默认值不落冗余键）', () => {
    expect(view).toContain('function sqlRunOpts(): Record<string, string | number | boolean> {');
    expect(view).toContain('...(timeZone.value ? { timeZone: timeZone.value } : {}),');
    expect(view).toContain('...(pageTimeout.value ? { pageTimeout: pageTimeout.value } : {}),');
    expect(view).toContain('...(columnar.value ? { columnar: true } : {}),');
    expect(view).toContain('...(lenient.value ? { lenient: true } : {}),');
    expect(view).toContain('const opts = sqlRunOpts();');
  });

  it('回放投递选项快照；旧收藏仅有 fetchSize 时降级', () => {
    replayFavorite(
      { kind: 'rest', tags: ['sql'], payload: { sql: 'SELECT 1', opts: { fetchSize: 50, timeZone: 'Asia/Shanghai', columnar: true } } },
      { push: vi.fn() } as any,
      () => {},
    );
    expect(JSON.parse(sessionStorage.getItem('esquerystudio.sql.prefill.opts') || '{}')).toEqual({ fetchSize: 50, timeZone: 'Asia/Shanghai', columnar: true });
    sessionStorage.clear();
    replayFavorite(
      { kind: 'rest', tags: ['sql'], payload: { sql: 'SELECT 1', fetchSize: 200 } },
      { push: vi.fn() } as any,
      () => {},
    );
    expect(JSON.parse(sessionStorage.getItem('esquerystudio.sql.prefill.opts') || '{}')).toEqual({ fetchSize: 200 });
  });

  it('控制台挂载恢复并夹取选项（损坏快照不阻塞回放）', () => {
    expect(view).toContain("const prefillOpts = sessionStorage.getItem('esquerystudio.sql.prefill.opts');");
    expect(view).toContain('function applySqlOpts(o: Record<string, unknown>) {');
    expect(view).toContain('if (Number.isFinite(o.fetchSize) && Number(o.fetchSize) > 0) fetchSize.value = Math.min(Number(o.fetchSize), 10000);');
    expect(view).toContain("if (typeof o.timeZone === 'string') timeZone.value = o.timeZone;");
    expect(view).toContain("if (typeof o.pageTimeout === 'string') pageTimeout.value = o.pageTimeout;");
    expect(view).toContain("if (typeof o.columnar === 'boolean') columnar.value = o.columnar;");
    expect(view).toContain("if (typeof o.lenient === 'boolean') lenient.value = o.lenient;");
    expect(view).toContain('} catch { /* 损坏的选项快照不阻塞 SQL 回放 */ }');
  });
});
