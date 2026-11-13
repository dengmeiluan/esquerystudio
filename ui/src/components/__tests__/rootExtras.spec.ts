/* 周边子句表单区契约：数字/清空/非数字标黄、sort 行增删改、_source 模式切换、highlight 字段行、extras 直通。
   W1 Task 4：_source one/list 已换 FieldPicker（mapping 补全）——mock 网络出口 mappingDetail，
   组件全用真的；.rx-src-fields class 透传到 FieldPicker 根节点，输入框在内层 .fxp-inp（弹层 Teleport 在 body）。 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, ref, type App } from 'vue';
import { createPinia } from 'pinia';

/* 惰性包装：vi.mock factory 提升到文件顶执行，此时 vi.fn 尚未初始化（TDZ） */
const mappingDetailFn = vi.fn();
vi.mock('../../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音 */
      clusterIndices: () => Promise.resolve([]),
    },
  };
});

import RootExtrasPane from '../builder/RootExtrasPane.vue';
import { __clearFieldCache } from '../../composables/useIndexFields';
import { emptyTree, parseTree, serializeTree, type QueryTree } from '../../utils/queryAst';

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  user: { properties: { name: { type: 'text' }, age: { type: 'integer' } } },
} } };

const apps: App[] = [];

function mount(tree: QueryTree, opts: { index?: string } = {}) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(tree);
  /* W1 Task 4：index 透传 FieldPicker；ref 暴露给用例改值以锁「切索引重拉」联动 */
  const idx = ref(opts.index ?? '');
  const app = createApp({
    render: () => h(RootExtrasPane, {
      tree: cur.value,
      fields: ['a', 'b', 'd'], types: { a: 'keyword', b: 'keyword', d: 'date' },
      index: idx.value,
      'onUpdate:tree': (t: QueryTree) => { cur.value = t; },
    }),
  });
  apps.push(app);
  app.use(createPinia());
  app.mount(host);
  return { host, cur, idx };
}

const tick = () => new Promise(r => setTimeout(r));
/* FieldPicker 候选链路（focus→ensure→await mappingDetail→渲染）多跳微任务，用 settle 范式兜稳 */
async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const itemNames = () => Array.from(document.body.querySelectorAll('.fxp-item .fxp-name')).map(el => el.textContent);

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  __clearFieldCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
});
afterEach(() => { apps.splice(0).forEach(a => a.unmount()); });

describe('RootExtrasPane', () => {
  /* 五百六十三批·用户实报「无效控制」：分页节（size/from 输入）退役——from 恒被页码
     覆盖、size 恒被分页档接管（562 联动），分页唯一入口=表格工具行分页器。
     原三个分页节行为用例随之退役，换负向锁防回潮。 */
  it('负向：分页节 size/from 输入退役不回潮（无效控制）', () => {
    const { host } = mount({ ...emptyTree(), size: 20, from: 40 });
    expect(host.querySelector('.rx-size')).toBeNull();
    expect(host.querySelector('.rx-from')).toBeNull();
    expect(host.textContent).not.toContain('分页');
  });

  it('加排序行（null→一行，默认 desc）并改 order', async () => {
    const { host, cur } = mount(emptyTree());
    // R125 v4: chip 化后先展开排序分区；五百六十三批：分页 chip 退役后排序=首 chip
    (host.querySelectorAll('.rx-chip')[0] as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-sort-add') as HTMLElement).click();
    await tick();
    expect(cur.value.sort!.length).toBe(1);
    /* 1100：默认字段改为「可排序 + 时间优先」——fixture 的 date 字段 d 优先于 a/b */
    expect(cur.value.sort![0].field).toBe('d');
    expect(cur.value.sort![0].params.order).toBe('desc');
    const sel = host.querySelector('.rx-sort-order') as HTMLSelectElement;
    sel.value = 'asc';
    sel.dispatchEvent(new Event('change'));
    await tick();
    expect(cur.value.sort![0].params.order).toBe('asc');
    expect(serializeTree(cur.value).sort).toEqual([{ d: 'asc' }]);
  });

  it('删除排序行 → 空数组保键', async () => {
    const t = emptyTree();
    t.sort = [{ id: 's1', field: 'a', form: 'short', params: { order: 'desc' } }];
    const { host, cur } = mount(t);
    (host.querySelector('.rx-sort-row [title="删除"]') as HTMLElement).click();
    await tick();
    expect(cur.value.sort).toEqual([]);
    expect(serializeTree(cur.value)).toEqual({ sort: [] });
  });

  it('排序行上移/下移', async () => {
    const t = emptyTree();
    t.sort = [
      { id: 's1', field: 'a', form: 'short', params: { order: 'desc' } },
      { id: 's2', field: 'b', form: 'str', params: {} },
    ];
    const { host, cur } = mount(t);
    (host.querySelectorAll('.rx-sort-row [title="上移"]')[1] as HTMLElement).click();
    await tick();
    expect(cur.value.sort![0].field).toBe('b');
    expect(cur.value.sort![1].field).toBe('a');
  });

  it('_source 从 null 设置为 list 并输入字段（FieldPicker 无索引降级手输直通）', async () => {
    const { host, cur } = mount(emptyTree());
    // R125 v4: 先展开字段裁剪分区；五百六十三批：分页 chip 退役后索引 -1
    (host.querySelectorAll('.rx-chip')[1] as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-src-set') as HTMLElement).click();
    await tick();
    expect(cur.value.source?.mode).toBe('list');
    /* index 为空 = FieldPicker 退化纯手输（零请求），行为与原裸 input 等价 */
    const inp = host.querySelector('.rx-src-fields .fxp-inp') as HTMLInputElement;
    inp.value = 'a, b';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(cur.value.source?.fields).toEqual(['a', 'b']);
    expect(serializeTree(cur.value)._source).toEqual(['a', 'b']);
    expect(mappingDetailFn, 'index 为空不许发请求').not.toHaveBeenCalled();
  });

  it('_source one：FieldPicker 候选选择回填 fields[0]（W1 Task 4 渗透点）', async () => {
    const t = emptyTree();
    t.source = { mode: 'one', fields: [], includes: [], excludes: [] };
    const { host, cur } = mount(t, { index: 'logs-x' });
    const inp = host.querySelector('.rx-src-fields .fxp-inp') as HTMLInputElement;
    inp.dispatchEvent(new Event('focus'));
    await settle();
    expect(mappingDetailFn).toHaveBeenCalledTimes(1);
    expect(mappingDetailFn.mock.calls[0][0]).toBe('logs-x');
    const it = Array.from(document.body.querySelectorAll<HTMLElement>('.fxp-item'))
      .find(el => el.textContent?.includes('user.name'));
    expect(it, 'user.name 候选必须在').toBeTruthy();
    it!.click();
    await settle();
    expect(cur.value.source?.fields).toEqual(['user.name']);
    expect(serializeTree(cur.value)._source).toBe('user.name');
  });

  it('_source list：multi 模式选择只补最后一段（W1 Task 4 渗透点）', async () => {
    const t = emptyTree();
    t.source = { mode: 'list', fields: ['status'], includes: [], excludes: [] };
    const { host, cur } = mount(t, { index: 'logs-x' });
    const inp = host.querySelector('.rx-src-fields .fxp-inp') as HTMLInputElement;
    inp.value = 'status, user.n';
    inp.dispatchEvent(new Event('input'));
    await settle();
    expect(itemNames()).toEqual(['user.name']);
    (document.body.querySelector('.fxp-item') as HTMLElement).click();
    await settle();
    expect(cur.value.source?.fields).toEqual(['status', 'user.name']);
    expect(serializeTree(cur.value)._source).toEqual(['status', 'user.name']);
  });

  it('index 透传联动：面板开着时切索引重拉并换字段集（W1 Task 2 评审遗留 R2）', async () => {
    mappingDetailFn.mockImplementation((index: string) => Promise.resolve(
      index === 'a-idx'
        ? { raw: { properties: { alpha: { type: 'keyword' } } } }
        : { raw: { properties: { beta: { type: 'text' } } } }));
    const t = emptyTree();
    t.source = { mode: 'one', fields: [], includes: [], excludes: [] };
    const { host, idx } = mount(t, { index: 'a-idx' });
    const inp = host.querySelector('.rx-src-fields .fxp-inp') as HTMLInputElement;
    inp.dispatchEvent(new Event('focus'));
    await settle();
    expect(itemNames()).toEqual(['alpha']);
    idx.value = 'b-idx';
    await settle();
    expect(mappingDetailFn, '切索引必须重拉').toHaveBeenCalledTimes(2);
    expect(mappingDetailFn.mock.calls[1][0]).toBe('b-idx');
    expect(itemNames(), '候选必须换成新索引字段').toEqual(['beta']);
  });

  it('highlight 启用 → 加字段（默认首字段）', async () => {
    const { host, cur } = mount(emptyTree());
    // R125 v4: 先展开高亮分区；五百六十三批：分页 chip 退役后索引 -1
    (host.querySelectorAll('.rx-chip')[2] as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-hl-set') as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-hl-add') as HTMLElement).click();
    await tick();
    expect(cur.value.highlight?.fields.length).toBe(1);
    expect(cur.value.highlight?.fields[0].name).toBe('a');
  });

  it('extras 渲染已有键（GenericParams 直通）', () => {
    const t = emptyTree();
    t.extras = { track_total_hits: true };
    const { host } = mount(t);
    /* 计划原文断言 host.textContent 含键名，但 GenericParams 的键渲染在 input value（真实浏览器可见），
       happy-dom 的 textContent 不含 input value（已用探针实证）——改断言 .gp-k 输入框的值，意图等价。 */
    const keys = Array.from(host.querySelectorAll('.rx-ex .gp-k')).map(el => (el as HTMLInputElement).value);
    expect(keys).toContain('track_total_hits');
  });

  it('pattern 单侧键解析后，另一侧输入不被静默丢弃（presence 修正）', async () => {
    const r = parseTree({ _source: { includes: ['a*'] } });
    if (!r.ok) throw new Error('parse failed');
    const { host, cur } = mount(r.tree);
    const inp = host.querySelector('[placeholder^="excludes"]') as HTMLInputElement;
    inp.value = 'b*';
    inp.dispatchEvent(new Event('input'));
    await tick();
    expect(serializeTree(cur.value)._source).toEqual({ includes: ['a*'], excludes: ['b*'] });
  });

  it('DSL 侧新增 sort 键后分区自动展开（空→非空跳变）', async () => {
    const { host, cur } = mount(emptyTree());
    expect(host.querySelector('.rx-sort-row')).toBeNull();
    const t2 = emptyTree();
    t2.sort = [{ id: 's1', field: 'a', form: 'short', params: { order: 'desc' } }];
    cur.value = t2;
    await tick();
    expect(host.querySelector('.rx-sort-row')).not.toBeNull();
  });

  it('aggs 未设置 → 添加顶层聚合（默认 terms）', async () => {
    const { host, cur } = mount(emptyTree());
    /* 五百六十三批：分页 chip 退役后索引 -1（原 [4]） */
    (host.querySelectorAll('.rx-chip')[3] as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-agg-set') as HTMLElement).click();
    await tick();
    expect(cur.value.aggs!.length).toBe(1);
    expect(cur.value.aggs![0].op).toBe('terms');
    expect(serializeTree(cur.value).aggs).toBeDefined();
  });

  it('移除聚合键 → aggs=null（键消失）', async () => {
    const t = emptyTree();
    t.aggs = [{ id: 'a1', name: 'g', op: 'terms', body: { field: 'a' }, children: [], meta: {}, aggKey: 'aggs' }];
    const { host, cur } = mount(t);
    (host.querySelector('[title="移除聚合键"]') as HTMLElement).click();
    await tick();
    expect(cur.value.aggs).toBeNull();
    expect(serializeTree(cur.value)).not.toHaveProperty('aggs');
  });

  it('顶层聚合删中间项后再加不撞名（防序列化同名覆盖）', async () => {
    const { host, cur } = mount(emptyTree());
    /* 五百六十三批：分页 chip 退役后索引 -1（原 [4]） */
    (host.querySelectorAll('.rx-chip')[3] as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-agg-set') as HTMLElement).click();
    await tick();
    (host.querySelector('.rx-agg-add') as HTMLElement).click();
    await tick();
    expect(cur.value.aggs!.map(a => a.name)).toEqual(['agg_1', 'agg_2']);
    /* 删 agg_1 后再加：新名必须跳过已占用的 agg_2 */
    cur.value = { ...cur.value, aggs: cur.value.aggs!.filter(a => a.name !== 'agg_1') };
    await tick();
    (host.querySelector('.rx-agg-add') as HTMLElement).click();
    await tick();
    const names = cur.value.aggs!.map(a => a.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual(['agg_2', 'agg_3']);
  });
});

/* ═══ 一百七十六批：chips 键盘导航（←→ 环绕移动焦点、Home/End 首尾）。
   chip=原生 button，Enter/Space=toggle 免费获得；普通键不拦截 ═══ */
describe('RootExtrasPane chips 键盘导航（一百七十六批）', () => {
  const key = (chip: HTMLElement, key: string) =>
    chip.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));

  it('→ 焦点移下一 chip 并环绕；← 反向；Home/End 跳首尾；非导航键放行', async () => {
    const { host } = mount(emptyTree());
    await tick();
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')];
    /* 五百六十三批：分页 chip 退役后 6→5 */
    expect(chips.length).toBeGreaterThanOrEqual(5);
    chips[0].focus();
    key(chips[0], 'ArrowRight');
    expect(document.activeElement).toBe(chips[1]);
    key(chips[1], 'ArrowRight');
    expect(document.activeElement).toBe(chips[2]);
    /* 末尾 → 环绕回首 */
    chips[chips.length - 1].focus();
    key(chips[chips.length - 1], 'ArrowRight');
    expect(document.activeElement).toBe(chips[0]);
    /* ← 反向 */
    key(chips[0], 'ArrowLeft');
    expect(document.activeElement).toBe(chips[chips.length - 1]);
    /* Home/End */
    key(chips[2], 'Home');
    expect(document.activeElement).toBe(chips[0]);
    key(chips[0], 'End');
    expect(document.activeElement).toBe(chips[chips.length - 1]);
    /* 非导航键：不 preventDefault、焦点不动（Enter 原生走 toggle） */
    chips[1].focus();
    const evt = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    chips[1].dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(chips[1]);
  });

  it('Enter 语义=toggle 展开（button 原生 click 路径；「排序」分区默认收起，点开出现）', async () => {
    const { host } = mount(emptyTree());
    await tick();
    const chip = host.querySelectorAll<HTMLButtonElement>('.rx-chip')[0]; // 排序（五百六十三批分页 chip 退役后为首 chip；emptyTree 无 sort，默认收起）
    chip.focus();
    chip.click(); /* happy-dom 原生 button Enter=click 不可脚本化，用 click 表征同一路径 */
    await tick();
    expect(host.querySelector('.rx-open')).not.toBeNull();
  });
});
