/**
 * 七百六十四批：AnalysisSettings 首刀三刀（R144；⑥763 头号建议落地=R143 裁决表
 * G227+G230+G229；741 G148/743 G152/745/747/749/751/753/755/757/760/762 首刀族
 * 同构；本页首例真挂载首刀后 spec——视图/组件全真，只 mock ../api 出口+Monaco
 * 边界（analysisSettingsAssistW3b 同源 mock 形态，深链走 hash 域 readHashQuery）。
 *
 * ① G227（P3 死代码·头号）.as-hd-l/-ic/-tt/-sub/-r/.as-ii 六死规则（PageHeader
 *    合并漏删族+IndexPicker 退役伴漏删，713 G53/715 G56/717 G61/721 G72/727 G86/
 *    729 G94/737 G131/741 G147/761 G220 同族）——修法=纯删零连锁；.as-hd 基础规则
 *    与 .as-hd-ic2.lv-* 五活规则不动。547 批 smallScreenFloor547 ④ .as-ii min()
 *    锁同步更新（负向锚：死类不回潮）。
 * ② G230（P3 一致性·次刀）filterKw 裸 ref 无草稿（SearchFilterBar 24 消费面 21
 *    已接/3 面裸=少数派）——修法=一行接 useScopedDraft 同主流形态，按索引作用域
 *    （Mapping indices-mapping 同款）防 A 索引过滤词串到 B。
 * ③ G229（弱 P3 aria·随批可裁）.as-groups 容器+.as-card-raw 卡无 role/aria-label
 *    （757 G210/761 G224 族）——修法=role=group+中文 aria-label。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/analysis-settings', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

/* MonacoEditor stub：JsonArea 内层编辑器边界（W3b 同款；刀面不触 dsl-assist） */
vi.mock('../components/MonacoEditor.vue', async () => {
  const { defineComponent: dc } = await import('vue');
  return {
    default: dc({
      props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
      emits: ['update:modelValue', 'execute'],
      setup() {
        return () => h('div', { class: 'monaco-host' });
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
      analysisUpdate: () => Promise.resolve({}),
      reloadAnalyzers: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import AnalysisSettingsView from '../views/AnalysisSettingsView.vue';

const src = readFileSync(join(__dirname, '../views/AnalysisSettingsView.vue'), 'utf-8');

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

/* main 桶：五类 7 项全形态（analyzer 2/tokenizer 1/filter 2 含 synonym/char_filter 1/normalizer 1）
   ——五卡全在场；kw=syn 命中 my_syn 单条（名含 syn）→ filter 卡 1 条、其余空分组整卡隐藏 */
const MAIN_764 = { analysis: {
  analyzer: { my_std: { type: 'pattern' }, my_kw: { type: 'keyword' } },
  tokenizer: { my_tk: { type: 'edge_ngram' } },
  filter: { my_stop: { type: 'stop' }, my_syn: { type: 'synonym', synonyms: ['好 => 佳'] } },
  char_filter: { my_map: { type: 'mapping' } },
  normalizer: { my_lc: { type: 'custom' } },
} };

async function mountView() {
  const app = createApp({ render: () => h(AnalysisSettingsView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

async function loadMain(host: HTMLElement) {
  const loadBtn = [...host.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('加载'));
  expect(loadBtn, '「加载」按钮在位').toBeTruthy();
  loadBtn!.click();
  await settle();
}

function kwInput(host: ParentNode): HTMLInputElement {
  const el = host.querySelector<HTMLInputElement>('.as-filter-ipt');
  expect(el, '过滤输入框在场').toBeTruthy();
  return el!;
}
async function setKw(host: ParentNode, v: string) {
  const el = kwInput(host);
  el.value = v;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  analysisSettingsFn.mockReset().mockResolvedValue(MAIN_764);
  history.replaceState(null, '', '#/?idx=logs-x');
});
afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
  history.replaceState(null, '', '#/');
});

describe('764 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('加载链：五卡在场+MetaStrip 五段+原始 JSON 卡+五类计数串', async () => {
    const host = await mountView();
    await loadMain(host);
    expect(analysisSettingsFn).toHaveBeenCalledWith('logs-x');
    expect(host.querySelectorAll('.as-card:not(.as-card-raw)').length).toBe(5);
    const segs = host.querySelectorAll('.as-meta .ms-i');
    expect(segs.length).toBe(5);
    /* toast 文本走 naive teleport 到 body（759 课①）：页面域锚改五类计数串（2/1/2/1/1） */
    expect(host.textContent).toContain('2 analyzer');
    expect(host.textContent).toContain('1 tokenizer');
    expect(host.textContent).toContain('2 filter');
    expect(host.textContent).toContain('1 char_filter');
    expect(host.textContent).toContain('1 normalizer');
    expect(host.querySelector('.as-card-raw'), '原始 JSON 编辑卡在场').toBeTruthy();
  });
});

describe('764 G227 六死规则整删（死代码·头号·PageHeader 合并漏删族+IndexPicker 退役伴漏删）', () => {
  it('源码锁：.as-hd-l/-ic/-tt/-sub/-r/.as-ii 六类名 scoped 绝迹（模板本就零引用）', () => {
    expect(src, '.as-hd-l 死规则须删').not.toMatch(/\.as-hd-l\b/);
    expect(src, '.as-hd-ic 死规则须删（-ic2 活锚不受扰，负向锚收词界）').not.toMatch(/\.as-hd-ic\s*\{/);
    expect(src, '.as-hd-tt 死规则须删').not.toMatch(/\.as-hd-tt\b/);
    expect(src, '.as-hd-sub 死规则须删').not.toMatch(/\.as-hd-sub\b/);
    expect(src, '.as-hd-r 死规则须删').not.toMatch(/\.as-hd-r\b/);
    expect(src, '.as-ii 死规则须删（IndexPicker 退役伴漏删）').not.toMatch(/\.as-ii\b/);
  });
  it('活规则不受扰：.as-hd 基础规则+.as-hd-ic2.lv-* 五色档在场', () => {
    expect(src).toMatch(/\.as-hd \{ display: flex; align-items: center; justify-content: space-between;/);
    expect(src).toMatch(/\.as-hd-ic2\.lv-analyzer\s*\{/);
    expect(src).toMatch(/\.as-hd-ic2\.lv-normalizer\s*\{/);
  });
});

describe('764 G230 过滤词接 useScopedDraft（一致性·次刀·21 面主流形态归一）', () => {
  it('源码锁：filterKw 接 useScopedDraft 按索引作用域，裸 ref 形态绝迹', () => {
    expect(src, '裸 ref 须退役').not.toMatch(/const filterKw = ref\(''\);/);
    expect(src, 'useScopedDraft 接线须在场（route=analysis-settings+index 维度）')
      .toMatch(/const filterKw = useScopedDraft\('filter', \{ route: 'analysis-settings', index: \(\) => index\.value\.trim\(\) \}, ''\)\.text;/);
  });
  it('行为实锚：kw 输入落 sessionStorage 草稿（按索引作用域）、不进 hash、过滤生效', async () => {
    const host = await mountView();
    await loadMain(host);
    await setKw(host, 'syn');
    /* 键前缀=esquerystudio.draft2（useScopedDraft PREFIX），startsWith 须带全前缀 */
    const draftKeys = Object.keys(sessionStorage).filter(k => k.startsWith('esquerystudio.draft2:analysis-settings:') && k.endsWith(':filter'));
    expect(draftKeys.length, '草稿键在场（useScopedDraft sessionStorage 通道）').toBeGreaterThan(0);
    expect(draftKeys[0], '按索引作用域（A 索引过滤词不串 B）').toContain('logs-x');
    expect(sessionStorage.getItem(draftKeys[0])).toBe('syn');
    expect(location.hash, 'kw 不进 URL').not.toContain('kw');
    expect(host.querySelectorAll('.as-card:not(.as-card-raw)').length, 'syn 单命中 → 其余空分组整卡隐藏').toBe(1);
    /* 「命中 N / 共 M」走 .as-count :title（763 probe 同锚），非 textContent */
    expect(host.querySelector('.as-count')!.getAttribute('title')).toBe('命中 1 / 共 2');
  });
  it('行为守卫：过滤链语义零改（清除恢复五卡）', async () => {
    const host = await mountView();
    await loadMain(host);
    await setKw(host, 'syn');
    await setKw(host, '');
    expect(host.querySelectorAll('.as-card:not(.as-card-raw)').length).toBe(5);
  });
});

describe('764 G229 容器 aria（757 G210/761 G224 族·随批可裁）', () => {
  it('挂载实锚：.as-groups role=group+中文 aria-label', async () => {
    const host = await mountView();
    await loadMain(host);
    const groups = host.querySelector('.as-groups');
    expect(groups, '.as-groups 容器在场').toBeTruthy();
    expect(groups!.getAttribute('role')).toBe('group');
    expect(groups!.getAttribute('aria-label')).toContain('分析组件');
  });
  it('挂载实锚：.as-card-raw role=group+中文 aria-label（含 settings 术语）', async () => {
    const host = await mountView();
    await loadMain(host);
    const raw = host.querySelector('.as-card-raw');
    expect(raw, '原始 JSON 编辑卡在场').toBeTruthy();
    expect(raw!.getAttribute('role')).toBe('group');
    expect(raw!.getAttribute('aria-label')).toContain('settings');
    expect(raw!.getAttribute('aria-label')).toContain('编辑');
  });
});
