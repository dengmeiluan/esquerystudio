import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

/* 1095：数组字段报错的自救入口。
 * ES SQL 对数组字段默认报 Arrays are not supported；宽容模式（field_multi_value_leniency）
 * 可让 SQL 取首值。此前用户需自行发现开关再重试，现错误面板直接给一键操作。 */
describe('1095 SQL 数组字段一键宽容重试', () => {
  it('默认严格；仅在未开宽容且命中数组错误时出现', () => {
    expect(src).toContain("const lenient = usePref('sql.lenient', false);");
    expect(src).toContain('const arrayLenientFix = computed(() => !lenient.value && !!runErr.value');
    expect(src).toContain('/Arrays are not supported|field_multi_value_leniency|multi[-_ ]value/i.test(runErr.value)');
    expect(src).toContain('data-test="sql-array-lenient"');
    expect(src).toContain('开启宽容模式并重试');
    expect(src).toContain('数组/多值字段只显示首值');
  });

  it('一键动作：开开关 + 提示 + 重新执行（不改 SQL 文本）', () => {
    expect(src).toMatch(/function enableLenientRetry\(\) \{\r?\n\s*lenient\.value = true;\r?\n\s*store\.notify\('info', '已开启宽容模式（数组字段取首值），正在重新执行'\);\r?\n\s*void doRun\(\);/);
  });
});
