/**
 * 五百四十七批（轨3 表格内核）：RT refreshable 内建补齐 + QRT bar-prepend/hideBody 平移。
 *
 * 背景：
 * ① RT refreshable：RT 只有 searchable（546 批）；refresh 事件通道既有（emits :634、
 *    提交链成功后唯一发射点 :1683），:576 有「refreshable 不加（G2 为 QRT 专属）」备案——
 *    撤销该字据，RT 工具行（bar-left，rt-qsearch 之后、kbd-hint 之前）内建刷新钮，
 *    形制逐字对齐 QRT 546 同款（btn sm ghost rt-tool-btn + RotateCcw :size=13 +
 *    aria-label「刷新结果」+ title「刷新结果（重跑当前查询）」，click→emit('refresh')）。
 *    消费侧不动：IndexHubView :125/:189、DslQueryView :311 的 @refresh 已在场，仅差
 *    refreshable prop——属下批消费侧批（见下方「消费侧备案」字面锁）。
 * ② QRT bar-prepend：RT 已有（541 批，bar-left 最前段），QRT 宿主视图（SystemView/
 *    LuceneQueryView）的视图 seg 被迫留在表格头外—— RT 541 同款平移到 QRT
 *    （slot 形态照抄，UI 寄居 prefsOn=storageKey 门控的 qrt-bar，接线宿主须同传 storageKey）。
 * ③ QRT hideBody：RT 541 同款平移——true 时表格体区块（loading/empty/wrap/转置主体分支）
 *    与转置态提示行（qrt-tr-bar）隐藏，工具行与分页行（pagerOn 行）常驻。缺省 false 全站
 *    零增量：loading/empty/wrap 链只加 `&& !hideBody` 类守卫，缺省路径 DOM 逐字节不变
 *    （硬契约）；tableBarUnify541 对 RT 的既有断言不得破。
 *
 * ═══ 备案（不做代码，下批执行卡）═══
 * 一、RT 内建分页 pagerOn（对齐 QRT 525 批 :547-550 三参齐备形态）留待下批。与宿主
 *     bar-prepend 寄居 Pagination 的关系要写明：二选一语义——内核 pagerOn 是「可选内建」
 *     缺省关；541 起 DslQueryView 等宿主已把 Pagination 寄居 RT #bar-prepend（宿主权威
 *     取数/切片），同一表格同时出现两套分页器是回归事故；下批接线 RT pagerOn 时必须
 *     约定：宿主寄居档（bar-prepend 内有 Pagination）不传 page/pageSize/total 三参，
 *     内建档不寄居，二者互斥由消费侧批裁决。
 * 二、last(kind) 共环收紧下批执行卡：RawIoRec.kind? + recordIo 第 8 参 + request init
 *     ioKind + last(pathSub?, kind?) 未命中回 null 不回退；验收信号=SqlConsoleView :397
 *     find 补丁退役；波及=api.clusterQuery 6 调用点打标。
 * 三、展示形式 view?: 'table'|'json'|'tree' 内核 prop 裁决不做（三页自造形态各异无公约数/
 *     分页语义耦合/内核膨胀），内核前置件= QRT bar-prepend/hideBody（宿主自管视图态）。
 *
 * 设施：qrtColFilter524 / tableKernelWave546 同款裸 createApp 直挂（pinia，无 router）；
 * happy-dom 口径：点击一律 dispatchEvent(new MouseEvent('click'))（el.click 不可靠）。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
/* 五百六十一批同步更新：refreshable 刷新钮合并 TableRefreshBtn 片段组件（形制字面新家） */
const refreshBtnSrc = readFileSync(join(__dirname, '../components/TableRefreshBtn.vue'), 'utf-8');

const QRT_HITS = [
  { _id: 'a', _source: { name: 'banana', age: 2 } },
  { _id: 'b', _source: { name: 'apple', age: 3 } },
  { _id: 'c', _source: { name: 'cherry', age: 1 } },
] as any;

const RT_HITS = [
  { _id: 'a', _source: { n: 30 } },
  { _id: 'b', _source: { n: 10 } },
  { _id: 'c', _source: { n: 20 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

/* 挂载辅助勿先 unmount（T39 卸载链断裂）——叠挂，卸载统一放钩子 */
async function mountTbl(
  comp: unknown,
  propsFactory: () => Record<string, unknown>,
  slots?: Record<string, () => ReturnType<typeof h>>,
) {
  const app = createApp({ setup: () => () => h(comp as any, propsFactory(), slots) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

/* 数据行计数（排除筛选空集提示行/截断提示行；用例内无展开行） */
const qrtRows = () => [...host.querySelectorAll('tbody tr')]
  .filter(tr => !tr.classList.contains('qrt-nomatch') && !tr.classList.contains('qrt-trunc-row'));
const rtRows = () => [...host.querySelectorAll('.rt-tbl tbody tr')];
const refreshBtn = () => [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '刷新结果');
const clickIt = async (el: Element) => {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  await tick(4);
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});
afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* ═══════════ 一、RT refreshable：缺省反锁 + 开 prop 钮在场 + emit('refresh') ═══════════ */
describe('五百四十七批：RT refreshable 内建（撤销 546 批「G2 为 QRT 专属」备案）', () => {
  it('缺省无刷新钮（反锁）；开 refreshable 后钮在场且寄居 rt-bar 工具行', async () => {
    await mountTbl(ResultTable, () => ({ hits: RT_HITS, total: 3, index: 'w547rt' }));
    expect(refreshBtn(), 'RT 缺省无刷新钮（全站零增量）').toBeUndefined();

    const got: number[] = [];
    await mountTbl(ResultTable, () => ({ hits: RT_HITS, total: 3, index: 'w547rtf', refreshable: true, onRefresh: () => { got.push(1); } }));
    const btn = refreshBtn();
    expect(btn, '开 prop 后刷新钮在场').toBeTruthy();
    expect(btn!.closest('.rt-bar'), '寄居 RT 工具行').toBeTruthy();
    expect(rtRows().length, '内核不自行取数（3 行原样）').toBe(3);
  });

  it('点击刷新钮 → emit refresh（dispatchEvent 口径，取数归宿主）', async () => {
    const got: number[] = [];
    await mountTbl(ResultTable, () => ({ hits: RT_HITS, total: 3, index: 'w547rtc', refreshable: true, onRefresh: () => { got.push(1); } }));
    const btn = refreshBtn();
    expect(btn).toBeTruthy();
    await clickIt(btn!);
    expect(got.length, '点击 → emit refresh 一拍').toBe(1);
    expect(rtRows().length).toBe(3);
  });

  it('钮形制源码锚：aria-label/title 逐字 + rt-tool-btn 形制 + 位次（561 同步更新：合并 TableRefreshBtn 片段组件）+ 546 字据撤销', () => {
    /* 五百六十一批同步更新：刷新钮合并 TableRefreshBtn（QRT/RT 同款单一出处）——aria/title/
       图标文案逐字同步更新组件源，类名经 btnCls prop 注入（rt-tool-btn 串留内核挂载位） */
    expect(refreshBtnSrc).toMatch(/<button v-if="on" class="btn sm ghost" :class="btnCls" aria-label="刷新结果"\s*\n\s*title="刷新结果（重跑当前查询）" @click="\$emit\('refresh'\)">/);
    expect(refreshBtnSrc).toMatch(/<RotateCcw :size="13" \/> 刷新/);
    expect(rt).toContain('btn-cls="rt-tool-btn"');
    /* 字据撤销=指令句退役（「」内为历史引述，不在禁列） */
    expect(rt, '546 批「refreshable 不加（G2 为 QRT 专属）」备案撤销').not.toContain('。refreshable 不加');
    /* 位次同步更新：搜索框（TableQSearch）在刷新钮（TableRefreshBtn）之前（bar-left 挂载序） */
    const qsearchAt = rt.indexOf('q-cls="rt-qsearch"');
    const btnAt = rt.indexOf('btn-cls="rt-tool-btn"');
    expect(qsearchAt).toBeGreaterThan(-1);
    expect(btnAt).toBeGreaterThan(qsearchAt);
    /* prop + 缺省值（对齐 QRT opt-in 形态） */
    expect(rt).toContain('refreshable?: boolean;');
    expect(rt).toContain('refreshable: false,');
  });
});

/* ═══════════ 二、QRT bar-prepend 槽（RT 541 同款平移）═══════════ */
describe('五百四十七批：QRT bar-prepend 槽（RT 541 同款平移）', () => {
  it('源码锚：slot 在 bar-left 最前段（形态对齐 tableBarUnify541 :19-32 的 RT 锁）', () => {
    const barLeftAt = qrt.indexOf('<template #bar-left>');
    const prependAt = qrt.indexOf('<slot name="bar-prepend" />');
    expect(barLeftAt, 'QRT bar-left 在场（防空跑）').toBeGreaterThan(-1);
    expect(prependAt, 'bar-prepend 槽在场').toBeGreaterThan(barLeftAt);
    expect(qrt.indexOf('<span v-if="props.total != null" class="qrt-coln mono">'), '计数条在槽之后（槽=最前段）').toBeGreaterThan(prependAt);
  });

  it('挂载：槽内容渲染在工具行内（qrt-bar；storageKey 启用 prefsOn 门控）', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w547bp' }), {
      'bar-prepend': () => h('span', { class: 'w547-seg' }, 'SEG'),
    });
    const seg = host.querySelector('.qrt-bar .w547-seg');
    expect(seg, 'bar-prepend 内容寄居 qrt-bar 工具行').toBeTruthy();
    expect(seg!.textContent).toBe('SEG');
    expect(qrtRows().length, '槽注入不影响行渲染').toBe(3);
  });
});

/* ═══════════ 三、QRT hideBody（RT 541 同款平移）═══════════ */
describe('五百四十七批：QRT hideBody 表格体隐藏（工具行/分页行常驻）', () => {
  it('缺省 false：表格体在场；true：表格体隐（wrap/table/loading 全隐）、工具行常驻', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w547hd0' }));
    expect(host.querySelector('.qrt-wrap'), '缺省表格体在场').toBeTruthy();
    expect(qrtRows().length).toBe(3);

    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w547hd1', hideBody: true }));
    const hiddenWrap = host.querySelector('.qrt-wrap') as HTMLElement;
    expect(hiddenWrap, 'hideBody=true 表格体保留（切档复用，不再整表重建）').toBeTruthy();
    expect(hiddenWrap.style.display, 'hideBody=true 表格体隐藏').toBe('none');
    expect(host.querySelector('.qrt-tbl'), '表格保留在隐藏容器内').toBeTruthy();
    expect(host.querySelector('.qrt-bar'), '工具行常驻').toBeTruthy();
  });

  it('loading 态同样被隐：hideBody=true + loading → 无骨架、工具行在场', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w547hdl', loading: true }));
    expect(host.querySelector('.qrt-loading'), '对照：loading 骨架在场').toBeTruthy();
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, storageKey: 'w547hdl2', loading: true, hideBody: true }));
    expect(host.querySelector('.qrt-loading'), 'hideBody=true 骨架隐').toBeNull();
    expect(host.querySelector('.qrt-bar')).toBeTruthy();
  });

  it('分页行常驻锁：hideBody=true 时即便空态（缺省链不渲染 .qrt-pgr 的场合）分页行仍在', async () => {
    /* 对照：缺省链——isEmpty 时 pagerOn 行不渲染（525 批既有契约） */
    await mountTbl(QueryResultTable, () => ({ hits: [], total: 0, page: 1, pageSize: 20, storageKey: 'w547pg0' }));
    expect(host.querySelector('.qrt-pgr'), '缺省：空态无分页行').toBeNull();
    await mountTbl(QueryResultTable, () => ({ hits: [], total: 0, page: 1, pageSize: 20, storageKey: 'w547pg1', hideBody: true }));
    expect(host.querySelector('.qrt-pgr'), 'hideBody=true：分页行常驻').toBeTruthy();
    expect((host.querySelector('.qrt-wrap') as HTMLElement).style.display, '空态+hideBody：表体仍隐藏').toBe('none');
  });

  it('hideBody 链源码锚：loading/empty/wrap 三分支守卫 + tr-bar 守卫 + pager 常驻条件', () => {
    expect(qrt).toContain('hideBody?: boolean;');
    expect(qrt).toContain('hideBody: false,');
    /* 六百零七批同步更新：守卫字面 !hideBody→!bodyHidden（hideBody ∪ 内建 viewSeg 非表格档，
       缺省路径行为等值——判别力不变=五处结构锚逐字保全） */
    expect(qrt).toMatch(/<template v-if="loading && !bodyHidden">/);
    expect(qrt).toMatch(/<EmptyState v-else-if="isEmpty && !bodyHidden"/);
    expect(qrt).toMatch(/<div v-else v-show="!bodyHidden" ref="wrapRef" class="qrt-wrap"/);
    expect(qrt).toMatch(/<div v-if="transposeOn && !bodyHidden" class="qrt-tr-bar"/);
    expect(qrt).toMatch(/<div v-if="pagerOn && \(\(!loading && !isEmpty\) \|\| bodyHidden\)" class="qrt-pgr">/);
  });
});

/* ═══════════ 四、缺省零增量总锁（546 反锁口径延伸）═══════════ */
describe('五百四十七批：缺省零增量总锁（546 反锁口径延伸到 RT/新 prop）', () => {
  it('QRT 不传新 prop：无刷新钮/无搜索框/无 bar-prepend 注入/表格体照常/分页行照既有链', async () => {
    await mountTbl(QueryResultTable, () => ({ hits: QRT_HITS, total: 3, storageKey: 'w547q0' }));
    expect(refreshBtn(), 'QRT 缺省无刷新钮（546 反锁延续）').toBeUndefined();
    expect(host.querySelector('.qrt-qsearch')).toBeNull();
    expect(host.querySelector('.w547-seg'), '未注入槽内容=零增量').toBeNull();
    expect(host.querySelector('.qrt-wrap')).toBeTruthy();
    expect(qrtRows().length, '3 行全渲染').toBe(3);
    expect(host.querySelector('.qrt-tr-bar'), '缺省无转置条').toBeNull();
  });

  it('RT 不传新 prop：无刷新钮（546 反锁口径延伸到 RT）+ 行渲染正常', async () => {
    await mountTbl(ResultTable, () => ({ hits: RT_HITS, total: 3, index: 'w547r0' }));
    expect(refreshBtn(), 'RT 缺省无刷新钮').toBeUndefined();
    expect(host.querySelector('.rt-qsearch')).toBeNull();
    expect(rtRows().length).toBe(3);
    expect(host.querySelector('.rt-wrap')).toBeTruthy();
  });
});

/* ═══════════ 五、消费侧备案字面锁（不动消费侧，下批消费侧批接线 refreshable prop）═══════════ */
describe('五百四十七批：消费侧备案（@refresh 事件接线已在场，仅差 refreshable prop——下批消费侧批）', () => {
  it('IndexHubView 两处 RT @refresh、DslQueryView RT @refresh 字面在场（状态字面锁）', () => {
    const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
    const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
    expect(ih).toContain('@refresh="runDocs"');
    expect(ih).toContain('@refresh="runDsl"');
    expect(dq).toContain('@refresh="runQuery"');
  });
});
