import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import AggTreeNode from '../builder/AggTreeNode.vue';
import type { AggNode } from '../../utils/queryAst';

/* 【预授权偏差D】apps 收集 + afterEach 统一 unmount（防 window/DOM 监听跨用例累积，项目既定范式） */
const apps: App[] = [];

function mountAgg(patch: Partial<AggNode> = {}, onRemove?: () => void) {
  const n: AggNode = {
    id: 'a1', name: 'by_status', op: 'terms', body: { field: 'status', size: 10 },
    children: [], meta: {}, aggKey: 'aggs', ...patch,
  };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(n);
  const app = createApp({
    render: () => h(AggTreeNode, {
      node: cur.value, fields: ['status', 'price'], types: { status: 'keyword', price: 'double' },
      'onUpdate:node': (x: AggNode) => { cur.value = x; },
      onRemove: () => onRemove?.(),
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}

const tick = () => new Promise(r => setTimeout(r));
beforeEach(() => { document.body.innerHTML = ''; localStorage.clear(); });
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

describe('AggTreeNode', () => {
  it('渲染名称与聚合类型', () => {
    const { host } = mountAgg();
    expect((host.querySelector('.agn-name') as HTMLInputElement).value).toBe('by_status');
    /* 聚合类型换二段式选择器后，值位在内层输入框（.agn-op → AggOpPicker 的 .agp-inp） */
    expect((host.querySelector('.agn-op-pick .agp-inp') as HTMLInputElement).value).toBe('terms');
  });

  it('改名 emit 新节点', async () => {
    const { host, cur } = mountAgg();
    const inp = host.querySelector('.agn-name') as HTMLInputElement;
    inp.value = 'by_state';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.name).toBe('by_state');
    expect(cur.value.id).toBe('a1');
  });

  it('换 op 保留 body（零降级，不静默丢参数）', async () => {
    const { host, cur } = mountAgg();
    const inp = host.querySelector('.agn-op-pick .agp-inp') as HTMLInputElement;
    inp.value = 'avg';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.op).toBe('avg');
    expect(cur.value.body).toEqual({ field: 'status', size: 10 });
  });

  it('对象 body 走 GenericParams', () => {
    const { host } = mountAgg();
    expect(host.querySelector('.agn-body .gp')).not.toBeNull();
    /* 计划原文断言 textContent 含 'status'，但 GenericParams 键/值都渲染在 input value（.gp-k/.gp-v），
       happy-dom 的 textContent 不含 input value（rootExtras.spec.ts「extras 渲染已有键」已用探针实证并同款处理）
       ——'status' 是 body.field 的值，改断言 .gp-v 值输入框，意图等价（body 数据经 GenericParams 可见）。
       五百一十九批：terms 的 body.field 行升级渲染 FieldSelect（.fs-inp），值不再落在 .gp-v——
       数据可见意图不变：.fs-inp 承载 field 值、.gp-v 留给 size */
    const vals = Array.from(host.querySelectorAll('.agn-body .gp-v')).map(el => (el as HTMLInputElement).value);
    expect(vals).toContain('10');
    expect((host.querySelector('.agn-body .fs-inp') as HTMLInputElement).value).toBe('status');
  });

  it('非标量 body 走单输入（原样保留）', () => {
    const { host } = mountAgg({ body: 5 });
    expect((host.querySelector('.agn-scalar') as HTMLInputElement).value).toBe('5');
  });

  it('加子聚合 → children+1 且递归渲染 .agn', async () => {
    const { host, cur } = mountAgg();
    (host.querySelector('.agn-add') as HTMLElement).click();
    await tick();
    expect(cur.value.children.length).toBe(1);
    expect(host.querySelectorAll('.agn').length).toBe(2);
  });

  it('删除 emit remove', () => {
    let fired = 0;
    const { host } = mountAgg({}, () => { fired++; });
    (host.querySelector('[title="删除聚合"]') as HTMLElement).click();
    expect(fired).toBe(1);
  });

  it('子聚合删中间项后再加不撞名', async () => {
    const { host, cur } = mountAgg();
    /* 递归渲染下每个子节点也带 .agn-add；模板中 children 渲染在按钮之前，
       故根节点的「子聚合」按钮恒为文档序最后一个——取最后一个确保点的是根（断言语义不变） */
    const clickRootAdd = () => {
      const btns = host.querySelectorAll('.agn-add');
      (btns[btns.length - 1] as HTMLElement).click();
    };
    clickRootAdd();
    await tick();
    clickRootAdd();
    await tick();
    expect(cur.value.children.map(c => c.name)).toEqual(['sub_1', 'sub_2']);
    cur.value = { ...cur.value, children: cur.value.children.filter(c => c.name !== 'sub_1') };
    await tick();
    clickRootAdd();
    await tick();
    const names = cur.value.children.map(c => c.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(['sub_2', 'sub_3']);
  });

  /* ==== 五百一十九批：聚合字段智能——top 常见聚合的 .field 键渲染 FieldSelect ==== */

  it('terms 聚合 body.field 行渲染 FieldSelect；非字段聚合回落裸键值表', async () => {
    const { host } = mountAgg();
    const fsInp = host.querySelector('.agn-body .fs-inp') as HTMLInputElement;
    expect(fsInp, 'field 键命中 → FieldSelect 输入').not.toBeNull();
    expect(fsInp.value, '字段值进 FieldSelect（happy-dom textContent 不含 input value，同既有探针结论）').toBe('status');
    const { host: h2 } = mountAgg({ op: 'top_hits' });
    expect(h2.querySelector('.agn-body .fs-inp'), 'top_hits 不在字段键聚合表 → 回落裸键值表').toBeNull();
    expect(h2.querySelector('.agn-body .gp-v')).not.toBeNull();
  });

  it('FieldSelect 选中字段回写 body.field', async () => {
    const { host, cur } = mountAgg();
    const inp = host.querySelector('.agn-body .fs-inp') as HTMLInputElement;
    inp.value = 'price';
    inp.dispatchEvent(new Event('input'));
    await tick();
    (document.body.querySelector('.fs-item') as HTMLElement).click();
    await tick();
    expect((cur.value.body as Record<string, unknown>).field).toBe('price');
  });

  /* ==== 五百三十一批：聚合 field 行类型置顶补全——数值聚合→数值族、range→date+数值族 ==== */

  /** 挂载指定 op 的聚合节点并聚焦 field 行 FieldSelect（弹层 teleport 到 body），返回候选/组头序 */
  async function openAggPopup(op: string) {
    const FIELDS = ['a_title', 'm_count', 'z_created'];
    const TYPES: Record<string, string> = { a_title: 'text', m_count: 'long', z_created: 'date' };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const cur = ref<AggNode>({ id: 'a9', name: 'x', op, body: { field: '' }, children: [], meta: {}, aggKey: 'aggs' });
    const app = createApp({
      render: () => h(AggTreeNode, {
        node: cur.value, fields: FIELDS, types: TYPES,
        'onUpdate:node': (n: AggNode) => { cur.value = n; },
      }),
    });
    apps.push(app);
    app.mount(host);
    const inp = host.querySelector('.fs-inp') as HTMLInputElement;
    inp.focus();
    await tick();
    return {
      items: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item')).map(el => el.textContent || ''),
      groups: Array.from(document.body.querySelectorAll<HTMLElement>('.fs-gh')).map(el => el.textContent || ''),
    };
  }

  it('五百三十一批：数值聚合（avg/min/max/sum/cardinality/histogram）field 行数值族置顶', async () => {
    for (const op of ['avg', 'min', 'max', 'sum', 'cardinality', 'histogram']) {
      const r = await openAggPopup(op);
      expect(r.groups[0], op + ' 组头应数值族在前').toBe('数值 字段');
      expect(r.items[0], op + ' 候选应数值字段置顶（字母序故意与置顶序相反）').toContain('m_count');
      /* 非 prio 字段殿后组保 fields() 序：a_title(idx0) 在 z_created(idx2) 前 */
      expect(r.items[1], op + ' 殿后组保 fields() 序').toContain('a_title');
      expect(r.items[r.items.length - 1], op + ' 殿后组收尾').toContain('z_created');
    }
  });

  it('五百三十一批：range 聚合 field 行 date 置顶、数值族次之', async () => {
    const r = await openAggPopup('range');
    expect(r.groups[0]).toBe('日期 字段');
    expect(r.items[0]).toContain('z_created');
    expect(r.items[1]).toContain('m_count');
    expect(r.items[r.items.length - 1]).toContain('a_title');
    /* 候选集不变：三字段全在 */
    expect(r.items.length).toBe(3);
  });
});
