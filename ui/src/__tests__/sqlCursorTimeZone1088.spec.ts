import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1088：time_zone 是 cursor 结果上下文的一部分。
 * 首查用 UTC、翻页前切 Asia/Shanghai 时，下一页日期列会换成新时区格式，与上一页不一致。
 * 与 columnar 同口径：切时区即作废旧 cursor 并标过期，重新执行后再翻页。 */
describe('1088 SQL 时区切换作废 cursor', () => {
  it('watch(timeZone) 存在且与 columnar 同语义', () => {
    expect(src).toMatch(/watch\(timeZone, \(\) => \{\r?\n\s*if \(cursor\.value\) \{\r?\n\s*resultStale\.value = true;\r?\n\s*staleLabel\.value = '时区已修改';\r?\n\s*void closeCursorQuiet\(\);/);
  });

  it('首查与续页都携带当前时区（快照同源）', () => {
    expect(src).toContain('if (timeZone.value) b.time_zone = timeZone.value;');
    expect(src).toContain('api.sqlCursor(cursor.value, timeZone.value || undefined, columnar.value || undefined)');
  });

  it('过期徽标说明真实原因（时区/参数/列式/取消/失败不再一律写 SQL 已修改）', () => {
    expect(src).toContain("const staleLabel = ref('SQL 已修改');");
    expect(src).toContain("staleLabel.value = '时区已修改';");
    expect(src).toContain("staleLabel.value = '列式形态已切换';");
    expect(src).toContain("staleLabel.value = '查询已取消';");
    expect(src).toContain("staleLabel.value = '查询失败';");
    expect(src).toContain("label: staleLabel.value");
  });
});
