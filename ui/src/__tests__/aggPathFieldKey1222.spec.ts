/**
 * 1222：聚合「字段键」与字段选择器的一致性。
 *
 * 现状机制：`AggTreeNode` 用 `aggFieldKeys` 告诉 `GenericParams` 哪些键该渲染 FieldSelect
 * （可从 mapping 挑字段，带 rank/分组/类型徽标/mark）。此前它写死 `['field']`，
 * 于是**字段键不叫 `field` 的算子就拿不到选择器**。
 *
 * 真浏览器实测（`size:0 + aggs`，展开「检索参数」，按 `.agn` 逐个查 `.fs` 数量）：
 *   修复前：nested=1（仅子聚合 terms.field 有；`path` 是裸输入）、reverse_nested=0、terms=1
 *   修复后：nested=2（`path=comments` 也有了）、reverse_nested=1（`path=_`）、terms=1（不变）
 * 也就是说 `nested` / `reverse_nested` 的**嵌套路径**此前只能凭记忆手打——错一个字母
 * ES 就找不到 nested 文档，而同一屏的 terms.field 却能点选。这是"同一件事两种待遇"的缺口。
 *
 * 本 spec 锁住「字段键 → 选择器键」的映射表本身，防止有人把 path 又改回裸输入、
 * 或误把其它算子的键也改成 path。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1439：字段键集合上收到 queryAstOps（补全侧 aggBodyKeys 要与之同源），
   组件只负责把集合映射成 fieldKeys——两处分别断言。 */
const src = readFileSync(join(__dirname, '../components/builder/AggTreeNode.vue'), 'utf-8');
const opsSrc = readFileSync(join(__dirname, '../utils/queryAstOps.ts'), 'utf-8');

describe('1222 聚合字段键的一致性', () => {
  it('nested / reverse_nested 的字段键是 path，且接上了字段选择器', () => {
    expect(opsSrc).toContain("export const PATH_BODY_AGGS: ReadonlySet<string> = new Set(['nested', 'reverse_nested']);");
    expect(src).toContain("if (PATH_BODY_AGGS.has(props.node.op)) return ['path'];");
    /* 1439：import 同源口径不变，名单随单源收口扩容（NUMERIC_FIELD_TYPES 也在这里） */
    /* 1439: import 同源口径不变，名单随单源收口扩容 */
    expect(src).toContain("FIELD_BODY_AGGS, PATH_BODY_AGGS");
    expect(src).toContain("} from '../../utils/queryAstOps';");
  });

  it('其余聚合仍走 field（不被 path 表误伤）', () => {
    expect(src).toContain("return FIELD_BODY_AGGS.has(props.node.op) ? ['field'] : [];");
    /* FIELD_BODY_AGGS 里不得混入 path 型算子 */
    const m = opsSrc.match(/export const FIELD_BODY_AGGS: ReadonlySet<string> = new Set\(\[([\s\S]*?)\]\);/);
    expect(m).toBeTruthy();
    expect(m![1]).not.toContain("'nested'");
    expect(m![1]).not.toContain("'reverse_nested'");
  });

  it('fieldKeys 真的传给了 GenericParams（不是算出来没用）', () => {
    expect(src).toMatch(/:field-keys="aggFieldKeys"/);
  });
});
