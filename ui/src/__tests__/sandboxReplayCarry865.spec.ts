/**
 * 八百六十五批：沙盒一次性送达通道「必达+旧稿暂存找回」+ 通道口径归一 sessionStorage。
 *
 * 契约（对齐 DslQueryView protectDraftBeforeOverride 同语义）：
 * ① 五个送达入口（QueryHub 历史回放 / favReplay 收藏 / 模板库 / 远程集群 / BoostTuner
 *    「送入搜索沙盒」）经 esquerystudio.sandbox.body / ss_dsl_body 一次性通道送达沙盒，
 *    消费端读到即载入——旧编辑稿非默认且不同于送达稿时，先暂存 sessionStorage
 *    「esquerystudio.sandbox.prev」+ toast 提供一键找回，再覆盖（送达必达，不得因旧稿丢弃）。
 * ② ss_dsl_body 通道归一 sessionStorage（与其余四模式 carry 键同口径）；
 *    localStorage 旧落点残留读后清（一次性清理，不再消费）。
 * ③ 消费后通道键必清（读一次即清语义保持）。
 *
 * 设施：NModal/MonacoEditor/editor.api stub + api 防御 mock（histEntry528 同范式）；
 * 视图静态 import（挂载 spec 惯例）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import SearchSandboxView from '../views/SearchSandboxView.vue';
import { draftStorageKey } from '../composables/useScopedDraft';

vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    NModal: defineComponent({
      name: 'NModal',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () => (props.show ? h('div', { class: 'nm-stub' }, slots.default ? slots.default() : []) : null);
      },
    }),
  };
});

vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) {
      return () => h('div', { class: 'monaco-stub', 'data-height': props.height }, String(props.modelValue ?? ''));
    },
  }),
}));

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: { setModelMarkers: () => {}, create: () => ({ dispose() {} }) },
  languages: {
    registerCompletionItemProvider: () => ({ dispose() {} }),
    CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
  },
  Range: class {},
  Uri: { parse: (v: string) => ({ toString: () => v }) },
}));

const searchDslFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchDsl: (...a: any[]) => searchDslFn(...a),
      listStoredScripts: () => Promise.resolve({ scripts: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(beforeMount?: (store: any) => void) {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(SearchSandboxView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.warnHandler = () => {};
  const { useAppStore } = await import('../stores/app');
  const store = useAppStore(pinia);
  if (beforeMount) beforeMount(store);
  app.mount(host);
  await settle();
  await wait(20);
  await settle();
  return { host, store, unmount: () => app.unmount() };
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  sessionStorage.clear();
  localStorage.clear();
  searchDslFn.mockReset().mockResolvedValue({ took: 3, hits: { hits: [], total: { value: 0 } } });
});

afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

const CARRY = '{"term":{"status":"CARRY-IN"}}';
const MY_DRAFT = '{"term":{"status":"MY-OLD-DRAFT"}}';

describe('沙盒送达通道：必达 + 旧稿暂存找回', () => {
  it('有旧稿时送达必达：载入送达稿 + 旧稿暂存 esquerystudio.sandbox.prev + toast 找回', async () => {
    const draftKey = draftStorageKey({ route: 'search-sandbox', index: () => '' }, 'dsl');
    sessionStorage.setItem(draftKey, MY_DRAFT);
    sessionStorage.setItem('esquerystudio.sandbox.body', CARRY);
    let notify: any;
    const { host, store, unmount } = await mountView(s => { notify = vi.spyOn(s, 'notify'); });
    expect(host.querySelector('.monaco-stub')!.textContent, '送达稿必达（不得因旧稿丢弃）').toContain('CARRY-IN');
    const prev = sessionStorage.getItem('esquerystudio.sandbox.prev');
    expect(prev, '旧稿暂存键在场').toBeTruthy();
    expect(String(prev)).toContain('MY-OLD-DRAFT');
    expect(notify, '暂存提示出场').toHaveBeenCalledWith('info', expect.stringContaining('暂存'), expect.objectContaining({ action: expect.anything() }));
    unmount();
  });

  it('无旧稿时送达直载（既有行为），默认模板稿视同无稿不暂存', async () => {
    sessionStorage.setItem('esquerystudio.sandbox.body', CARRY);
    const { host, store, unmount } = await mountView();
    const notify = vi.spyOn(store, 'notify');
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('CARRY-IN');
    expect(sessionStorage.getItem('esquerystudio.sandbox.prev'), '无稿不暂存').toBeNull();
    expect(notify).not.toHaveBeenCalled();
    unmount();
  });

  it('送达与旧稿相同内容时不重复暂存', async () => {
    const draftKey = draftStorageKey({ route: 'search-sandbox', index: () => '' }, 'dsl');
    sessionStorage.setItem(draftKey, CARRY);
    sessionStorage.setItem('esquerystudio.sandbox.body', CARRY);
    const { host, unmount } = await mountView();
    expect(host.querySelector('.monaco-stub')!.textContent).toContain('CARRY-IN');
    expect(sessionStorage.getItem('esquerystudio.sandbox.prev'), '同内容不暂存').toBeNull();
    unmount();
  });
});

describe('ss_dsl_body 通道归一 sessionStorage', () => {
  it('消费端吃 sessionStorage 版 ss_dsl_body；localStorage 旧落点残留读后清', async () => {
    sessionStorage.setItem('ss_dsl_body', '{"term":{"ss":true}}');
    localStorage.setItem('ss_dsl_body', '{"stale":1}');
    const { host, unmount } = await mountView();
    expect(host.querySelector('.monaco-stub')!.textContent, '消费 sessionStorage 新落点').toContain('"ss":true');
    expect(localStorage.getItem('ss_dsl_body'), '旧落点残留清零').toBeNull();
    expect(sessionStorage.getItem('ss_dsl_body'), '读一次即清').toBeNull();
    unmount();
  });

  it('QueryHub 写侧通道锁：sandbox 回放写 sessionStorage（与其余四模式 carry 同口径）', () => {
    const qh = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');
    expect(qh).toContain("writeStoredRaw(sessionStorage, 'ss_dsl_body'");
    expect(qh, 'localStorage 旧落点退役').not.toContain("writeStoredRaw(localStorage, 'ss_dsl_body'");
  });
});
