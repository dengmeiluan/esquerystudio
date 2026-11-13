/**
 * 五百三十八批：DSL 字段位算子→类型亲和置顶序看守（dslCompletionContext 链接 typePriorityForOp）。
 *
 *  A 不同算子上下文 → 不同首字段类型：match/match_phrase 全文语义 text 置前、term 精确语义
 *    keyword 置前、range 范围语义 date/数值族置前（同一线程清单三种算子三种首字段）；
 *  B 只改序不改候选集 + 稳定（同档保原序、未命中垫底保原序）；
 *  C 无类型倾向算子（exists）/未知算子 → 原序直通（零倾向零扰动）；
 *  D 源锚：dslCompletionContext 消费 queryAstOps.typePriorityForOp（链上首次接线，
 *    与 sqlCompletion/ClauseNode 单一出处同源，不另起算子映射表防漂移）。
 *
 * 纯函数静态断言，不挂 Monaco。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { dslFieldAffinityTypes, orderFieldsByClauseOp } from '../utils/dslCompletionContext';

const SRC = join(__dirname, '..');
const dcc = readFileSync(join(SRC, 'utils/dslCompletionContext.ts'), 'utf-8');

const FIELDS = [
  { path: 'title', type: 'text' },
  { path: 'status', type: 'keyword' },
  { path: 'cnt', type: 'long' },
  { path: 'created', type: 'date' },
  { path: 'flag', type: 'boolean' },
  { path: 'host', type: 'ip' },
];
const paths = (fs: { path: string }[]) => fs.map(f => f.path);

describe('A 不同算子上下文 → 不同首字段类型', () => {
  it('match/match_phrase 全文语义：text 族置前', () => {
    expect(paths(orderFieldsByClauseOp(FIELDS, 'match'))[0]).toBe('title');
    expect(paths(orderFieldsByClauseOp(FIELDS, 'match_phrase'))[0]).toBe('title');
  });

  it('term 精确语义：keyword 置前（text 让位）', () => {
    const out = paths(orderFieldsByClauseOp(FIELDS, 'term'));
    expect(out[0]).toBe('status');
    expect(out.indexOf('status')).toBeLessThan(out.indexOf('title'));
  });

  it('range 范围语义：date/数值族置前（text/keyword/boolean/ip 垫后）', () => {
    const out = paths(orderFieldsByClauseOp(FIELDS, 'range'));
    /* typePriorityForOp('range') date 先于数值族：date 置顶、long 次之 */
    expect(out.slice(0, 2)).toEqual(['created', 'cnt']);
    expect(Math.min(out.indexOf('created'), out.indexOf('cnt'))).toBeLessThan(out.indexOf('title'));
  });

  it('dslFieldAffinityTypes 族展开：各算子首类型不同、无倾向算子空表', () => {
    expect(dslFieldAffinityTypes('match')[0]).toBe('text');
    expect(dslFieldAffinityTypes('term')[0]).toBe('keyword');
    expect(dslFieldAffinityTypes('range')[0]).toBe('date');
    expect(dslFieldAffinityTypes('exists')).toEqual([]);
    expect(dslFieldAffinityTypes('no_such_op')).toEqual([]);
  });
});

describe('B 只改序不改候选集 + 稳定', () => {
  it('候选集不变（各算子进出等集）', () => {
    const sorted = paths(FIELDS).sort();
    for (const op of ['match', 'match_phrase', 'term', 'range', 'wildcard', 'regexp', 'exists', 'no_such_op']) {
      expect(paths(orderFieldsByClauseOp(FIELDS, op)).sort(), `算子 ${op} 不得增删候选`).toEqual(sorted);
    }
  });

  it('稳定：同档保原序（term 下两个 keyword 字段不换位；未命中档亦然）', () => {
    const twin = [...FIELDS, { path: 'vendor', type: 'keyword' }];
    const out = paths(orderFieldsByClauseOp(twin, 'term'));
    expect(out.indexOf('status')).toBeLessThan(out.indexOf('vendor'));
    /* flag(boolean)/host(ip)/title(text)/cnt(long)/created(date) 全部未命中 term 亲和 → 原相对序 */
    for (const [a, b] of [['title', 'cnt'], ['cnt', 'created'], ['created', 'flag'], ['flag', 'host']] as const) {
      expect(out.indexOf(a), `${a} 应在 ${b} 前（原序）`).toBeLessThan(out.indexOf(b));
    }
  });
});

describe('C 无倾向直通与源锚', () => {
  it('exists/未知算子 → 原序原样直通（零倾向零扰动）', () => {
    expect(paths(orderFieldsByClauseOp(FIELDS, 'exists'))).toEqual(paths(FIELDS));
    expect(paths(orderFieldsByClauseOp(FIELDS, 'no_such_op'))).toEqual(paths(FIELDS));
  });

  it('dslCompletionContext 消费 queryAstOps.typePriorityForOp（链上首次接线，单一出处）', () => {
    /* 554 同步更新：queryAstOps 单行导入扩为多导入（KEYWORD_VALUE_TYPES/NUMERIC_VALUE_TYPES
       族表单源同批接入 AFFINITY_FAMILIES）——typePriorityForOp 自 queryAstOps 导入锚意保形。
       1439：聚合体键补全同批接入 AGG_BODY_PARAMS/FIELD_BODY_AGGS/PATH_BODY_AGGS，仍同一行导入。 */
    expect(dcc).toMatch(/import \{ typePriorityForOp, [^}]*AGG_BODY_PARAMS[^}]*\} from '\.\/queryAstOps';/);
  });
});
