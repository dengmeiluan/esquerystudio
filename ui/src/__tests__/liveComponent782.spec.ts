/**
 * 七百八十二批：实时监控第二刀（用户实报续修「协调性/一致性/对称性/不重复性/组件性」；
 * 稿=docs/goal782-live-component.html；研究底=五维审计〔自勘+Explore 双路〕）。
 *
 * Z1 组件性·头名：三表外壳（Top 索引/告警历史/慢请求）同构手写三遍合并 CollapsePanel
 *    统一件（展开钮/计数/导出门控/空态四要素三套写法已漂移；顺手治真缺陷=告警历史
 *    展开钮计数源 srvAlerts.length 与表行 alertHistRows.length 筛选时不一致）。
 * Z2 不重复性：告警历史级别列 CRIT/WARN/INFO ternary→StatusPill 单源（映射 5 处→1）。
 * Z3 一致性：.ld-hd 六条旧页头死规则整删（780 G267/G268 族第二例）+.ld-al-badge{} 空规则删
 *    +表格 12px→var(--fs-sm) 精确等值合并+chips 2px→var(--sp-0)；waitText 六份字面量→一 computed。
 * Z4 协调性：历史区头部两行分层（轻信息行/控件行解耦——11 子项单行 wrap 不可控）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useLiveMonitorStore } from '../stores/liveMonitor';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const cpSrc = readFileSync(join(__dirname, '../components/CollapsePanel.vue'), 'utf-8');
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

describe('Z1：CollapsePanel 合并三表外壳', () => {
  it('组件契约：展开钮 aria-expanded/v-model:open/计数徽标/#actions slot', async () => {
    const mod = await import('../components/CollapsePanel.vue');
    const host = document.createElement('div');
    document.body.appendChild(host);
    /* 内容区 v-if 卸载式（原三表行为零变化）——展开态断言内容在场 */
    const a = createApp({ render: () => h(mod.default, { open: true, title: 'Top 索引', count: 7, 'onUpdate:open': () => {} }, { actions: () => h('button', { class: 'btn' }, '复制 TSV'), default: () => h('table') }) });
    a.mount(host);
    await settle(4);
    const btn = host.querySelector('button[aria-expanded="true"]') as HTMLElement;
    expect(btn, '展开钮 aria-expanded').toBeTruthy();
    expect(host.textContent).toContain('Top 索引');
    expect(host.textContent).toContain('7');
    expect(host.querySelector('.btn')?.textContent).toContain('复制 TSV');
    expect(host.querySelector('table')).toBeTruthy();
    a.unmount(); host.remove();
  });

  it('三处消费接线（800 同步更新：三表合并「监控明细」单容器 ld-detail；782 CollapsePanel 合并态为其中间形态）', () => {
    const t = strip(liveSrc);
    expect(t, '单容器在场').toContain('ld-detail');
    /* 三视图表体与计数语汇在场（告警计数=表行集口径语义保留） */
    expect(t).toContain('alertHistRows');
    expect(t, '旧漂移计数退役').not.toContain('告警历史（${srvAlerts.length}）');
    /* 旧手写外壳四要素退役 */
    expect(t, '旧展开钮三元组退役').not.toContain(':aria-expanded="topOpen"');
    expect(t).not.toContain(':aria-expanded="alertHistOpen"');
    expect(t).not.toContain(':aria-expanded="slowOpen"');
  });

  it('导出函数保留视图侧（802 同步更新：平铺双钮收 ⋯ 菜单=copyDetail 按 detailTab 分发三函数）', () => {
    const t = strip(liveSrc);
    expect(t).toContain("copyDetail('tsv')");
    expect(t).toMatch(/detailTab\.value === 'top'[^}]{0,60}copyTop\(fmt\)/);
    expect(t).toMatch(/detailTab\.value === 'slow'[^}]{0,60}copySlow\(fmt\)/);
    expect(t).toMatch(/copyAlertHist\(fmt\)/);
  });
});

describe('Z2：告警级别列 StatusPill 单源', () => {
  it('源码锁：级别列换 StatusPill + 旧 ternary span 退役', () => {
    const t = strip(liveSrc);
    expect(t, '级别列 StatusPill').toMatch(/<StatusPill :tone="a\.level === 'CRIT' \? 'r' : a\.level === 'WARN' \? 'y' : 'n'"/);
    expect(t, '旧类名 ternary 退役（表格级形态；chips 行 ternary 随 chip 结构保留=稿决议）').not.toContain(`<td><span :class="a.level === 'CRIT' ? 'crit'`);
  });
});

describe('Z3：死码与散值合并', () => {
  it('.ld-hd 六条死规则+.ld-al-badge 空规则整删（780 族第二例）', () => {
    const t = strip(liveSrc);
    expect(t, 'ld-hd 零残留').not.toContain('.ld-hd');
    expect(t, '空规则零残留').not.toMatch(/\.ld-al-badge\s*\{\s*\}/);
  });

  it('散值精确等值合并：表格 12px→fs-sm；chips 2px→sp-0', () => {
    const t = strip(liveSrc);
    /* 784 同步更新：三表改用全站 .tbl（tbl zebra）——scoped 基底规则（fs-sm 逐值同）随改用
       整删，字号语言源移交 theme.css .tbl；12px 裸值退役断言口径不变 */
    expect(t, '表格改用全站 .tbl（字号语言源=theme.css .tbl）').toMatch(/<table class="tbl zebra ld-hist-hist-t">/);
    expect(t, '旧裸值退役').not.toContain('font-size: 12px');
    expect(t, 'chips 纵向内边 token 化').toMatch(/\.ld-hist-al \{[^}]*padding: var\(--sp-0\) var\(--sp-2\)/);
  });

  it('waitText 六份字面量→单 computed', () => {
    const t = strip(liveSrc);
    expect(t, 'computed 单源').toMatch(/const waitText = computed/);
    const n = (t.match(/采样中，约 /g) || []).length;
    expect(n, '字面量恰 1 处（computed 内）').toBe(1);
    expect(t, '五卡统一消费').toContain(':wait-text="waitText"');
  });
});

describe('Z4：历史区头部两行分层', () => {
  it('源码锁：head-top（标题+副题+ring）/head-ctl（seg+控件行）结构化', () => {
    const t = strip(liveSrc);
    expect(t, '轻信息行').toContain('ld-hist-head-top');
    expect(t, '控件行').toContain('ld-hist-head-ctl');
    /* ring 移入 top 行 */
    expect(t).toMatch(/ld-hist-head-top[\s\S]{0,400}ld-hist-ring/);
  });
});

describe('组件源码完整性', () => {
  it('CollapsePanel 组件源码：aria-expanded+v-model+chev 旋转', () => {
    const t = strip(cpSrc);
    expect(t).toContain(':aria-expanded');
    expect(t).toContain('update:open');
  });
});
