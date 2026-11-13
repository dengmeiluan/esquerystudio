/**
 * 【558 批 b 轨1：智能提示与纠错】hintWave558b
 *
 * A LuceneInput 语法检查补 _exists_:字段 未知字段纠错——规则⑥正则只捕 `name:` 形态，
 *   _exists_ 本名被下划线前缀豁免，其参数（真字段名）此前零纠错；补单列扫描，捕获组走
 *   同一 known/editDistance 最近候选逻辑、同格式提示。
 * B AnalysisSettingsView 原始 settings JSON 区 dsl-assist 补 analyzers() 候选（AnalyzeView
 *   avBodyAssist 同通道契约）——页内 raw 即 analysis 对象，零请求派生；fields 维持空数组
 *   （W3b 五百一十九批契约不回归，同步更新锁在 analysisSettingsAssistW3b.spec）。
 * C fieldSearch 组头中文兜底：GH_LABEL→esEnumZh.FIELD_TYPE_ZH→原名 三级链——text/keyword/
 *   ip/boolean/geo_point/object 组头出人话（词面升级，fieldSelectPopup/fieldPicker/
 *   boostFieldPrioW3b/suggestWave556 锁面同步同步更新）。
 * D utils/highlightSanitize 单源：SearchSandboxView hlSafe 平移导出（白名单放行
 *   <em class="hl">，其余转义 fail-closed）。
 * E SearchSandboxView hits 结果面查找三件套（374 批 lc-json-find 同款）接线源码锁。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/analysis-settings', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* 只替换网络出口：A 用 mappingDetail，B 用 analysisSettings（其余防御性 stub 挡真实 fetch） */
const mappingDetailFn = vi.fn();
const analysisSettingsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      analysisSettings: (...a: any[]) => analysisSettingsFn(...a),
      analysisUpdate: () => Promise.resolve({}),
      reloadAnalyzers: () => Promise.resolve({}),
      searchRaw: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

/* B 观测点：MonacoEditor stub 捕获 JsonArea 透传的 dslAssist（analysisSettingsAssistW3b 范式） */
vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup(props: any) {
        (window as any).__hw558bAssist = props.dslAssist;
        return () => h('div', { class: 'monaco-host' });
      },
    }),
  };
});

import LuceneInput from '../components/LuceneInput.vue';
import AnalysisSettingsView from '../views/AnalysisSettingsView.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { searchFields, groupByLabel } from '../utils/fieldSearch';
import { hlSafe } from '../utils/highlightSanitize';

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text', fields: { keyword: { type: 'keyword' } } },
  created_at: { type: 'date' },
} } };

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

/* ── A：LuceneInput 挂载（luceneInput.spec 同范式，提示条在组件根内非 Teleport） ── */
async function mountLi(init: { modelValue?: string; index?: string } = {}) {
  /* reactive 必要：modelValue 回写不进响应式则 props 恒空，语法检查永不触发（luceneInput.spec 同款） */
  const state = reactive({ modelValue: init.modelValue ?? '', index: init.index ?? 'logs-2026.08' });
  const app = createApp({ render: () => h(LuceneInput, {
    modelValue: state.modelValue, index: state.index,
    'onUpdate:modelValue': (v: string) => { state.modelValue = v; },
    onEnter: () => {},
  }) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, state };
}
async function typeLi(host: ParentNode, v: string) {
  const el = host.querySelector<HTMLInputElement>('.li-inp')!;
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await settle();
}
const issueText = (host: ParentNode) => host.querySelector('.li-syntax')?.textContent ?? '';

/* ── B：AnalysisSettingsView 挂载（analysisSettingsAssistW3b 同范式） ── */
async function mountAs() {
  const app = createApp({ render: () => h(AnalysisSettingsView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).__hw558bAssist;
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
  analysisSettingsFn.mockReset().mockResolvedValue({
    analysis: { analyzer: { my_std: { type: 'pattern' } }, filter: { my_stop: { type: 'stop' } } },
  });
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
  history.replaceState(null, '', '#/');
});

describe('A LuceneInput _exists_:字段 未知字段纠错（558b）', () => {
  it('拼错字段出建议：_exists_:statu 点名未知字段并附编辑距离最近候选 status', async () => {
    const { host } = await mountLi();
    await typeLi(host, '_exists_:statu');
    expect(issueText(host), '_exists_ 参数不再被下划线前缀豁免放走').toContain('未知字段「statu」');
    expect(issueText(host), '同格式附最近候选（规则⑥同款 ≤2 才附）').toContain('最接近：status');
  });

  it('清单内字段零提示：_exists_:status 不误报', async () => {
    const { host } = await mountLi();
    await typeLi(host, '_exists_:status');
    expect(issueText(host), 'known 字段零纠错').toBe('');
  });

  it('全新字段（距离 >2）只点名不附候选；与既有 name: 形态互不串扰', async () => {
    const { host } = await mountLi();
    await typeLi(host, '_exists_:zzzzzz AND ghost:active');
    expect(issueText(host)).toContain('未知字段「zzzzzz」');
    expect(issueText(host)).toContain('未知字段「ghost」');
    expect(issueText(host), '距离全 >2 不附候选').not.toContain('最接近');
  });
});

describe('B AnalysisSettings analyzers() 候选接线（558b）', () => {
  it('加载后 Monaco 收到 analyzers()=analyzer+normalizer+tokenizer 名单（filter 不入通道）；fields 仍空、bodyKind 仍 settings', async () => {
    const host = await mountAs();
    const loadBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('加载'));
    expect(loadBtn, '「加载」按钮在位').toBeTruthy();
    loadBtn!.click();
    await settle();
    const assist = (window as any).__hw558bAssist;
    expect(assist, 'JsonArea 内层 Monaco 必须收到 dslAssist').toBeTruthy();
    expect(assist.analyzers(), '自定义组件名单从页内 raw 零请求派生').toEqual(['my_std']);
    expect(assist.fields(), 'fields 仍空数组（519 批契约不回归）').toEqual([]);
    expect(assist.bodyKind()).toBe('settings');
  });
});

describe('C fieldSearch 组头中文兜底 GH_LABEL→FIELD_TYPE_ZH（558b）', () => {
  const FIELDS = [
    { path: 'title', type: 'text' },
    { path: 'status', type: 'keyword' },
    { path: 'ip', type: 'ip' },
    { path: 'flag', type: 'boolean' },
    { path: 'loc', type: 'geo_point' },
    { path: 'obj', type: 'object' },
    { path: 'n', type: 'long' },
    { path: 'ts', type: 'date' },
  ];
  it('组头出人话：布尔/IP 地址/地理坐标/数值/对象/精确值/文本/日期（组序=searchFields 字母序首现序）', () => {
    const labels = groupByLabel(searchFields({ fields: FIELDS, query: '' }).flat).map(g => g.label);
    expect(labels).toEqual(['布尔 字段', 'IP 地址 字段', '地理坐标 字段', '数值 字段', '对象 字段', '精确值 字段', '文本 字段', '日期 字段']);
  });
  it('GH_LABEL 既有档零回退（数值族/date）；未知类型仍原名归组（不猜不编）', () => {
    const labels = groupByLabel(searchFields({ fields: [
      { path: 'n', type: 'scaled_float' }, { path: 'ts', type: 'date_nanos' }, { path: 'x', type: 'my_custom' },
    ], query: '' }).flat).map(g => g.label);
    expect(labels).toEqual(['数值 字段', '日期 字段', 'my_custom 字段']);
  });
});

describe('D highlightSanitize 单源（558b）', () => {
  it('受控 <em class="hl"> 放行；文档携带的注入标签全转义（fail-closed）', () => {
    expect(hlSafe('前<em class="hl">词</em>后')).toBe('前<em class="hl">词</em>后');
    expect(hlSafe('<img src=x onerror=alert(1)>正常<em class="hl">词</em>'))
      .toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(hlSafe('<script>alert(1)</script>')).not.toContain('<script>');
    expect(hlSafe('<EM CLASS="hl">x</EM>')).not.toContain('<EM');
  });
  it('裸 & < > 转义不破坏、纯文本原样', () => {
    expect(hlSafe('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
    expect(hlSafe('普通文本 123')).toBe('普通文本 123');
  });
});

describe('E SearchSandboxView hits 查找与净化单源接线（源码锁，558b）', () => {
  const ss = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');
  it('hlSafe 单源 import（本地 function hlSafe 退役）；模板净化出口不变', () => {
    expect(ss).toContain("import { hlSafe } from '../utils/highlightSanitize';");
    expect(ss, '本地定义退役（单源不许双份）').not.toMatch(/function hlSafe\(/);
    expect(ss).toContain('v-html="hlSafe(Array.isArray(v) ? v.join(\' … \') : String(v))"');
  });
  /* 五百六十五批同步更新：_id/_index 命中高亮改用 MarkText 统一件（558b 手写 splitMark
     渲染退役，sandboxMarkTextUnify565 详记）——断言语义=查找高亮在场，锚随单源收口改形态 */
  it('hits 结果面查找三件套：hitsKw 过滤+计数+清除，_id/_index MarkText 切分高亮', () => {
    expect(ss).toContain('const hitsKw = ref(\'\');');
    expect(ss).toContain('const shownHits = computed');
    expect(ss).toContain("import MarkText from '../components/MarkText.vue';");
    expect(ss).toContain(`<MarkText :text="String(h._id ?? '')" :kw="hitsMarkKw" />`);
    expect(ss).toContain(`<MarkText :text="String(h._index ?? '')" :kw="hitsMarkKw" />`);
    expect(ss).toContain('v-for="({ h, i }) in shownHits"');
  });
});
