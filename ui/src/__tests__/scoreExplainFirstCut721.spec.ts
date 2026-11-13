/**
 * 七百二十一批：ScoreExplain 首刀两件套+随刀（R102；R101 裁决表头号 G72+G74，G73 随刀）。
 *
 * ① G74（P3 铁律 F）MetaStrip max_score 段中文备注——「任何英文参数必须有中文备注」：
 *    R101 读数「3 命中·3 展示·0.913 max_score」末段英文裸 label 悬停零备注，
 *    修法=tip「最高相关度得分」（715 G55/717 G60 同族；tip 走 :title 悬停通道，
 *    MetaStrip help 档 cursor:help，备注不进可见文本）。
 * ② G72（P3 死代码）五类死样式规则清（713 G53/714 G56/715 G56/717 G61/719 G67 同族；
 *    R101 D9 通杀扫描 43 条 se-* 规则 0 命中 13、人工剔除条件渲染/伪类=真死 5 类）：
 *    页头合并遗留的左组/图标色/右钮组修饰（含 900 档换行变体）+IndexPicker 退役
 *    伴漏的输入框孤儿+_source 旧 pre 形态修饰（JsonTree 渲染 .jtree 非 pre）；
 *    活锚 .se-hd（页头壳）/.se-src+.se-src summary（_source 折叠）/.se-hit-hd 900 档保留。
 * ③ G73（P3 随刀增强）执行钮 Play 图标 spinning 绑 busy（713 G51/717 G62/719 G66
 *    spinner 语义同族；busy 守卫+文本改用「执行中…」既有，spinning 补齐在途旋转语言）。
 *
 * 驱动方式照 dslValueWire661（monaco ESM 全 stub + api mock 挂载冒烟）+
 * synonymsFirstCut719（行为在途窗双读 + 源码锁 + 渲染负锚三段式）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub（661 spec 同范式：JsonArea 真挂载、注册面最小桩） */
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

const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchRaw: (...a: any[]) => searchRawFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: { status: { type: 'keyword' } } } }),
    },
  };
});

import ScoreExplainView from '../views/ScoreExplainView.vue';

/* 执行成功应答：首 hit 全形态（matched_queries+_explanation+_source）、次 hit 最小形态 */
const SEARCH_OK = {
  took: 12,
  hits: {
    total: { value: 2, relation: 'eq' },
    max_score: 0.913,
    hits: [
      { _id: 'se-a', _score: 0.913, matched_queries: ['main-match'], _explanation: { value: 0.913, description: 'sum of:', details: [] }, _source: { title: '文档甲' } },
      { _id: 'se-b', _score: 0.4, _source: { status: 1 } },
    ],
  },
};

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountSe() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(ScoreExplainView as any) });
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
    .find(b => b.textContent?.includes('执行解剖') || b.textContent?.includes('执行中'));
  expect(btn, '「执行解剖」按钮必须存在（页头 actions）').toBeTruthy();
  return btn!;
}

async function runOk(host: HTMLElement) {
  searchRawFn.mockResolvedValueOnce(SEARCH_OK);
  findRunBtn(host).click();
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  /* idx 深链：带索引语境（run 的 !index 门恒过；useUrlState init 读真 hash） */
  history.replaceState(null, '', '#/?idx=idx_se');
  localStorage.setItem('es_picked', 'idx_se');
  searchRawFn.mockReset().mockResolvedValue(SEARCH_OK);
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('721 G74 max_score 中文备注（铁律 F）', () => {
  it('执行后 max_score 段悬停可达：title=最高相关度得分 + help 档；命中段对照无 tip', async () => {
    const host = await mountSe();
    await runOk(host);
    const items = Array.from(host.querySelectorAll<HTMLElement>('.se-meta .ms-i'));
    const maxItem = items.find(el => el.textContent?.includes('max_score'));
    expect(maxItem, 'max_score 段必须在场（执行成功后统计条渲染）').toBeTruthy();
    expect(maxItem!.getAttribute('title'), 'G74 病灶：max_score 英文裸 label 无中文备注').toBe('最高相关度得分');
    expect(maxItem!.classList.contains('help'), 'tip 段挂 MetaStrip help 档（cursor:help）').toBe(true);
    const hitItem = items.find(el => el.textContent?.includes('命中'));
    expect(hitItem, '命中段在场（对照组）').toBeTruthy();
    expect(hitItem!.getAttribute('title'), '对照段（中文 label）不挂 tip').toBeNull();
  });

  it('备注不进可见文本 + 数值在场：纯 title 通道，统计条渲染链零回归', async () => {
    const host = await mountSe();
    await runOk(host);
    const maxItem = Array.from(host.querySelectorAll<HTMLElement>('.se-meta .ms-i'))
      .find(el => el.textContent?.includes('max_score'));
    expect(maxItem!.textContent).toContain('0.913');
    expect(maxItem!.textContent, '备注走 title 通道不进可见文本').not.toContain('最高相关度得分');
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(searchRawFn.mock.calls[0][0], '深链索引上行').toBe('idx_se');
  });
});

describe('721 G73 执行钮在途 spinning（随刀增强，713 G51/717 G62/719 G66 同族）', () => {
  it('在途窗双读：disabled=true + Play 图标 spinning + 文本改用「执行中…」；完成复常双 false', async () => {
    let release: (() => void) | null = null;
    searchRawFn.mockImplementation(() => new Promise<any>(res => { release = () => res(SEARCH_OK); }));
    const host = await mountSe();
    const btn = findRunBtn(host);
    expect(btn.disabled, '起手未在途不禁用').toBe(false);
    btn.click();
    await settle(4);
    expect(searchRawFn, '点击即触发一次 search-raw').toHaveBeenCalledTimes(1);
    expect(btn.disabled, 'busy 守卫既有（R101 读数）').toBe(true);
    expect(btn.querySelector('.spinning'), 'G73：在途窗 Play 零 spinning').toBeTruthy();
    expect(btn.textContent).toContain('执行中…');
    release!();
    await settle();
    expect(btn.disabled, '完成复常').toBe(false);
    expect(btn.querySelector('.spinning')).toBeNull();
    expect(btn.textContent).toContain('执行解剖');
  });
});

describe('721 源码锁', () => {
  it('G73+G74 字面锁：Play spinning 绑 busy + max_score tip 字面', () => {
    const v = readFileSync(join(__dirname, '../views/ScoreExplainView.vue'), 'utf-8');
    expect(v).toContain('<Play :size="12" :class="{ spinning: busy }" />');
    expect(v).toContain("label: 'max_score', tip: '最高相关度得分' }");
  });

  it('G72 源码锁：五类死规则零残留（含 900 档变体）+ 活锚保留', () => {
    const v = readFileSync(join(__dirname, '../views/ScoreExplainView.vue'), 'utf-8');
    /* 页头合并遗留三族（左组/图标色/右钮组；活锚 .se-hd 不在锁面） */
    expect(v).not.toMatch(/\.se-hd-l\b/);
    expect(v).not.toMatch(/\.se-hd-ic\b/);
    expect(v, '基础+900 档换行变体双形态一并清零').not.toMatch(/\.se-hd-r\b/);
    /* IndexPicker 退役伴漏的输入框孤儿 */
    expect(v).not.toMatch(/\.se-ii\b/);
    /* _source 旧 pre 形态修饰（JsonTree 渲染 .jtree 非 pre；活锚 .se-src/.se-src summary 不在锁面） */
    expect(v).not.toMatch(/\.se-src pre\b/);
    /* 活锚三件+900 档活规则 */
    expect(v).toContain('.se-hd {');
    expect(v).toContain('.se-src {');
    expect(v).toContain('.se-src summary {');
    expect(v).toContain('.se-hit-hd { flex-wrap: wrap; }');
  });
});

describe('721 G72 渲染负锚（删除零误伤守卫）', () => {
  it('页头壳/编辑器/统计条/_source 折叠结构不变；旧 pre 形态 DOM 零', async () => {
    const host = await mountSe();
    expect(host.querySelector('.se-hd'), '页头壳在场（PageHeader 容器）').toBeTruthy();
    expect(host.querySelector('.monaco-host'), 'JsonArea 编辑器在场').toBeTruthy();
    await runOk(host);
    expect(host.querySelectorAll('.se-hit').length, '两 hit 渲染（执行链零回归）').toBe(2);
    expect(host.querySelector('.se-src summary'), '_source 折叠活锚在场（首 hit 自动展开）').toBeTruthy();
    expect(host.querySelector('.se-src pre'), 'JsonTree 渲染 .jtree 非 pre——旧 pre 形态 DOM 零').toBeNull();
    expect(host.querySelector('.se-src .jtree')).toBeTruthy();
  });
});
