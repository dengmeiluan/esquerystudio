/**
 * 七百二十九批：ProfileFlame 首刀两小刀（R110；R109 裁决表头号 G94+G95）。
 *
 * ① G94（P3 死代码）三条死样式规则清（713 G53/715 G56/717 G61/721 G72/727 G86 同族；
 *    R109 grep 实锚模板 0 引用）：页头合并后左组/图标色两条同族漏删+IndexPicker
 *    合并后手写输入框孤儿一条；活锚 .pf-hd（页头壳）/.pf-inputs（工具条承接线）保留。
 * ② G95（P3 铁律 D 在途可感知）分析钮 Play 图标 spinning 绑 busy+文案「分析中…」切换
 *    （721 G73 ScoreExplain 同款修法；R109 读数=busy 只 disabled 页面零 spinner；
 *    722 G81 豁免口径=纯文本钮无图标可挂，本页 Play 图标在场不满足豁免前提）。
 *
 * 驱动方式照 scoreExplainFirstCut721（monaco ESM 全 stub + api mock 挂载冒烟）
 * +synonymsFirstCut719（行为在途窗双读 + 源码锁 + 渲染负锚三段式）。
 * mock 数值同 728 探针三分片球：s0 6.9ms>s1 4.5ms>s2 2.4ms → 四格 3/13.80ms/6.90ms/17。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub（721 spec 同范式：JsonArea 真挂载、注册面最小桩） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const fakeEditor = {
    onDidChangeModelContent: () => ({ dispose() {} }),
    addAction: () => {},
    getValue: () => '',
    setValue: () => {},
    updateOptions: () => {},
    getAction: () => null,
    getSelection: () => null,
    executeEdits: () => {},
    focus: () => {},
    deltaDecorations: () => [],
    getModel: () => null,
    dispose: () => {},
  };
  return {
    editor: { defineTheme: () => {}, create: () => fakeEditor, setTheme: () => {}, setModelMarkers: () => {} },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      registerHoverProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {},
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/format/browser/formatActions', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/comment/browser/comment', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));

const searchDslFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchDsl: (...a: any[]) => searchDslFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: { status: { type: 'keyword' }, title: { type: 'text' }, createdAt: { type: 'date' } } } }),
    },
  };
});

import ProfileFlameView from '../views/ProfileFlameView.vue';

/* 三分片 profile 应答（728 探针同构球）：s0 6.9ms（7 节点）>s1 4.5ms（6）>s2 2.4ms（4）
   → 四格 3/13.80ms/6.90ms/17；hotOps 17 QRT 前 10 截断；多分片不自动 focus */
const NS = (ms: number) => Math.round(ms * 1e6);
const q0 = { type: 'BooleanQuery', description: 'status:open title:sample', time_in_nanos: NS(4.2), children: [
  { type: 'TermQuery', description: 'status:open', time_in_nanos: NS(1.6) },
  { type: 'PhraseQuery', description: 'title:sample', time_in_nanos: NS(0.9) },
  { type: 'MatchNoDocsQuery', description: 'no match', time_in_nanos: NS(0.2) },
] };
const q1 = { type: 'BooleanQuery', description: 'status:open title:sample', time_in_nanos: NS(2.8), children: [
  { type: 'TermQuery', description: 'status:open', time_in_nanos: NS(1.2) },
  { type: 'PhraseQuery', description: 'title:sample', time_in_nanos: NS(0.7) },
] };
const q2 = { type: 'BooleanQuery', description: 'status:open', time_in_nanos: NS(1.5), children: [
  { type: 'TermQuery', description: 'status:open', time_in_nanos: NS(0.6) },
] };
const PROFILE_MULTI = { took: 20, hits: { total: { value: 15 }, hits: [] }, profile: { shards: [
  { id: '[pf-t][0]', searches: [
    { query: [q0], collector: [{ type: 'SimpleTopScoreDocCollector', description: 'collect top 5', time_in_nanos: NS(0.8) }] },
  ], aggregations: [{ type: 'NumericTermsAggregator', description: 'by_status', time_in_nanos: NS(1.9), children: [
    { type: 'GlobalOrdinalsStringTermsAggregator', description: 'by_status leaf', time_in_nanos: NS(1.1) },
  ] }] },
  { id: '[pf-t][1]', searches: [
    { query: [q1], collector: [{ type: 'SimpleTopScoreDocCollector', description: 'collect top 5', time_in_nanos: NS(0.5) }] },
  ], aggregations: [{ type: 'NumericTermsAggregator', description: 'by_status', time_in_nanos: NS(1.2), children: [
    { type: 'GlobalOrdinalsStringTermsAggregator', description: 'by_status leaf', time_in_nanos: NS(0.8) },
  ] }] },
  { id: '[pf-t][2]', searches: [
    { query: [q2], collector: [{ type: 'SimpleTopScoreDocCollector', description: 'collect top 5', time_in_nanos: NS(0.3) }] },
  ], aggregations: [{ type: 'NumericTermsAggregator', description: 'by_status', time_in_nanos: NS(0.6) }] },
] } };

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountPf() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(ProfileFlameView as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findRunBtn(host: HTMLElement): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => (b.textContent || '').includes('分析'));
  expect(btn, '「分析」按钮必须存在（工具条）').toBeTruthy();
  return btn!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  /* idx 深链：带索引语境（useUrlState init 读真 hash；默认草稿非空 → 分析钮 enabled） */
  history.replaceState(null, '', '#/?idx=idx_pf');
  localStorage.setItem('es_picked', 'idx_pf');
  searchDslFn.mockReset().mockResolvedValue(PROFILE_MULTI);
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('729 G95 分析钮在途可感知（铁律 D；721 G73 同款修法）', () => {
  it('在途窗双读：disabled=true + Play 图标 spinning + 文本改用「分析中…」；完成复常双 false', async () => {
    let release: (() => void) | null = null;
    searchDslFn.mockImplementation(() => new Promise<any>(res => { release = () => res(PROFILE_MULTI); }));
    const host = await mountPf();
    const btn = findRunBtn(host);
    expect(btn.disabled, '起手未在途不禁用（默认草稿非空）').toBe(false);
    btn.click();
    await settle(4);
    expect(searchDslFn, '点击即触发一次 search-dsl（profile=true）').toHaveBeenCalledTimes(1);
    expect(searchDslFn.mock.calls[0][2], 'profile 开关上行').toMatchObject({ profile: true });
    expect(btn.disabled, 'busy 守卫既有（R109 读数）').toBe(true);
    expect(btn.querySelector('.spinning'), 'G95 病灶：在途窗 Play 零 spinning（页面零 spinner）').toBeTruthy();
    expect(btn.textContent).toContain('分析中…');
    release!();
    await settle();
    expect(btn.disabled, '完成复常').toBe(false);
    expect(btn.querySelector('.spinning')).toBeNull();
    expect(btn.textContent).toContain('分析');
  });
});

describe('729 源码锁', () => {
  it('G95 字面锁：Play spinning 绑 busy + 文案切换字面', () => {
    const v = readFileSync(join(__dirname, '../views/ProfileFlameView.vue'), 'utf-8');
    expect(v).toContain('<Play :size="12" :class="{ spinning: busy }" />');
    expect(v).toContain("{{ busy ? '分析中…' : '分析' }}");
  });

  it('G94 源码锁：三条死规则零残留 + 活锚保留', () => {
    const v = readFileSync(join(__dirname, '../views/ProfileFlameView.vue'), 'utf-8');
    /* 页头合并同族漏删两条（活锚 .pf-hd 不在锁面） */
    expect(v).not.toMatch(/\.pf-hd-l\b/);
    expect(v).not.toMatch(/\.pf-hd-ic\b/);
    /* IndexPicker 合并后手写输入框孤儿（\b 防 .pf-inputs 活类误伤） */
    expect(v).not.toMatch(/\.pf-inp\b/);
    /* 活锚两件 */
    expect(v).toContain('.pf-hd {');
    expect(v).toContain('.pf-inputs {');
  });
});

describe('729 G94 渲染负锚（删除零误伤守卫，现状即守卫）', () => {
  it('页头壳/IndexPicker 输入框/编辑器在场 + 分析链四格/热力条/QRT 零回归', async () => {
    const host = await mountPf();
    expect(host.querySelector('.pf-hd'), '页头壳在场（PageHeader 容器）').toBeTruthy();
    expect(host.querySelector('.pf-inputs input'), 'IndexPicker 输入框在场（孤儿删的是手写输入修饰非组件）').toBeTruthy();
    expect(host.querySelector('.monaco-host'), 'JsonArea 编辑器在场').toBeTruthy();
    findRunBtn(host).click();
    await settle();
    const cells = Array.from(host.querySelectorAll('.pf-sum-cell')).map(c => (c.textContent || '').replace(/\s+/g, ''));
    expect(cells, '分析链零回归：四格精确读数（三分片球）').toEqual(['3参与分片', '13.80ms总耗时', '6.90ms最慢分片', '17热操作']);
    expect(host.querySelectorAll('.pf-heat-row').length, '热力条 3 行').toBe(3);
    expect((host.querySelector('.pf-heat-label')?.textContent || '').trim(), '降序首行=最慢分片').toBe('[pf-t][0]');
    expect(host.querySelectorAll('.pf-hot-qrt tbody tr').length, 'QRT 前 10 截断').toBe(10);
    expect(host.querySelector('.pf-flame'), '多分片不自动 focus').toBeNull();
    expect(searchDslFn).toHaveBeenCalledTimes(1);
  });
});
