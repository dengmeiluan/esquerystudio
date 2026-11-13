/* 1012 批组件契约：geo_distance / geo_bounding_box 专用坐标编辑位（ClauseNode 挂接）——
   ① geo_distance：distance + lat/lon 双数值输入，编辑写回 value/params（整树往返深等价）；
     lat 越界黄点警示
   ② geo_bounding_box：corners 四输入 / edges 平铺四输入，半成品删键语义
   ③ 串坐标/geohash 等合法 ES 形态保真优先 → 退化通用键值表（.gp 在场 .gve 缺席） */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import { parseTree, serializeTree, type LeafNode } from '../../utils/queryAst';

const mk = (op: string, value: unknown, params: Record<string, unknown> = {}): LeafNode => ({
  id: 'g1', type: 'leaf', op, field: 'location', value, params, raw: null,
});

const apps: App[] = [];
function mount(node: LeafNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: ['location'], types: { location: 'geo_point' },
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1012 geo_distance 专用编辑位', () => {
  it('distance+lat/lon 渲染；lat 编辑写回并整树往返', async () => {
    const { host, cur } = mount(mk('geo_distance', { lat: 40, lon: -70 }, { distance: '12km' }));
    const dist = host.querySelector<HTMLInputElement>('.gve-dist');
    expect(dist, 'distance 输入在场').not.toBeNull();
    expect(dist!.value).toBe('12km');
    const lat = host.querySelector<HTMLInputElement>('.gve-n');
    expect(lat!.value).toBe('40');
    lat!.value = '41.5';
    lat!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ lat: 41.5, lon: -70 });
    const t = parseTree({ query: { geo_distance: { distance: '12km', location: cur.value.value as Record<string, unknown> } } });
    if (!t.ok) throw new Error('parse failed');
    expect(serializeTree(t.tree)).toEqual({ query: { geo_distance: { distance: '12km', location: { lat: 41.5, lon: -70 } } } });
  });

  it('distance 编辑写回 params、空串删键；lat 空串删键（半成品中间态）', async () => {
    const { host, cur } = mount(mk('geo_distance', { lat: 40, lon: -70 }, { distance: '12km' }));
    const dist = host.querySelector<HTMLInputElement>('.gve-dist')!;
    dist.value = '200km';
    dist.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.params.distance).toBe('200km');
    dist.value = '';
    dist.dispatchEvent(new Event('input'));
    await tick();
    expect('distance' in cur.value.params).toBe(false);
    const lat = host.querySelector<HTMLInputElement>('.gve-n')!;
    lat.value = '';
    lat.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ lon: -70 });
  });

  it('lat 越界（120）黄点警示在场', () => {
    const { host } = mount(mk('geo_distance', { lat: 120, lon: -70 }, { distance: '1km' }));
    expect(host.querySelector('.gve .cn-rwarn[aria-label="纬度超出 -90~90"]')).not.toBeNull();
  });

  it('空值 {} 也可直接输入（无需先加键）', async () => {
    const { host, cur } = mount(mk('geo_distance', {}, { distance: '5km' }));
    const lat = host.querySelector<HTMLInputElement>('.gve-n')!;
    lat.value = '40';
    lat.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ lat: 40 });
  });
});

describe('1012 geo_bounding_box 专用编辑位', () => {
  it('corners 四输入渲染；左上 lat 编辑写回对应角', async () => {
    const v = { top_left: { lat: 42, lon: -72 }, bottom_right: { lat: 40, lon: -74 } };
    const { host, cur } = mount(mk('geo_bounding_box', v));
    expect(host.querySelectorAll('.gve-n').length).toBe(4);
    const tlLat = host.querySelector<HTMLInputElement>('.gve-n');
    expect(tlLat!.value).toBe('42');
    tlLat!.value = '43';
    tlLat!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ top_left: { lat: 43, lon: -72 }, bottom_right: { lat: 40, lon: -74 } });
  });

  it('edges 平铺四输入渲染与写回', async () => {
    const { host, cur } = mount(mk('geo_bounding_box', { top: 40, left: -74, right: -72, bottom: 39 }));
    expect(host.querySelectorAll('.gve-n').length).toBe(4);
    const top = host.querySelector<HTMLInputElement>('.gve-n')!;
    expect(top!.value).toBe('40');
    top!.value = '41';
    top!.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ top: 41, left: -74, right: -72, bottom: 39 });
  });

  it('角清空=删角键（半成品）；空值 {} 骨架可输入', async () => {
    const { host, cur } = mount(mk('geo_bounding_box', { top_left: { lat: 42, lon: -72 } }));
    const tlLat = host.querySelector<HTMLInputElement>('.gve-n')!;
    tlLat.value = '';
    tlLat.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.value).toEqual({ top_left: { lon: -72 } });
    /* 空值骨架：直接给四输入 */
    const { host: h2, cur: c2 } = mount(mk('geo_bounding_box', {}));
    const first = h2.querySelector<HTMLInputElement>('.gve-n')!;
    first.value = '10';
    first.dispatchEvent(new Event('input'));
    await tick();
    expect(c2.value.value).toEqual({ top_left: { lat: 10 } });
  });
});

describe('1012 geo 退化契约（保真优先）', () => {
  it.each([
    /* 串/geohash 是标量值 → 既有标量文本输入（可改串保真），对象畸形 → 通用键值表 */
    ['geo_distance 串坐标（标量输入保真）', 'geo_distance', '40,-70', 'scalar'],
    ['geo_distance geohash（标量输入保真）', 'geo_distance', 'u17', 'scalar'],
    ['bbox 角值串', 'geo_bounding_box', { top_left: '40,-72' }, 'gp'],
    ['bbox 混合形态', 'geo_bounding_box', { top: 40, top_left: { lat: 1 } }, 'gp'],
  ])('%s → 专用编辑位退场', (_n, op, v, mode) => {
    const { host } = mount(mk(op, v));
    expect(host.querySelector('.gve'), '专用编辑位退场').toBeNull();
    if (mode === 'gp') expect(host.querySelector('.gp'), '通用键值表兜底').not.toBeNull();
    else expect(host.querySelector('.cn-val'), '标量文本输入保真').not.toBeNull();
  });
});
