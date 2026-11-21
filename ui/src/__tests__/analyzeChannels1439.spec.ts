/**
 * 1439：AnalyzeView 按类别实名通道——视图装载 analysisSettings 后，五类通道各回各的名单。
 * 挂载级（MonacoEditor stub 捕获 avBodyAssist），直接调通道并断言数据，
 * 排除浏览器首帧时序干扰。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const routeMock = { path: '/analyze', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute', 'keydown'],
      setup(props: any) {
        (window as any).__avAssist = props.dslAssist;
        return () => h('div', { class: 'monaco-stub' });
      },
    }),
  };
});

const analysisSettingsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analysisSettings: (...a: any[]) => analysisSettingsFn(...a),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      markSilent: undefined,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import AnalyzeView from '../views/AnalyzeView.vue';
import { useAppStore } from '../stores/app';

const apps: ReturnType<typeof createApp>[] = [];
async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).__avAssist;
  analysisSettingsFn.mockReset().mockResolvedValue({
    analysis: {
      analyzer: { default: {}, content_analyzer: {} },
      tokenizer: { edge_ngram_tk: {} },
      filter: { my_synonyms: {}, my_stop: {} },
      normalizer: { lower_norm: {} },
      char_filter: { html_strip_cf: {} },
    },
  });
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('1439 AnalyzeView 按类别实名通道', () => {
  it('五类通道各回各的名单（tokenizer/filter 不再并入 analyzers）', async () => {
    const pinia = createPinia();
    const store = useAppStore(pinia);
    store.pickedIdx = 'bond_issuer';
    const app = createApp({ render: () => h(AnalyzeView) });
    apps.push(app);
    app.use(pinia);
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    await settle();
    const assist = (window as any).__avAssist;
    expect(assist, 'body Monaco 必须收到 avBodyAssist').toBeTruthy();
    /* 首次通道调用触发惰性拉取，再 settle 等异步装载 */
    assist.tokenizers();
    await settle();
    expect(analysisSettingsFn).toHaveBeenCalledWith('bond_issuer');
    expect(assist.tokenizers()).toEqual(['edge_ngram_tk']);
    expect(assist.filters()).toEqual(['my_synonyms', 'my_stop']);
    expect(assist.normalizers()).toEqual(['lower_norm']);
    expect(assist.charFilters()).toEqual(['html_strip_cf']);
    expect(assist.analyzers()).toEqual(['default', 'content_analyzer']);
    /* 交叉污染负控：tokenizer 名单不混 analyzer/filter 名 */
    expect(assist.tokenizers()).not.toContain('my_synonyms');
    expect(assist.analyzers()).not.toContain('edge_ngram_tk');
  });
});
