import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

// 八百一十二批·横切审计第二轮（R192）族4 键盘可达小刀——a 无 href 链接族 6 处
// （IndexHub×3+LiveDashboard×1+Mapping×2）+ Xmigrate cpy span 点击复制 1 处。
// a 无 href 不可 tab 聚焦、Enter 不触发、读屏不报 link 角色（铁律 B/D 键盘可达）。
// 修法=MappingFieldTree mft-attr-link 范式（a 补 role="link"+tabindex="0"+
// @keydown.enter.prevent）+ AdhocRebuildView:489 cpy span 键盘三件套范式。
// 挂载级组=事件→路由真断言（范式=mappingFirstCut760/liveRefactor794/indexHubMetaStrip）。

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('kbdReach812 逐文件三件套锚', () => {
  it('IndexHubView ih-link 三处均带 role=link+tabindex+keydown.enter', () => {
    const v = rd('../views/IndexHubView.vue');
    const total = (v.match(/<a class="ih-link"/g) || []).length;
    const role = (v.match(/<a class="ih-link" role="link"/g) || []).length;
    const tbi = (v.match(/<a class="ih-link" role="link" tabindex="0"/g) || []).length;
    const kd = (v.match(/@keydown\.enter\.prevent="goto\(/g) || []).length;
    expect(total).toBe(3);
    expect(role).toBe(3);
    expect(tbi).toBe(3);
    expect(kd).toBe(3);
  });

  it('LiveDashboardView ld-top-link 带 role=link+tabindex+keydown.enter', () => {
    const v = rd('../views/LiveDashboardView.vue');
    expect(v).toContain('class="ld-top-link" role="link" tabindex="0"');
    expect((v.match(/@keydown\.enter\.prevent="gotoBrowser\(/g) || []).length).toBe(1);
  });

  it('MappingView mp-link 两处均带 role=link+tabindex+keydown.enter', () => {
    const v = rd('../views/MappingView.vue');
    const total = (v.match(/<a class="mp-link"/g) || []).length;
    const full = (v.match(/<a class="mp-link" role="link" tabindex="0"/g) || []).length;
    const kd = (v.match(/@keydown\.enter\.prevent="goto(Designer|Rebuild)"/g) || []).length;
    expect(total).toBe(2);
    expect(full).toBe(2);
    expect(kd).toBe(2);
  });

  it('XmigrateView cpy span 补键盘三件套（AdhocRebuild 489 行同款）', () => {
    const v = rd('../views/XmigrateView.vue');
    const cpy = (v.match(/class="mono cpy"/g) || []).length;
    const armed = (v.match(/class="mono cpy"[^>]*tabindex="0"[^>]*role="button"/g) || []).length;
    expect(cpy).toBeGreaterThanOrEqual(1);
    expect(armed).toBe(cpy); // 全部 cpy span 均已武装
    expect(v).toContain('@keydown.enter.prevent="copyJobId(');
  });
});

describe('kbdReach812 全域守卫：a 无 href 且绑 @click 且零 tabindex 禁新增（行级口径）', () => {
  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(n => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.vue') ? [p] : [];
    });
  }
  it('views+components 全域零「a 无 href 无 tabindex 且 @click」形态', () => {
    const offenders: string[] = [];
    for (const base of ['../views', '../components']) {
      for (const f of walk(join(__dirname, base))) {
        const lines = readFileSync(f, 'utf-8').split(/\r?\n/);
        lines.forEach((l, i) => {
          // a 开标签行内：绑 @click 且无 href= 且无 tabindex= 且无 role="link"/button（行级锚定，跨行 a 需升级守卫）
          if (/<a\s/.test(l) && /@click/.test(l) && !/href=/.test(l) && !/tabindex=/.test(l) && !/role="(link|button)"/.test(l)) {
            offenders.push(`${f.replace(/\\/g, '/').split('/src/')[1]}:${i + 1}`);
          }
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});

/* ---- 挂载级键盘链（keydown Enter→路由真断言）----
   一球三页：IndexHub（MetaStrip 管控链）+Mapping（添加字段弹窗双链）+LiveDashboard（Top 行内链）。
   mock 面=三页挂载消费端点并集（范式=mappingFirstCut760 INSPECT 桶+liveRefactor794 topMock+
   indexHubMetaStrip IDX_A/FIVE_ALIASES），Monaco happy-dom stub=743 起统一样式。 */

const { topMock } = vi.hoisted(() => ({
  topMock: async () => ({ records: [
    { index: 'orders-v9', qps: 12, idxRate: 100, storeMb: 2100 },
    { index: 'quotes-v3', qps: 4, idxRate: 50, storeMb: 800 },
  ] }),
}));

const IDX_A = {
  index: 'idx_a', health: 'green', status: 'open', pri: 3, rep: 1,
  'docs.count': 12345, 'store.size': '34.5gb',
  'creation.date.string': '2024-01-02T03:04:05.123Z',
};
const FIVE_ALIASES = ['al_one', 'al_two', 'al_three', 'al_four', 'al_five']
  .map(a => ({ alias: a, index: 'idx_a' }));
const INSPECT_812 = {
  docCount: 777,
  mappings: { 'orders-v9-20261001': { properties: {
    id: { type: 'keyword' }, name: { type: 'text' }, memo: { type: 'text' },
  } } },
  settings: { 'orders-v9-20261001': { 'index.refresh_interval': '1s' } },
};

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([IDX_A]),
      aliases: () => Promise.resolve(FIVE_ALIASES),
      indexSettings: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({}),
      shards: () => Promise.resolve([]),
      clusterQuery: () => Promise.resolve({ total: 0, hits: [] }),
      clusterInspect: () => Promise.resolve(INSPECT_812),
      indexSettingsDefaults: () => Promise.resolve({ body: '{}' }),
      analysisSettings: () => Promise.resolve({ analysis: {} }),
      monitorTopIndexes: () => topMock(),
      monitorMetrics: () => Promise.resolve({ records: [
        { connName: 'prod-es', timestamp: 1000, qps: 1, indexRate: 1, heapUsedPct: 10, cpuPct: 5, diskUsedPct: 20 },
        { connName: 'prod-es', timestamp: 2000, qps: 2, indexRate: 2, heapUsedPct: 11, cpuPct: 6, diskUsedPct: 21 },
      ] }),
      nodesStatsBrief: () => Promise.resolve([]),
      pendingTasks: () => Promise.resolve({ tasks: [] }),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import IndexHubView from '../views/IndexHubView.vue';
import MappingView from '../views/MappingView.vue';
import LiveDashboardView from '../views/LiveDashboardView.vue';

const apps: ReturnType<typeof createApp>[] = [];
async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
function kEnter(el: Element) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
}
/* vue-router memory push 的 currentRoute 更新跨宏任务边界——纯微任务 settle 链不保证，
   键盘/点击断言前须宏任务一拍（812 探针课；MetaStrip 绿用例 setTimeout(0) 同口径） */
async function tickRoute() {
  await new Promise(r => setTimeout(r, 0));
  for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountWith(view: any, routes: string[], startHash: string) {
  history.replaceState(null, '', startHash);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }, ...routes.map(p => ({ path: p, component: { template: `<div class="stub-${p.slice(1)}"/>` } }))],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(view) });
  apps.push(app);
  const pinia = createPinia();
  app.use(pinia);
  app.use(router);
  setActivePinia(pinia);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle(18);
  return { router, host };
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
});

describe('kbdReach812 挂载级键盘链（Enter→路由）', () => {
  it('IndexHub：ih-link Enter 触发 goto → /aliases（管控链键盘直达）', async () => {
    const { router } = await mountWith(IndexHubView, ['/aliases', '/mapping', '/topology'], '#/?idx=idx_a');
    const links = document.querySelectorAll('a.ih-link');
    expect(links.length).toBeGreaterThanOrEqual(1);
    expect(links[0].getAttribute('tabindex')).toBe('0');
    expect(links[0].getAttribute('role')).toBe('link');
    kEnter(links[0]);
    await tickRoute();
    expect(router.currentRoute.value.path).toBe('/aliases');
  });

  it('Mapping：添加字段弹窗 mp-link[0] Enter → /mapping-designer', async () => {
    const { router, host } = await mountWith(MappingView, ['/mapping-designer', '/adhoc-rebuild'], '#/?idx=orders-v9');
    const addBtn = Array.from(host.querySelectorAll('button')).find(b => (b.textContent || '').includes('添加字段'));
    expect(addBtn, '添加字段钮在场').toBeTruthy();
    (addBtn as HTMLButtonElement).click();
    await settle(6);
    const links = document.querySelectorAll('a.mp-link'); // n-modal teleport→body（759 课①）
    expect(links.length).toBe(2);
    kEnter(links[0]);
    await tickRoute();
    expect(router.currentRoute.value.path).toBe('/mapping-designer');
  });

  it('Mapping：弹窗 mp-link[1] Enter → /adhoc-rebuild（零停机重建链）', async () => {
    const { router, host } = await mountWith(MappingView, ['/mapping-designer', '/adhoc-rebuild'], '#/?idx=orders-v9');
    const addBtn = Array.from(host.querySelectorAll('button')).find(b => (b.textContent || '').includes('添加字段'));
    (addBtn as HTMLButtonElement).click();
    await settle(6);
    const links = document.querySelectorAll('a.mp-link');
    kEnter(links[1]);
    await tickRoute();
    expect(router.currentRoute.value.path).toBe('/adhoc-rebuild');
  });

  it('LiveDashboard：Top 行内 ld-top-link Enter → /browser 深链', async () => {
    const { router } = await mountWith(LiveDashboardView, ['/browser'], '#/live');
    // 800 批单壳折叠区默认收起+懒加载（786-C2 课①）：展开「监控明细」（detailTab 默认 top）
    const toggle = document.querySelector('.ld-detail-toggle') as HTMLButtonElement;
    expect(toggle, '监控明细折叠钮在场').toBeTruthy();
    toggle.click();
    await settle(10);
    // Top 区二段视图默认 curve（802 批），ld-top-link 在 table 分支——切「表格」
    const tblBtn = Array.from(document.querySelectorAll('button')).find(b => (b.textContent || '').trim() === '表格');
    expect(tblBtn, 'Top 曲线/表格 seg 钮在场').toBeTruthy();
    (tblBtn as HTMLButtonElement).click();
    await settle(8);
    const link = document.querySelector('a.ld-top-link');
    expect(link, 'Top 行内链在场（topMock 数据渲染后）').toBeTruthy();
    kEnter(link!);
    await tickRoute();
    expect(router.currentRoute.value.path).toBe('/browser');
    expect(String(router.currentRoute.value.query.idx || '')).toBe('orders-v9');
  });
});
