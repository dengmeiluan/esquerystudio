import { describe, it, expect } from 'vitest';
import { makeNodeByOp, serializeTree, parseTree, WRAP_META, type QueryTree } from '../queryAst';
import { OPS_META, MULTI_META, RETRIEVER_META } from '../queryAstOps';

/* 1161：全算子 loop 审计——不是抽查某个算子，而是把注册表里**每一个**算子都过一遍
 「工厂造节点 → 序列化 → 反解析 → 再序列化」，两轮序列化必须逐字节一致。
 这抓的是「用户真的能把这个算子放进树里并原样取回」这一类断裂：
 工厂给的空值形态不被 parse 认回、serialize 少写/多写键、wrap/multi 的子键漂移。
 注：这是结构往返（不是语义正确性），语义由各自单测覆盖。 */
/* 用真实解析出的 bool 根做容器（避免手搓节点漏字段），只把 must 换成待测算子 */
function treeWith(node: any): QueryTree {
  const base = parseTree({ query: { bool: { must: [{ match_all: {} }] } } });
  if (!base.ok) throw new Error('基准树解析失败');
  const root = (base.tree as any).root;
  root.must = [node];
  return base.tree;
}

const ALL_OPS = [
  ...Object.keys(OPS_META),
  ...Object.keys(WRAP_META),
  ...Object.keys(MULTI_META),
];

describe('1161 全算子结构往返（工厂→序列化→反解析→再序列化）', () => {
  it('注册表非空且覆盖三类算子', () => {
    expect(Object.keys(OPS_META).length).toBeGreaterThan(40);
    expect(Object.keys(WRAP_META).length).toBeGreaterThan(5);
    expect(Object.keys(MULTI_META).length).toBeGreaterThan(5);
    expect(ALL_OPS.length).toBeGreaterThan(55);
  });

  it.each(ALL_OPS)('%s 结构往返保真', (op) => {
    let node: any;
    try {
      node = makeNodeByOp(op);
    } catch (e: any) {
      throw new Error(`makeNodeByOp('${op}') 抛错：${e?.message || e}`);
    }
    /* match_all / match_none 工厂回落 match_all 节点，是既有契约 */
    const t1 = treeWith(node);
    let body: any;
    try {
      body = serializeTree(t1);
    } catch (e: any) {
      throw new Error(`serializeTree 抛错：${e?.message || e}`);
    }
    const p = parseTree(body);
    expect(p.ok, `序列化产物必须能被反解析：${JSON.stringify(body).slice(0, 200)}`).toBe(true);
    if (!p.ok) return;
    const body2 = serializeTree(p.tree);
    expect(body2, `两轮序列化必须一致（${op}）`).toEqual(body);
  });
});

describe('1161 检索器变体结构往返', () => {
  it.each(Object.keys(RETRIEVER_META))('%s', (kind) => {
    const meta = RETRIEVER_META[kind];
    /* 最小合法体：按 kind 造出 retriever 对象（query/flat/list/child 四形态） */
    const minimal: Record<string, any> = {};
    if (meta.kind === 'query') minimal.query = { match_all: {} };
    if (meta.kind === 'flat') { minimal.field = 'v'; minimal.query_vector = [0.1]; }
    if (meta.kind === 'list') {
      const item = meta.wrapped ? { retriever: { standard: { query: { match_all: {} } } } } : { standard: { query: { match_all: {} } } };
      minimal[meta.listKey || 'retrievers'] = [item];
    }
    if (meta.kind === 'child') minimal[meta.childKey || 'retriever'] = { standard: { query: { match_all: {} } } };
    const body = { retriever: { [kind]: minimal } };
    const p = parseTree(body);
    expect(p.ok, `${kind} 应能解析`).toBe(true);
    if (!p.ok) return;
    expect(serializeTree(p.tree), `${kind} 往返保真`).toEqual(body);
  });
});
