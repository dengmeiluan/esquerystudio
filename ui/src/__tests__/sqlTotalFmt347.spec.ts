/**
 * 三百四十七批：SqlConsole 结果计数 fmtNum 口径统一（千分位，与全站一致）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('SqlConsole 计数口径（347 批）', () => {
  /* 五百一十九批：结果行「N 行 × M 列」手写串改用 MetaStrip 统一件，
     本守卫同步更新——fmtNum 千分位口径不变（resultMeta computed 单一出处）+ 模板 MetaStrip 接线在场 */
  it('结果行 fmtNum 化（MetaStrip 合并后口径不变）', () => {
    expect(v).toContain('{ value: fmtNum(rows.value.length), label: \'行\' }');
    expect(v).toContain('{ value: fmtNum(cols.value.length), label: \'列\' }');
    expect(v).toContain('<MetaStrip :items="resultMeta" />');
  });
});
