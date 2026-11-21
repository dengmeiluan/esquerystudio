/**
 * 五百五十批（轨3 表格内核）：last(kind) 执行卡 + RT 内建分页 pagerOn + 互斥约定固化。
 *
 * ① last(kind)（547 批备案「下批执行卡」兑现）：
 *    - RawIoRec.kind? 字段 + recordIo 第 8 可选参 + request init ioKind 通道（内部消费，
 *      解构剥离不进公开 fetch 语义——参照 signal 透传形态）；
 *    - ioRecorder.last(pathSub?, kind?) 双参：kind 在场二段过滤 r.kind===kind，未命中回
 *      null 不回退（保持既有 last 语义：无参=全局最近、单参=路径过滤）；
 *    - SqlConsoleView openRawIo 的 546 all().find 排 translate 补丁退役 →
 *      last('/cluster/sql/', 'sql')；'sql' 打标收敛在 api 层执行链
 *      （sqlJson/sqlLenient/sqlCursor/sqlClose），translate 未打标天然排除（546 语义等价）；
 *      其余调用点本次只开通道不打标（避免面铺开，消费侧按需补）。
 * ② RT 内建分页 pagerOn（QRT 525 批 :561 三参齐备形态逐字平移）：page/pageSize 可选参 +
 *    既有 total 三参齐备才在工具行（rt-bar bar-left）渲染内建 Pagination，翻页/改页大小只
 *    emit（update:page / update:pageSize）给宿主（远端契约同 QRT），取数/切片归宿主。
 *    ═══ 互斥约定（固化，消费侧下批执行时必须遵守）═══
 *    宿主 bar-prepend 寄居 Pagination 档（DslQueryView/IndexHubView 现状）不传 page 系
 *    props（三参不齐 → pagerOn 恒 false → 内建档天然不出）；内建档（传齐三参）不寄居——
 *    同一表格同时出现两套分页器是回归事故，由宿主自行二选一。不改任何宿主。
 *
 * 设施：rawIo545 / tableKernelWave547 同款（fetch stub 走真实 request 内核；裸 createApp
 * 直挂 pinia 无 router；happy-dom 口径：点击一律 dispatchEvent(new MouseEvent('click'))）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const apiSrc = read('../api.ts');
const rtSrc = read('../components/ResultTable.vue');
const sqlSrc = read('../views/SqlConsoleView.vue');

/* ═══════════ 一、last(kind) 执行卡：api 层行为锁（fetch stub 走真实 request 内核） ═══════════ */

import { post, ioRecorder, api } from '../api';

beforeEach(() => {
  localStorage.clear();
  ioRecorder.clear();
});
afterEach(() => { vi.unstubAllGlobals(); });

describe('五百五十批①：ioKind 通道 + recordIo 第 8 参 + RawIoRec.kind', () => {
  it('post init ioKind → rec.kind 落账；ioKind 内部消费不进 fetch init（解构剥离）', async () => {
    let capturedInit: RequestInit | null = null;
    vi.stubGlobal('fetch', vi.fn(async (_u: unknown, init?: RequestInit) => {
      capturedInit = init ?? null;
      return new Response('{}', { status: 200 });
    }));
    await post('/cluster/sql/query', '{}', undefined, { ioKind: 'sql' });
    const rec = ioRecorder.last('/cluster/sql/query');
    expect(rec, '记录必须落账').toBeTruthy();
    expect(rec!.kind, 'recordIo 第 8 参写入 kind').toBe('sql');
    expect(capturedInit, 'fetch 被 null 合并守卫兜底也须捕获').toBeTruthy();
    expect('ioKind' in capturedInit!, 'ioKind 必须在 request 内剥离，不得漏进公开 fetch init').toBe(false);
  });

  it('未打标调用点零增量：rec.kind undefined（既有 7 参调用/hotThreads 两点式不受影响）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"ok":1}', { status: 200 })));
    await post('/cluster/query?index=i', { size: 1 });
    await api.hotThreads();
    expect(ioRecorder.last('/cluster/query')!.kind, '未打标记录 kind=undefined').toBeUndefined();
    expect(ioRecorder.last('/cluster/hot-threads')!.kind, '裸 fetch 两点式未打标').toBeUndefined();
  });
});

describe('五百五十批①：last(pathSub, kind) 双参过滤', () => {
  it('kind 在场二段过滤：跳过更新的未打标/异标记录命中打标档；单参语义不变（kind 不参与）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await post('/cluster/sql/query', '{}', undefined, { ioKind: 'sql' });   /* 执行链（较旧） */
    await post('/cluster/sql/translate', '{}');                              /* 未打标（更新） */
    await post('/cluster/other', '{}', undefined, { ioKind: 'x' });          /* 异标（最新） */
    const hit = ioRecorder.last('/cluster/sql/', 'sql');
    expect(hit, 'kind 过滤命中执行链记录').toBeTruthy();
    expect(hit!.url).toContain('/cluster/sql/query');
    expect(hit!.kind).toBe('sql');
    expect(ioRecorder.last('/cluster/sql/')!.url, '单参=路径过滤语义不变（translate 在场即命中——546 备案的误中背景，双参即修复）').toContain('/cluster/sql/translate');
    expect(ioRecorder.last('/cluster/other', 'x')!.url).toContain('/cluster/other');
  });

  it('未命中回 null 不回退：路径内只有未打标/异标记录时 kind 查询不得回退到未打标档', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    await post('/cluster/sql/translate', '{}'); /* 只有未打标 */
    expect(ioRecorder.last('/cluster/sql/', 'sql'), '未命中不回退（547 备案口径）').toBeNull();
    expect(ioRecorder.last('/cluster/other', 'sql'), '异标不回退').toBeNull();
    expect(ioRecorder.last('/nowhere'), '既有 last 未命中语义不变').toBeNull();
  });

  it("api 层 'sql' 打标收敛在 SqlConsole 执行链（query/lenient/cursor/close），translate 不打标——源码锚", () => {
    for (const fn of ['sqlJson', 'sqlLenient', 'sqlCursor', 'sqlClose']) {
      const line = apiSrc.split('\n').find(l => l.includes(fn + ':'));
      expect(line, fn + ' 定义行在场').toBeTruthy();
      expect(line!, fn + " 必须 ioKind: 'sql' 打标").toContain("ioKind: 'sql'");
    }
    const trLine = apiSrc.split('\n').find(l => l.includes('sqlTranslate:'));
    expect(trLine, 'sqlTranslate 定义行在场').toBeTruthy();
    expect(trLine!, 'translate 不打标（天然排除——546 排 translate 语义等价）').not.toContain('ioKind');
  });

  it('行为：api.sqlLenient 真件打标 → last(\'/cluster/sql/\', \'sql\') 命中执行链而非后发的 translate', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"columns":[],"rows":[]}', { status: 200 })));
    await api.sqlLenient('{"query":"SELECT 1"}');
    await api.sqlTranslate('{"query":"SELECT 1"}'); /* fire-and-forget 恒新于执行记录（546 背景） */
    const hit = ioRecorder.last('/cluster/sql/', 'sql');
    expect(hit, '双参收口命中执行记录').toBeTruthy();
    expect(hit!.url).toContain('/cluster/sql/lenient');
    expect(hit!.url.toLowerCase()).not.toContain('translate');
    expect(ioRecorder.last('/cluster/sql/translate')!.kind, 'translate 未打标').toBeUndefined();
  });
});

/* ═══════════ 二、SqlConsole 补丁退役（源码锁；548 判空形态零触碰） ═══════════ */

describe('五百五十批①：SqlConsoleView openRawIo 546 find 补丁退役', () => {
  it('all().find 排 translate 补丁不在场；last(\'/cluster/sql/\', \'sql\') 双参收口在场', () => {
    expect(sqlSrc, '546 find 补丁退役（退役代码字面不得再现，含注释）').not.toContain("ioRecorder.all().find(r => r.url.includes('/cluster/sql/')");
    expect(sqlSrc).toContain("ioRecorder.last('/cluster/sql/', 'sql')");
  });

  it('548 判空形态零触碰（adhocReattach548 锁同步更新后的另一半）：notify→return→开弹窗逐字保留', () => {
    expect(sqlSrc).toContain("if (!rec) { store.notify('info', '暂无原始 IO 记录，先在本页执行一次操作（记录环近 30 条）再查看'); return; }");
    expect(sqlSrc).toMatch(/return; \}\s*rawIoRec\.value = rec;\s*rawIoShow\.value = true;/);
  });
});

/* ═══════════ 三、RT 内建分页 pagerOn（QRT 525 批三参齐备形态平移）+ 互斥约定 ═══════════ */

import ResultTable from '../components/ResultTable.vue';

const RT_HITS = [
  { _id: 'a', _source: { n: 1 } },
  { _id: 'b', _source: { n: 2 } },
  { _id: 'c', _source: { n: 3 } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(propsFactory: () => Record<string, any>, slots?: Record<string, () => ReturnType<typeof h>>) {
  const app = createApp({ setup: () => () => h(ResultTable, propsFactory() as any, slots) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
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

describe('五百五十批②：RT pagerOn 内建分页（源码锚）', () => {
  it('三参齐备 computed 形态逐字对齐 QRT:561 + page/pageSize 可选参 + 双 emit 通道', () => {
    expect(rtSrc).toContain('const pagerOn = computed(() => props.page != null && props.pageSize != null && props.total != null);');
    expect(rtSrc).toContain('page?: number;');
    expect(rtSrc).toContain('pageSize?: number;');
    expect(rtSrc).toContain("(e: 'update:page', p: number): void;");
    expect(rtSrc).toContain("(e: 'update:pageSize', s: number): void;");
  });

  it('内建 Pagination 寄居 rt-bar 且与 #bar-prepend 槽共存于 bar-left（槽在前=寄居位，内建在后）——宿主自行二选一', () => {
    const prependAt = rtSrc.indexOf('<slot name="bar-prepend" />');
    const pagerAt = rtSrc.indexOf('<Pagination v-if="pagerOn"');
    expect(prependAt, 'bar-prepend 槽在场（防空跑）').toBeGreaterThan(-1);
    expect(pagerAt, '内建 Pagination（pagerOn 门控）在场').toBeGreaterThan(-1);
    expect(pagerAt).toBeGreaterThan(prependAt);
    expect(rtSrc.indexOf('<span class="rt-info mono">'), '两者都在 rt-info 前=同属 bar-left').toBeGreaterThan(pagerAt);
  });
});

describe('五百五十批②：RT pagerOn 行为锁 + 互斥约定', () => {
  it('缺省零增量：不传 page 系 props 无内建分页器（反锁）；既有行渲染/工具行不受影响', async () => {
    await mountTbl(() => ({ hits: RT_HITS, total: 3, index: 'w550rt0' }));
    expect(host.querySelector('.rt-bar .pgn'), '缺省无内建分页器（全站零增量）').toBeNull();
    expect(host.querySelectorAll('.rt-tbl tbody tr').length).toBe(3);
  });

  it('互斥约定·寄居档：#bar-prepend 寄居 Pagination 的宿主（DslQueryView/IndexHubView 现状）不传 page 系 props → 槽内容在、内建档不出', async () => {
    await mountTbl(() => ({ hits: RT_HITS, total: 3, index: 'w550rt1' }), {
      'bar-prepend': () => h('span', { class: 'w550-seg' }, 'SEG'),
    });
    const seg = host.querySelector('.rt-bar .w550-seg');
    expect(seg, '寄居内容照常渲染在工具行').toBeTruthy();
    expect(host.querySelector('.rt-bar .pgn'), '寄居档不传 page 系 props=内建档天然不出（二选一之寄居侧）').toBeNull();
  });

  it('互斥约定·内建档：传齐 page/pageSize/total 三参 → 内建 Pagination 在 rt-bar 出场（内建档不寄居，本档不注入槽内容）', async () => {
    const pageGot: number[] = [], sizeGot: number[] = [];
    await mountTbl(() => ({
      hits: RT_HITS, total: 45, index: 'w550rt2',
      page: 2, pageSize: 20,
      'onUpdate:page': (p: number) => pageGot.push(p),
      'onUpdate:pageSize': (s: number) => sizeGot.push(s),
    }));
    const pgn = host.querySelector('.rt-bar .pgn');
    expect(pgn, '三参齐备内建档出场').toBeTruthy();
    expect(pgn!.textContent).toContain('/ 3'); /* ceil(45/20)=3 */
    /* 翻页/改页大小只 emit 给宿主（内核不自行取数、不改行集——远端契约同 QRT 525） */
    const next = [...host.querySelectorAll<HTMLButtonElement>('[aria-label="下一页"]')].pop()!;
    expect(next, '下一页钮在场').toBeTruthy();
    await clickIt(next);
    expect(pageGot, '点击下一页 → update:page 意图').toEqual([3]);
    /* 五百七十七批同步更新：563/566 批改用后 .pgn-psel=触发钮（aria-haspopup=listbox），点击开
       n-popover listbox（teleport body）→ 点选项 emit——旧 select.value/change 路径已退役 */
    const sel = host.querySelector<HTMLButtonElement>('.pgn-psel')!;
    expect(sel, '页大小触发钮在场').toBeTruthy();
    sel.click();
    await tick(4);
    const opt = Array.from(document.body.querySelectorAll<HTMLButtonElement>('.pgn-psize-opt'))
      .find(b => b.textContent?.includes('50'));
    expect(opt, 'listbox 选项 50/页 在场（teleport body）').toBeTruthy();
    opt!.click();
    await tick(4);
    expect(sizeGot, '改页大小 → update:pageSize 意图').toEqual([50]);
    expect(host.querySelectorAll('.rt-tbl tbody tr').length, '内核不自行切片（行集归宿主）').toBe(3);
  });
});
