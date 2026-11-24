/**
 * 一千四百四十三批：评分类算子的「创建 → 写回」体检。
 *
 * 用户目标是全部 DSL 语法双向可用。评分类算子的共同陷阱：主值往往**可选**，
 * 构建器把 mainKey 当必填，创建时的空初值会被如实写进 DSL——
 * 例如 `script` 创建后写出 `{"script":{"script":{"source":""}}}`，
 * ES 收到空 source 直接 400（缺脚本比错脚本更糟：用户看不出哪里没填）。
 *
 * 判据：
 *  ① 创建后写回的 DSL 里不得出现「空串必填主值」（script.source / wrapper.query 这类）；
 *  ② distance_feature 切算子后 origin 必须补齐（paramsForOp 契约）；
 *  ③ 官方骨架往返（键序无关比较——ES 不认键序）；
 *  ④ 负控：空值探测器能抓到真实空值（不是恒真）。
 */
import { describe, it, expect } from 'vitest';
import { makeNodeByOp, serQueryNode, parseQueryNode } from '../utils/queryAst';
import { paramsForOp } from '../utils/queryAstOps';

function stable(v: any): string {
  if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/* 这些位置的空串一定是缺陷：ES 会 400 或行为不可预期 */
const REQUIRED_PATHS = [
  '$.script.script.source',
  '$.wrapper.query',
];

function emptyAt(v: any, path = '$', out: string[] = []): string[] {
  if (v === '') out.push(path);
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v)) emptyAt(val, path + '.' + k, out);
  }
  if (Array.isArray(v)) v.forEach((x, i) => emptyAt(x, path + '[' + i + ']', out));
  return out;
}

describe('1443 评分类算子创建与写回', () => {
  it('① 创建后写回：必填主值位不得是空串', () => {
    const ops = ['rank_feature', 'distance_feature', 'script', 'wrapper', 'script_score', 'pinned', 'constant_score'];
    const bad: string[] = [];
    for (const op of ops) {
      const n = makeNodeByOp(op);
      let body: any;
      try { body = serQueryNode(n); } catch (e: any) { bad.push(`${op} 抛错 ${e?.message}`); continue; }
      const hit = emptyAt(body).filter(p => REQUIRED_PATHS.includes(p));
      if (hit.length) bad.push(`${op} → ${JSON.stringify(body)}（必填空值：${hit.join(',')}）`);
    }
    expect(bad, '创建即写出必填空值：\n' + bad.join('\n')).toEqual([]);
  });

  it('② distance_feature 切算子后 origin 必须补齐', () => {
    expect(paramsForOp('distance_feature', { field: 'publish_time', pivot: '7d' }).origin).toBe('now');
    expect(paramsForOp('distance_feature', { origin: '2024-01-01', pivot: '7d' }).origin).toBe('2024-01-01');
  });

  it('③ 官方骨架往返（键序无关）', () => {
    const cases: Array<[string, any]> = [
      ['rank_feature 带 boost', { rank_feature: { field: 'rank_score', boost: 2 } }],
      ['rank_feature 省略 boost', { rank_feature: { field: 'rank_score' } }],
      ['distance_feature', { distance_feature: { field: 'publish_time', origin: 'now', pivot: '7d' } }],
      ['constant_score', { constant_score: { filter: { term: { s: 'A' } }, boost: 1.2 } }],
      ['function_score', { function_score: { query: { match_all: {} }, boost: 1.5, boost_mode: 'multiply' } }],
      ['script_score', { script_score: { query: { match_all: {} }, script: { source: 'Math.log(1 + doc["n"].value)' } } }],
      ['script 过滤', { script: { script: { source: 'doc["n"].value > 1' } } }],
      ['pinned 结构', { pinned: { ids: ['1', '2'], organic: { match_all: {} } } }],
    ];
    const bad: string[] = [];
    for (const [label, body] of cases) {
      const back = serQueryNode(parseQueryNode(body));
      if (stable(back) !== stable(body)) bad.push(`${label}：${JSON.stringify(back)} ≠ ${JSON.stringify(body)}`);
    }
    expect(bad, '骨架往返不符：\n' + bad.join('\n')).toEqual([]);
  });

  it('④ 负控：空值探测器能抓到真实空值', () => {
    expect(emptyAt({ a: '' })).toEqual(['$.a']);
    expect(emptyAt({ a: { b: '' } })).toEqual(['$.a.b']);
    expect(emptyAt({ a: 1, b: 'x' })).toEqual([]);
    /* 且 ① 的判据只认必填路径——非必填位的空串不误报 */
    expect(emptyAt({ rank_feature: { boost: '' } }).filter(p => REQUIRED_PATHS.includes(p))).toEqual([]);
  });
});
