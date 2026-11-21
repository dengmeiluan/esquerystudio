/**
 * 五百六十二批·用户产线实报：查询工作台「检索参数 size=20」与表格分页器「100/页」脱节。
 *
 * 根因双层：
 *  ① DslQueryView runQuery 组装段恒 `obj.size = pageSize.value`——用户 DSL 文本显式写的
 *     size 被静默覆盖为分页档，执行行摘要串（paramsSummary 读文本）显示的 size=20 与
 *     实际执行窗口（分页档 100）不符，纯误导；
 *  ② 分页器读全站共享键 es_pager_size，与 DSL 文本 size 零联动。
 *
 * 修法=档内显式 size 反向驱动：DSL 顶层 size 是档位值（10/20/50/100）且≠当前档时，
 * 执行组装段先 writePageSize（落共享键+更新 ref），from/size 全链按同一档生成；
 * 档外/缺席照旧注入分页档（现状语义）。分页器改档不回写 DSL 文本（程序化改用户
 * 手排 JSON 有毁稿风险，备案不做）。锁 usePagerSize.PAGER_SIZES 导出与同步块接线。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PAGER_SIZES, readPagerSize, writePagerSize } from '../composables/usePagerSize';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');
const dq = read('views/DslQueryView.vue');

describe('562 实报：DSL 档内 size 反向驱动分页档（执行窗口全链一致）', () => {
  it('usePagerSize 导出 PAGER_SIZES 档位单源（与 Pagination 默认档同值）', () => {
    expect(PAGER_SIZES).toEqual([10, 20, 50, 100]);
    expect(dq).toContain("import { usePagerSize, PAGER_SIZES } from '../composables/usePagerSize'");
  });
  it('runQuery 组装段：档内显式 size 先同步分页档再注入 from/size（不再静默覆盖用户 size）', () => {
    /* 七百九十六批同步更新：同步块加 !pagerDrivenRun 守卫（分页器发起的执行=分页档获胜，
       DSL 旧 size 不得回滚用户刚点的档——用户实报「点 50/页 不生效」根因刀；契约本体
       =pagerSizeFight796.spec，本锁同步更新守卫新形态） */
    expect(dq).toMatch(/if \(!pagerDrivenRun && typeof obj\.size === 'number' && PAGER_SIZES\.includes\(obj\.size\) && obj\.size !== pageSize\.value\) \{\s*\n\s*writePageSize\(obj\.size\);\s*\n\s*\}/);
    /* from/size 注入在其后（同步后的档驱动窗口） */
    expect(dq.indexOf('PAGER_SIZES.includes(obj.size)')).toBeLessThan(dq.indexOf('obj.from = (page.value - 1) * pageSize.value;'));
  });
  it('行为：writePageSize 落共享键且读回一致（档内值）', () => {
    const prev = localStorage.getItem('es_pager_size');
    try {
      writePagerSize(50);
      expect(readPagerSize()).toBe(50);
    } finally {
      if (prev == null) localStorage.removeItem('es_pager_size');
      else localStorage.setItem('es_pager_size', prev);
    }
  });
  it('paramsSummary 既有联动语义自洽：档同步后 size 与每页条数相同，摘要不再出 size 段', () => {
    expect(dq).toContain("if (typeof obj.size === 'number' && obj.size !== pageSize.value) parts.push('size=' + obj.size);");
  });
});
