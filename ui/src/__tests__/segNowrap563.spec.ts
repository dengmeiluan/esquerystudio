/**
 * 五百六十三批·用户产线实报「排版乱了」+「这个不应该直接全部在表头」:
 *  ① 全站 seg 钮文字永不断行(theme.css .seg button 补 white-space: nowrap)——
 *     窄容器压缩下「表/格」「卡/片」逐字断行是组件级 bug;容器宽度不足由外层滚动承接。
 *  ② Pagination 触发钮同锁(「20/页」断行)。
 * 源码锁口径(focusSurface401 同理由)。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');
const pgn = readFileSync(join(SRC, 'components/Pagination.vue'), 'utf-8');
const rt = readFileSync(join(SRC, 'components/ResultTable.vue'), 'utf-8');

describe('563 实报:seg 钮与分页触发钮文字永不断行', () => {
  it('theme.css .seg button 补 white-space: nowrap(全站 seg 语言统一守卫)', () => {
    expect(theme).toMatch(/\.seg button \{[^}]*white-space: nowrap;/);
  });
  it('pgn-psel 触发钮补 white-space: nowrap(「20/页」不再逐字断行)', () => {
    expect(pgn).toMatch(/\.pgn-psel \{[^}]*white-space: nowrap;/);
  });
  it('待提交弹层向上弹(top-end,不盖表格列头)', () => {
    expect(rt).toMatch(/placement="top-end" :show="pendOpen"/);
  });
});
