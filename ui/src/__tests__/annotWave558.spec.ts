/**
 * 五百五十八批工蚁B（轨1 高亮切分收口）annotWave558：
 *  A MappingFieldTree hlSegs 手写 while 切分退役（全站第四份纯文本切分收口
 *    useGridSearch.splitMark 单源，JsonTree renderHl 557 批先例）：源码锁（import/
 *    消费/旧循环退役）+ 挂载行为（模板消费点 {t,hit} 保形，字面高亮零漂移）；
 *  B IndexOptionRow v-html 注入面退役：esc()+<mark> 串接只标首处（indexOf 单点）
 *    → splitMark 分段渲染 v-for（多命中全标），v-html/esc 双退役源码锁 + 挂载多 mark；
 *  C sqlCompletion 三小件：① IN 列表第 2+ 项裸字面量形态（数值列 `IN (1, 2␣` 尾项
 *    零候选根治；已完成项剥净校验同步扩——子查询/字母裸词不进支路）；②
 *    VAL_FORMAT_HINTS version 档（'1.0.0' 形态，545 表锁同范式）；③ 值位候选
 *    「精确前缀命中置顶」（服务端 doc_count 序保底，非精确项相对序零漂移）。
 *
 * stub 范式：A 挂载照 analyzerLink（vue-router mock + pinia）；B 挂载照
 * hintWave557 D 段（createApp 直挂 happy-dom）；C 照 hintWave557 C 段（monaco
 * 最小 fake + pinia + api spy）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';

/* 惰性包装（T31）：factory 提升时 vi.fn 未初始化（analyzerLink 同款） */
const routerPush = vi.fn();
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: (...a: any[]) => routerPush(...a) }),
}));

import MappingFieldTree from '../components/MappingFieldTree.vue';
import IndexOptionRow from '../components/IndexOptionRow.vue';
import { ensureSqlCompletion, VAL_FORMAT_HINTS, type SqlCompletionCtx } from '../utils/sqlCompletion';
import { api } from '../api';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
async function mountComp(comp: any, props: Record<string, any>) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  await nextTick();
  apps.push(app);
  return host;
}
afterEach(() => {
  for (const a of apps.splice(0).reverse()) a.unmount();
  document.body.innerHTML = '';
});

/* ═══ A：MappingFieldTree hlSegs 收口 splitMark 单源 ═══ */
describe('558 A：MappingFieldTree hlSegs 收口（全站第四份手写切分退役）', () => {
  it('源码锁：splitMark 单源 import+消费，手写 indexOf 切分循环退役，模板消费点保形', () => {
    const v = read('components/MappingFieldTree.vue');
    expect(v, '切分收口 useGridSearch.splitMark 单源').toContain("import { splitMark } from '../composables/useGridSearch';");
    expect(v).toMatch(/splitMark\(name,\s*k\)/);
    expect(v, '手写 indexOf 切分循环退役').not.toMatch(/indexOf\(k, i/);
    expect(v, '模板消费点保形：hlSegs(f.name) 照旧').toContain('hlSegs(f.name)');
    expect(v, '返回结构保形：{t,hit}（模板 seg.hit 分支不变）').toContain('seg.hit');
  });

  it('挂载行为：搜索态字段名命中 <mark> 渲染零漂移（大小写不敏感、原文大小写入 mark）', async () => {
    const host = await mountComp(MappingFieldTree, {
      properties: { userName: { type: 'keyword' }, created: { type: 'date' } },
      keyword: 'NAME',
    });
    const marks = Array.from(host.querySelectorAll('mark.mft-mark')).map(el => el.textContent);
    expect(marks, '命中段原文大小写保形（k.length 切片口径）').toEqual(['Name']);
    /* 非命中段照旧平文（mark 只包命中） */
    expect(host.querySelector('.mft-name')?.textContent).toContain('user');
  });
});

/* ═══ B：IndexOptionRow v-html 退役 → splitMark 分段渲染 ═══ */
describe('558 B：IndexOptionRow 多命中全标（v-html 注入面退役）', () => {
  it('源码锁：v-html/esc 串接双退役，模板 v-for 分段 + splitMark 单源', () => {
    const v = read('components/IndexOptionRow.vue');
    expect(v, 'v-html 注入面退役（模板属性面）').not.toMatch(/v-html="/);
    expect(v, 'esc()+<mark> 串接退役').not.toMatch(/const esc|'<mark>'/);
    expect(v, 'splitMark 单源消费').toContain("import { splitMark } from '../composables/useGridSearch';");
    expect(v, '模板 v-for 分段渲染').toMatch(/v-for="\(seg, si\) in nameSegs"/);
  });

  it('挂载行为：多命中全标（旧 indexOf 单点只标首处）+ 无命中单段原文', async () => {
    const host = await mountComp(IndexOptionRow, { name: 'logs-logstash-2026', hl: 'log' });
    const marks = Array.from(host.querySelectorAll('.ior-name mark')).map(el => el.textContent);
    expect(marks, 'logs/logstash 两处命中全标').toEqual(['log', 'log']);
    expect(host.querySelector('.ior-name')?.textContent, '拼接文本与原名一致（mark 只是包裹）').toBe('logs-logstash-2026');

    const host2 = await mountComp(IndexOptionRow, { name: 'orders', hl: 'zzz' });
    expect(host2.querySelectorAll('.ior-name mark').length, '无命中零 mark').toBe(0);
    expect(host2.querySelector('.ior-name')?.textContent).toBe('orders');

    const host3 = await mountComp(IndexOptionRow, { name: 'orders', hl: '  ' });
    expect(host3.querySelectorAll('.ior-name mark').length, '空白关键词视同无高亮（trim 口径零漂移）').toBe(0);
  });
});

/* ═══ C：sqlCompletion IN 裸字面 / version 档 / 精确置顶 ═══ */
type Provider = { provideCompletionItems: (model: any, position: any, context?: any, token?: any) => any };

function makeMonaco() {
  const providers: Record<string, Provider[]> = {};
  return {
    providers,
    api: {
      languages: {
        registerCompletionItemProvider: (_lang: string, p: Provider) => {
          (providers[_lang] ||= []).push(p);
          return { dispose: () => {} };
        },
        CompletionItemKind: { Field: 'Field', Property: 'Property', Value: 'Value' },
      },
    },
  };
}

const ALL_FIELDS = [
  { path: 'name', type: 'keyword' },
  { path: 'amount', type: 'double' },
  { path: 'ver', type: 'version' },
  { path: 'created', type: 'date' },
];

function makeCtx(): () => SqlCompletionCtx {
  return () => ({
    indices: () => [{ index: 'orders' }],
    pickedIdx: () => 'orders',
    curFields: () => ALL_FIELDS,
    ensureCurFields: () => {},
  });
}
function fakeSqlModel(text: string) {
  return {
    getValue: () => text,
    getOffsetAt: () => text.length,
    getWordUntilPosition: () => ({ startColumn: 1, endColumn: 1, word: '' }),
  };
}
function sqlProvider(m: ReturnType<typeof makeMonaco>): Provider {
  const arr = m.providers.sql;
  expect(arr, 'sql 语言 provider 必须已注册').toBeTruthy();
  return arr![arr!.length - 1];
}

describe('558 C：sqlCompletion 值位三小件', () => {
  beforeEach(() => { setActivePinia(createPinia()); });
  afterEach(() => { __clearSuggestCache(); vi.restoreAllMocks(); localStorage.clear(); });

  it('① 数值列 IN (1, 2␣ 第 2 项裸字面：出数值静态档（旧零候选根治）', () => {
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw');
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const r: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel('SELECT * FROM orders WHERE amount IN (1, 2'), { lineNumber: 1 });
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['100']);
      expect(String(r.suggestions[0].detail)).toContain('double');
      expect(r.suggestions[0].kind).toBe('Value');
      expect(spy, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it("① 裸已完成项 + 引号尾项混排（IN (1, 2, '␣）同通道：剥净校验认数字形态", () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const r: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel("SELECT * FROM orders WHERE amount IN (1, 2, '"), { lineNumber: 1 });
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['100']);
    } finally { h.dispose(); }
  });

  it('① 负向：子查询/字母裸词已完成项不进支路（宁缺勿错，不落值位候选）', () => {
    const m = makeMonaco();
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      const cases = [
        'SELECT * FROM orders WHERE amount IN (SELECT id, 2',
        'SELECT * FROM orders WHERE amount IN (1, x, 2',
      ];
      for (const before of cases) {
        const r: any = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
        const list = (r.suggestions ?? []) as any[];
        expect(list.every(s => s.kind !== 'Value'), before).toBe(true);
      }
    } finally { h.dispose(); }
  });

  it('② version 档：表锁 + 值位行为（= 位出 1.0.0 形态示例，零请求）', () => {
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw');
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      expect(VAL_FORMAT_HINTS.version).toEqual({ detail: '字面提示 · version', values: ['1.0.0'] });
      const r: any = sqlProvider(m).provideCompletionItems(
        fakeSqlModel("SELECT * FROM orders WHERE ver = '"), { lineNumber: 1 });
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['1.0.0']);
      expect(String(r.suggestions[0].detail)).toContain('version');
      expect(spy, '静态档零请求').not.toHaveBeenCalled();
    } finally { h.dispose(); }
  });

  it('③ 精确前缀命中置顶：已敲完整词提到首位，非精确项保持服务端 doc_count 序', async () => {
    vi.useFakeTimers();
    const m = makeMonaco();
    const spy = vi.spyOn(api, 'searchRaw').mockResolvedValue({
      aggregations: { suggest: { buckets: [{ key: 'act' }, { key: 'active' }] } },
    });
    const h = ensureSqlCompletion(m.api as any, makeCtx());
    try {
      /* 已敲完整词 'active'：服务端 doc_count 序里排后的精确命中提到首位 */
      const before = "SELECT * FROM orders WHERE name = 'active";
      const p = sqlProvider(m).provideCompletionItems(fakeSqlModel(before), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r = await p;
      expect((r.suggestions as any[]).map(s => s.label)).toEqual(['active', 'act']);
      expect(String(r.suggestions[0].sortText) < String(r.suggestions[1].sortText), 'sortText 同步提前').toBe(true);

      /* 前缀非精确命中：服务端序零漂移（535/557 既有契约不回退） */
      __clearSuggestCache();
      spy.mockClear();
      const before2 = "SELECT * FROM orders WHERE name = 'ac";
      const p2 = sqlProvider(m).provideCompletionItems(fakeSqlModel(before2), { lineNumber: 1 });
      await vi.advanceTimersByTimeAsync(10);
      const r2 = await p2;
      expect((r2.suggestions as any[]).map(s => s.label)).toEqual(['act', 'active']);
    } finally { h.dispose(); vi.useRealTimers(); }
  });
});
