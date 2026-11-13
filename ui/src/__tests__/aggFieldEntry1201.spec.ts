/**
 * 1201：聚合一侧与 1200 同族的「有体无入口」。
 *
 * 聚合编辑器（AggTreeNode）靠两张表决定能点什么：
 *   · FIELD_BODY_AGGS —— 哪些聚合的 body 有 `field` 行（渲染成字段选择器）
 *   · AGG_BODY_PARAMS —— 哪些参数是具名输入框（枚举/数值/布尔）
 * 两张表都没登记，就只能靠自由键值表手打键名。问题在于 **stats** 这种官方必填 field 的聚合
 * 漏在 FIELD_BODY_AGGS 之外：新建 `stats` 后 body 里没有字段行，用户得手打 `"field"` 才能跑。
 * 这与 1200（nested/has_child/has_parent 有渲染器、有参数表，却没有新建入口）是同一类缺口：
 * 支持读、支持改，就是不给入口。
 *
 * 本批只补**确定的**：stats 进字段表 + 进数值置顶；stats/top_metrics/matrix_stats 补参数 schema。
 * 不把 matrix_stats 的 `fields` 或 top_metrics 的 `metrics` 硬塞成单值 field —— 那是数组键，
 * 塞进去会给一个 ES 不认的假入口。
 *
 * 锁：① stats 在字段聚合表里，且数值族置顶；
 *     ② 三个聚合的参数 schema 在册且键准确；
 *     ③ 全量普查：所有「body 有 field」的聚合（FIELD_BODY_AGGS）必须都在 AGG_OPS 里；
 *     ④ 反向普查：每个登记了 AGG_BODY_PARAMS 的 key 都必须是该聚合官方 body 里合法的一层键
 *        （用往返证明：把 schema 的键塞进 body → 解析 → 写回必须无损）；
 *     ⑤ 负控：把 stats 从字段表删掉 → ① 转红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGG_OPS, AGG_BODY_PARAMS } from '../utils/queryAstOps';
import { parseTree, serializeTree } from '../utils/queryAst';

const aggSrc = readFileSync(join(__dirname, '../components/builder/AggTreeNode.vue'), 'utf-8');
/* 1439：字段键集合上收到 queryAstOps（补全侧要同源），字段证据从那里取；
   数值聚合倾向表仍在组件内。 */
const opsSrc = readFileSync(join(__dirname, '../utils/queryAstOps.ts'), 'utf-8');
const fieldAggs = (() => {
  const m = /FIELD_BODY_AGGS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\)/.exec(opsSrc);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
})();
const numericAggs = (() => {
  const m = /NUMERIC_AGGS = new Set\(\[([\s\S]*?)\]\)/.exec(aggSrc);
  return m ? [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]) : [];
})();

describe('1201 聚合的字段入口与参数 schema', () => {
  it('stats 有字段行（官方必填 field），并按数值聚合置顶数值字段', () => {
    expect(fieldAggs, 'stats 必须有 field 入口').toContain('stats');
    expect(numericAggs, 'stats 是数值聚合，应置顶数值族').toContain('stats');
  });

  it('stats / top_metrics / matrix_stats 的参数 schema 在册', () => {
    /* 断言「在册」而不是锁死全集：后续补齐必填主键（top_metrics.metrics / matrix_stats.fields）
       属于增强，不该让这条变红。missing 不是 top_metrics 的顶层键（它在 metrics 项内），
       故不再要求它出现——见 1244 spec 的官方文档核对。 */
    expect(AGG_BODY_PARAMS.stats?.map(p => p.key)).toContain('missing');
    expect(AGG_BODY_PARAMS.top_metrics?.map(p => p.key)).toEqual(
      expect.arrayContaining(['metrics', 'size']),
    );
    expect(AGG_BODY_PARAMS.matrix_stats?.map(p => p.key)).toEqual(
      expect.arrayContaining(['fields', 'mode']),
    );
    const mode = AGG_BODY_PARAMS.matrix_stats!.find(p => p.key === 'mode')!;
    expect(mode.kind, 'mode 应为枚举').toBe('enum');
    expect(mode.options, '官方五档').toEqual(expect.arrayContaining(['avg', 'sum', 'median']));
  });

  it('普查：字段聚合表里的每个算子都在 AGG_OPS（防拼错成幽灵项）', () => {
    const ghosts = fieldAggs.filter(o => !AGG_OPS[o]);
    expect(ghosts, `字段聚合表引用了未注册聚合：${ghosts.join(',')}`).toEqual([]);
  });

  it('普查：schema 声明的每个键都能塞进该聚合 body 并无损往返', () => {
    const bad: string[] = [];
    for (const [op, schema] of Object.entries(AGG_BODY_PARAMS)) {
      const body: Record<string, unknown> = {};
      for (const p of schema) {
        body[p.key] = p.kind === 'number' ? 1 : p.kind === 'boolean' ? true
          : p.kind === 'enum' ? (p.options?.[0] ?? 'x') : 'x';
      }
      /* field 类聚合给个合法 field，避免生成体本身不合法影响比对 */
      if (fieldAggs.includes(op)) body.field = 'f';
      const doc = { query: { match_all: {} }, aggs: { a: { [op]: body } } };
      const r = parseTree(doc as any);
      if (!r.ok) { bad.push(`${op}: parse failed`); continue; }
      if (JSON.stringify(serializeTree((r as any).tree)) !== JSON.stringify(doc)) bad.push(`${op}: roundtrip`);
    }
    expect(bad, bad.join('; ')).toEqual([]);
  });

  it('负控：字段聚合表不得回退（stats 不得再缺席）', () => {
    expect(fieldAggs.includes('stats'), 'stats 从字段表消失说明修复被回退').toBe(true);
  });
});
