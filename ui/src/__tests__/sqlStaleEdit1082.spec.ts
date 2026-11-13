import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1082：无 cursor 时改稿/改参数也要把旧结果标过期。
 * 实测：选中 A 索引执行、再用模板改 FROM 到 B，表里 A 的行仍显示为当前结果（无过期徽标），
 * 用户会把上一轮结果当成新语句的产物。过期判定不能再只在「有 cursor」时发生。 */
describe('1082 SQL 改稿过期判定', () => {
  it('记录上次成功执行的 SQL/参数快照', () => {
    expect(src).toContain('const runSql = ref<string | null>(null);');
    expect(src).toContain('const runParams = ref<string | null>(null);');
    expect(src).toContain('runSql.value = sqlSnapshot;');
    expect(src).toContain("runParams.value = paramsSnapshot ?? '';");
  });

  it('改 SQL 且已有行即标过期（不依赖 cursor）', () => {
    expect(src).toMatch(/if \(rows\.value\.length && runSql\.value !== null && sql\.value !== runSql\.value\) \{\r?\n\s*resultStale\.value = true;\r?\n\s*staleLabel\.value = 'SQL 已修改';/);
  });

  it('改参数且已有行即标过期（空参数数组不算改动）', () => {
    expect(src).toMatch(/if \(rows\.value\.length && runParams\.value !== null && paramsText\.value\.trim\(\) !== runParams\.value\) \{\r?\n\s*resultStale\.value = true;\r?\n\s*staleLabel\.value = '参数已修改';/);
    expect(src).toContain("const paramsNow = paramParse.value.ok && paramParse.value.value.length ? paramsText.value.trim() : '';");
  });

  it('执行期间继续改稿，成功回包仍标过期', () => {
    /* 1126：成功回包按快照重算 stale（程序化改稿+立即重跑的 watch 竞态必须被清掉） */
    expect(src).toMatch(/const inputChanged = sql\.value !== sqlSnapshot \|\| paramsNow !== runParams\.value;\r?\n\s*resultStale\.value = inputChanged;\r?\n\s*if \(inputChanged\) \{\r?\n\s*staleLabel\.value = '执行期间输入已修改';/);
  });
});
