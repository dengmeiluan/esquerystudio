import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1127：结果表两种筛选语义必须一眼可分——
 本地筛选=仅当前结果集（前端内存，不改查询）；下钻=改 SQL 条件并重查。 */
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const hint = readFileSync(join(__dirname, '../components/TableFilteredHint.vue'), 'utf-8');

describe('1127 本地筛选 vs 查询下钻文案', () => {
  it('单元格菜单两项显式区分', () => {
    expect(qrt).toContain("label: '仅筛选当前结果（不改查询）'");
    /* 1439：文案随 condTarget（缺省 SQL，SQL 宿主渲染结果与旧字面量一致） */
    expect(qrt).toContain('label: `加入查询条件并重查（改 ${props.condTarget}）`');
    expect(qrt).toContain("condTarget: 'SQL'");
    expect(qrt).not.toContain("label: '按此值筛选'");
  });

  it('筛选态提示行 tooltip 说明仅前端、不改查询', () => {
    expect(hint).toContain('仅筛选当前结果集（前端内存），不修改查询');
    expect(hint).toContain('加入查询条件并重查');
  });

  it('无工具行通道（SQL 默认/未开 tableBar）也渲染筛选态提示与清除入口', () => {
    /* 1141：门控改 barOn——开 tableBar 时提示并入工具行，未开时仍走这条独立条 */
    expect(qrt).toContain('v-if="!barOn && activeFilterCount && !bodyHidden"');
    expect(qrt).toContain('class="qrt-filter-bar"');
  });
});
