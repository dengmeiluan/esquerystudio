/**
 * 五百二十五批 W5b：SynonymsManagerView 三件套。
 *
 * ① 页内 IndexPicker 退役换只读 CurrentIdxChip（W1 件：无 props 自读 store、空不渲染）——
 *    选索引入口收敛 TopBar；useIdxState follow 档零改（index 跟随顶栏、watch 照常 doLoad）。
 * ② .sy-grid 1fr 1fr 等分 → 三列（--sy-left-w 11px 柄 + 右自适应），SplitHandle +
 *    usePref('synonyms.leftW')（TemplatesView 范式），窄屏柄隐堆叠。
 * ③ 行级 lint 4→9 规则（既有四类保留：无分隔符/左侧空/重复/超长；新增：中文标点、
 *    「=>」右侧空、空词元（连续或尾随逗号）、混用「,」与「=>」、词元保留字符 " [ ] ^ ~）；
 *    坏行走 setLineMarkers（owner 'es-syn-lint'）行号直射划线 + 统计条保留 + 下发禁用不回归。
 *
 * 驱动方式照 synonymsLint.spec（raw 走 useScopedDraft sessionStorage 键挂载前种稿）；
 * MonacoEditor stub 捕获 setLineMarkers 调用（真实 Monaco 在 happy-dom 不可断言 marker 面）；
 * CurrentIdxChip 保持真实（断言 .cic 渲染/未选索引不渲染，router 真装）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* MonacoEditor stub：捕获 setLineMarkers（记录到模块级数组），其余面最小化 */
const lineMarkerCalls: { markers: { line: number; message: string }[]; owner: string }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
    methods: {
      setLineMarkers(markers: { line: number; message: string }[], owner: string) {
        lineMarkerCalls.push({ markers, owner });
      },
    },
  },
}));

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  editor: { defineTheme: () => {}, create: () => ({}), setTheme: () => {}, setModelMarkers: () => {} },
  languages: {
    registerCompletionItemProvider: () => ({ dispose() {} }),
    register: () => {},
    setMonarchTokensProvider: () => {},
    setLanguageConfiguration: () => {},
    registerCodeActionProvider: () => ({ dispose() {} }),
    json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
  },
  Range: class {},
  KeyMod: {},
  KeyCode: {},
  MarkerSeverity: {},
}));
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

const analysisSettingsFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analysisSettings: (...a: any[]) => analysisSettingsFn(...a),
      synonymsUpsert: () => Promise.resolve({ ok: true, steps: [] }),
      reloadAnalyzers: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import SynonymsManagerView from '../views/SynonymsManagerView.vue';

const DRAFT_KEY = 'esquerystudio.draft2:synonyms:host:-:-:raw';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountSy() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(SynonymsManagerView as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findSendBtn(host: HTMLElement): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('下发 & 重载'));
  expect(btn, '「下发 & 重载」按钮必须存在').toBeTruthy();
  return btn!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  lineMarkerCalls.length = 0;
  localStorage.clear();
  sessionStorage.clear();
  /* idx 深链：带索引语境（follow 档 index 跟随顶栏，下发钮 !index 门可测） */
  history.replaceState(null, '', '#/?idx=idx_a');
  localStorage.setItem('es_picked', 'idx_a');
  analysisSettingsFn.mockReset().mockResolvedValue({ analysis: { filter: {} } });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('525 同义词规则行级 lint 4→9', () => {
  it('新增五类坏行全数点名：中文标点/=>右侧空/空词元/混用/保留字符（行号+原因）', async () => {
    sessionStorage.setItem(DRAFT_KEY, [
      '# 注释行不参与 lint',
      '中文标点, 测试：',
      'a =>',
      '连续,, 逗号',
      '混用, x => y',
      '词, 元"引[保]留^字~符',
    ].join('\n'));
    const host = await mountSy();
    const lint = host.querySelector('.sy-lint');
    expect(lint, '有坏行必须出现 lint 提示条（统计条旁）').toBeTruthy();
    expect(lint!.textContent).toContain('5 行有问题');
    expect(lint!.textContent).toContain('第 2 行');
    expect(lint!.textContent).toContain('含中文标点');
    expect(lint!.textContent).toContain('第 3 行');
    expect(lint!.textContent).toContain('「=>」右侧词元为空');
    expect(lint!.textContent).toContain('第 4 行');
    expect(lint!.textContent).toContain('空词元（连续或尾随逗号）');
    expect(lint!.textContent).toContain('第 5 行');
    expect(lint!.textContent).toContain('混用「,」与「=>」');
    expect(lint!.textContent).toContain('第 6 行');
    expect(lint!.textContent).toContain('保留字符');
    /* 统计条照常保留 */
    expect(host.querySelector('.sy-stat')!.textContent).toContain('已解析');
    /* 有坏行 = 下发禁用（既有闸不回归） */
    expect(findSendBtn(host).disabled).toBe(true);
  });

  it('坏行走 setLineMarkers（owner es-syn-lint）行号直射：badLines 行号与原因一一进 markers', async () => {
    sessionStorage.setItem(DRAFT_KEY, '好行, ok\n坏行无分隔符');
    const host = await mountSy();
    /* nextTick 包裹的 immediate：挂载即带坏行的草稿也必须划上（ref 就绪后补划） */
    const called = lineMarkerCalls.filter(c => c.owner === 'es-syn-lint');
    expect(called.length, '挂载后至少划一次').toBeGreaterThan(0);
    const last = called[called.length - 1];
    expect(last.markers).toEqual([{ line: 2, message: '既无「,」也无「=>」分隔符' }]);
    expect(host.querySelector('.sy-lint'), '统计条提示与划线并存').toBeTruthy();
  });

  it('既有四规则不回归：无分隔符/左侧空/重复/超长照旧点名', async () => {
    const longToken = 't'.repeat(81);
    sessionStorage.setItem(DRAFT_KEY, [
      '孤行无分隔符',
      ', 左侧空',
      '苹果 => apple',
      '苹果 => apple',
      'x => ' + longToken,
    ].join('\n'));
    const host = await mountSy();
    const lint = host.querySelector('.sy-lint');
    /* 5 行稿中 4 行坏（第 3 行「苹果 => apple」合法不报） */
    expect(lint!.textContent).toContain('4 行有问题');
    expect(lint!.textContent).toContain('既无「,」也无「=>」分隔符');
    expect(lint!.textContent).toContain('左侧词表为空');
    expect(lint!.textContent).toContain('与第 3 行重复');
    expect(lint!.textContent).toContain('超长词条');
  });

  it('合法输入零 lint + 划线零条 + 下发可用（不误报：短语内含=>字样的右侧词元不算混用噪音行）', async () => {
    sessionStorage.setItem(DRAFT_KEY, '# 只有注释\n\ncar => automobile\napple, banana, 苹果');
    const host = await mountSy();
    expect(host.querySelector('.sy-lint')).toBeNull();
    expect(findSendBtn(host).disabled).toBe(false);
    const calls = lineMarkerCalls.filter(c => c.owner === 'es-syn-lint');
    expect(calls[calls.length - 1].markers).toEqual([]);
  });
});

describe('525 CurrentIdxChip 换件 + SplitHandle 双栏（源码锁 + 渲染）', () => {
  it('源码锁：IndexPicker 退役换 CurrentIdxChip；SplitHandle+usePref(synonyms.leftW) 接线；CSS 三列+窄屏柄隐', () => {
    const v = readFileSync(join(__dirname, '../views/SynonymsManagerView.vue'), 'utf-8');
    expect(v).toContain('<CurrentIdxChip />');
    expect(v).not.toContain('<IndexPicker');
    expect(v).not.toContain("from '../components/IndexPicker.vue'");
    expect(v).toContain("import CurrentIdxChip from '../components/CurrentIdxChip.vue';");
    expect(v).toContain("usePref('synonyms.leftW', 0)");
    expect(v).toContain('<SplitHandle axis="vertical"');
    expect(v).toContain("'--sy-left-w'");
    expect(v).toContain("class=\"sy-split\"");
    expect(v).toContain('var(--sy-left-w, minmax(0, 1fr)) 11px minmax(0, 1fr)');
    expect(v).toMatch(/@media \(max-width: 1100px\) \{[\s\S]*\.sy-split \{ display: none; \}/);
    /* setLineMarkers 接线 + owner 契约 */
    expect(v).toContain("'es-syn-lint'");
    expect(v).toContain('setLineMarkers?.(');
  });

  it('渲染：已选索引出 .cic chip（自读 store）；未选索引 chip 不渲染（页内空态兜底）', async () => {
    const host = await mountSy();
    const chip = host.querySelector('.cic');
    expect(chip, '带 ?idx= 深链进页必须渲染 CurrentIdxChip').toBeTruthy();
    expect(chip!.querySelector('.cic-nm')!.textContent).toBe('idx_a');
    expect(host.querySelector('.ixp-inp'), '页内不再有可写 IndexPicker').toBeNull();
    apps.forEach(a => a.unmount()); apps.length = 0;
    document.body.innerHTML = '';
    history.replaceState(null, '', '#/');
    localStorage.removeItem('es_picked');
    const host2 = await mountSy();
    expect(host2.querySelector('.cic'), '未选索引整件不渲染（根 v-if）').toBeNull();
  });
});
