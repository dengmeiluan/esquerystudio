/* 1020 批组件契约：聚合 body 按类型 schema 富表单（AggTreeNode 挂接）——
   ① 在册聚合（terms/date_histogram/…）body 具名参数升类型化控件（enum 下拉/布尔/数值），
     field 行 FieldSelect 既有（field-keys 不受 schema 影响）
   ② 编辑写回 body（整树序列化往返）；未登记键自由表加键零丢失
   ③ 未登记聚合类型零 schema = 裸表（现状不变） */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import AggTreeNode from '../builder/AggTreeNode.vue';
import { serializeTree, parseTree, type AggNode } from '../../utils/queryAst';
import { AGG_BODY_PARAMS, AGG_OPS } from '../../utils/queryAstOps';

function mkAgg(op: string, body: unknown): AggNode {
  return { id: 'a1', name: 'my_agg', op, body, children: [], meta: {}, aggKey: 'aggs' };
}

const apps: App[] = [];
function mount(node: AggNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(AggTreeNode, {
      node: cur.value, fields: ['status', 'created'], types: { status: 'keyword', created: 'date' },
      'onUpdate:node': (n: AggNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1020 聚合 body schema 富表单', () => {
  it('terms：execution_hint 在册参数渲染下拉（enum 档）；field 行仍是 FieldSelect；换值写回', async () => {
    const { host, cur } = mount(mkAgg('terms', { field: 'status', size: 10, execution_hint: 'map' }));
    /* enum 档 = select 元素且选项三档 */
    const sel = [...host.querySelectorAll<HTMLSelectElement>('.agn-body select')].find(s => [...s.options].some(o => o.value === 'global_ordinals'));
    expect(sel, 'execution_hint 枚举下拉').toBeTruthy();
    expect(sel!.value).toBe('map');
    /* field 行 FieldSelect 在场（schema 不抢字段行） */
    expect(host.querySelector('.agn-body .fs-inp'), 'field 行 FieldSelect').not.toBeNull();
    /* enum 换值写回 body */
    sel!.value = 'global_ordinals';
    sel!.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    expect((cur.value.body as Record<string, unknown>).execution_hint).toBe('global_ordinals');
  });

  it('date_histogram：calendar_interval 文本档渲染与编辑写回；整树序列化往返', async () => {
    const { host, cur } = mount(mkAgg('date_histogram', { field: 'created', calendar_interval: 'day', min_doc_count: 1 }));
    const inputs = [...host.querySelectorAll<HTMLInputElement>('.agn-body input')];
    const cal = inputs.find(i => i.value === 'day')!;
    cal.value = 'month';
    cal.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect((cur.value.body as Record<string, unknown>).calendar_interval).toBe('month');
    /* 整树序列化往返（body 直通零 AST 改动） */
    const t = parseTree({ aggs: { by_day: { [cur.value.op]: cur.value.body as Record<string, unknown> } } });
    if (!t.ok) throw new Error('parse failed');
    expect(serializeTree({ ...t.tree, aggs: [t.tree.aggs![0]] })).toEqual({
      aggs: { by_day: { date_histogram: { field: 'created', calendar_interval: 'month', min_doc_count: 1 } } },
    });
  });

  it('未登记键仍可自由加（零丢失）：terms 加 order 对象键', async () => {
    const { host, cur } = mount(mkAgg('terms', { field: 'status' }));
    const addKey = host.querySelector<HTMLInputElement>('.agn-body .gp-add input')!;
    addKey.value = 'order';
    addKey.dispatchEvent(new Event('input'));
    (host.querySelector('.agn-body .gp-add button') as HTMLElement).click();
    await tick();
    expect('order' in (cur.value.body as Record<string, unknown>)).toBe(true);
  });

  it('未登记聚合类型（percentiles）零 schema 裸表（现状不变）', () => {
    const { host } = mount(mkAgg('percentiles', { field: 'price', percents: [50, 95] }));
    expect(host.querySelector('.agn-body .gp'), '裸键值表').not.toBeNull();
    const sel = host.querySelector('.agn-body select');
    expect(sel, '无枚举下拉').toBeNull();
  });

  it('注册表与建议表一致性：schema 键不与 field 冲突', () => {
    for (const [op, ps] of Object.entries(AGG_BODY_PARAMS)) {
      expect(AGG_OPS[op], op + ' 在建议表中').toBeTruthy();
      expect(ps.map(p => p.key)).not.toContain('field');
    }
    expect(AGG_BODY_PARAMS.terms.find(p => p.key === 'execution_hint')?.options)
      .toEqual(['map', 'global_ordinals', 'term_ordinals']);
  });
});
