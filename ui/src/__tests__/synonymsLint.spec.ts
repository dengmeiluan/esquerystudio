/**
 * 五百二十四批+1：同义词字典规则行级 lint（SynonymsManagerView）。
 *
 * 契约：
 * ① 坏行四类硬错：无「,」无「=>」、左侧词表为空、整行重复、超长 token（>80 字符）——
 *    坏行列表（行号 1 基 + 原因）显示在统计条旁 warn 档（.sy-lint）；
 * ② 有坏行（或 filter 名非法）时「下发 & 重载」禁用，title 说明原因；
 * ③ filter 名校验：仅小写字母/数字/下划线，非法即红字（.sy-lint-err）+ 下发禁用；
 * ④ 全合法输入零 lint 提示、下发可用（有索引语境时）。
 *
 * 驱动方式：raw 走 useScopedDraft sessionStorage 键（esquerystudio.draft2:synonyms:host:-:-:raw）
 * 挂载前种稿；filterName 是真实 <input v-model>——value+dispatchEvent(input) 驱动。
 * 设施同 dslAssistPenetration：monaco stub + api 出口 mock。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

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
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Value: 13 },
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
  expect(btn, '「下发 & 重载」按钮必须存在（me=null 未鉴权部署全放行）').toBeTruthy();
  return btn!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  /* idx 深链：下发钮的 :disabled 含 !index 门——带索引语境才测得到坏行/filter 名两道闸 */
  history.replaceState(null, '', '#/?idx=idx_a');
  analysisSettingsFn.mockReset().mockResolvedValue({ analysis: { filter: {} } });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('同义词规则行级 lint（524+1 批）', () => {
  it('① 四类坏行全数点名：无分隔符/左侧空/重复/超长（行号+原因，warn 档）', async () => {
    const longToken = 't'.repeat(81);
    sessionStorage.setItem(DRAFT_KEY, [
      '# 注释行不参与 lint',
      'elasticsearch, es',
      '孤行无分隔符',
      ', 左侧空',
      '苹果 => apple',
      '苹果 => apple',
      'x => ' + longToken,
    ].join('\n'));
    const host = await mountSy();
    const lint = host.querySelector('.sy-lint');
    expect(lint, '有坏行必须出现 lint 提示条（统计条旁）').toBeTruthy();
    expect(lint!.textContent).toContain('4 行有问题');
    expect(lint!.textContent).toContain('第 3 行');
    expect(lint!.textContent).toContain('既无「,」也无「=>」分隔符');
    expect(lint!.textContent).toContain('第 4 行');
    expect(lint!.textContent).toContain('左侧词表为空');
    expect(lint!.textContent).toContain('第 6 行');
    expect(lint!.textContent).toContain('与第 5 行重复');
    expect(lint!.textContent).toContain('第 7 行');
    expect(lint!.textContent).toContain('超长词条');
    /* 统计条照常计数：解析 5 条（7 行 - 注释 - 重复行仍在 parsed，重复不剔除） */
    expect(host.querySelector('.sy-stat')!.textContent).toContain('已解析');
  });

  it('② 有坏行时「下发」禁用且 title 说明原因', async () => {
    sessionStorage.setItem(DRAFT_KEY, '坏行无分隔符\n好行, ok');
    const host = await mountSy();
    const btn = findSendBtn(host);
    expect(btn.disabled, '坏行必须禁用下发（close→PUT→open 失败会让索引停在关闭态）').toBe(true);
    expect(btn.title).toContain('无法解析的规则行');
  });

  it('③ filter 名非法（大写/非法字符）红字 + 下发禁用；合法后恢复', async () => {
    sessionStorage.setItem(DRAFT_KEY, 'a, b');
    const host = await mountSy();
    const inp = host.querySelector<HTMLInputElement>('input.sy-ii');
    expect(inp, 'filter 名输入框必须存在').toBeTruthy();
    /* 初始默认 custom_synonyms 合法：无红字、无 lint、下发可用 */
    expect(host.querySelector('.sy-lint-err')).toBeNull();
    expect(host.querySelector('.sy-lint')).toBeNull();
    expect(findSendBtn(host).disabled).toBe(false);
    /* 大写+非法字符 → 红字 + 禁用 + title 原因（v-model 靠 input 事件流转） */
    inp!.value = 'My-Filter!';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    const err = host.querySelector('.sy-lint-err');
    expect(err, '非法 filter 名必须出红字').toBeTruthy();
    expect(err!.textContent).toContain('仅允许小写字母、数字、下划线');
    const btn = findSendBtn(host);
    expect(btn.disabled).toBe(true);
    expect(btn.title).toContain('仅允许小写字母');
    /* 修成合法 → 红字熄、禁用解除（真实流转，非同值赋值） */
    inp!.value = 'my_filter_2';
    inp!.dispatchEvent(new Event('input'));
    await settle();
    expect(host.querySelector('.sy-lint-err')).toBeNull();
    expect(findSendBtn(host).disabled).toBe(false);
  });

  it('④ 合法输入零 lint 提示（空词典/注释行/正常规则）', async () => {
    /* 五百二十五批同步更新：原稿 'car, auto => automobile' 撞新规则「混用「,」与「=>」」——
       9 规则口径下该形态非法，合法样例改用单向替换与等价清单两行 */
    sessionStorage.setItem(DRAFT_KEY, '# 只有注释\n\ncar => automobile\napple, banana');
    const host = await mountSy();
    expect(host.querySelector('.sy-lint')).toBeNull();
    expect(findSendBtn(host).disabled).toBe(false);
  });
});
