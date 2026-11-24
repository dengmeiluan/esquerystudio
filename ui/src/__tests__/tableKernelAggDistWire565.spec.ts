/**
 * 五百六十五批件①：QRT aggDist 接线（563 批余量收口——内核数据/展示面已就绪，QRT 消费侧缺位）。
 * 563 已交付：useAggRow 第 5 参 distOf → aggDist 出口、TableAggFoot dist 可选 prop 渲染 8 桶
 * mini-bar（aggDistMini563 只锁纯函数与缺省零渲染，不得破坏其断言）；未接线证据：
 * QRT useAggRow 解构仅 {aggOn,toggleAggRow,aggFoot,aggSpark} 未传 distOf、
 * TableAggFoot 调用点未传 :dist。
 * 接线（useColStats.dist 先例同源）：statsOf(c).dist 直连第 5 参——守卫列
 * （semanticGuard.typeTierSuppressed：binary 等 18 型+_source）dist 恒 null 天然不出。
 * 锁定：
 * 1) 预置开聚合：keyword 标注列（值为 JS number，硬口径可数）tfoot 出 .qrt-agg-dist
 *    8 桶 mini-bar（distBinsOf 单源 8 桶；Σ/分布口径分离备案在档——isNumeric force 不放大）；
 * 2) 非语义守卫列（binary）：distOf 走 useColStats suppressed 恒 null → 无 dist 段
 *    （且无 foot——numericOfCount 同守卫，td 恒空）；
 * 3) 关聚合：TableAggFoot 整行移除（aggOn 门控）零渲染——useAggRow 关闭恒 null 已由
 *    aggDistMini563 单元锁，此处锁 QRT 消费面缺省零渲染不破；
 * 4) 源码锁：解构含 aggDist + 第 5 参 statsOf(c).dist 直连 + tfoot :dist="aggDist" 在场。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(QueryResultTable as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* keyword 标注列值=JS number（硬口径可数：Σ/dist 同源收 number）；binary 列=守卫列 */
const COLS = ['kw', 'raw'];
const ROWS = [[10, 'AA=='], [4, 'BB=='], [8, 'CC==']] as any;
const PROPS = {
  cols: COLS, rows: ROWS, storageKey: 'adw565', sortable: true,
  fieldTypes: { kw: 'keyword', raw: 'binary' },
};

describe('五百六十五批件①：QRT aggDist 接线', () => {
  it('开聚合：keyword 标注列 tfoot 出 .qrt-agg-dist 8 桶 mini-bar；binary 守卫列不出', async () => {
    localStorage.setItem('es_tbl_agg:adw565', '1');
    await mountTbl(PROPS);
    const aggRow = host.querySelector('.qrt-agg-row') as HTMLElement | null;
    expect(aggRow, '聚合行开关已预置应渲染').toBeTruthy();
    const cells = aggRow!.querySelectorAll('td.qrt-agg-cell');
    expect(cells.length).toBe(2);
    /* keyword 列：foot 在场（硬口径 number 可数）+ dist 8 桶 mini-bar */
    expect(cells[0]!.textContent, 'kw 列 Σ foot 在场').toContain('Σ');
    const bars = cells[0]!.querySelectorAll('.qrt-agg-dist i');
    expect(bars.length, 'kw 列 dist 8 桶 mini-bar').toBe(8);
    /* binary 守卫列：distOf（useColStats.dist）恒 null → 无 dist 段；foot 同守卫 td 恒空 */
    expect(cells[1]!.querySelector('.qrt-agg-dist'), 'binary 守卫列不出 dist').toBeNull();
    expect(cells[1]!.textContent!.trim(), 'binary 守卫列无 foot').toBe('');
  });

  it('关聚合（缺省）：TableAggFoot 整行移除零渲染（QRT 消费面缺省零增量）', async () => {
    await mountTbl(PROPS);
    expect(host.querySelector('.qrt-agg-row'), 'aggOn 关闭无聚合行').toBeNull();
    expect(host.querySelector('.qrt-agg-dist'), '零 dist 渲染').toBeNull();
  });

  it('源码锁：useAggRow 解构 aggDist + 第 5 参 statsOf(c).dist 直连 + tfoot :dist 在场', () => {
    expect(qrt).toContain('const { aggOn, toggleAggRow, aggFoot, aggSpark, aggDist } = useAggRow(');
    expect(qrt).toContain('colStats.statsOf(c).dist');
    expect(qrt).toMatch(/<TableAggFoot v-if="aggOn" prefix="qrt"[\s\S]*?:dist="aggDist"/);
  });
});
