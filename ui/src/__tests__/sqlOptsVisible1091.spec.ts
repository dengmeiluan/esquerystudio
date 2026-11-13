import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describeSqlOpts } from '../utils/sqlOpts';

const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');
const hub = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');

/* 1091：执行上下文可见——结果区显示当前时区（日期口径），历史行显示非默认选项摘要。
 * 回放已能还原选项（1089），但点开前看不到「当时的时区/取数/列式」，仍要靠记忆。 */
describe('1091 SQL 执行上下文可见', () => {
  it('摘要只列非默认项，默认设置零噪音', () => {
    expect(describeSqlOpts({ fetchSize: 200, lenient: true })).toBe('');
    expect(describeSqlOpts(undefined)).toBe('');
    expect(describeSqlOpts({ timeZone: 'Asia/Shanghai', fetchSize: 50, pageTimeout: '30s', columnar: true, lenient: false }))
      .toBe('Asia/Shanghai · fetch 50 · timeout 30s · 列式 · 非宽容');
  });

  it('结果区在非默认时区时显示时区徽标', () => {
    expect(view).toContain("...(timeZone.value ? [{ value: timeZone.value, label: '时区',");
    expect(view).toContain('结果日期列按此 SQL time_zone 渲染');
  });

  it('页内历史行与跨模式抽屉都挂选项摘要', () => {
    expect(view).toContain("import { describeSqlOpts } from '../utils/sqlOpts';");
    expect(view).toMatch(/const histRows = computed\(\(\) => qh\.items\.filter\(i => i\.mode === 'sql'\)\.map\(i => \{/);
    expect(hub).toContain("import { describeSqlOpts } from '../utils/sqlOpts';");
    expect(hub).toMatch(/const histRows = computed\(\(\) => hist\.items\.map\(i => \{/);
    expect(hub).toContain(':items="histRows"');
  });
});
