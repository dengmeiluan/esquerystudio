/* 1022 批组件契约：date_range/range 的 ranges 行编辑 + filters 命名/匿名桶查询树
   （AggTreeNode 挂接，body 直通零 AST 改动）——
   ① ranges 三元组行渲染/编辑/增删（数值写数值、date-math 原样、空串删键、开区间）
   ② filters 命名桶：名编辑 + MiniTreeEditor 树编辑写回（ser 往返）；匿名数组形态
   ③ 参数表剥离面板键 + 表内加出路由回流；整树序列化往返 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import AggTreeNode from '../builder/AggTreeNode.vue';
import { serializeTree, emptyTree, type AggNode } from '../../utils/queryAst';

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
const mk = (op: string, body: unknown): AggNode =>
  ({ id: 'a1', name: 'my_agg', op, body, children: [], meta: {}, aggKey: 'aggs' });
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1022 date_range/range ranges 行编辑', () => {
  it('三元组行渲染；数值写数值、date-math 原样、空串删键', async () => {
    const { host, cur } = mount(mk('date_range', { field: 'created', ranges: [{ to: 'now-10M/M' }, { from: 100, to: 200, key: 'mid' }] }));
    const rows = [...host.querySelectorAll('.arp-row')];
    expect(rows.length).toBe(2);
    /* 第二行 from=100 to=200 key=mid */
    const inputs = [...rows[1].querySelectorAll<HTMLInputElement>('input')];
    expect(inputs.map(i => i.value)).toEqual(['100', '200', 'mid']);
    /* 改 from 为 date-math 串（原样字符串） */
    inputs[0].value = 'now-1y/y';
    inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect((cur.value.body as Record<string, unknown>).ranges).toEqual([
      { to: 'now-10M/M' },
      { from: 'now-1y/y', to: 200, key: 'mid' },
    ]);
    /* 数值写数值 */
    const fresh = [...host.querySelectorAll('.arp-row')][1].querySelectorAll<HTMLInputElement>('input');
    fresh[1].value = '300';
    fresh[1].dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(((cur.value.body as Record<string, unknown>).ranges as Record<string, unknown>[])[1].to).toBe(300);
    /* key 空串删键（开区间 from-only 合法形态） */
    const again = [...host.querySelectorAll('.arp-row')][1].querySelectorAll<HTMLInputElement>('input');
    again[2].value = '';
    again[2].dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(((cur.value.body as Record<string, unknown>).ranges as Record<string, unknown>[])[1]).toEqual({ from: 'now-1y/y', to: 300 });
  });

  it('加行/删行；range 聚合同构共用面板', async () => {
    const { host, cur } = mount(mk('range', { field: 'price', ranges: [{ from: 0 }] }));
    (host.querySelector('.arp-add') as HTMLElement).click();
    await tick();
    expect(((cur.value.body as Record<string, unknown>).ranges as unknown[]).length).toBe(2);
    (host.querySelectorAll('button[aria-label="删除区间行"]')[0] as HTMLElement).click();
    await tick();
    expect(cur.value.body).toEqual({ field: 'price', ranges: [{}] });
  });

  it('参数表视图剥 ranges；整树序列化往返', async () => {
    const { host, cur } = mount(mk('date_range', { field: 'created', format: 'yyyy', ranges: [{ from: '2020', to: '2021' }] }));
    expect([...host.querySelectorAll('.agn-body .gp-row')].every(r => !r.textContent?.includes('ranges'))).toBe(true);
    expect(serializeTree({ ...emptyTree(), aggs: [cur.value] }))
      .toEqual({ aggs: { my_agg: { date_range: { field: 'created', format: 'yyyy', ranges: [{ from: '2020', to: '2021' }] } } } });
  });
});

describe('1022 filters 命名/匿名桶查询树', () => {
  it('命名桶：名编辑 + 树编辑写回（bool 组真值链）', async () => {
    const { host, cur } = mount(mk('filters', { filters: { errors: { term: { status: 'error' } } }, other_bucket: true }));
    const name = host.querySelector<HTMLInputElement>('.afp-name');
    expect(name!.value).toBe('errors');
    expect(host.querySelector('.afp-tree .cn'), '桶查询树行').not.toBeNull();
    name!.value = 'errs';
    name!.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    const body = cur.value.body as Record<string, unknown>;
    expect(Object.keys(body.filters as object)).toEqual(['errs']);
    expect(body.other_bucket).toBe(true);
  });

  it('匿名数组形态：树行渲染 + 删桶', async () => {
    const { host, cur } = mount(mk('filters', { filters: [{ match_all: {} }, { term: { status: 'ok' } }] }));
    expect(host.querySelectorAll('.afp-tree .cn').length).toBe(2);
    (host.querySelector('button[aria-label="删除桶"]') as HTMLElement).click();
    await tick();
    expect(cur.value.body).toEqual({ filters: [{ term: { status: 'ok' } }] });
  });

  it('加桶（match_all 骨架）与整树往返', async () => {
    const { host, cur } = mount(mk('filters', { filters: { a: { match_all: {} } } }));
    (host.querySelector('.afp-add') as HTMLElement).click();
    await tick();
    const body = cur.value.body as Record<string, unknown>;
    expect(Object.keys(body.filters as object)).toEqual(['a', 'bucket_2']);
    expect(serializeTree({ ...emptyTree(), aggs: [cur.value] }))
      .toEqual({ aggs: { my_agg: { filters: { filters: { a: { match_all: {} }, bucket_2: { match_all: {} } } } } } });
  });

  it('filters 键形态畸形（串）→ 面板退场提示，参数表保真', () => {
    const { host } = mount(mk('filters', { filters: 'bad' }));
    expect(host.querySelector('.afp-none'), '畸形形态提示').not.toBeNull();
    expect(host.querySelector('.agn-body .gp'), '参数表可见 filters 键').toBeTruthy();
  });
});
