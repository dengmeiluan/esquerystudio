/**
 * 五百五十六批轨1：智能提示与高亮·残面清零——
 *  A useTermsSuggest 首轮时延形态：同步候选即刻回填（TTL 同 key 命中即完成不进防抖 /
 *    宽前缀缓存本地滤上移同步段 / 新增 localStorage 词项持久档 stash 按前缀同步回填），
 *    词项请求 fire-and-forget，到达后权威刷新（同步候选只承担防抖等待期；补后混入
 *    与既有「响应=suggestions 精确值」契约冲突，评估后不采，备案）；
 *  B 四查询面值位/字段位类型盲区补档：SearchSandboxView snippets 补 boolean 字面量与
 *    ip 区间两片段、LuceneQueryView TEMPLATES 补 ip 段模板（SORTABLE_TYPES 补
 *    date_nanos/ip 受 suggestWave548 E1 源码锁字面约束，备案待下批随锁更新）；
 *  C monacoJsonQuickFix 规则→fix 白名单补三条：agg-size-default（terms 体收尾插
 *    "size": 20）/ collapse-structure（标量子集包对象）/ highlight-fields（fields 标量
 *    包数组；缺 fields 分支无修复价值零 action）——quickFixDslLint534 B 段负向锁形态
 *    （无 '"terms"' 文档 / 缺 fields 消息）在新 fix 证据闸下维持零 action 不回退；
 *  D esEnumZh 字段类型词表 FIELD_TYPE_ZH 收口（只增）+ fieldSearch.GH_LABEL 补
 *    date_nanos 归「日期」组（554 批 date 族并档后的组头归一）；
 *  E fieldSearch 短查询词纠错阈值收紧：kw ≤2 字符时 fuzzy 编辑距离 ≤1（两字全换的
 *    d=2 候选基本无关，噪音大于价值；≥3 字符维持既有 ≤2 口径）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, defineComponent, h, nextTick, type App } from 'vue';
import { createPinia } from 'pinia';

/* 只替换网络出口，composable/store 全用真的（useTermsSuggest.spec 同款惰性包装防 TDZ） */
const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api,
    searchRaw: (...a: any[]) => searchRawFn(...a),
    clusterIndices: () => Promise.resolve([]), overview: () => Promise.resolve({}),
    clusterHealth: () => Promise.resolve({}),
    setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
  } };
});

/* monaco 全 mock（静态守卫：happy-dom 无真编辑器；C 段 provider 行为面直测） */
const caps = vi.hoisted(() => ({
  calls: [] as string[],
  providers: [] as any[],
  filter: null as any,
  markers: [] as any[],
}));
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => ({
  languages: {
    registerCodeActionProvider: (_lang: string, p: any) => {
      caps.calls.push(_lang);
      caps.providers.push(p);
      return { dispose() {} };
    },
  },
  editor: {
    getModelMarkers: (filter: any) => { caps.filter = filter; return caps.markers; },
  },
}));

import { useTermsSuggest, __clearSuggestCache } from '../composables/useTermsSuggest';
import { searchFields, groupByLabel } from '../utils/fieldSearch';
import { ensureDslLintQuickFixes, recordDslLintMarkers } from '../utils/monacoJsonQuickFix';

/* 动态导入（新导出在实施前不存在——undefined 呈红而非整文件载入崩） */
const ezhMod: any = await import('../utils/esEnumZh');

const SRC = join(__dirname, '..');
const readSrc = (rel: string) => readFileSync(join(SRC, rel), 'utf-8');
const ss = readSrc('views/SearchSandboxView.vue');
const lqv = readSrc('views/LuceneQueryView.vue');

const apps: App[] = [];
function withSetup(index: () => string) {
  let out!: ReturnType<typeof useTermsSuggest>;
  const Comp = defineComponent({ setup() { out = useTermsSuggest(index); return () => h('div'); } });
  const app = createApp(Comp);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  apps.push(app);
  return out;
}

function aggResp(...keys: string[]) {
  return { aggregations: { suggest: { buckets: keys.map(k => ({ key: k })) } } };
}

const STASH_KEY = 'esquerystudio_terms_stash::@host|logs-x|status';

/* ═══ A：useTermsSuggest 首轮同步候选 + stash merge ═══ */

describe('A useTermsSuggest 首轮同步候选', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    localStorage.clear();
    __clearSuggestCache();
    searchRawFn.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => { vi.useRealTimers(); while (apps.length) apps.pop()!.unmount(); });

  it('A1 首轮（缓存全空）词项持久档按前缀同步回填：suggest 调用即见候选，不等防抖不等网络', () => {
    localStorage.setItem(STASH_KEY, JSON.stringify(['active', 'audit', 'closed']));
    searchRawFn.mockImplementation(() => new Promise(() => {})); /* 网络永不回：候选仍须先出 */
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'ac');
    expect(out.suggestions.value, '同步候选即刻返回（audit/closed 不匹配 ac 前缀）').toEqual(['active']);
    expect(searchRawFn, '同步回填零网络').not.toHaveBeenCalled();
  });

  it('A2 词项到达后二次刷新：同步候选退位、权威 top20 接管（补后混入与既有精确值契约冲突，备案不采）', async () => {
    localStorage.setItem(STASH_KEY, JSON.stringify(['active', 'audit']));
    searchRawFn.mockResolvedValue(aggResp('active-x'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'ac');
    expect(out.suggestions.value, '防抖窗内持久档候选先出').toEqual(['active']);
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggestions.value, '词项到达权威刷新').toEqual(['active-x']);
  });

  it('A3 TTL 同 key 缓存命中升级为同步完成：调用即 suggesting 复位且零新请求（不等防抖）', async () => {
    searchRawFn.mockResolvedValue(aggResp('err-1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'err');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggesting.value).toBe(false);
    out.suggest('status', 'err');
    expect(out.suggesting.value, '命中即完成（原实现防抖窗内 suggesting=true）').toBe(false);
    expect(out.suggestions.value).toEqual(['err-1']);
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn, '缓存命中零新请求').toHaveBeenCalledTimes(1);
  });

  it('A4 宽前缀缓存本地滤上移同步段：防抖窗内即见回填（响应未回）', async () => {
    searchRawFn.mockResolvedValueOnce(aggResp('error-1', 'other'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'er');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual(['error-1', 'other']);
    searchRawFn.mockImplementation(() => new Promise(() => {}));
    out.suggest('status', 'erro');
    expect(out.suggestions.value, '同步段即回填（原实现需等 300ms 防抖）').toEqual(['error-1']);
  });

  it('A5 负向：无持久档无缓存时同步阶段不产候选，防抖语义照旧', () => {
    const out = withSetup(() => 'logs-x');
    searchRawFn.mockResolvedValue(aggResp('v1'));
    out.suggest('status', 'a');
    expect(out.suggestions.value).toEqual([]);
    expect(searchRawFn).not.toHaveBeenCalled();
    return vi.advanceTimersByTimeAsync(300).then(() => {
      expect(searchRawFn, '防抖后照常发请求').toHaveBeenCalledTimes(1);
      expect(out.suggestions.value).toEqual(['v1']);
    });
  });

  it('A6 词项持久档随成功响应滚动更新（key 契约 esquerystudio_terms_stash::target|idx|field）', async () => {
    searchRawFn.mockResolvedValue(aggResp('v9', 'v8'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', '');
    await vi.advanceTimersByTimeAsync(300);
    expect(JSON.parse(localStorage.getItem(STASH_KEY) || '[]')).toEqual(['v9', 'v8']);
  });

  it('A7 suggestAsync 首轮同步命中即刻兑现（挂账不悬挂）', async () => {
    searchRawFn.mockResolvedValueOnce(aggResp('p1'));
    const out = withSetup(() => 'logs-x');
    const p1 = out.suggestAsync('status', 'p');
    await vi.advanceTimersByTimeAsync(300);
    await expect(p1).resolves.toEqual(['p1']);
    searchRawFn.mockImplementation(() => new Promise(() => {}));
    const p2 = out.suggestAsync('status', 'p');   /* 同 key 缓存命中 → 同步终点 */
    await expect(p2, '同步命中 promise 立即兑现缓存值').resolves.toEqual(['p1']);
  });
});

/* ═══ B：四面值位/字段位类型盲区补档（源码锁） ═══ */

describe('B 四面类型盲区补档', () => {
  it('B1 SearchSandboxView snippets 补 boolean 字面量与 ip 区间两片段', () => {
    expect(ss).toContain(`{ name: 'term 布尔', body: \`{"size":10,"query":{"term":{"deleted":false}}}\` }`);
    expect(ss).toContain(`{ name: 'range IP', body: \`{"size":10,"query":{"range":{"ip":{"gte":"10.0.0.10","lte":"10.0.0.20"}}}}\` }`);
  });

  it('B2 LuceneQueryView TEMPLATES 补 ip 段模板', () => {
    expect(lqv).toContain(`d: 'IP 区间', q: 'ip:[10.0.0.0 TO 10.0.0.255]' }`);
  });
});

/* ═══ C：monacoJsonQuickFix 三条新 fix ═══ */

const URI_STR = 'inmemory://dsl-lint/556';
const URI = { toString: () => URI_STR };

/** 单行文档 fake model（quickFixDslLint534 同款范式）。 */
function fakeModel(line: string) {
  const colOf = (idx: number) => idx + 1;
  return {
    uri: URI,
    getValueInRange: (r: any) => line.slice(r.startColumn - 1, r.endColumn - 1),
    getLineContent: () => line,
    getLineCount: () => 1,
    getLineMaxColumn: () => line.length + 1,
    findMatches: (needle: string, scope: any) => {
      const hits: any[] = [];
      let from = 0;
      for (;;) {
        const at = line.indexOf(needle, from);
        if (at < 0) break;
        hits.push({ range: { startLineNumber: 1, startColumn: colOf(at), endLineNumber: 1, endColumn: colOf(at) + needle.length } });
        from = at + 1;
      }
      return hits.filter(h => h.range.startColumn >= scope.startColumn);
    },
  };
}
const RANGE = { startLineNumber: 1, startColumn: 1, endLineNumber: 5, endColumn: 80 };
function markerAt(sc: number, ec: number, patch: Record<string, any> = {}) {
  return {
    owner: 'es-dsl-lint', startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec,
    message: '', severity: 4, code: { value: 'es-dsl-lint:anchored' }, ...patch,
  };
}
function entry(sc: number, ec: number, rule: string, message: string) {
  return { startLineNumber: 1, startColumn: sc, endLineNumber: 1, endColumn: ec, finding: { rule, message, suggestion: 's', anchor: 'a' } };
}

describe('C monacoJsonQuickFix 556 三条新 fix', () => {
  let dsl: any;
  beforeEach(() => {
    ensureDslLintQuickFixes();
    dsl = caps.providers[caps.providers.length - 1];
    caps.markers = []; caps.filter = null;
  });

  it('C1 agg-size-default → terms 体收尾插 "size": 20（体非空插 ", \\"size\\": 20"）', () => {
    const line = '{"aggs":{"a":{"terms":{"field":"f"}}}}';
    const model = fakeModel(line);
    caps.markers = [markerAt(15, 22)]; /* 覆盖 "terms"（col15 起 7 字符） */
    recordDslLintMarkers(URI_STR, [entry(15, 22, 'agg-size-default', 'terms 聚合未写 size：默认只返回 10 桶，长尾分布会被静默截断')]);
    const acts = dsl.provideCodeActions(model, RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].title).toContain('size');
    const te = acts[0].edit.edits[0].textEdit;
    expect(te.text).toBe(', "size": 20');
    expect(te.range).toEqual({ startLineNumber: 1, startColumn: 35, endLineNumber: 1, endColumn: 35 }); /* 收尾 } 前 */
  });

  it('C2 collapse-structure → 标量子集包对象（{"v": {}}）', () => {
    const model = fakeModel('{"collapse": "user_id"}');
    caps.markers = [markerAt(2, 12)]; /* 覆盖 "collapse" */
    recordDslLintMarkers(URI_STR, [entry(2, 12, 'collapse-structure', 'collapse 值必须是对象形态 { "字段名": {} }：收到标量「user_id」，ES 会拒绝请求（400）')]);
    const acts = dsl.provideCodeActions(model, RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].edit.edits[0].textEdit.text).toBe('{"user_id": {}}');
    expect(acts[0].edit.edits[0].textEdit.range).toEqual({ startLineNumber: 1, startColumn: 14, endLineNumber: 1, endColumn: 23 });
  });

  it('C3 highlight-fields → fields 标量包数组（multi-match-fields 同款形态）', () => {
    const model = fakeModel('{"highlight": {"fields": "title"}}');
    caps.markers = [markerAt(2, 13)]; /* 覆盖 "highlight" */
    recordDslLintMarkers(URI_STR, [entry(2, 13, 'highlight-fields', 'highlight fields 必须是对象或数组：收到标量「title」')]);
    const acts = dsl.provideCodeActions(model, RANGE).actions;
    expect(acts.length).toBe(1);
    expect(acts[0].edit.edits[0].textEdit.text).toBe('["title"]');
  });

  it('C4 负向（quickFixDslLint534 B 段同形态不回退）：数组 collapse / 缺 fields / 无 terms 体 / 534 建议类零 action', () => {
    const cases: [any, any, string][] = [
      /* collapse 数组形态：无标量证据零 action */
      [fakeModel('{"collapse": ["user_id"]}'), entry(2, 12, 'collapse-structure', 'collapse 值必须是对象形态 { "字段名": {} }：收到数组，ES 会拒绝请求（400）'),
        '{"collapse": ["user_id"]}'],
      /* highlight 缺 fields 分支：无修复价值零 action（534 B 段原形态） */
      [fakeModel('{"highlight": {}}'), entry(2, 13, 'highlight-fields', 'highlight 缺 fields：不指定高亮字段会被 ES 拒绝或整卡零高亮'),
        '{"highlight": {}}'],
      /* agg-size-default：marker 非 "terms" 本体（534 B 段用 {"anchor": {}} 文档）零 action */
      [fakeModel('{"anchor": {}}'), entry(2, 9, 'agg-size-default', 'terms 聚合未写 size：默认只返回 10 桶'),
        '{"anchor": {}}'],
    ];
    for (const [model, ent] of cases) {
      caps.markers = [markerAt(ent.startColumn, ent.endColumn)];
      recordDslLintMarkers(URI_STR, [ent]);
      const acts = dsl.provideCodeActions(model, RANGE).actions;
      expect(acts.map((a: any) => a.title), `${ent.finding.rule} 必须零 action`).toEqual([]);
    }
  });
});

/* ═══ D：esEnumZh 字段类型词表 + GH_LABEL date 族组头归一 ═══ */

describe('D esEnumZh 字段类型词表', () => {
  it('D1 FIELD_TYPE_ZH 全表收口（核心类型 + 区间族 + 554 值类型族三员）', () => {
    const t = ezhMod.FIELD_TYPE_ZH;
    expect(t).toBeTruthy();
    expect(t.text).toBe('文本');
    expect(t.keyword).toBe('精确值');
    expect(t.date).toBe('日期');
    expect(t.date_nanos).toBe('纳秒日期');
    expect(t.ip).toBe('IP 地址');
    expect(t.boolean).toBe('布尔');
    expect(t.geo_point).toBe('地理坐标');
    expect(t.constant_keyword).toBe('常量关键字');
    expect(t.wildcard).toBe('通配关键字');
    expect(t.nested).toBe('嵌套对象');
    expect(t.alias).toBe('字段别名');
    expect(t.date_range).toBe('日期区间');
    expect(t.ip_range).toBe('IP 区间');
  });

  it('D2 fieldTypeZh：收录回中文、未知回原值（不猜不编）', () => {
    expect(ezhMod.fieldTypeZh('long')).toBe('长整数');
    expect(ezhMod.fieldTypeZh('totally_new_type')).toBe('totally_new_type');
    expect(ezhMod.fieldTypeZh('')).toBe('');
  });

  it('D3 fieldSearch.GH_LABEL 补 date_nanos 归「日期」组（554 并档后的组头归一，只增不删）', () => {
    const g = groupByLabel([{ path: 't', type: 'date_nanos', rank: 1, segs: [{ t: 't', m: false }], i: 0 }]);
    expect(g[0].label).toBe('日期 字段');
    /* 既有组头零回退（fieldSelectPopup / boostFieldPrioW3b 锁面）。
       558b 同步更新：组头人话词面升级（GH_LABEL→FIELD_TYPE_ZH 兜底），keyword→精确值 */
    const g2 = groupByLabel([{ path: 'x', type: 'keyword', rank: 1, segs: [], i: 0 }]);
    expect(g2[0].label).toBe('精确值 字段');
  });
});

/* ═══ E：fieldSearch 短查询词纠错阈值收紧 ═══ */

describe('E fieldSearch 短词 fuzzy 阈值', () => {
  it('E1 kw ≤2 字符：编辑距离 ≤1 才纠错（d=2 两字全换候选出局）', () => {
    const fields = [{ path: 'cb', type: 'keyword' }, { path: 'bd', type: 'keyword' }];
    const r = searchFields({ fields, query: 'ab' });
    /* cb 距离 1 在场；bd 距离 2（两字全换）被短词阈值滤掉 */
    expect(r.flat.map(h => h.path)).toEqual(['cb']);
    expect(r.flat[0]!.fuzzy).toBe(true);
  });

  it('E2 kw ≥3 字符维持既有 ≤2 口径（suggestWave548 C 段语义不回退）', () => {
    const fields = [{ path: 'abc', type: 'keyword' }, { path: 'ade', type: 'keyword' }];
    const r = searchFields({ fields, query: 'abx' });
    /* abc 距离 1、ade 距离 2——长词两档都在 */
    expect(r.flat.map(h => h.path)).toEqual(['abc', 'ade']);
  });
});
