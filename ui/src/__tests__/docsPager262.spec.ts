/**
 * ：索引工作区文档表翻页范式与查询工作台统一（实报「翻页行为不一致」）。
 * 旧形态：IndexHub「N 条」下拉（20/50/100）改 size 重查，无翻页器；
 * 新形态：与 DslQueryView 同款 Pagination 组件 + from/size 真检索 + 共享页大小记忆 es_pager_size
 *（一次调节两工作台一致，页大小选项集随之统一为 Pagination 默认 10/20/50/100）。
 * 锁定：buildDocsDsl from 注入 + IndexHubView 接线源码锁 + 共享键迁移读。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildDocsDsl } from '../utils/workbench';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('文档表真分页统一（）', () => {
  it('buildDocsDsl：from 注入 DSL（缺省 0 向后兼容）', () => {
    const d = JSON.parse(buildDocsDsl('', 20, 40));
    expect(d.from).toBe(40);
    expect(d.size).toBe(20);
    expect(d.track_total_hits, '300+ 批：统一 ES 默认（不精确计数），下界语义经 totalGte 标注').toBeUndefined();
    expect(JSON.parse(buildDocsDsl('x', 50)).from).toBe(0);
  });

  it('IndexHubView 源码锁：Pagination 接线+共享键+旧范式退役', () => {
    const v = read('../views/IndexHubView.vue');
    /* 同步更新：JSON/Tree 档无翻页语义，Pagination 带视图档 v-if 前缀（DQ 同款），
       props 值恒等（from/size 真检索语义零触） */
    expect(v).toMatch(/<Pagination v-if="docsView !== 'json' && docsView !== 'tree'"\s*\n\s+:page="docsPage" :total-pages="docsTotalPages" :page-size="docsSize"/);
    expect(v).toMatch(/es_pager_size/);
    expect(v).toMatch(/buildDocsDsl\(docsQ\.value, docsSize\.value, \(docsPage\.value - 1\) \* docsSize\.value\)/);
    expect(v).toMatch(/function runDocsNew\(\)/);
    expect(v, '旧「N 条」选项集退役').not.toMatch(/SIZE_OPTS/);
    expect(v, '旧维度键不再写（兼容读保留）').not.toMatch(/setItem\('ihub\.docsSize'/);
    expect(v).toMatch(/docsPage\.value = 1; \/\* 切索引翻页归位 \*\//);
  });

  it('两工作台页大小同源：DslQueryView 读写同键 es_pager_size', () => {
    const dq = read('../views/DslQueryView.vue');
    /* 合并 usePagerSize 统一件后契约同步更新：读写+档位钳制（越档/坏值回落 20、旧 ihub.docsSize
       兼容读）归统一件，视图不再裸读写 es_pager_size */
    /* 同步更新（击穿者：562 实报 size 与分页档脱节——import 增补 PAGER_SIZES
       档位单源，执行窗口同步块见 dqSizePagerSync562） */
    expect(dq).toMatch(/import \{ usePagerSize, PAGER_SIZES \} from '\.\.\/composables\/usePagerSize';/);
    expect(dq).toMatch(/const \{ size: pageSize, set: writePageSize \} = usePagerSize\(\);/);
    expect(dq, '写侧走统一件 set（同步 ref+落共享键）').toContain('writePageSize(s);');
    expect(dq, '裸读写 es_pager_size 退役').not.toMatch(/localStorage\.(get|set)Item\('es_pager_size'/);
  });
});
