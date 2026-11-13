/**
 * 1202：管道聚合族的必填主键没有入口。
 *
 * 与 1200/1201 同一个病根：表里有名字、能读能改，但 UI 上不给入口/给错形态。
 *   · bucket_script / bucket_selector 的官方体必须同时有 buckets_path + script，
 *     此前 schema 只登记了 buckets_path —— 新建后根本没有 script 输入位；
 *   · bucket_sort 必须给 sort（规则数组），而 size/from 才是常调标量，
 *     此前 schema 只有 gap_policy —— 等于「桶排序」配不出排序；
 *   · cumulative_cardinality 是管道聚合（必须 buckets_path 指向输入），此前只登记了 precision_threshold。
 *
 * 处理口径（为什么只补标量）：
 *   GenericParams 新建 `json` 档参数时默认值是 `{}`，而 `bucket_sort.sort` 要的是**数组**——
 *   登记进去反而给一个 ES 会拒的默认值。数组键一律留在自由表里由用户写 `[{...}]`。
 *   已存在的对象形态也不会被 text schema 破坏：模板分支里 object/array 优先于 text，
 *   只有标量值才走文本框（保住 `script:{source:…}` 这类官方写法）。
 *
 * 锁：① 三处 schema 键准确；② sort 故意不在 schema 里（防有人"补全"成 json 制造非法默认值）；
 *     ③ 全量普查：schema 键塞进 body 必须无损往返；④ 已存在的对象型 script 不被强转。
 */
import { describe, it, expect } from 'vitest';
import { AGG_BODY_PARAMS, AGG_OPS } from '../utils/queryAstOps';
import { parseTree, serializeTree } from '../utils/queryAst';

describe('1202 管道聚合的必填主键', () => {
  it('bucket_script / bucket_selector 带 script', () => {
    expect(AGG_BODY_PARAMS.bucket_script?.map(p => p.key)).toContain('script');
    expect(AGG_BODY_PARAMS.bucket_selector?.map(p => p.key)).toContain('script');
    /* gap_policy 是 enum（bucket_script 官方不认 gap_policy；selector 认）——
       只对 selector 断言，避免把不存在的键写进去 */
    const sel = AGG_BODY_PARAMS.bucket_selector!.find(p => p.key === 'gap_policy');
    expect(sel?.kind).toBe('enum');
    expect(AGG_BODY_PARAMS.bucket_script?.some(p => p.key === 'gap_policy'), 'bucket_script 无 gap_policy')
      .toBe(false);
  });

  it('bucket_sort 补 size / from（标量），且 sort 刻意不登记', () => {
    const keys = AGG_BODY_PARAMS.bucket_sort!.map(p => p.key);
    expect(keys).toContain('size');
    expect(keys).toContain('from');
    expect(keys).toContain('gap_policy');
    /* 数组键不登记：json 档新建默认 {} 而 ES 要数组，给默认值反而害人 */
    expect(keys, 'sort 数组不得登记为具名档').not.toContain('sort');
  });

  it('cumulative_cardinality 有 buckets_path', () => {
    expect(AGG_BODY_PARAMS.cumulative_cardinality?.map(p => p.key)).toContain('buckets_path');
  });

  it('普查：每个 schema 的键都能塞进该聚合并无损往返', () => {
    const bad: string[] = [];
    for (const [op, schema] of Object.entries(AGG_BODY_PARAMS)) {
      if (!AGG_OPS[op]) continue;
      const body: Record<string, unknown> = {};
      for (const p of schema) {
        body[p.key] = p.kind === 'number' ? 1 : p.kind === 'boolean' ? true
          : p.kind === 'enum' ? (p.options?.[0] ?? 'x') : 'x';
      }
      const doc = { query: { match_all: {} }, aggs: { a: { [op]: body } } };
      const r = parseTree(doc as any);
      if (!r.ok) { bad.push(`${op}: parse`); continue; }
      if (JSON.stringify(serializeTree((r as any).tree)) !== JSON.stringify(doc)) bad.push(`${op}: roundtrip`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('已存在的对象型 script 不被 text schema 破坏（保真）', () => {
    const doc = {
      query: { match_all: {} },
      aggs: { a: { bucket_selector: { buckets_path: { t: '_count' }, script: { source: 'params.t > 1' } } } },
    };
    const r = parseTree(doc as any);
    expect(r.ok).toBe(true);
    expect(serializeTree((r as any).tree)).toEqual(doc);
  });
});

/* 1202 接线面：schema 有键 ≠ UI 有位。用真实挂载确认 bucket_sort 真的给出
   size/from 数值控件，且已存在的对象型 script 不会退化成 [object Object]。 */
import { createApp, h, nextTick } from 'vue';
import AggTreeNode from '../components/builder/AggTreeNode.vue';

const apps: ReturnType<typeof createApp>[] = [];
let mountHost: HTMLElement;
async function mountAgg(op: string, body: any) {
  mountHost = document.createElement('div'); document.body.appendChild(mountHost);
  const app = createApp({
    render: () => h(AggTreeNode as any, {
      node: { id: 'a1', type: 'agg', op, name: 'a', body, meta: {}, children: [], params: {} },
      fields: ['score'], types: { score: 'double' },
    }),
  });
  apps.push(app); app.mount(mountHost);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return mountHost;
}

describe('1202 接线面', () => {
  it('bucket_sort 的 size 走数值控件', async () => {
    await mountAgg('bucket_sort', { size: 3 });
    const num = document.querySelector('.agn input[type="number"]');
    expect(num, 'size 必须是数值控件（schemaKind number 分支）').toBeTruthy();
    while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = '';
  });

  it('对象型 script 不被强转（键名与键值都还在）', async () => {
    await mountAgg('bucket_selector', { buckets_path: { t: '_count' }, script: { source: 'params.t > 1' } });
    const txt = (document.querySelector('.agn')?.textContent || '');
    expect(txt).not.toContain('[object Object]');
    expect(txt).toContain('script');
    while (apps.length) apps.pop()!.unmount(); document.body.innerHTML = '';
  });
});
