/* 985 批：查询构建树算子大扩充。双向无损硬契约覆盖新算子全集：
   多字段形态（fields）/ 具名字段键形态（named）/ 无字段形态（none）/
   对象值算子（geo 系/terms_set/intervals 等）/ geo_distance 混层特判 /
   复合包装（constant_score 等 wrap 扩员）/ 多子查询容器（boosting/dis_max）。
   serialize(parse(x)) 必须与 x 深度相等——零降级的数学保证不因算子扩充松动。 */
import { describe, it, expect } from 'vitest';
import {
  parseTree, serializeTree, parseQueryNode, serQueryNode,
  findNode, updateNodeById, removeNodeById, moveNode, makeNodeByOp,
} from '../utils/queryAst';
import type { LeafNode, MultiNode, QueryNode } from '../utils/queryAst';
import { OPS_META, ADV_MENU, labelOfOp, RICH_OPS, MULTI_META } from '../utils/queryAstOps';

const roundTrip = (name: string, dsl: any) => {
  it(name, () => {
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
};

describe('985 多字段形态（fields）往返无损', () => {
  roundTrip('multi_match 全形态', { query: { multi_match: { query: '债券 利率', fields: ['title', 'summary'], type: 'best_fields', operator: 'and' } } });
  roundTrip('multi_match 缺 fields 键', { query: { multi_match: { query: 'x' } } });
  roundTrip('multi_match 空 fields 数组', { query: { multi_match: { query: 'x', fields: [] } } });
  roundTrip('simple_query_string', { query: { simple_query_string: { query: 'kw +phra', fields: ['a', 'b'], default_operator: 'and' } } });
  roundTrip('combined_fields', { query: { combined_fields: { query: 'x', fields: ['t^2'] } } });
  roundTrip('more_like_this', { query: { more_like_this: { like: '样本文本', fields: ['title'], min_term_freq: 1 } } });
});

describe('985 具名字段键形态（named）往返无损', () => {
  roundTrip('query_string 带 default_field', { query: { query_string: { query: 'a AND b', default_field: 'title', default_operator: 'and' } } });
  roundTrip('query_string 无 default_field', { query: { query_string: { query: 'x' } } });
  roundTrip('query_string default_field 数组进 params 原样', { query: { query_string: { query: 'x', default_field: ['t1', 't2'] } } });
  roundTrip('percolate', { query: { percolate: { field: 'query', document: { msg: 'hi' }, name: 'p1' } } });
});

describe('985 无字段形态（none）往返无损', () => {
  roundTrip('ids', { query: { ids: { values: ['1', '2'] } } });
  roundTrip('ids 带参数', { query: { ids: { values: ['1'], boost: 2 } } });
  roundTrip('script', { query: { script: { script: { source: "doc['a'].value > 1", params: { k: 1 } } } } });
  roundTrip('wrapper', { query: { wrapper: { query: 'eyJ0ZXJtIjp7fX0=' } } });
});

describe('985 对象值算子（field 形态 wrap=none）往返无损', () => {
  roundTrip('terms_set', { query: { terms_set: { codes: ['a', 'b'], minimum_should_match_field: 'required_matches' } } });
  roundTrip('geo_bounding_box', { query: { geo_bounding_box: { location: { top_left: { lat: 40, lon: -70 }, bottom_right: { lat: 39, lon: -71 } } } } });
  roundTrip('geo_polygon', { query: { geo_polygon: { location: { points: [{ lat: 40, lon: -70 }, { lat: 39, lon: -71 }] } } } });
  roundTrip('geo_shape', { query: { geo_shape: { region: { shape: { type: 'envelope', coordinates: [[-70, 40], [-71, 39]] }, relation: 'within' } } } });
  roundTrip('intervals', { query: { intervals: { text: { match: { query: '债券', max_gaps: 0, ordered: true } } } } });
  roundTrip('intervals allOf 真实组合形态', { query: { intervals: { text: { allOf: { ordered: true, clauses: [{ match: { query: '债券' } }, { anyOf: { clauses: [{ match: { query: '利率' } }] } }] } } } } });
  roundTrip('parent_id（join 族叶子）', { query: { parent_id: { field: 'relation', type: 'answer', id: '42' } } });
  roundTrip('match_bool_prefix', { query: { match_bool_prefix: { title: { query: '债 利', operator: 'and' } } } });
  roundTrip('rank_feature 标量', { query: { rank_feature: { features: { page_rank: 3.5 } } } });
});

describe('985 geo_distance 混层特判', () => {
  roundTrip('对象值 + 散参数同层', { query: { geo_distance: { distance: '200km', location: { lat: 40, lon: -70 } } } });
  roundTrip('字段值是字符串形态落 raw 不丢', { query: { geo_distance: { distance: '12km', location: '40,-70' } } });
  it('parse 投影：对象值键 = 字段，散参数进 params', () => {
    const n = parseQueryNode({ geo_distance: { distance: '200km', location: { lat: 1, lon: 2 } } }) as LeafNode;
    expect(n.type).toBe('leaf');
    expect(n.field).toBe('location');
    expect(n.value).toEqual({ lat: 1, lon: 2 });
    expect(n.params).toEqual({ distance: '200km' });
  });
});

describe('985 span 跨度系与 distance_feature 往返无损', () => {
  roundTrip('distance_feature 散层', { query: { distance_feature: { field: 'dt', pivot: '7d', queries: ['a', 'b'] } } });
  roundTrip('span_term 简写', { query: { span_term: { t: 'x' } } });
  roundTrip('span_term 完整体（term 主值键）', { query: { span_term: { t: { term: 'x', boost: 2 } } } });
  roundTrip('span_near', { query: { span_near: { clauses: [{ span_term: { t: 'a' } }, { span_term: { t: 'b' } }], slop: 2, in_order: false } } });
  roundTrip('span_or', { query: { span_or: { clauses: [{ span_term: { t: 'a' } }] } } });
  roundTrip('span_not', { query: { span_not: { include: { span_term: { t: 'a' } }, exclude: { span_term: { t: 'b' } }, dist: 3 } } });
  roundTrip('span_containing', { query: { span_containing: { little: { span_term: { t: 'a' } }, big: { span_term: { t: 'b' } } } } });
  roundTrip('span_within', { query: { span_within: { little: { span_term: { t: 'a' } }, big: { span_term: { t: 'b' } } } } });
  roundTrip('span_first', { query: { span_first: { match: { span_term: { t: 'a' } }, end: 3 } } });
  roundTrip('span_multi', { query: { span_multi: { match: { term: { t: 'a' } }, boost: 1.2 } } });
  it('span_near parse 投影：clauses 数组分区 + slop 参数分账', () => {
    const n = parseQueryNode({ span_near: { clauses: [{ span_term: { t: 'a' } }], slop: 1 } }) as MultiNode;
    expect(n.type).toBe('multi');
    expect(n.children.map(c => c.key)).toEqual(['clauses']);
    expect(n.params).toEqual({ slop: 1 });
  });
  /* 产线真实形态（onshore-sentiment-service-apple ElasticSearchUtils.
     getIntervalQueryOrderBuilderMatch：IntervalQueryBuilder(field,
     Match(text, maxGaps, ordered=true, filter=null, analyzer=null))——
     maxGaps=0 短语等价 / -1 match 等价 / 多字段 ifPresent(x::or) 并列进 should） */
  roundTrip('intervals 产线形态 A：短语等价（max_gaps 0, ordered）', {
    query: { intervals: { sentimentTitleStandard: { match: { query: '债券 利率', max_gaps: 0, ordered: true } } } },
  });
  roundTrip('intervals 产线形态 B：match 等价（max_gaps -1）', {
    query: { intervals: { sentimentTitleStandard: { match: { query: '债券 利率', max_gaps: -1, ordered: true } } } },
  });
  it('intervals 产线组合：多字段 ifPresent(x::or) = bool should 并列，逐子句富表单投影', () => {
    const dsl = {
      query: {
        bool: {
          should: [
            { intervals: { sentimentTitle: { match: { query: '茅台', max_gaps: 0, ordered: true } } } },
            { intervals: { sentimentTitleStandard: { match: { query: '茅台', max_gaps: 0, ordered: true } } } },
            { intervals: { contentHtml: { match: { query: '茅台', max_gaps: -1, ordered: true } } } },
          ],
          minimum_should_match: 1,
        },
      },
    };
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
    const root = r.tree.root as any;
    expect(root.children.every((c: any) => c.node.type === 'leaf' && c.node.op === 'intervals' && c.node.field
      && typeof c.node.value === 'object')).toBe(true);   // 三子句全部富表单化（非 raw）
  });
});

describe('985 复合包装（wrap 扩员）往返无损', () => {
  roundTrip('constant_score', { query: { constant_score: { filter: { term: { status: 'active' } }, boost: 1.5 } } });
  roundTrip('function_score 带函数数组', { query: { function_score: { query: { match_all: {} }, functions: [{ weight: 2 }], boost_mode: 'multiply' } } });
  roundTrip('script_score', { query: { script_score: { query: { match_all: {} }, script: { source: 'doc.a.value' } } } });
  roundTrip('pinned', { query: { pinned: { ids: ['1', '2'], organic: { match: { title: 'x' } } } } });
  it('parse 投影：constant_score 子查询键 filter、无路由字段', () => {
    const n = parseQueryNode({ constant_score: { filter: { term: { a: 1 } }, boost: 2 } });
    expect(n.type).toBe('wrap');
    if (n.type !== 'wrap') return;
    expect(n.field).toBeNull();
    expect(n.childKey).toBe('filter');
    expect(n.params).toEqual({ boost: 2 });
    expect(serQueryNode(n)).toEqual({ constant_score: { filter: { term: { a: 1 } }, boost: 2 } });
  });
  it('子查询键缺席落 raw（畸形无损）', () => {
    const n = parseQueryNode({ constant_score: { boost: 1 } });
    expect(n.type).toBe('leaf');
    expect(serQueryNode(n)).toEqual({ constant_score: { boost: 1 } });
  });
});

describe('985 多子查询容器（multi）', () => {
  roundTrip('boosting 双分区', { query: { boosting: { positive: { match: { t: '好' } }, negative: { match: { t: '坏' } }, negative_boost: 0.2 } } });
  roundTrip('dis_max 多查询', { query: { dis_max: { queries: [{ term: { a: 1 } }, { term: { b: 2 } }], tie_breaker: 0.3 } } });
  roundTrip('dis_max 单查询数组形态原样', { query: { dis_max: { queries: [{ term: { a: 1 } }] } } });
  it('parse 投影：boosting 分区键与 params 分账', () => {
    const n = parseQueryNode({ boosting: { positive: { term: { a: 1 } }, negative: { term: { b: 2 } }, negative_boost: 0.5 } }) as MultiNode;
    expect(n.type).toBe('multi');
    expect(n.children.map(c => c.key)).toEqual(['positive', 'negative']);
    expect(n.params).toEqual({ negative_boost: 0.5 });
  });
  it('嵌套组合：bool 包 multi 包 wrap', () => {
    const dsl = { query: { bool: { must: [{ boosting: { positive: { nested: { path: 'p', query: { term: { 'p.x': 1 } } } }, negative: { match_all: {} }, negative_boost: 0.1 } }] } } };
    const r = parseTree(dsl);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(serializeTree(r.tree)).toEqual(dsl);
  });
});

describe('985 树操作下钻 multi', () => {
  const SRC = { boosting: { positive: { term: { a: 1 } }, negative: { bool: { must: [{ term: { b: 2 } }] } }, negative_boost: 0.3 } };
  const kids = (n: QueryNode) => (n as MultiNode).children;

  it('findNode 下钻 multi 子查询', () => {
    const root = parseQueryNode(SRC);
    const inner = kids(root)[1].node;
    expect(findNode(root, inner.id)?.id).toBe(inner.id);
    expect(findNode(root, 'nope')).toBeNull();
  });
  it('updateNodeById 更新 multi 子查询，原树不变', () => {
    const root = parseQueryNode(SRC);
    const a = kids(root)[0].node as LeafNode;
    const next = updateNodeById(root, a.id, n => ({ ...(n as LeafNode), value: 9 }));
    expect(serQueryNode(next)).toEqual({ boosting: { positive: { term: { a: 9 } }, negative: { bool: { must: [{ term: { b: 2 } }] } }, negative_boost: 0.3 } });
    expect(serQueryNode(root)).toEqual(SRC);
  });
  it('removeNodeById 删 multi 子查询', () => {
    const root = parseQueryNode(SRC);
    const next = removeNodeById(root, kids(root)[0].node.id);
    expect(serQueryNode(next)).toEqual({ boosting: { negative: { bool: { must: [{ term: { b: 2 } }] } }, negative_boost: 0.3 } });
  });
  it('拖拽防环：multi 的后代 bool 拒绝作为自身拖拽落点', () => {
    const root = parseQueryNode({ bool: { must: [SRC] } });
    const multi = (root as any).children[0].node;
    const innerBool = kids(multi)[1].node;
    expect(serQueryNode(moveNode(root, multi.id, innerBool.id, 'must'))).toEqual({ bool: { must: [SRC] } });
  });
});

describe('985 节点工厂 makeNodeByOp', () => {
  it('span 系工厂形态正确（multi 分区/ 包装 childKey / term 主值）', () => {
    const sn = makeNodeByOp('span_near') as MultiNode;
    expect(sn.children.map(c => c.key)).toEqual(['clauses']);
    expect(sn.arrForm).toEqual({ clauses: true });
    const sf = makeNodeByOp('span_first') as any;
    expect(sf.childKey).toBe('match');
    const st = makeNodeByOp('span_term') as LeafNode;
    expect(st.field).toBe('');
    expect(st.value).toBe('');
  });
  it('对象值算子初值 {}，数组值初值 []，标量初值空串', () => {
    /* 1119：terms_set 字段键持词项数组（官方体），初值 [] 而非 {} */
    expect((makeNodeByOp('terms_set') as LeafNode).value).toEqual([]);
    expect((makeNodeByOp('terms') as LeafNode).value).toEqual([]);
    expect((makeNodeByOp('term') as LeafNode).value).toBe('');
    expect((makeNodeByOp('term') as LeafNode).field).toBe('');
  });
  it('多字段形态 fields=[] 无字段；无字段形态 field=null', () => {
    const mm = makeNodeByOp('multi_match') as LeafNode;
    expect(mm.fields).toEqual([]);
    expect(mm.field).toBeNull();
    const ids = makeNodeByOp('ids') as LeafNode;
    expect(ids.field).toBeNull();
    /* 1045：ids 空节点给数组初值（ClauseNode 直接进入 chip 编辑，不再标量空串） */
    expect(ids.value).toEqual([]);
  });
  it('wrap 工厂：路由字段空串 / 无路由字段 null / childKey 记忆', () => {
    const nested = makeNodeByOp('nested') as any;
    expect(nested.type).toBe('wrap');
    expect(nested.field).toBe('');
    expect(nested.childKey).toBe('query');
    const cs = makeNodeByOp('constant_score') as any;
    expect(cs.field).toBeNull();
    expect(cs.childKey).toBe('filter');
  });
  it('multi 工厂：boosting 双分区各含 match_all 空槽', () => {
    const b = makeNodeByOp('boosting') as MultiNode;
    expect(b.type).toBe('multi');
    expect(b.children.map(c => c.key)).toEqual(['positive', 'negative']);
    expect(b.children.every(c => (c.node as LeafNode).op === 'match_all')).toBe(true);
  });
  it('未知 op 回退 match_all', () => {
    expect((makeNodeByOp('no_such_op') as LeafNode).op).toBe('match_all');
  });
});

describe('985 注册表契约', () => {
  it('fields/named/none 形态必须声明 mainKey（match_all/match_none 走既有特判豁免）', () => {
    for (const op of RICH_OPS) {
      const m = OPS_META[op];
      if (m.form === 'fields' || m.form === 'named' || (m.form === 'none' && op !== 'match_all' && op !== 'match_none')) {
        expect(m.mainKey, op + ' 缺 mainKey').toBeTruthy();
      }
      if (m.form === 'named') expect(m.fieldKey, op + ' 缺 fieldKey').toBeTruthy();
    }
  });
  it('ADV_MENU 分组成员全部已注册且有中文标签', () => {
    for (const g of ADV_MENU) {
      expect(g.ops.length, g.group).toBeGreaterThan(0);
      for (const op of g.ops) expect(labelOfOp(op)).not.toBe(op);
    }
  });
  it('MULTI_META 分区键表齐备（partLabel 全覆盖）', () => {
    for (const [op, meta] of Object.entries(MULTI_META)) {
      for (const k of meta.keys) expect(meta.partLabel[k], op + ':' + k).toBeTruthy();
    }
  });
});
