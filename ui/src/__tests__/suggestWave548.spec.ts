/**
 * 548 批 W2 轨1：智能提示/纠错残面——
 *  A useTermsSuggest 四件：A1 悬挂修复（防抖窗内被清的旧 suggestAsync seq 立即兑现 []，
 *    不再永久悬挂）/ A2 宽前缀缓存本地滤（更宽前缀已缓存结果 startsWith 回填，零网络白得，
 *    随后照旧发网请求更新）/ A3 跨字段串显清空（field 变化 suggest 触发即清旧 top20）/
 *    A4 防抖起步置位（锁同步更新在 useTermsSuggest395.spec，不在本件）；
 *  B queryAstOps：opsForType date 分支并入 date_nanos（原落兜底 ['exists']）+
 *    typePriorityForOp('range') 序列补 date_nanos（紧跟 date；545/530 精确锁同步更新）；
 *  C fieldSearch.searchFields 零命中近似候选：三档全空且查询词非空时附编辑距离 ≤2 的
 *    top-5 最近字段（rank=3 恒居既有三档之后 + fuzzy 标记；typeFilter 照常生效）；
 *  D LuceneInput：known 行扩 wildcard/date_nanos（双字面锁同步更新在 luceneValTiers538 /
 *    sqlLuceneTiers546，本件只锁 D2 纯 style 收口 gap→var(--sp-2)，--sp-2=8px 精确等值）；
 *  E LuceneQueryView：SORTABLE_TYPES 补 unsigned_long（545 数值族九口径对齐）。
 *    E2 备案：JSON 视图 _source 高亮——JsonTree.vue 的 kw 是 tools 模式私有 ref，
 *    无外部 kw/mark prop 通道，共享件不扩通道，本侧无可接线（_id 列 MarkText 既有）。
 *  F BoostTunerView：搜索词裸 input 接值位候选（useTermsSuggest 同内核 + datalist 轻量形态，
 *    前缀过滤；源锚断言同 boostTunerWorkbench408 形态——挂载整视图依赖面过重）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SORTABLE_FIELD_TYPES } from '../utils/queryAstOps';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, defineComponent, h, type App } from 'vue';
import { createPinia } from 'pinia';

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
import { useTermsSuggest, __clearSuggestCache } from '../composables/useTermsSuggest';
import { opsForType, typePriorityForOp } from '../utils/queryAstOps';
import { searchFields } from '../utils/fieldSearch';

const SRC = join(__dirname, '..');

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

beforeEach(() => {
  document.body.innerHTML = '';
  __clearSuggestCache();
  searchRawFn.mockReset();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  while (apps.length) apps.pop()!.unmount();
});

/* ═══ A：useTermsSuggest 四件 ═══ */

describe('A useTermsSuggest 548 残面', () => {
  it('A1 悬挂修复：防抖窗内被新 suggest 清掉的旧 suggestAsync promise 立即 resolve([])', async () => {
    searchRawFn.mockResolvedValue(aggResp('b1'));
    const out = withSetup(() => 'logs-x');
    const p1 = out.suggestAsync('status', 'a');
    await vi.advanceTimersByTimeAsync(50);          /* 未到 300ms，p1 定时器仍挂起 */
    const p2 = out.suggestAsync('status', 'ab');    /* 清掉 p1 的定时器 */
    await expect(p1, '被清旧 seq 立即兑现 []，不悬挂').resolves.toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    await expect(p2, '新 seq 照常兑现').resolves.toEqual(['b1']);
    expect(searchRawFn, '旧定时器被清只发最新一次').toHaveBeenCalledTimes(1);
  });

  it('A1 补充：在飞请求被新 suggest 超越，旧 promise 立即 resolve([])（不依赖响应/序号过期路径）', async () => {
    searchRawFn.mockImplementationOnce(() => new Promise(() => {})); /* p1 在飞永不回 */
    searchRawFn.mockResolvedValueOnce(aggResp('b1'));
    const out = withSetup(() => 'logs-x');
    const p1 = out.suggestAsync('status', 'a');
    await vi.advanceTimersByTimeAsync(300);          /* p1 已发请求，在飞 */
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    const p2 = out.suggestAsync('status', 'ab');     /* 超越：清 stale 定时器句柄 */
    await expect(p1, '在飞旧 promise 立即取消兑现 []').resolves.toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    await expect(p2).resolves.toEqual(['b1']);
  });

  it('A2 宽前缀缓存本地滤：更宽前缀已缓存 → 零网络先回填，随后照旧发网请求更新', async () => {
    searchRawFn.mockResolvedValueOnce(aggResp('error-1', 'error-2', 'other'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'er');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    expect(out.suggestions.value).toEqual(['error-1', 'error-2', 'other']);
    searchRawFn.mockImplementation(() => new Promise(() => {})); /* 第二次请求挂起不回 */
    out.suggest('status', 'erro');                   /* 精确 key 未命中；宽前缀 'er' 已缓存 */
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value, '宽前缀缓存 startsWith 本地滤回填（响应未回已可见）')
      .toEqual(['error-1', 'error-2']);
    expect(searchRawFn, '回填后照旧发网请求取权威 top20').toHaveBeenCalledTimes(2);
  });

  it('A2 反例：同前缀精确命中走既有缓存路径零请求；无更宽前缀命中时不回填', async () => {
    searchRawFn.mockResolvedValueOnce(aggResp('err-1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('status', 'err');
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn).toHaveBeenCalledTimes(1);
    searchRawFn.mockImplementation(() => new Promise(() => {}));
    out.suggest('status', 'xyz');                    /* 无任何宽前缀缓存可滤 */
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value, '无宽前缀命中不回填（保持旧值等响应）').toEqual(['err-1']);
    expect(searchRawFn).toHaveBeenCalledTimes(2);
  });

  it('A3 跨字段串显：field 变化 suggest 触发即同步清空旧字段建议', async () => {
    searchRawFn.mockResolvedValueOnce(aggResp('A1'))
      .mockResolvedValueOnce(aggResp('B1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('fieldA', '');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual(['A1']);
    out.suggest('fieldB', '');
    expect(out.suggestions.value, '切字段立即清空，旧字段 top20 不串显（不等防抖/响应）').toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual(['B1']);
    out.suggest('fieldB', 'x');                      /* 同字段续打：不误清 */
    expect(out.suggestions.value, '同字段连打不清空（防闪）').toEqual(['B1']);
    await vi.advanceTimersByTimeAsync(300);
  });

  it('A3 边界：空字段早退路径同样即时清空（field 变化为空串）', async () => {
    searchRawFn.mockResolvedValueOnce(aggResp('A1'));
    const out = withSetup(() => 'logs-x');
    out.suggest('fieldA', '');
    await vi.advanceTimersByTimeAsync(300);
    expect(out.suggestions.value).toEqual(['A1']);
    out.suggest('', 'a');
    expect(out.suggestions.value, 'field 清空触发 A3 即时清空').toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(searchRawFn, '早退不发请求').toHaveBeenCalledTimes(1);
  });
});

/* ═══ B：queryAstOps date_nanos 并档（additive） ═══ */

describe('B queryAstOps date_nanos 并档', () => {
  it('opsForType：date_nanos 出 range/exists（原落兜底 exists）', () => {
    expect(opsForType('date_nanos')).toEqual(['range', 'exists']);
  });

  it('typePriorityForOp(range)：date_nanos 紧跟 date 位置，其余次序零变动', () => {
    expect(typePriorityForOp('range')).toEqual([
      'date', 'date_nanos', 'long', 'integer', 'short', 'byte', 'double', 'float', 'half_float', 'scaled_float', 'unsigned_long',
    ]);
  });

  it('既有分支零回退（additive 自证）', () => {
    expect(opsForType('date')).toEqual(['range', 'exists']);
    expect(opsForType(undefined)).toEqual(['exists']);
    expect(opsForType('rank_feature_vector')).toEqual(['exists']);
    expect(typePriorityForOp('term')).toEqual(['keyword']);
    expect(typePriorityForOp('exists')).toEqual([]);
  });
});

/* ═══ C：searchFields 零命中近似候选档 ═══ */

const C_FIELDS = [
  { path: 'status', type: 'keyword' },
  { path: 'user_name', type: 'text' },
  { path: 'created_at', type: 'date' },
  { path: 'message', type: 'text' },
];

describe('C searchFields 零命中近似候选', () => {
  it('零命中：编辑距离 ≤2 的最近字段附为近似候选（rank=3 + fuzzy 标记）', () => {
    const r = searchFields({ fields: C_FIELDS, query: 'statuz' });   /* status 距离 1，其余 >2 */
    expect(r.flat.map(h => h.path)).toEqual(['status']);
    expect(r.flat[0]!.rank, '近似候选 rank=3，恒居既有三档之后').toBe(3);
    expect(r.flat[0]!.fuzzy).toBe(true);
  });

  it('三档有命中时零近似候选混入（fuzzy 仅在零命中时出现）', () => {
    const r = searchFields({ fields: C_FIELDS, query: 'stat' });
    expect(r.flat.map(h => h.path)).toEqual(['status']);
    expect(r.flat[0]!.rank, '前缀命中档位不变').toBe(1);
    expect(r.flat[0]!.fuzzy).toBeUndefined();
    expect(r.total).toBe(1);
    expect(r.capped).toBe(false);
  });

  it('近似候选排序：距离升序、同距字母序、截断 top-5', () => {
    const fields = [
      { path: 'a', type: 'keyword' }, { path: 'ab', type: 'keyword' }, { path: 'abc', type: 'keyword' },
      { path: 'abd', type: 'keyword' }, { path: 'aby', type: 'keyword' }, { path: 'ax', type: 'keyword' },
      { path: 'zzzzzzz', type: 'keyword' },
    ];
    const r = searchFields({ fields, query: 'abx' });
    /* 'abx' 距离：ab/abc/abd/aby/ax=1（字母序），a=2；候选 6 个截断 top-5，a（距离最远）出局 */
    expect(r.flat.map(h => h.path)).toEqual(['ab', 'abc', 'abd', 'aby', 'ax']);
    expect(r.total, 'total 含近似候选数（消费方 N/N 计数连贯）').toBe(5);
    expect(r.flat.every(h => h.fuzzy)).toBe(true);
  });

  it('typeFilter 照常生效：过滤后无候选则近似候选也不出（不越类型域）', () => {
    const r = searchFields({ fields: C_FIELDS, query: 'statuz', typeFilter: ['text'] });
    expect(r.flat, 'status 是 keyword，text 域内无近似候选').toEqual([]);
  });

  it('空查询不纠错：query 空时零命中就是零候选（无「笔误」可纠正）', () => {
    const r = searchFields({ fields: [], query: 'x' });
    expect(r.flat).toEqual([]);
  });
});

/* ═══ D2 / E1：源锚（D1 双字面锁同步更新在 luceneValTiers538 / sqlLuceneTiers546） ═══ */

describe('D2/E1 源锚', () => {
  const li = readFileSync(join(SRC, 'components/LuceneInput.vue'), 'utf-8');
  const lqv = readFileSync(join(SRC, 'views/LuceneQueryView.vue'), 'utf-8');

  it('D2 纯 style 收口：.li-item gap 8px→var(--sp-2)（theme.css --sp-2=8px 精确等值，视觉零变化）', () => {
    /* 560 同步更新：.li-item padding 横向 10px 精确等值收 var(--sp-2h)（spSweep545 头注③
       备案修订合并）——原锁意图「gap 收 token 且无裸 8px」保持 */
    expect(li).toContain('.li-item { display: flex; align-items: center; gap: var(--sp-2); padding: 5px var(--sp-2h); cursor: pointer; }');
    expect(li).not.toContain('gap: 8px');
  });

  it('E1 SORTABLE_TYPES 补 unsigned_long（545 数值族九口径对齐；531 date/long 提前次序零变动）', () => {
    /* 1439：改吃 queryAstOps 单源 SORTABLE_FIELD_TYPES（Lucene/PIT/构建器同表）——
       原锁意图「数值族九口径齐 + unsigned_long 在册」保留，另加官方可排序的 date_nanos */
    expect(lqv).toContain("const SORTABLE_TYPES = SORTABLE_FIELD_TYPES.join(',');");
    expect(SORTABLE_FIELD_TYPES).toEqual(expect.arrayContaining([
      'keyword', 'date', 'date_nanos', 'long', 'integer', 'short', 'byte',
      'double', 'float', 'half_float', 'scaled_float', 'unsigned_long', 'boolean',
    ]));
  });
});

/* ═══ F：BoostTunerView 搜索词值位候选（源锚，同 408 形态） ═══ */

describe('F BoostTunerView 搜索词值位候选', () => {
  const v = readFileSync(join(SRC, 'views/BoostTunerView.vue'), 'utf-8');

  it('源锚：bt-kw 接 datalist 候选 + useTermsSuggest 同内核 + 前缀过滤', () => {
    expect(v, '值位候选内核与 LuceneInput 值位同源（terms agg top20/防抖/缓存）').toContain('useTermsSuggest');
    expect(v, 'keyword input 挂 datalist').toMatch(/<input v-model="keyword" class="bt-kw"[^>]*list="bt-kw-candidates"/);
    expect(v).toContain('<datalist id="bt-kw-candidates">');
    expect(v, '候选按当前关键词前缀过滤').toMatch(/kwSugList\.value\.filter/);
    expect(v, '首个启用字段做 terms agg（取打分字段语义）').toMatch(/kwField/);
  });

  it('408 既有锚零回退（WorkbenchLayout 契约在場自证）', () => {
    expect(v).toMatch(/<WorkbenchLayout :scope="btScope" :panes="BT_PANES" axis="vertical" mode="tuner">/);
    expect(v).toContain('<template #pane-boosttuner-params>');
  });
});
