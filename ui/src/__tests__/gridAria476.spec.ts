/**
 * 四百七十六批：RT/QRT 根元素读屏上下文标注——role="region"+aria-label
 * （Tab 聚焦后的快捷键摘要），读屏用户 Tab 进入表格即获知可用交互；
 * 两表根 tabindex=-1（程序聚焦）已有，补语义名。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(SRC, 'components/QueryResultTable.vue'), 'utf-8');

describe('RT/QRT 根读屏标注（476 批）', () => {
  it('RT：role=region+aria-label 含快捷键摘要', () => {
    expect(rt).toMatch(/role="region" aria-label="查询结果表格（Tab 聚焦后：↑↓ 行导航、Ctrl\+F 查找、Enter 打开文档）"/);
  });

  it('QRT：role=region+aria-label', () => {
    expect(qrt).toMatch(/role="region" aria-label="查询结果表格（Tab 聚焦后：↑↓ 行导航、Ctrl\+F 查找、Esc 退出）"/);
  });
});
