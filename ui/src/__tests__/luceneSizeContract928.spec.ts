/**
 * Lucene 查询页 header size 输入契约（同文件两口径单点收敛）：
 * 此前 v-model.number 裸绑 size ref——与分页器 setSize 写路径两口径并存：
 * 不钳制（可输任意数含 0/负/超万）、不归页 1（from 语义漂移）、不重查、不写
 * es_pager_size 共享键（与 IndexHub/DslQuery「一次调节全站一致」契约分裂）。
 * 修=onSizeInput 单点收敛：档位值（10/20/50/100）走 setSize 全套（写共享键+
 * 归页 1+已查过即重查，与分页器/IndexHub setDocsSize 同语义）；非档位值=
 * 会话内自由取值（clamp [1,10000]，ES max_result_window 上限语义；DslQuery
 * PAGER_SIZES.includes 同判据——非档位值不参与共享分页契约）不写共享键，
 * 归页 1+重查照做；空串/非数回退现值不动作。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      resolveSchema: vi.fn(() => Promise.resolve({ warnings: [] })),
      luceneSearch: vi.fn(() => Promise.resolve({ took: 3, hits: { total: { value: 0 }, hits: [] } })),
    },
  };
});

import LuceneQueryView from '../views/LuceneQueryView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountLucene() {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(LuceneQueryView as never) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  const store = useAppStore(pinia);
  vi.spyOn(store, 'notify');
  return host;
}

function sizeInput(host: ParentNode): HTMLInputElement {
  const el = host.querySelector<HTMLInputElement>('input[type="number"][max="10000"]');
  expect(el, 'header size 输入必须在场').toBeTruthy();
  return el!;
}

async function commitSize(host: ParentNode, value: string) {
  const el = sizeInput(host);
  el.value = value;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
}

async function runOnce(host: ParentNode) {
  const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('执行') && !b.disabled);
  expect(run, '执行钮必须可点（idx+qs 已备）').toBeTruthy();
  run!.click();
  await settle();
}

beforeEach(async () => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  location.hash = '#/?idx=i1';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/?idx=i1');
  const { api } = await import('../api');
  (api.luceneSearch as ReturnType<typeof vi.fn>).mockClear();
  (api.resolveSchema as ReturnType<typeof vi.fn>).mockClear();
});

afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('header size 输入两口径收敛', () => {
  it('档位值 100：走 setSize 全套（写共享键+归页 1+重查 size=100 from=0）', async () => {
    const { api } = await import('../api');
    const host = await mountLucene();
    await runOnce(host);
    await commitSize(host, '100');
    expect(localStorage.getItem('es_pager_size'), '档位值必须写共享键（全站一致契约）').toBe('100');
    const calls = (api.luceneSearch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length, '已查过（首查后）改档必须重查').toBeGreaterThanOrEqual(2);
    const last = calls[calls.length - 1];
    expect(last[2], 'size 参数=档位值').toBe(100);
    expect(last[3], 'from 归页 1（偏移 0）').toBe(0);
  });

  it('非档位值 500：会话内生效并重查，共享键不被毒化', async () => {
    const { api } = await import('../api');
    localStorage.setItem('es_pager_size', '50');
    const host = await mountLucene();
    await runOnce(host);
    await commitSize(host, '500');
    expect(localStorage.getItem('es_pager_size'), '非档位值不得写共享键（读侧钳制会静默丢弃，写=脏键）').toBe('50');
    const calls = (api.luceneSearch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(2);
    const last = calls[calls.length - 1];
    expect(last[2]).toBe(500);
    expect(last[3]).toBe(0);
    expect(sizeInput(host).value).toBe('500');
  });

  it('空串/非数：回退现值零动作（不重查不改共享键）', async () => {
    const { api } = await import('../api');
    localStorage.setItem('es_pager_size', '50');
    const host = await mountLucene();
    await commitSize(host, '');
    expect(sizeInput(host).value).toBe('50');
    await commitSize(host, 'abc');
    expect(sizeInput(host).value).toBe('50');
    expect((api.luceneSearch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    expect(localStorage.getItem('es_pager_size')).toBe('50');
  });

  it('越界钳制：0→1、99999→10000（ES 上限语义照 title）', async () => {
    const { api } = await import('../api');
    const host = await mountLucene();
    await runOnce(host);
    await commitSize(host, '0');
    expect(sizeInput(host).value).toBe('1');
    await commitSize(host, '99999');
    expect(sizeInput(host).value).toBe('10000');
    const calls = (api.luceneSearch as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(3);
    expect(calls[calls.length - 1][2]).toBe(10000);
  });

  it('源码锁：input 换 :value/@change 单点绑定（v-model 裸绑退役）', () => {
    const src = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
    expect(src).toContain('<input :value="size" type="number" min="1" max="10000" class="lc-ii sm" @change="onSizeInput" />');
    expect(src, 'v-model 裸绑必须退役').not.toContain('v-model.number="size"');
    expect(src).toContain('title="每页返回条数 · 上限 10000"');
  });
});
