/**
 * 七百八十四批：表格内核 .tbl 改用（782 稿决议表「下批候选」落地——监控屏三表
 * Top 索引/告警历史/慢请求 挂全站 `tbl zebra` 类，免费得 hover 高亮/斑马纹/sticky
 * 表头〔表头底色分层〕；视觉变化=决议表预审预期收益，独立批走查=probe-784）。
 *
 * 改用语义分工：
 *   - 表格语言源=theme.css `.tbl` 族（表体 fs-sm/表头 fs-xs 600/sticky top:0 bg2/
 *     hover 高亮/`.zebra` 斑马/圆角表头）——起 `.tbl` 有实时监控三表 live 消费面
 *     （既有消费=AdhocRebuild 两表+MappingFieldTree）；
 *   - 本域 scoped 只保留差异化语言：紧凑密度（th/td 3px——监控页高密度不漂移）+
 *     nowrap 语义（URI/长值不折行，msg 列回开）；
 *   - scoped 基底规则（width/border-collapse/fs-sm 与 `.tbl` 逐值同）随改用整删
 *     （冗余；782 Z3 的 token 化语言移交 `.tbl` 承载）。
 *
 * 看守面：
 *   ① 三表挂载恰 3（`class="tbl zebra ld-hist-hist-t"`，DOM 锚 ld-hist-hist-t 保留）；
 *   ② scoped 基底单选择器形态不得回流（783-C1 口径=按选择器形态锁，非类名子串）；
 *   ③ 密度+msg 规则保留（改用不丢监控页密度/nowrap 语言）；
 *   ④ theme.css `.tbl` 族四正向锚（防后续批误删——改用批起是 live 依赖）；
 *   ⑤ 挂载级：面板展开后 table.tbl.zebra 真渲染（非纯文本锁；慢请求面板在
 *     canAuditAll 权限门内=源码锁① 覆盖，挂载面覆盖恒渲染的两面）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const themeCss = readFileSync(join(__dirname, '../theme.css'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) {
      if (p === 'then' || typeof p === 'symbol') return undefined;
      return anyCall;
    },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, { get: () => anyCall });
  return { ...actual, api: proxied };
});

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLive() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const mod = await import('../views/LiveDashboardView.vue');
  const app = createApp({ render: () => h(mod.default as any) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

function seed(mon: ReturnType<typeof useLiveMonitorStore>) {
  mon.nodes = [{ nodeId: 'd1', name: 'node-d-01', roles: ['data'], heapPct: 60, cpuPct: 20, diskTotal: 1000, diskFree: 300, queryTotal: 100, indexTotal: 40 }];
  mon.nodeSeries = { 'node-d-01': { heap: [60, 61], cpu: [20, 21], disk: [70, 71], qps: [1, 2], idx: [3, 4] } };
  mon.sampleTs = [1000, 2000];
  mon.qpsSeries = [10, 12]; mon.indexRateSeries = [4, 5]; mon.heapSeries = [60, 61]; mon.cpuSeries = [20, 21]; mon.diskSeries = [70, 71];
}

let app: ReturnType<typeof createApp> | null = null;
let hostEl: HTMLElement | null = null;
beforeEach(async () => {
  localStorage.clear();
  document.body.innerHTML = '';
  const m = await mountLive();
  app = m.app; hostEl = m.host;
  seed(useLiveMonitorStore(m.pinia));
  await settle();
});
afterEach(() => { app?.unmount(); hostEl?.remove(); app = null; hostEl = null; });

describe('784：三表 .tbl 改用（源码锁）', () => {
  it('三表挂 `tbl zebra` 恰 3（Top 索引/告警历史/慢请求），旧裸类形态退役', () => {
    const t = strip(liveSrc);
    const n = (t.match(/<table class="tbl zebra ld-hist-hist-t">/g) || []).length;
    /* 794 件2 同步更新：Top 索引表格随双视图 seg 条件化（v-if topView==='table'）——恒驻 2+Top 表格视图形态锁 */
    expect(n, '恒驻改用形态（告警历史/慢请求）恰 2+Top 表格视图条件面').toBe(2);
    expect(t).toContain(String.raw`<table v-if="topView === 'table'" class="tbl zebra ld-hist-hist-t">`);
    expect(t, '旧裸类 table 形态不得回流').not.toContain('<table class="ld-hist-hist-t">');
  });

  it('scoped 基底规则整删（与 .tbl 逐值同=冗余；字号语言源移交 theme.css .tbl）', () => {
    const t = strip(liveSrc);
    /* 783-C1 口径：按选择器形态锁——`.ld-hist-hist-t {` 单选择器整块形态；
       th,td 复合形态与 .ld-hist-hist-msg 后代形态是保留件，不命中 */
    expect(t, 'scoped 基底单选择器形态不得回流').not.toMatch(/\.ld-hist-hist-t \{[^}]*\}/);
  });

  it('密度+nowrap 语义保留（改用不丢监控页高密度语言）', () => {
    const t = strip(liveSrc);
    expect(t, 'th/td 紧凑密度规则在场').toMatch(/\.ld-hist-hist-t th, \.ld-hist-hist-t td \{[^}]*padding: 3px var\(--sp-2\);[^}]*white-space: nowrap; \}/);
    expect(t, 'msg 列回开规则在场').toMatch(/\.ld-hist-hist-t \.ld-hist-hist-msg \{ white-space: normal; \}/);
  });
});

describe('784：theme.css .tbl 族正向锚（改用批起是 live 依赖，防误删）', () => {
  it('基底+sticky 表头+hover 高亮+斑马纹四件全在场', () => {
    const css = strip(themeCss);
    expect(css, '基底（表体 fs-sm 字号语言源）').toMatch(/\.tbl \{ width: 100%; border-collapse: collapse; font-size: var\(--fs-sm\); \}/);
    expect(css, '表头 sticky（免费三件之一）').toMatch(/\.tbl th \{[^}]*position: sticky; top: 0;/);
    expect(css, '行 hover 高亮（免费三件之二）').toMatch(/\.tbl tbody tr:hover \{ background: var\(--bg2\); box-shadow: inset 3px 0 0 var\(--ac-hi\); \}/);
    /* 七百八十七批锁同步更新：786 刀B 将斑马底换 --tbl-zebra token（比旧 hl-soft 深一档）
       时漏同步更新本正则——与 semanticTier531 fmtNum 同族 786 遗留锁碎，787 基线归因补账 */
    expect(css, '斑马纹（免费三件之三）').toMatch(/\.tbl\.zebra tbody tr:nth-child\(even\) \{ background: var\(--tbl-zebra\); \}/);
  });
});

describe('784：挂载级改用验证', () => {
  it('面板展开后 table.tbl.zebra 真渲染（DOM 类名级，非纯文本锁）', async () => {
    const host = hostEl!;
    /* 800 同步更新：三面板合并「监控明细」单容器（ld-detail）——开容器+切告警视图出第二面表格 */
    const detailToggle = host.querySelector<HTMLButtonElement>('.ld-detail-toggle');
    expect(detailToggle, '监控明细容器钮在场').toBeTruthy();
    detailToggle!.click();
    await settle(8);
    /* 恒渲染两视图（Top 索引=非 nodeMode 档默认 tab、告警历史=切 tab）；慢请求在 canAuditAll 权限门内由源码锁① 覆盖 */
    const segBtns = [...host.querySelectorAll<HTMLButtonElement>('.ld-detail-seg button')];
    expect(segBtns.length, '明细 seg 视图钮 ≥2').toBeGreaterThanOrEqual(2);
    /* 794 件2 同步更新：Top 索引默认曲线视图；切表格视图后出第一面表格 */
    expect(host.querySelector('.ld-top-plot'), 'Top 索引默认曲线视图').toBeTruthy();
    const topTblBtn = [...host.querySelectorAll('.ld-top-viewseg button')].find(b => (b.textContent || '').includes('表格')) as HTMLButtonElement | undefined;
    topTblBtn?.click();
    await settle(6);
    expect(host.querySelectorAll('table.tbl.zebra.ld-hist-hist-t').length, 'Top 表格视图改用面在场').toBeGreaterThanOrEqual(1);
    /* 800 同步更新：切告警视图=第二面表格（单容器内两视图表格） */
    const alertBtn = segBtns.find(b => (b.textContent || '').includes('告警历史')) as HTMLButtonElement | undefined;
    alertBtn?.click();
    await settle(6);
    const n = host.querySelectorAll('table.tbl.zebra.ld-hist-hist-t').length;
    expect(n, '告警视图改用表格在场').toBeGreaterThanOrEqual(1);
    /* 收起→再展开：改用类随重挂载稳定（铁律 D1 序列①） */
    detailToggle!.click();
    await settle(4);
    detailToggle!.click();
    await settle(8);
    expect(host.querySelectorAll('table.tbl.zebra.ld-hist-hist-t').length, '再展开后告警表格仍在场（单容器重开）').toBeGreaterThanOrEqual(1);
  });
  it('1158：三表行右键接线在挂载态不炸（菜单组件随面板渲染）', async () => {
    const host = hostEl!;
    const detailToggle = host.querySelector<HTMLButtonElement>('.ld-detail-toggle');
    expect(detailToggle, '监控明细容器钮在场').toBeTruthy();
    detailToggle!.click();
    await settle(8);
    /* 告警历史视图：无 seed 告警时渲染空态行，右键不应抛错（事件挂在有数据的 tr 上） */
    const segBtns = [...host.querySelectorAll<HTMLButtonElement>('.ld-detail-seg button')];
    segBtns.find(b => (b.textContent || '').includes('告警历史'))?.click();
    await settle(8);
    const table = host.querySelector('table.tbl.zebra.ld-hist-hist-t');
    expect(table, '告警历史表在场').toBeTruthy();
    const emptyRow = table!.querySelector('tbody tr');
    if (emptyRow) {
      emptyRow.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
      await settle(4);
    }
    /* 菜单未开时 CellContextMenu 不渲染（v-if ldMenu）——这是预期 */
    expect(document.querySelectorAll('.ccm-mask').length).toBe(0);
    /* 视图仍然稳定（面板未因右键事件崩掉） */
    expect(host.querySelector('table.tbl.zebra.ld-hist-hist-t')).toBeTruthy();
  });
});
