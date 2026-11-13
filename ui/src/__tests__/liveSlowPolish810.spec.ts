/**
 * 八百一十批·监控第九轮「慢请求视图质感」（用户续令「继续深度改造+保持一样的设计语言」；
 * 稿=docs/goal809-slow-polish.html）。Phase 0 取证：Top=802 底座合规/告警历史=StatusPill 合规/
 * 慢请求视图两处掉队。刀面：件1 耗时列 tone 档化（阈值语义链 ≥×2 err / ≥×1.5 warn——
 * slowThresholdMs 单源）；件2 刷新钮 spinning（IlmView 同款全站惯例）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import LiveDashboardView from '../views/LiveDashboardView.vue';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/* api 代理桶：opsAudit 返回慢请求样本（阈值 1000 语义链下 2148=err/1511·1411=warn/1000·1137=默认） */
const bucket = vi.hoisted(() => ({
  slow: [
    { timestamp: 5000, username: 'ops_admin', connName: 'qa-es', method: 'GET', uri: '/_reindex/0', costMs: 1000, httpStatus: 200 },
    { timestamp: 4000, username: 'ops_admin', connName: 'qa-es', method: 'POST', uri: '/_reindex/2', costMs: 1511, httpStatus: 200 },
    { timestamp: 3000, username: 'ops_admin', connName: 'qa-es', method: 'GET', uri: '/_reindex/4', costMs: 2148, httpStatus: 200 },
  ] as any[],
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) { if (p === 'then' || typeof p === 'symbol') return undefined; return anyCall; },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'auth') {
        /* ADMIN me=canAuditAll true（慢请求 seg 解锁；802 probe 同款 ME 形态） */
        return { ...actual.api.auth, me: () => Promise.resolve({ username: 'ops_admin', displayName: '运维管理员', role: 'ADMIN', fallback: false, hasAnyUser: true, delegated: false, authSource: 'local', attributes: {}, grantedPages: null, pages: { groups: [] } }), opsAudit: () => Promise.resolve({ records: bucket.slow }) };
      }
      if (prop === 'clusterHealth') return () => Promise.resolve({ status: 'green', version: '8.11.4', unassigned: 0, number_of_data_nodes: 2 });
      if (prop === 'nodesStatsBrief') return () => Promise.resolve([
        { nodeId: 'n1', name: 'node-d-01', roles: ['data'], heapPct: 40, cpuPct: 30, diskTotal: 1000, diskFree: 600 },
      ]);
      if (prop === 'pendingTasks') return () => Promise.resolve({ tasks: [] });
      return anyCall;
    },
  });
  return { ...actual, api: proxied };
});

async function settle(n = 20) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

let app: ReturnType<typeof createApp> | null = null;
let hostEl: HTMLElement | null = null;

async function mountLiveOpenSlow() {
  location.hash = '#/';
  const pinia = createPinia();
  setActivePinia(pinia);
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const a = createApp({ render: () => h(LiveDashboardView as any) });
  a.use(pinia); a.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  a.mount(host);
  /* probe 由 App 壳触发（App.vue:409）——裸挂载手动跑一次（ADMIN me=慢请求 seg 解锁） */
  const { useAuthStore } = await import('../stores/auth');
  await useAuthStore().probe();
  await settle(30);
  app = a; hostEl = host;
  /* 展开监控明细+切慢请求视图（ADMIN 默认 canAuditAll=true） */
  const toggle = [...host.querySelectorAll('button')].find(b => (b.textContent || '').includes('监控明细')) as HTMLButtonElement;
  toggle?.click();
  await settle();
  const slowBtn = [...host.querySelectorAll('.ld-detail-seg button')].find(b => (b.textContent || '').includes('慢请求')) as HTMLButtonElement;
  slowBtn?.click();
  await settle();
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => { app?.unmount(); hostEl?.remove(); app = null; hostEl = null; });

describe('件1：慢请求耗时列 tone 档化', () => {
  it('A1 挂载：慢请求表 3 行+耗时 tone 三档（阈值 1000 链：2148=err/1511=warn/1000=默认；行按 mock 原序不排序=内容锚定）', async () => {
    await mountLiveOpenSlow();
    const rows = [...hostEl!.querySelectorAll('.ld-detail tbody tr')];
    expect(rows.length, '慢请求 3 行').toBe(3);
    const costTd = (v: number) => rows.map(r => r.querySelectorAll('td')[5]!).find(td => td.textContent!.trim() === String(v))!;
    expect(costTd(2148).className, 'costMs 2148=err 档（≥阈值×2）').toContain('err');
    expect(costTd(1511).className, 'costMs 1511=warn 档（≥阈值×1.5）').toContain('warn');
    expect(costTd(1000).className, 'costMs 1000=默认档（恰阈值不着色）').not.toContain('err');
    expect(costTd(1000).className).not.toContain('warn');
  });

  it('A2 源码锁：slowCostTone 单源函数+阈值语义链+CSS 两档色', () => {
    const s = strip(liveSrc);
    expect(s).toContain('slowCostTone');
    expect(s).toMatch(/slowCostTone[\s\S]{0,400}2(\.\d+)?\s*\*|slowCostTone[\s\S]{0,400}\*\s*2/);
    expect(s).toMatch(/\.ld-cost-err \{[^}]*var\(--err\)/);
    expect(s).toMatch(/\.ld-cost-warn \{[^}]*var\(--wn\)/);
  });
});

describe('件2：慢请求刷新钮 spinning', () => {
  it('B1 源码锁：RotateCw :class spinning 绑 slowLoading+scoped keyframes（IlmView 同款惯例）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/RotateCw[^>]*:class="\{ spinning: slowLoading \}"/);
    expect(s).toMatch(/@keyframes (ld-spin|rot)\b|animation:[^;]*spin|\.spinning \{[^}]*animation/);
    expect(s).toMatch(/\.spinning \{[^}]*animation/);
  });
});
