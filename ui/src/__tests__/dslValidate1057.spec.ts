/* 1057：DSL 只校验不执行——_validate/query 按当前索引验 query，结论条随改稿清空。 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { draftStorageKey } from '../composables/useScopedDraft';

const validateFn = vi.fn();
const searchFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => [{ index: 'idx-a', health: 'green', status: 'open' }]),
      mappingDetail: vi.fn(async () => ({ raw: { properties: { title: { type: 'text' } } } })),
      clusterHealth: vi.fn(async () => ({})),
      overview: vi.fn(async () => ({})),
      nodesStatsBrief: vi.fn(async () => []),
      aliases: vi.fn(async () => []),
      searchDsl: (...a: any[]) => searchFn(...a),
      validateQuery: (...a: any[]) => validateFn(...a),
      resolveSchema: vi.fn(async () => ({ warnings: [] })),
    },
  };
});
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    template: '<div class="monaco-stub"></div>',
  },
}));

import DslQueryView from '../views/DslQueryView.vue';

const apps: ReturnType<typeof createApp>[] = [];
const settle = async (n = 24) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const DRAFT = draftStorageKey({ route: 'query', index: () => 'idx-a' }, 'dsl');

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });
  await router.push('/'); await router.isReady();
  const app = createApp({ render: () => h(DslQueryView) });
  apps.push(app); app.use(pinia); app.use(router);
  const host = document.createElement('div'); document.body.appendChild(host);
  app.mount(host); await settle();
  return host;
}
const validateBtn = (host: ParentNode) => host.querySelector<HTMLButtonElement>('[aria-label="校验 query（不执行）"]');
const bar = (host: ParentNode) => host.querySelector('.dq-vbar');

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('es_picked', 'idx-a');
  validateFn.mockReset(); searchFn.mockReset();
});
afterEach(() => { apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } }); apps.length = 0; });

describe('1057 DSL query 校验', () => {
  it('校验通过 → 只调 _validate，不出检索请求；结论条标记通过', async () => {
    sessionStorage.setItem(DRAFT, JSON.stringify({ query: { term: { title: '年报' } } }));
    validateFn.mockResolvedValue({ valid: true, _shards: { total: 1, successful: 1, failed: 0 } });
    const host = await mountView();
    const btn = validateBtn(host);
    expect(btn, '校验入口必须在场').toBeTruthy();
    btn!.click(); await settle();
    expect(validateFn).toHaveBeenCalledTimes(1);
    const [idx, body] = validateFn.mock.calls[0];
    expect(idx).toBe('idx-a');
    expect(JSON.parse(body)).toEqual({ query: { term: { title: '年报' } } });
    expect(searchFn, '校验不得触发真实检索').not.toHaveBeenCalled();
    expect(bar(host)?.textContent).toContain('query 校验通过');
  });

  it('分片失败 → warn 结论条带失败分片数', async () => {
    sessionStorage.setItem(DRAFT, JSON.stringify({ query: { term: { title: '年报' } } }));
    validateFn.mockResolvedValue({ valid: true, _shards: { total: 2, successful: 1, failed: 1 } });
    const host = await mountView();
    validateBtn(host)!.click(); await settle();
    expect(bar(host)?.classList.contains('lint-bar-warn')).toBe(true);
    expect(bar(host)?.textContent).toContain('1 个分片报错');
  });

  it('无 query 键 → 不调 _validate（纯聚合场景诚实跳过）', async () => {
    sessionStorage.setItem(DRAFT, JSON.stringify({ size: 10, aggs: { by_title: { terms: { field: 'title' } } } }));
    const host = await mountView();
    validateBtn(host)!.click(); await settle();
    expect(validateFn).not.toHaveBeenCalled();
    expect(bar(host)).toBeNull();
  });
});
