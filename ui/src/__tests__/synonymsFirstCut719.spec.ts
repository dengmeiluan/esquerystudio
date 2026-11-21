/**
 * 七百一十九批：SynonymsManager 首刀两件套（R100；R99 裁决表头号 G66+G67）。
 *
 * ① G66（P3 真交互语义）热重载在途守卫——doReload 起手 busy=true + finally 复位
 *    （713 G51/717 G62 spinner 语义同族）：修「单独点热重载在途窗 disabled=false+
 *    零 spinning、连点可重复触发 reload-analyzers」（R99 D6 读数铁证：同页加载钮
 *    同窗双 true 对照=两钮语义不对称）；热重载钮 Zap 图标补 spinning 绑 busy
 *    （BulkEditor Send 图标 spinning 先例——非刷新图标在途旋转全站既有语言）。
 * ② G67（P3 死代码）六条死样式规则清——PageHeader 合并后遗留的页头左组标题后缀族
 *    四条 + 表单壳合并后遗留的表单行修饰两条（713 G53/714 G56/715 G56/717 G61 同族；
 *    R99 D9 通杀扫描 44 条 sy-* 规则 0 命中 9 条、人工剔除伪元素/伪类/条件渲染 3 条
 *    =真死 6）；活锚 .sy-hd（外距）/ .sy-hd-r（预览卡头钮组）/ .sy-ii（输入框）保留。
 *
 * 驱动方式照 synonyms525.spec（useScopedDraft 键挂载前种稿可选；MonacoEditor stub；
 * idx 深链 beforeEach 形态；reload 慢窗=deferred promise 手动放行）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* MonacoEditor stub：不划线面，最小化桩（Monaco 真实件在 happy-dom 不可挂） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute'],
    template: '<div class="monaco-stub"></div>',
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
const synonymsUpsertFn = vi.fn();
const reloadAnalyzersFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analysisSettings: (...a: any[]) => analysisSettingsFn(...a),
      synonymsUpsert: (...a: any[]) => synonymsUpsertFn(...a),
      reloadAnalyzers: (...a: any[]) => reloadAnalyzersFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

/* 下发链走 askConfirm 直通（确认弹层壳另有 525/rawioWave561 家族覆盖，只验 busy 链） */
vi.mock('../composables/confirm', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../composables/confirm')>();
  return { ...actual, askConfirm: () => Promise.resolve(true) };
});

import SynonymsManagerView from '../views/SynonymsManagerView.vue';

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

function findReloadBtn(host: HTMLElement): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('热重载') && !b.textContent.includes('下发'));
  expect(btn, '「热重载」按钮必须存在（canOps 钮组）').toBeTruthy();
  return btn!;
}

function findSendBtn(host: HTMLElement): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('下发 & 重载'));
  expect(btn, '「下发 & 重载」按钮必须存在').toBeTruthy();
  return btn!;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  /* idx 深链：带索引语境（热重载/下发 !index 门恒过） */
  history.replaceState(null, '', '#/?idx=idx_a');
  localStorage.setItem('es_picked', 'idx_a');
  analysisSettingsFn.mockReset().mockResolvedValue({ analysis: { filter: {} } });
  synonymsUpsertFn.mockReset().mockResolvedValue({ ok: true, steps: ['close 索引', 'PUT settings', 'open 索引'] });
  reloadAnalyzersFn.mockReset().mockResolvedValue({});
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('719 G66 热重载在途守卫（doReload busy 管理）', () => {
  it('在途窗双读：热重载钮 disabled=true + 图标 spinning；完成复常双 false', async () => {
    let release: (() => void) | null = null;
    reloadAnalyzersFn.mockImplementation(() => new Promise<any>(res => { release = () => res({}); }));
    const host = await mountSy();
    const btn = findReloadBtn(host);
    expect(btn.disabled, '起手未在途不禁用').toBe(false);
    btn.click();
    await settle(4);
    expect(reloadAnalyzersFn, '点击即触发一次 reload-analyzers').toHaveBeenCalledTimes(1);
    expect(btn.disabled, 'G66 病灶：在途窗 disabled=false（doReload 不置 busy）').toBe(true);
    expect(btn.querySelector('.spinning'), 'G66 病灶：在途窗图标零 spinning').toBeTruthy();
    release!();
    await settle();
    expect(btn.disabled, '完成复常').toBe(false);
    expect(btn.querySelector('.spinning')).toBeNull();
  });

  it('连点守卫：在途窗内二次点击不重复触发 reload-analyzers', async () => {
    let release: (() => void) | null = null;
    reloadAnalyzersFn.mockImplementation(() => new Promise<any>(res => { release = () => res({}); }));
    const host = await mountSy();
    const btn = findReloadBtn(host);
    btn.click();
    await settle(4);
    expect(btn.disabled, '首点后按钮应即禁用').toBe(true);
    btn.click(); /* 在途窗内连点（happy-dom 对 disabled 钮不派发 click） */
    await settle(4);
    expect(reloadAnalyzersFn, 'G66 病灶：连点重复触发 reload-analyzers').toHaveBeenCalledTimes(1);
    release!();
    await settle();
    expect(reloadAnalyzersFn).toHaveBeenCalledTimes(1);
  });

  it('下发链零回归：doSave 成功自动热重载，upsert/reload 双命中且 busy 复常', async () => {
    /* 前置态先验（709-C1）：默认示例稿含「=> 与 , 混用」坏行会禁用下发——种干净草稿 */
    sessionStorage.setItem('esquerystudio.draft2:synonyms:host:-:-:raw', 'elasticsearch, es');
    const host = await mountSy();
    const send = findSendBtn(host);
    expect(send.disabled, '默认示例稿有合法行=可下发').toBe(false);
    send.click();
    await settle();
    expect(synonymsUpsertFn).toHaveBeenCalledTimes(1);
    expect(reloadAnalyzersFn, 'doSave 成功自动热重载链保持').toHaveBeenCalledTimes(1);
    expect(findReloadBtn(host).disabled, '链完成后 busy 复常').toBe(false);
  });
});

describe('719 G66/G67 源码锁', () => {
  it('G66 源码锁：doReload 函数体起手 busy=true + finally 复位；Zap 图标 spinning 绑 busy', () => {
    const v = readFileSync(join(__dirname, '../views/SynonymsManagerView.vue'), 'utf-8');
    const fn = v.match(/async function doReload\(\)[\s\S]*?\n\}/);
    expect(fn, 'doReload 函数体必须可定位').toBeTruthy();
    expect(fn![0]).toContain('busy.value = true;');
    expect(fn![0]).toMatch(/finally\s*\{\s*busy\.value = false;\s*\}/);
    expect(v).toContain('<Zap :size="12" :class="{ spinning: busy }" />');
  });

  it('G67 源码锁：六死规则零残留 + 活锚 .sy-hd/.sy-hd-r/.sy-ii 保留', () => {
    const v = readFileSync(join(__dirname, '../views/SynonymsManagerView.vue'), 'utf-8');
    /* 页头左组标题后缀族四条（-l/-ic/-tt/-sub；活锚 -r 不在锁面） */
    expect(v).not.toMatch(/\.sy-hd-(l|ic|tt|sub)\b/);
    /* 表单行修饰两条（裸类+子选择器） */
    expect(v).not.toMatch(/\.sy-inp\b/);
    /* 活锚三件保留（.sy-hd 外距锚/.sy-hd-r 预览卡头钮组/.sy-ii 输入框） */
    expect(v).toContain('.sy-hd {');
    expect(v).toContain('.sy-hd-r {');
    expect(v).toContain('.sy-ii {');
  });

  it('渲染负锚：删除后页头壳与预览卡头钮组结构不变（守卫删除零误伤）', async () => {
    const host = await mountSy();
    expect(host.querySelector('.sy-hd'), '页头壳在场（PageHeader 容器）').toBeTruthy();
    const r = host.querySelector('.sy-hd-r');
    expect(r, '预览卡头钮组在场').toBeTruthy();
    expect(r!.querySelectorAll('button').length, '热重载+下发两钮').toBe(2);
    expect(host.querySelector('input.sy-ii'), 'filter 名输入框在场').toBeTruthy();
  });
});
