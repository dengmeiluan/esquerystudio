/**
 * 五百六十五批件②：QRT onSort 入口 sortableGuard 短路接线（563 批余量收口——
 * semanticGuard.typeTierSuppressed / tableSort.sortableGuard 纯函数出口已就绪，QRT 消费侧缺位）。
 * 未接线证据：QRT onSort（前 :897）无任何抑制守卫——binary/_source 等「显式非语义」列
 * 点击照落 sortSpec（raw doc/密文比较排序语义 VOID）。
 * 接线：sortableGuard((c) => effType(c)) 在 onSort 入口短路（effType=显式 fieldTypes ∪
 * 按值采样推断，与 useColStats fieldType 先例同读取口径）；本地/remote 双档同守——短路即
 * 不落 sortSpec/不落盘/不 emit 远端意图。豁免口径 semanticGuard 备案：_id/_index/_score/
 * _seq_no 排序有语义不收。
 * 锁定：
 * 1) binary 显式类型列点击排序不产生 sort 态（行序不变/th 不亮 on/无 aria-sort/零落盘）；
 * 2) _source 元字段列（无显式类型）按名抑制同上；
 * 3) 数值（long）/keyword 列正常排序（升序起步，227 批口径），aria-sort/落盘在场；
 * 4) _id 豁免仍可排序；
 * 5) 源码锁：sortableGuard 在场（QRT 消费面单源 import）。
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

const thOf = (col: string) =>
  [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes(col)) as HTMLElement;
const dataRows = () =>
  [...host.querySelectorAll('tbody tr')]
    .filter(tr => tr.querySelector('td.qrt-cell'))
    .map(tr => (tr.querySelector('td.qrt-cell') as HTMLElement).textContent!.trim());
const sortLsKeys = () =>
  [...Array(localStorage.length)].map((_, i) => localStorage.key(i)!).filter(k => k.startsWith('es_tbl_sort'));

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* blob=binary 显式类型；_source 无显式类型（元字段档按名抑制）；_id 豁免 */
const PROPS = {
  cols: ['name', 'price', 'blob', '_source', '_id'],
  rows: [
    ['b', 3, 'zz', 's3', 'id-b'],
    ['a', 1, 'aa', 's1', 'id-a'],
    ['c', 2, 'mm', 's2', 'id-c'],
  ] as any,
  storageKey: 'stw565', sortable: true,
  fieldTypes: { name: 'keyword', price: 'long', blob: 'binary' },
};

describe('五百六十五批件②：QRT onSort 入口 sortableGuard 短路', () => {
  it('binary 列点击排序不落态：行序不变/th 不亮/无 aria-sort/零落盘', async () => {
    await mountTbl(PROPS);
    thOf('blob').click();
    await tick(6);
    expect(dataRows(), 'blob 列（binary）点击排序被短路——行序保持原始序').toEqual(['b', 'a', 'c']);
    expect(thOf('blob').classList.contains('on'), '抑制列不亮 on').toBe(false);
    expect(thOf('blob').getAttribute('aria-sort'), '抑制列无 aria-sort').toBeNull();
    expect(sortLsKeys(), '抑制列零落盘').toEqual([]);
  });

  it('_source 元字段列（无显式类型）点击排序同抑制', async () => {
    await mountTbl(PROPS);
    thOf('_source').click();
    await tick(6);
    expect(dataRows(), '_source 列按名抑制——行序保持原始序').toEqual(['b', 'a', 'c']);
    expect(thOf('_source').classList.contains('on'), '_source 不亮 on').toBe(false);
    expect(sortLsKeys(), '_source 零落盘').toEqual([]);
  });

  it('数值/keyword 列正常排序（升序起步）；aria-sort 与落盘在场', async () => {
    await mountTbl(PROPS);
    thOf('price').click();
    await tick(6);
    expect(dataRows(), 'price 升序（227 批起步口径）').toEqual(['a', 'c', 'b']);
    expect(thOf('price').getAttribute('aria-sort')).toBe('ascending');
    expect(sortLsKeys().length, '放行列正常落盘').toBeGreaterThan(0);
    thOf('price').click();
    await tick(6);
    expect(dataRows(), '二击降序').toEqual(['b', 'c', 'a']);
    thOf('name').click();
    await tick(6);
    expect(dataRows(), 'keyword 列换键升序').toEqual(['a', 'b', 'c']);
  });

  it('_id 元字段豁免：仍可正常排序', async () => {
    await mountTbl(PROPS);
    thOf('_id').click();
    await tick(6);
    expect(dataRows(), '_id 升序（豁免不抑制）').toEqual(['a', 'b', 'c']);
    expect(thOf('_id').getAttribute('aria-sort')).toBe('ascending');
  });

  it('源码锁：sortableGuard 单源消费在场（onSort 入口短路）', () => {
    expect(qrt).toContain('sortableGuard');
  });
});
