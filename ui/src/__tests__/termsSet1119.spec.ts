import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseTree, serializeTree, makeNodeByOp } from '../utils/queryAst';
import { OPS_META } from '../utils/queryAstOps';

/* 1119：terms_set 官方体 = {field: [词项…], minimum_should_match_field|script}——
 字段键持数组、msm 与字段同层。此前带 msm 的合法 DSL 整条落 raw，构建器新建又把
 msm 写进字段对象（400）。现走「字段 + 兄弟参数」富表单，数组用 chips 编辑。 */
const clause = readFileSync(join(__dirname, '../components/builder/ClauseNode.vue'), 'utf-8');

describe('1119 terms_set 字段数组 + 兄弟 msm', () => {
  it('带 minimum_should_match_field 往返无损且结构化', () => {
    const body = { query: { terms_set: { tags: ['a', 'b'], minimum_should_match_field: 'min_matches' } } };
    const r = parseTree(body);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const leaf: any = r.tree.root;
    expect(leaf.type).toBe('leaf');
    expect(leaf.op).toBe('terms_set');
    expect(leaf.field).toBe('tags');
    expect(leaf.value).toEqual(['a', 'b']);
    expect(leaf.params).toEqual({ minimum_should_match_field: 'min_matches' });
    expect(serializeTree(r.tree)).toEqual(body);
  });

  it('minimum_should_match_script 对象与无 msm 形态同样往返', () => {
    const withScript = { query: { terms_set: { tags: ['x'], minimum_should_match_script: { source: '2' } } } };
    const r1 = parseTree(withScript);
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(serializeTree(r1.tree)).toEqual(withScript);
    const plain = { query: { terms_set: { tags: ['x', 'y'] } } };
    const r2 = parseTree(plain);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(serializeTree(r2.tree)).toEqual(plain);
  });

  it('新建节点值形态为数组；参数 schema 暴露两个 msm 键', () => {
    const n: any = makeNodeByOp('terms_set');
    expect(n.value).toEqual([]);
    expect(n.field).toBe('');
    const keys = (OPS_META.terms_set.params || []).map(p => p.key);
    expect(keys).toEqual(['minimum_should_match_field', 'minimum_should_match_script']);
  });

  it('构建器接线：数组 chips + 多值占位；msm 走参数面板', () => {
    expect(clause).toContain("const ARRAY_VAL_OPS = new Set(['terms', 'ids', 'terms_set']);");
    expect(clause).toContain("if (props.node.op === 'terms' || props.node.op === 'terms_set') return '输入值后回车或逗号添加';");
    expect(clause).toContain('if (ARRAY_VAL_OPS.has(op)) {');
  });
});
