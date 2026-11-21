/**
 * R130 一百七十九批：分析器上下文联动闭环（用户插队需求——
 * 「mapping/settings 里看到 analyzer/tokenizer/filter，想要一键验证分词效果」）。
 * 系统性矩阵：
 *   定义/引用（SettingsGrid analysis.* 行）──「试」钮/可点名字 ──▶ /analyze?idx&kind&name（预填+自动执行）
 *   字段级引用（MappingFieldTree attrs 名字）──可点名字 ─────────▶ /analyze（组件本体快验）
 *   字段级整体（text 字段行）────────「字段验证」钮 ──────▶ /analyzer-lab?idx&field=<path>
 *     （LabView 深链消费：loadFields→verifyField——真实样本+field/analyzer/search_analyzer
 *      三链路并排；嵌套/multi-field 路径整体交给 ES 的 field 参数解析，前端不拆）
 * 锁定：MappingFieldTree / SettingsGrid 的联动渲染与跳转参数；未传索引上下文零增量。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 惰性包装（T31）：factory 提升时 vi.fn 未初始化 */
const routeQuery: Record<string, string> = {};
const routerPush = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: routeQuery }),
  useRouter: () => ({ push: (...a: any[]) => routerPush(...a) }),
}));

const mappingDetailFn = vi.fn();
const analyzeTextFn = vi.fn();
const clusterQueryFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      analyzeText: (...a: any[]) => analyzeTextFn(...a),
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import MappingFieldTree from '../components/MappingFieldTree.vue';
import SettingsGrid from '../components/SettingsGrid.vue';
import { flattenMapping } from '../utils/mappingTree';

const PROPS: Record<string, any> = {
  title: { type: 'text', analyzer: 'ik_custom', search_analyzer: 'ik_smart' },
  issuer: { type: 'object', properties: { name: { type: 'text', analyzer: 'pinyin' } } },
};

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountComp(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  for (const k of Object.keys(routeQuery)) delete routeQuery[k];
  routerPush.mockClear();
  mappingDetailFn.mockReset();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('MappingFieldTree 分析器联动（一百七十九批）', () => {
  it('attrs 中分析器名渲染为可点名字；点击跳 /analyze 带索引/类型/名字', async () => {
    await mountComp(MappingFieldTree, { properties: PROPS, index: 'idx-a' });
    const links = [...host.querySelectorAll('.mft-attr-link')] as HTMLAnchorElement[];
    expect(links.length).toBeGreaterThanOrEqual(3); // title 2 + 嵌套 issuer.name 1（折叠集初始为空=全展开）
    expect(links.map(a => a.textContent?.trim())).toEqual(['ik_custom', 'ik_smart', 'pinyin']);
    links[0].click();
    await tick();
    expect(routerPush).toHaveBeenCalledWith({
      path: '/analyze',
      query: { idx: 'idx-a', kind: 'analyzer', name: 'ik_custom' },
    });
  });

  it('text 字段行「字段验证」钮跳 /analyzer-lab?idx&field=<完整嵌套路径>', async () => {
    await mountComp(MappingFieldTree, { properties: PROPS, index: 'idx-a' });
    const tryBtns = [...host.querySelectorAll('.mft-try')] as HTMLButtonElement[];
    expect(tryBtns.length).toBeGreaterThanOrEqual(1); // title（+嵌套需展开，顶层只验证可见行）
    tryBtns[0].click();
    await tick();
    expect(routerPush).toHaveBeenCalledWith({
      path: '/analyzer-lab',
      query: { idx: 'idx-a', field: 'title' },
    });
  });

  it('未传 index：名字仍可跳（无 idx 参数），不抛错', async () => {
    await mountComp(MappingFieldTree, { properties: PROPS });
    const links = [...host.querySelectorAll('.mft-attr-link')] as HTMLAnchorElement[];
    links[0]?.click();
    await tick();
    expect(routerPush).toHaveBeenCalledWith({ path: '/analyze', query: { kind: 'analyzer', name: 'ik_custom' } });
  });
});

describe('SettingsGrid 分析器联动（一百七十九批）', () => {
  const ROWS = [
    { k: 'index.analysis.analyzer.ik_custom.type', v: 'custom' },
    { k: 'index.analysis.analyzer.ik_custom.tokenizer', v: 'my_tok' },
    { k: 'index.analysis.filter.my_syn.rules', v: 'a, b' },
    { k: 'index.number_of_shards', v: '3' },
  ];

  it('定义行「试」钮：跳 /analyze 带 kind/name；引用行值拆可点名字', async () => {
    await mountComp(SettingsGrid, { rows: ROWS, stripPrefix: 'index.', analyzeIndex: 'idx-a' });
    const trys = [...host.querySelectorAll('.sg-try')] as HTMLButtonElement[];
    expect(trys.length).toBe(2); // .type 行（ik_custom）+ .rules 行（my_syn）；.tokenizer 引用行走值名字
    trys[0].click();
    await tick();
    expect(routerPush).toHaveBeenCalledWith({
      path: '/analyze',
      query: { idx: 'idx-a', kind: 'analyzer', name: 'ik_custom' },
    });
    /* 定义行第二钮：filter 定义 → kind=filter */
    trys[1].click();
    await tick();
    expect(routerPush).toHaveBeenCalledWith({
      path: '/analyze',
      query: { idx: 'idx-a', kind: 'filter', name: 'my_syn' },
    });
    /* 引用行：.tokenizer 值 my_tok → 可点名字 */
    const refs = [...host.querySelectorAll('.sg-analyze')] as HTMLAnchorElement[];
    expect(refs.map(a => a.textContent?.trim())).toContain('my_tok');
    refs.find(a => a.textContent?.trim() === 'my_tok')!.click();
    await tick();
    expect(routerPush).toHaveBeenCalledWith({
      path: '/analyze',
      query: { idx: 'idx-a', kind: 'tokenizer', name: 'my_tok' },
    });
    /* 非 analysis 行不受影响（number_of_shards 无联动） */
    expect(host.textContent).toContain('3');
  });

  it('未传 analyzeIndex：零增量（无「试」钮/无可点名字）', async () => {
    await mountComp(SettingsGrid, { rows: ROWS, stripPrefix: 'index.' });
    expect(host.querySelectorAll('.sg-try').length).toBe(0);
    expect(host.querySelectorAll('.sg-analyze').length).toBe(0);
  });
});

/* 自检防跑空：fixture 的 flattenMapping 必须产出带 analyzer attrs 的行 */
describe('联动 fixture 自检', () => {
  it('flattenMapping 产出 attrs 含 analyzer 键（防空跑假绿）', () => {
    const rows = flattenMapping(PROPS);
    expect(rows.some(r => r.attrs.includes('analyzer: ik_custom'))).toBe(true);
  });
});

async function tick() { for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); } }

describe('分词结果可读性（一百八十一批）', () => {
  const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
  it('列头中文主名（QRT 列名键）；词性代码转「中文 原代码」双写；未知代码原样', () => {
    const s = read('../views/AnalyzeView.vue');
    /* 五百二十九批锚同步更新：th 内 av-th-en 英文小字随 QRT 换壳退役——列头由列名键渲染，
       中文主名保真（AV_TOKEN_COLS 中文键），英文原文由 Markdown 复制表头/槽内原码延续 */
    expect(s).toMatch(/const AV_TOKEN_COLS = \['#', '词元', '序位', '字符区间', '词性', '长度'\]/);
    expect(s).toMatch(/const POS_ZH: Record<string, string>/);
    expect(s).toMatch(/nx: '外文词'/);
    expect(s).toMatch(/nt: '机构团体'/);
    expect(s).toMatch(/nz: '专有名词'/);
    expect(s).toMatch(/<ALPHANUM>': '字母数字'/);
    /* w 系细类归标点 */
    expect(s).toMatch(/t\.startsWith\('w'\)/);
    /* Markdown 复制表头同步中文化 */
    expect(s).toContain('| # | 词元 | 序位 | 字符区间 | 词性 |');
  });
});
