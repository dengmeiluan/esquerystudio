/**
 * 五百六十一批：内核小件+三视图表格头收口源码锚与行为锁。
 * ① remote 直选收口：QRT emitRemoteSort 补 directDir 可选参数（RT 535 先例平移），
 *    directSort remote 档改走同一收口（行为等价：事件名/载荷逐字保形）——补 QRT 直选
 *    行为锁（列头菜单「升序/降序」直发，535 只锁了 RT 半边）；
 * ② 三段同构块合并片段组件（TableAggFoot/TableFilteredHint/TableQSearch/TableRefreshBtn，
 *    类名 prefix 参数化、DOM 逐字节）——双内核接线源码锚+片段组件行为复验（agg tfoot/
 *    筛选提示/内建搜索/刷新钮四件在 535/534/546/547/551/552 既有行为锁零改锚，本文件只锁
 *    组件化新面）；
 * ③ QRT hideBody→true 自动退聚焦（RT 552 rtFix552 对称件平移）源码锚；
 * ④ 「复制整表 JSON」动作函数化+expose（SystemView 宿主快捷钮同一收口）源码锚+行为锁。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';

const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const sys = readFileSync(join(__dirname, '../views/SystemView.vue'), 'utf-8');
const readComp = (n: string) => readFileSync(join(__dirname, '../components', n), 'utf-8');
const tableSortSrc = readFileSync(join(__dirname, '../composables/tableSort.ts'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

const ctxItems = () => [...document.querySelectorAll('.ccm .ccm-it')] as HTMLButtonElement[];
const ctxItem = (label: string) => ctxItems().find(b => b.textContent?.includes(label)) as HTMLButtonElement | undefined;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
  document.querySelectorAll('.cfp, .ccm-mask, .n-drawer, .n-drawer-container').forEach(e => e.remove());
});

/* ═══════════ 一、① remote 直选收口 ═══════════ */
describe('五百六十一批①：远端直选与表头点击同一收口（六百零三批同步更新=emitRemoteSort 合并 tableSort.useSortChain 机内，锁随机器走新家）', () => {
  it('源码锁：双内核单入口委托状态机；直选/循环/远端意图镜像分支全在机内单一出处', () => {
    expect(qrt, 'QRT 表头点击单入口委托').toContain('chain.sortBy(name, undefined, shift)');
    expect(qrt, 'QRT 右键直选同一收口（dir 1|-1 归一字符串后委托）').toContain("chain.sortBy(col, dir === 1 ? 'asc' : 'desc')");
    expect(rt, 'RT 表头点击单入口委托（directDir 直选同参透传）').toContain('chain.sortBy(c, directDir, shift)');
    expect(tableSortSrc, '远端意图分支机内单源（isRemote 档只 emit 不落本地）').toMatch(/if \(opts\.isRemote\(\)\) \{/);
    expect(tableSortSrc, '直选跳过循环直发字面在机内').toContain('remoteSortCur.value = { f: key, d: directDir }');
  });

  it('QRT：remoteSort 档列头右键「升序排序」直发 asc（载荷/事件名与点击循环同契约）', async () => {
    const got: Array<{ f: string; d: 'asc' | 'desc' } | null> = [];
    await mountTbl(QueryResultTable, {
      cols: ['n'], rows: [[30], [10]] as any, sortable: true, remoteSort: true,
      onSortChange: (s: any) => got.push(s),
    });
    const th = host.querySelector('thead th[data-col="n"]') as HTMLElement;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(6);
    ctxItem('升序排序')!.click();
    await tick(6);
    expect(got, 'directDir 直发 asc（与 RT 535 直选同契约）').toEqual([{ f: 'n', d: 'asc' }]);
    /* 直选后循环基点同步（再点击走降序——收口共用 remoteSortCur） */
    th.click(); await tick(4);
    expect(got[got.length - 1], '直选后点击翻转 desc（同一意图态）').toEqual({ f: 'n', d: 'desc' });
  });
});

/* ═══════════ 二、② 三段同构块合并片段组件 ═══════════ */
describe('五百六十一批②：bar-left/tfoot 同构段合并片段组件（DOM 逐字节）', () => {
  it('源码锁：四片段组件在场且双内核同款接线（props 传差异位）', () => {
    for (const f of ['TableAggFoot.vue', 'TableFilteredHint.vue', 'TableQSearch.vue', 'TableRefreshBtn.vue']) {
      expect(readComp(f).length, f + ' 在场').toBeGreaterThan(0);
    }
    expect(qrt).toContain('<TableFilteredHint :active="activeFilterCount" :shown="filteredRows.length" :total="rawRows.length"');
    expect(qrt).toContain('span-cls="qrt-filtered mono" fmode-cls="qrt-fmode mono" clear-cls="qrt-filtered-clear"');
    expect(rt).toContain('<TableFilteredHint :active="activeFilterCount" :shown="filteredHits.length" :total="hits.length"');
    expect(rt).toContain('span-cls="rt-filtered mono" fmode-cls="rt-fmode mono" clear-cls="rt-filtered-clear"');
    /* 六百二十一批同步更新：@enter 桥接滚动下一命中行接线（单框双效，TableQSearch 定向转 emit） */
    expect(qrt).toContain('<TableQSearch :on="searchable" q-cls="qrt-qsearch" v-model:kw="searchableKw" @enter="bridgeNext" />');
    expect(rt).toContain('<TableQSearch :on="searchable" q-cls="rt-qsearch" v-model:kw="searchableKw" @enter="bridgeNext" />');
    expect(qrt).toContain('<TableRefreshBtn :on="refreshable" btn-cls="qrt-tool-btn" @refresh="emit(\'refresh\')" />');
    expect(rt).toContain('<TableRefreshBtn :on="refreshable" btn-cls="rt-tool-btn" @refresh="emit(\'refresh\')" />');
    expect(qrt).toMatch(/<TableAggFoot v-if="aggOn" prefix="qrt" :cols="shownCols" :foot="aggFoot" :spark="aggSpark"/);
    expect(rt).toMatch(/<TableAggFoot v-if="aggOn" prefix="rt" :cols="visibleCols" :foot="aggFoot" :spark="aggSpark"/);
  });

  it('源码锁：迁出段内核反锚（tfoot/提示 span/搜索框字面退役防双份漂移；弹层槽 fmode 留内核）（五百六十五批同步更新：QRT 手搓槽钮退役——fmode 字面单源再合并 ColFilterPopover 内建 chip，反锚翻「QRT 不再手搓」防双份漂移）（五百六十七批同步更新：RT 手搓槽钮对称退役——反锚同翻「RT 不再手搓」，双内核 fmode 单源闭环）', () => {
    expect(qrt, 'QRT 内核不再持有 tfoot 聚合模板（迁 TableAggFoot）').not.toContain('<tfoot v-if="aggOn">');
    expect(rt, 'RT 内核同退役').not.toContain('<tfoot v-if="aggOn">');
    expect(qrt, 'QRT 提示行 span 字面退役（迁 TableFilteredHint）').not.toContain('<span v-if="activeFilterCount" class="qrt-filtered mono">');
    expect(rt, 'RT 同退役').not.toContain('<span v-if="activeFilterCount" class="rt-filtered mono">');
    /* 五百六十五批同步更新：QRT 手搓 fmode 钮退役（同串迁移 filterModeToggle561 行为锚原样通过），
       单一出处再合并 ColFilterPopover 内建 chip——QRT 只留接线、不再手搓（防双份漂移反锚保真）
       五百六十七批同步更新：RT 半边对称落地，双内核手搓槽钮字面同退役 */
    expect(qrt, 'QRT 手搓槽钮字面退役').not.toMatch(/class="qrt-fmode mono"/);
    expect(qrt, 'QRT 改走内建 chip 接线（prop 在场）').toContain(':filter-mode="filterModeLive"');
    expect(rt, 'RT 手搓槽钮字面对称退役').not.toMatch(/class="rt-fmode mono"/);
    expect(rt, 'RT 改走内建 chip 接线（prop 在场）').toContain(':filter-mode="filterModeLive"');
  });

  it('行为复验：agg tfoot 经组件渲染逐字节等值（Σ/avg 前缀+min~max+count+med+空值率+spark）', async () => {
    localStorage.setItem('es_tbl_agg:w561a1', '1');
    await mountTbl(QueryResultTable, { cols: ['v'], rows: [[50], [80]] as any, storageKey: 'w561a1' });
    const tfoot = host.querySelector('tfoot tr.qrt-agg-row');
    expect(tfoot, '落盘播种直接出 tfoot（组件渲染）').toBeTruthy();
    expect(tfoot!.textContent).toContain('Σ 130 · avg 65.00');
    expect(tfoot!.textContent).toContain(' · min 50 · max 80');
    expect(tfoot!.textContent).toContain(' · count 2');
    localStorage.setItem('es_tbl_agg:w561a2', '1');
    await mountTbl(ResultTable, {
      hits: [{ _id: 'a', _source: { v: 50 } }, { _id: 'b', _source: { v: 80 } }] as any,
      total: 2, index: 'w561a2',
    });
    const rfoot = host.querySelector('tfoot tr.rt-agg-row');
    expect(rfoot, 'RT 同构（组件渲染）').toBeTruthy();
    expect(rfoot!.textContent).toContain('Σ 130 · avg 65.00');
    expect(rfoot!.textContent).toContain(' · min 50 · max 80');
  });
});

/* ═══════════ 三、③ hideBody 退聚焦（rtFix552 对称件） ═══════════ */
describe('五百六十一批③：QRT hideBody→true 自动退出聚焦（RT 552 对称件平移）', () => {
  it('源码锁：watch(bodyHidden) 在场且只在聚焦中触发', () => {
    /* 六百零七批同步更新：QRT watch 源升 bodyHidden（hideBody ∪ 内建 viewSeg 非表格档——
       内建档切换同样退聚焦，561 语义全覆盖）
       六百零九批同步更新：RT 半边对称升 bodyHidden（viewSeg=false 时源≡hideBody 行为等值
       零回归；双内核 watch 源自此同字面） */
    expect(qrt).toMatch(/watch\(bodyHidden, h => \{ if \(h && focused\.value\) focused\.value = false; \}\);/);
    expect(rt).toMatch(/watch\(bodyHidden, h => \{ if \(h && focused\.value\) focused\.value = false; \}\);/);
  });
});

/* ═══════════ 四、④ 复制整表 JSON 函数化+expose（SystemView 收口） ═══════════ */
describe('五百六十一批④：copyTableJson 动作函数化+expose（宿主快捷钮同一收口）', () => {
  it('源码锁：QRT defineExpose copyTableJson+菜单项共用；SystemView bar-prepend 快捷钮接线', () => {
    expect(qrt).toMatch(/async function copyTableJson\(\)/);
    expect(qrt).toMatch(/copyTableJson,/);
    expect(qrt).toMatch(/\{ key: 'copy-table-json', label: '复制整表 JSON', icon: Braces, run: \(\) => copyTableJson\(\) \}/);
    expect(sys).toContain('<template #bar-prepend>');
    expect(sys).toMatch(/@click="resQrt\?\.copyTableJson\(\)"/);
    expect(sys).toContain('复制整表 JSON');
    expect(sys, '宿主 copyResp 退役（负锁）').not.toContain('function copyResp');
  });

  it('行为锁：列头右键「复制整表 JSON」剪贴板=矩阵 JSON（函数化后语义零变化）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator.clipboard, { writeText });
    await mountTbl(QueryResultTable, { cols: ['n'], rows: [[1], [2]] as any, storageKey: 'w561cj' });
    const th = host.querySelector('thead th[data-col="n"]') as HTMLElement;
    th.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    await tick(6);
    ctxItem('复制整表 JSON')!.click();
    await tick(6);
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(JSON.parse(writeText.mock.calls[0][0] as string)).toEqual([{ n: 1 }, { n: 2 }]);
  });
});
