/**
 * 批次 1376：远端排序「可排性预检」下沉双内核。
 *
 * 缺口（本轮排查实锤）：text 列无 .keyword 子域时 ES 无法排序。两个宿主都已接
 * resolveSortField（DslQueryView.writeSortToDsl / IndexHubView.onDocsSortChange），
 * 但裁决发生在**内核已经把箭头推到新态并 emit 之后**——宿主拒绝时：
 *   · 提示弹了（好的），
 *   · 但表头箭头停在「升序」、aria-sort=ascending（假的），
 *   · 数据一条没动 → 用户看到「排序成功但没生效」的暗状态。
 * 同一宿主若还接 syncSort，下一次回填不会覆盖它（宿主权威态根本没变），
 * 箭头会一直亮着直到切索引。
 *
 * 修法 = 把同一单源裁决提到内核入口（remote 档才接）：拦下即不落态、不 emit。
 * 本地档不接——行序就在内存里，任何字段都能排，多这层只会误伤。
 *
 * 负控（每条断言都要能红）：
 *  ① text 无子域列：不亮箭头、不 emit sort-change；
 *  ② 负控——去掉预检（直接调 chain.sortBy）则箭头必亮、必 emit；本用例用
 *     「同表 keyword 列仍可排」证明拦截不是把整条排序链打断；
 *  ③ text 有 .keyword 子域：照常放行（预检不能误伤可排 text）；
 *  ④ 本地档（未开 remote-sort）：text 无子域列仍可排（不能误伤本地排序）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';

/* 1376：DslQueryView 的表类型源 useIndexFieldTypes 必须登记 multi-field 子域，
   否则新预检会把「text + .keyword 子域」的可排列误拦（IndexHub fieldTypesMap 同口径）。 */
const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, mappingDetail: (...a: any[]) => mappingDetailFn(...a) } };
});
import { useIndexFieldTypes } from '../composables/useIndexFieldTypes';
import { ref } from 'vue';

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

const tick = async (n = 8) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

async function mount(props: Record<string, any>, comp: any, onEvent?: (s: any) => void) {
  const app = createApp({
    setup: () => () => h(comp, { ...props, onSortChange: (s: any) => onEvent?.(s) }),
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  await tick();
}

const thOf = (col: string) =>
  [...host.querySelectorAll('thead th')].find(t => t.textContent?.includes(col)) as HTMLElement;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  mappingDetailFn.mockReset();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

/* title=text 无 .keyword 子域（不可排）；tag=text 有 tag.keyword（可排）；price=long */
const QTYPES = { title: 'text', tag: 'text', 'tag.keyword': 'keyword', price: 'long' };

const QRT_PROPS = {
  cols: ['title', 'tag', 'price'],
  rows: [
    ['b', 'y', 3],
    ['a', 'x', 1],
    ['c', 'z', 2],
  ] as any,
  sortable: true,
  remoteSort: true,
  /* 生产两宿主（DslQueryView/IndexHubView）都接 sync-sort；remote 未接线档箭头恒不渲染
     （display/data 分轨），所以这里必须接上才能验证「箭头是否被误点亮」 */
  syncSort: null,
  fieldTypes: QTYPES,
};

/* RT hits：_source 列名与 mapping 同名 */
const RT_PROPS = {
  hits: [
    { _id: '1', _source: { title: 'b', tag: 'y', price: 3 } },
    { _id: '2', _source: { title: 'a', tag: 'x', price: 1 } },
    { _id: '3', _source: { title: 'c', tag: 'z', price: 2 } },
  ] as any,
  total: 3,
  index: 't1376',
  remoteSort: true,
  syncSort: null,
  fieldTypes: QTYPES,
};

describe('1376 QRT 远端排序预检', () => {
  it('① text 无 .keyword 子域：不 emit、不亮箭头（暗状态根除）', async () => {
    const emitted: any[] = [];
    await mount(QRT_PROPS, QueryResultTable, s => emitted.push(s));
    thOf('title').click();
    await tick(6);
    expect(emitted, '不可排 text 列零 emit（宿主无机会下发坏 sort）').toEqual([]);
    expect(thOf('title').getAttribute('aria-sort'), '不亮 aria-sort').toBeNull();
    expect(thOf('title').classList.contains('on'), '不亮 on').toBe(false);
  });

  it('② 负控：同表可排列照常出箭头并 emit（拦截没打断排序链）', async () => {
    const emitted: any[] = [];
    await mount(QRT_PROPS, QueryResultTable, s => emitted.push(s));
    thOf('price').click();
    await tick(6);
    expect(emitted, '可排列 emit 一次 asc 意图').toEqual([{ f: 'price', d: 'asc' }]);
    expect(thOf('price').getAttribute('aria-sort')).toBe('ascending');
  });

  it('③ text 有 .keyword 子域：放行（预检不误伤可排 text）', async () => {
    const emitted: any[] = [];
    await mount(QRT_PROPS, QueryResultTable, s => emitted.push(s));
    thOf('tag').click();
    await tick(6);
    expect(emitted, '有子域的 text 列照常 emit').toEqual([{ f: 'tag', d: 'asc' }]);
    expect(thOf('tag').getAttribute('aria-sort')).toBe('ascending');
  });

  it('④ 负控：本地档（未开 remote-sort）不可排 text 列仍能排', async () => {
    await mount({ ...QRT_PROPS, remoteSort: false }, QueryResultTable);
    thOf('title').click();
    await tick(6);
    expect(thOf('title').getAttribute('aria-sort'), '本地档不被预检误伤').toBe('ascending');
  });
});

describe('1376 RT 远端排序预检', () => {
  it('① text 无 .keyword 子域：不 emit、不亮箭头', async () => {
    const emitted: any[] = [];
    await mount(RT_PROPS, ResultTable, s => emitted.push(s));
    thOf('title').click();
    await tick(6);
    expect(emitted, '不可排 text 列零 emit').toEqual([]);
    expect(thOf('title').getAttribute('aria-sort'), '不亮 aria-sort').toBeNull();
  });

  it('② 负控：同表可排列照常出箭头并 emit', async () => {
    const emitted: any[] = [];
    await mount(RT_PROPS, ResultTable, s => emitted.push(s));
    thOf('price').click();
    await tick(6);
    expect(emitted, '可排列 emit 一次 asc 意图').toEqual([{ f: 'price', d: 'asc' }]);
    expect(thOf('price').getAttribute('aria-sort')).toBe('ascending');
  });

  it('③ text 有 .keyword 子域：放行', async () => {
    const emitted: any[] = [];
    await mount(RT_PROPS, ResultTable, s => emitted.push(s));
    thOf('tag').click();
    await tick(6);
    expect(emitted).toEqual([{ f: 'tag', d: 'asc' }]);
  });

  it('④ 负控：本地档不可排 text 列仍能排', async () => {
    await mount({ ...RT_PROPS, remoteSort: false }, ResultTable);
    thOf('title').click();
    await tick(6);
    expect(thOf('title').getAttribute('aria-sort'), '本地档不被预检误伤').toBe('ascending');
  });
});

describe('1376 表类型源登记 multi-field 子域', () => {
  it('useIndexFieldTypes 登记 a.keyword（含嵌套），否则可排 text 列被预检误拦', async () => {
    mappingDetailFn.mockResolvedValue({ raw: { properties: {
      title: { type: 'text', fields: { keyword: { type: 'keyword' } } },
      plain: { type: 'text' },
      author: { properties: { name: { type: 'text', fields: { keyword: { type: 'keyword' } } } } },
    } } });
    let out!: Record<string, string>;
    const app = createApp({
      setup() {
        const idx = ref('t1376');
        const types = useIndexFieldTypes(idx);
        return () => { out = types.value; return h('div'); };
      },
    });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    await tick(20);
    expect(out['title'], '父字段类型照常在').toBe('text');
    expect(out['title.keyword'], 'multi-field 子域必须入表（排序裁决要看子域是否存在）').toBe('keyword');
    expect(out['author.name.keyword'], '嵌套 object 下的子域同样登记').toBe('keyword');
    expect(out['plain'], '无子域的 text 照常只有父字段').toBe('text');
  });
});
