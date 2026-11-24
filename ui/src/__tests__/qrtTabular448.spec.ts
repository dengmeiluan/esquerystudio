/**
 * 四百四十八批：QRT 表格数字等宽补齐——theme.css tabular-nums 选择器族覆盖了
 * .tbl td（RT）却漏了 .qrt-tbl td（QRT），数字列（_score/耗时/计数）字符宽度
 * 不等宽导致变化时列宽微抖。一行收口，全 QRT 宿主（Lucene/PIT/模板/SQL/沙盒）受益。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../theme.css'), 'utf-8');

describe('QRT 数字等宽（448 批）', () => {
  it('tabular-nums 选择器族覆盖 .qrt-tbl td', () => {
    expect(s).toContain('.num, .tbl td, .qrt-tbl td, .idx-meta, .pill, .chip, .kbd { font-variant-numeric: tabular-nums; }');
  });
});
