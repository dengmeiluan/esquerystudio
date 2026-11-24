/**
 * 八百零八批·监控第八轮「实时告警行卡化」（用户续令「继续升级」；稿=docs/goal808-alert-polish.html）。
 * 794~806 八轮后告警区=唯一未轮到区：行=裸文字+border-bottom 分隔（Phase 0 取证清单感）。
 * 刀面（纯 CSS 零模板）：.ld-alert 行升 chip 卡——level tint 底（--warn-soft/--err-soft）+
 * 1px level 边+圆角 r-s+chip 间距；左缘 4px 色条保留（795 件2 档零迁移）；hover=brightness 微亮；
 * resolved=灰 chip。挂载 spec 静态 import（805-C1）；api 代理真值驱动 store.tick→reconcile 告警状态机。
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

/* api 代理桶：per-test 切健康/告警场景（挂载后 mon.start()→tick 读桶） */
const bucket = vi.hoisted(() => ({
  health: { status: 'green', version: '8.11.4', unassigned: 0, number_of_data_nodes: 2 } as any,
  nodes: [] as any[],
}));
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  const anyCall: any = new Proxy(function () { return Promise.resolve(null); }, {
    get(_t, p) { if (p === 'then' || typeof p === 'symbol') return undefined; return anyCall; },
    apply() { return Promise.resolve(null); },
  });
  const proxied = new Proxy({}, {
    get(_target, prop: string) {
      if (prop === 'clusterHealth') return () => Promise.resolve(bucket.health);
      if (prop === 'nodesStatsBrief') return () => Promise.resolve(bucket.nodes);
      if (prop === 'pendingTasks') return () => Promise.resolve({ tasks: [] });
      if (prop === 'monitorMetrics') {
        return () => Promise.resolve({ records: [
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 2000, qps: 71.4 },
          { kind: 'metrics', scope: 'cluster', connName: 'qa-es', timestamp: 1000, qps: 52 },
        ] });
      }
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

async function mountLive() {
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
  await settle(30);
  app = a; hostEl = host;
  return { app: a, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => { app?.unmount(); hostEl?.remove(); app = null; hostEl = null; });

describe('件1：实时告警行 chip 卡化', () => {
  it('A1 挂载：告警态双 bad 行在场（tick→reconcile 真值链）+计数徽标+文案', async () => {
    bucket.nodes = [
      { nodeId: 'd3', name: 'node-d-03', roles: ['data'], heapPct: 91, cpuPct: 73, diskTotal: 2000, diskFree: 140 },
      { nodeId: 'd1', name: 'node-d-01', roles: ['data'], heapPct: 40, cpuPct: 88, diskTotal: 1000, diskFree: 400 },
    ];
    await mountLive();
    const rows = [...hostEl!.querySelectorAll('.ld-alert')];
    expect(rows.length, 'heap91 bad+disk93 bad+cpu88 warn=3 行').toBe(3);
    expect(rows.filter(r => r.classList.contains('bad')).length).toBe(2);
    expect(rows.filter(r => r.classList.contains('warn')).length).toBe(1);
    expect(hostEl!.querySelector('.ld-al-badge')!.textContent).toContain('2');
    const txt = hostEl!.querySelector('.ld-alerts')!.textContent!;
    expect(txt).toContain('node-d-03 Heap');
    expect(txt).toContain('91%');
    expect(txt).toContain('阈值 85%');
  });

  it('A2 挂载：健康态零行+「无活动告警」绿胶囊（802 件4 语义回归锚）', async () => {
    bucket.nodes = [
      { nodeId: 'd1', name: 'node-d-01', roles: ['data'], heapPct: 40, cpuPct: 30, diskTotal: 1000, diskFree: 400 },
    ];
    await mountLive();
    expect(hostEl!.querySelectorAll('.ld-alert').length, '健康节点零告警行').toBe(0);
    const ok = hostEl!.querySelector('.ld-alerts .ld-ok-chip');
    expect(ok, '空态绿胶囊在场').toBeTruthy();
    expect(ok!.textContent).toContain('无活动告警');
  });

  it('A3 源码锁：chip 形态三件（tint 底+1px level 边+圆角）+chip 间距+brightness hover', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-alert \{[^}]*border-radius:\s*var\(--r-s\)/);
    expect(s).toMatch(/\.ld-alert \{[^}]*border:\s*1px solid var\(--border\)/);
    expect(s).toMatch(/\.ld-alert \{[^}]*margin-bottom:\s*var\(--sp-1\)/);
    expect(s).not.toMatch(/\.ld-alert \{[^}]*border-bottom/);
    expect(s).toMatch(/\.ld-alert\.bad \{[^}]*var\(--err-soft\)/);
    expect(s).toMatch(/\.ld-alert\.bad \{[^}]*var\(--err-line\)/);
    expect(s).toMatch(/\.ld-alert\.warn \{[^}]*var\(--warn-soft\)/);
    expect(s).toMatch(/\.ld-alert\.warn \{[^}]*var\(--warn-line\)/);
    expect(s).toMatch(/\.ld-alert\.resolved \{[^}]*opacity:\s*0?\.75/);
  });

  it('A4 源码锁：左缘 4px 色条三档保留（795 件2 档零迁移防回潮）+hover brightness 档', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-alert\.bad \{[^}]*border-left:\s*4px[^}]*var\(--err\)/);
    expect(s).toMatch(/\.ld-alert\.warn \{[^}]*border-left:\s*4px[^}]*var\(--warn\)/);
    expect(s).toMatch(/\.ld-alert\.resolved \{[^}]*border-left:\s*4px/);
    expect(s).toMatch(/\.ld-alert\.(warn|bad):hover[^{]*\{[^}]*brightness/);
  });
});
