/* 五百六十五批件⑤：splitMark 迁 utils/markSeg 治依赖倒挂。
 *  背景：utils/fieldSearch.ts 反向 import composables/useGridSearch（utils→composables
 *  方向倒挂）；splitMark/normNumStr 单源在 useGridSearch，全站 10+ 消费方。
 *  锁面：
 *   A markSeg.splitMark/normNumStr 与旧行为逐字一致（行为样例：基础切分/数值归一/多命中）；
 *   B useGridSearch re-export 与 markSeg 是同一函数引用（10+ 消费方 import 路径零改契约）；
 *   C fieldSearch 改从 utils/markSeg import，倒挂消除（源码锁）；
 *   D useGridSearch 保留 re-export（源码锁）；markSeg 零 composables 依赖（纯函数件）。 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitMark, normNumStr } from '../utils/markSeg';
import { splitMark as splitMarkViaGrid, normNumStr as normNumViaGrid } from '../composables/useGridSearch';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

describe('五百六十五批件⑤ A：markSeg.splitMark/normNumStr 行为逐字一致', () => {
  it('基础切分：大小写不敏感命中、原文大小写入 mark、多命中、无命中/空词单段', () => {
    expect(splitMark('userName', 'name')).toEqual([{ t: 'user', m: false }, { t: 'Name', m: true }]);
    /* 多命中后余段平文收尾为既有真实行为，逐字锁定 */
    expect(splitMark('abcabc', 'ab')).toEqual([{ t: 'ab', m: true }, { t: 'c', m: false }, { t: 'ab', m: true }, { t: 'c', m: false }]);
    expect(splitMark('abc', 'ZZZ')).toEqual([{ t: 'abc', m: false }]);
    expect(splitMark('abc', '')).toEqual([{ t: 'abc', m: false }]);
    expect(splitMark('abc', '   ')).toEqual([{ t: 'abc', m: false }]);
    expect(splitMark('orderNo', 'ORDER')).toEqual([{ t: 'order', m: true }, { t: 'No', m: false }]);
  });

  it('557 数值归一命中：字面扫不动时整段标 mark（千分位/空白双口径），非数字形态不归一', () => {
    expect(splitMark('1,234', '123')).toEqual([{ t: '1,234', m: true }]);
    expect(splitMark('1 234', '1234')).toEqual([{ t: '1 234', m: true }]);
    expect(splitMark('a,b', 'ab')).toEqual([{ t: 'a,b', m: false }]);
  });

  it('normNumStr 语义保形（useGridSearch 第二遍归一口径）', () => {
    expect(normNumStr('1,234')).toBe('1234');
    expect(normNumStr('12,34')).toBeNull();
    expect(normNumStr('42')).toBe('42');
    expect(normNumStr('-3.5')).toBe('-3.5');
    expect(normNumStr('abc')).toBeNull();
  });
});

describe('五百六十五批件⑤ B：useGridSearch re-export 同一引用', () => {
  it('经 useGridSearch import 的 splitMark/normNumStr 与 markSeg 导出是同一函数', () => {
    expect(splitMarkViaGrid).toBe(splitMark);
    expect(normNumViaGrid).toBe(normNumStr);
  });
});

describe('五百六十五批件⑤ C：依赖倒挂消除（源码锁）', () => {
  it('fieldSearch 不再反向 import composables，改从 utils/markSeg 引切分件', () => {
    const v = read('utils/fieldSearch.ts');
    expect(v, 'utils→composables 倒挂退役').not.toContain("from '../composables/useGridSearch'");
    expect(v, '切分件改从 markSeg 引').toContain("from './markSeg'");
  });

  it('useGridSearch re-export splitMark/normNumStr（10+ 消费方 import 路径零改）', () => {
    const v = read('composables/useGridSearch.ts');
    expect(v).toMatch(/export\s*\{[^}]*splitMark[^}]*\}\s*from\s*'\.\.\/utils\/markSeg'/);
  });

  it('markSeg 是纯函数件：零 composables 依赖', () => {
    const v = read('utils/markSeg.ts');
    expect(v, 'markSeg 不得 import composables').not.toMatch(/from\s+'\.\.\/composables/);
    expect(v).toContain('export function splitMark');
    expect(v).toContain('export function normNumStr');
  });
});
