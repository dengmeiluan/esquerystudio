/**
 * 五百二十一批：builder FieldSelect 按算子场景传 typePriority（候选分组置顶，不改候选集）。
 *  ① ClauseNode：term/terms/prefix → keyword 优先；range → date/数值族优先；其余算子无倾向（纯 rank 平铺）；
 *  ② WrapNodeRow：包装路由字段（join 字段/嵌套路径）keyword 优先；
 *  ③ GenericParams：新增可选 typePriority 透传（缺省空 = 既有调用方零增量）。
 * 契约边界：fields 传参与 dsl-assist 计数链路不动（fieldPickerPenetration 契约）——本 spec 只断言
 * 候选分组次序。弹层 teleport 到 body，断言查 document.body；字段名故意取 z_ 前缀使字母序与
 * 置顶序相反（置顶效果才可辨）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import WrapNodeRow from '../builder/WrapNodeRow.vue';
import GenericParams from '../builder/GenericParams.vue';
import AggTreeNode from '../builder/AggTreeNode.vue';
import type { LeafNode, WrapNode, AggNode } from '../../utils/queryAst';

beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });

/* 挂载后聚焦字段选择器开弹层，返回候选行文本序（.fs-item）与组头序（.fs-gh） */
async function openPopup(mount: (host: HTMLDivElement) => void) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  mount(host);
  const inp = host.querySelector('.fs-inp') as HTMLInputElement;
  inp.focus();
  await new Promise(r => setTimeout(r));
  return {
    items: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item')).map(el => el.textContent || ''),
    groups: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-gh')).map(el => el.textContent || ''),
  };
}

const TYPES4 = { a_title: 'text', z_status: 'keyword' };
const FIELDS4 = Object.keys(TYPES4);

function mountClause(node: LeafNode) {
  return openPopup(host => {
    const cur = ref(node);
    createApp({
      render: () => h(ClauseNode, {
        node: cur.value, fields: FIELDS4, types: TYPES4,
        'onUpdate:node': (n: LeafNode) => { cur.value = n; },
      }),
    }).mount(host);
  });
}

const mkLeaf = (patch: Partial<LeafNode>): LeafNode => ({
  id: 't1', type: 'leaf', op: 'term', field: 'z_status', value: 'x', params: {}, raw: null, ...patch,
});

describe('ClauseNode FieldSelect typePriority（521 批）', () => {
  it('term/terms/prefix 算子：keyword 字段置顶（组头 keyword 字段在前）', async () => {
    for (const op of ['term', 'terms', 'prefix']) {
      /* field 置空：FieldSelect 候选按 model-value 过滤，非空会把候选滤成单项、置顶效果不可辨 */
      const r = await mountClause(mkLeaf({ op: op as LeafNode['op'], field: '' }));
      expect(r.groups[0], op + ' 算子组头应 keyword 在前').toBe('精确值 字段'); /* 558b 随迁：组头人话词面 */
      expect(r.items[0], op + ' 算子候选应 keyword 字段置顶').toContain('z_status');
    }
  });

  it('range 算子：date 置顶、数值族次之、text 殿后', async () => {
    const types = { a_title: 'text', m_count: 'long', z_created: 'date' };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref(mkLeaf({ op: 'range', field: '', value: {} }));
    createApp({
      render: () => h(ClauseNode, {
        node: cur.value, fields: Object.keys(types), types,
        'onUpdate:node': (n: LeafNode) => { cur.value = n; },
      }),
    }).mount(host);
    const inp = host.querySelector('.fs-inp') as HTMLInputElement;
    inp.focus();
    await new Promise(r => setTimeout(r));
    const groups = Array.from(document.body.querySelectorAll<HTMLElement>('.fs-gh')).map(el => el.textContent || '');
    const items = Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item')).map(el => el.textContent || '');
    expect(groups[0]).toBe('日期 字段');
    expect(items[0]).toContain('z_created');
    expect(items.some(t => t!.includes('m_count'))).toBe(true);
    expect(items[items.length - 1]).toContain('a_title');
  });

  it('match 算子无类型倾向：空数组归一 null，保持纯 rank+字母序（现状不回归）', async () => {
    const r = await mountClause(mkLeaf({ op: 'match', field: '' }));
    expect(r.groups).toEqual(['文本 字段', '精确值 字段']); /* 558b 随迁：组头人话词面 */
    expect(r.items[0]).toContain('a_title');
  });
});

describe('WrapNodeRow FieldSelect typePriority（521 批 / W3b 按 op 分派）', () => {
  /* W3b 核真：useIndexFields.walk 把 mapping 的 type:'nested'/'join' 按原类型入表、
     纯 properties 节点入 'object'——包装路由字段类型是 nested/object/join，
     原 ['keyword'] 置顶基本永不命中（打空），改按 node.op 分派。 */
  const WRAP_TYPES = { a_title: 'text', z_status: 'keyword', m_obj: 'object', z_nested: 'nested', j_rel: 'join' };
  const WRAP_FIELDS = Object.keys(WRAP_TYPES);

  it('nested：嵌套路径字段（nested/object 类型）置顶，keyword 殿后', async () => {
    const node: WrapNode = { id: 'w1', type: 'wrap', op: 'nested', field: '', child: null, params: {} };
    const r = await openPopup(host => {
      const cur = ref(node);
      createApp({
        render: () => h(WrapNodeRow, {
          node: cur.value, fields: WRAP_FIELDS, types: WRAP_TYPES,
          'onUpdate:node': (n: WrapNode) => { cur.value = n; },
        }),
      }).mount(host);
    });
    expect(r.groups[0]).toBe('嵌套对象 字段'); /* 558b 随迁：组头人话词面 */
    expect(r.groups[1]).toBe('对象 字段'); /* 558b 随迁：组头人话词面 */
    expect(r.items[0]).toContain('z_nested');
    expect(r.items[1]).toContain('m_obj');
    /* 非 prio 类型归「其他」组殿后（原 keyword 不再置顶） */
    expect(r.groups[r.groups.length - 1]).toBe('其他 字段');
  });

  it('has_child/has_parent：join 字段置顶；未知 wrap 算子回落 keyword', async () => {
    for (const op of ['has_child', 'has_parent']) {
      const node: WrapNode = { id: 'w2', type: 'wrap', op, field: '', child: null, params: {} };
      const r = await openPopup(host => {
        const cur = ref(node);
        createApp({
          render: () => h(WrapNodeRow, {
            node: cur.value, fields: WRAP_FIELDS, types: WRAP_TYPES,
            'onUpdate:node': (n: WrapNode) => { cur.value = n; },
          }),
        }).mount(host);
      });
      expect(r.groups[0], op + ' 组头应 join 在前').toBe('父子关联 字段'); /* 558b 随迁：组头人话词面 */
      expect(r.items[0]).toContain('j_rel');
    }
  });
});

describe('GenericParams typePriority 透传（521 批）', () => {
  const mountGp = (typePriority?: string[]) => openPopup(host => {
    createApp({
      render: () => h(GenericParams, {
        value: { field: '' }, fieldKeys: ['field'], fields: FIELDS4, types: TYPES4,
        ...(typePriority !== undefined ? { typePriority } : {}),
        onUpdate: () => {},
      }),
    }).mount(host);
  });

  it('传 keyword 优先 → 字段键行候选 keyword 置顶', async () => {
    const r = await mountGp(['keyword']);
    expect(r.groups[0]).toBe('精确值 字段'); /* 558b 随迁：组头人话词面 */
    expect(r.items[0]).toContain('z_status');
  });

  it('缺省（既有调用方零增量）：纯 rank+字母序平铺', async () => {
    const r = await mountGp();
    expect(r.items[0]).toContain('a_title');
  });
});

describe('AggTreeNode aggTypePriority（五百三十一批补全：数值聚合/range）', () => {
  const A_FIELDS = ['a_title', 'm_count', 'z_created'];
  const A_TYPES: Record<string, string> = { a_title: 'text', m_count: 'long', z_created: 'date' };
  const mkAgg = (op: string) => openPopup(host => {
    const cur = ref<AggNode>({ id: 'a1', name: 'x', op, body: { field: '' }, children: [], meta: {}, aggKey: 'aggs' });
    createApp({
      render: () => h(AggTreeNode, {
        node: cur.value, fields: A_FIELDS, types: A_TYPES,
        'onUpdate:node': (n: AggNode) => { cur.value = n; },
      }),
    }).mount(host);
  });

  it('数值聚合族：数值字段置顶（组头数值在前）', async () => {
    for (const op of ['avg', 'min', 'max', 'sum', 'cardinality', 'histogram']) {
      const r = await mkAgg(op);
      expect(r.groups[0], op + ' 组头应数值在前').toBe('数值 字段');
      expect(r.items[0], op + ' 候选应数值字段置顶').toContain('m_count');
    }
  });

  it('range 聚合：date 置顶、数值族次之、text 殿后', async () => {
    const r = await mkAgg('range');
    expect(r.groups[0]).toBe('日期 字段');
    expect(r.items[0]).toContain('z_created');
    expect(r.items[1]).toContain('m_count');
    expect(r.items[r.items.length - 1]).toContain('a_title');
  });
});
