/**
 * 五百六十三批（531 遗留件①收口）：filterMode OR 档内核层余量三件。
 * 此前 534/552/556/560/561 已把组合档接进双内核（filterRows mode 参数/useFilterMode/
 * TableFilteredHint/弹层槽注入），收口内核共享层余量：
 * 1) OR/AND 语义出 useColFilters 闭包成导出纯函数 filterRowsPure（spec 全锁双档语义：
 *    等值∪区间∪包含三档、空选集列剔除、零生效列恒等回落同引用）——filterRows 委托之，
 *    534 源码锁 filterRows 签名行与 556 三档 OR 运行时锚保真；
 * 2) TableShell 增可选 filterMode prop（缺省 'AND' 向后兼容）经 bar-left 作用域槽下发
 *    （壳不自渲染档位钮——561 双内核提示行/弹层槽注入位已有，缺省槽参对既有非作用域
 *    用法零影响）；
 * 3) TableFilteredHint mode 改可选（缺省 'AND'）；ColFilterPopover 增可选 filterMode
 *    内建档位 chip（不传零渲染——五通道既有消费方弹层零变化）。
 */
import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { useColFilters, filterRowsPure } from '../composables/useColFilters';
import TableShell from '../components/TableShell.vue';
import TableFilteredHint from '../components/TableFilteredHint.vue';
import ColFilterPopover from '../components/ColFilterPopover.vue';

const ROWS = [
  { id: 1, name: 'banana', age: 2, tag: 'red' },
  { id: 2, name: 'apple', age: 3, tag: 'blue' },
  { id: 3, name: 'cherry', age: 4, tag: 'red' },
  { id: 4, name: 'banana', age: 9, tag: 'gold' },
];
const getVal = (row: any, col: string) => row[col];

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

/* ═══════════ 一、filterRowsPure 纯函数双档语义全锁 ═══════════ */
describe('filterRowsPure 纯函数（五百六十三批）', () => {
  const eqOnly = { colFilters: { name: ['banana'] }, rangeFilters: {}, containsFilters: {} };

  it('AND（缺省档）：等值命中 2 行；mode 缺省与显式 AND 同判', () => {
    expect(filterRowsPure(ROWS, eqOnly, getVal).map(r => r.id)).toEqual([1, 4]);
    expect(filterRowsPure(ROWS, eqOnly, getVal, 'AND').map(r => r.id)).toEqual([1, 4]);
  });

  it('OR 档：等值∪区间∪包含三档并集（列间任一命中即保留）', () => {
    const st = {
      colFilters: { name: ['banana'] },
      rangeFilters: { age: { min: '4', max: '' } },
      containsFilters: { tag: 'bl' },
    };
    /* banana(1,4) ∪ age≥4(3,4) ∪ tag 含 bl(2) = 1,2,3,4 全保留 */
    expect(filterRowsPure(ROWS, st, getVal, 'OR').map(r => r.id)).toEqual([1, 2, 3, 4]);
    /* 同态 AND：三族同时命中——banana ∧ age≥4 = {4}，但 4 的 tag=gold 不含 bl → 空集 */
    expect(filterRowsPure(ROWS, st, getVal, 'AND')).toEqual([]);
  });

  it('OR 档列内语义不变：单列等值仍按选中集判（OR 不放宽列内为「任一值」歧义）', () => {
    const st = { colFilters: { name: ['apple', 'cherry'] }, rangeFilters: {}, containsFilters: {} };
    expect(filterRowsPure(ROWS, st, getVal, 'OR').map(r => r.id)).toEqual([2, 3]);
  });

  it('空选集列不出现在生效列集（该列不过滤）；零生效列恒等回落同引用', () => {
    const st = { colFilters: { name: [] }, rangeFilters: {}, containsFilters: {} };
    expect(filterRowsPure(ROWS, st, getVal).length).toBe(4);
    const empty = { colFilters: {}, rangeFilters: {}, containsFilters: {} };
    expect(filterRowsPure(ROWS, empty, getVal, 'OR')).toBe(ROWS);
    const blankKw = { colFilters: {}, rangeFilters: { age: { min: '', max: '' } }, containsFilters: { tag: '  ' } };
    expect(filterRowsPure(ROWS, blankKw, getVal, 'AND')).toBe(ROWS);
  });

  it('区间/包含命中契约保真：空值不命中区间与包含；闭区间含端点', () => {
    const rows: { v: any }[] = [{ v: null }, { v: '' }, { v: 2 }, { v: 5 }];
    const st = { colFilters: {}, rangeFilters: { v: { min: '2', max: '5' } }, containsFilters: {} };
    expect(filterRowsPure(rows, st, (r, c: string) => r[c] ?? r.v, 'AND').map(r => r.v)).toEqual([2, 5]);
    const ct = { colFilters: {}, rangeFilters: {}, containsFilters: { v: '2' } };
    expect(filterRowsPure(rows, ct, (r, c: string) => r[c] ?? r.v, 'AND').map(r => r.v)).toEqual([2]);
  });

  it('filterRows 委托同源：composable 运行态快照与 filterRowsPure 输出逐行相等（双档）', () => {
    const f = useColFilters({
      rows: () => ROWS,
      getVal,
      labelOf: (v) => (v === null || v === undefined ? '∅' : String(v)),
    });
    f.toggleFilterVal('name', 'banana');
    f.setRangeFilter('age', 'min', '3');
    f.setContainsFilter('tag', 're');
    for (const mode of ['AND', 'OR'] as const) {
      const viaComposable = f.filterRows(ROWS, mode);
      const viaPure = filterRowsPure(ROWS, {
        colFilters: f.colFilters.value,
        rangeFilters: f.rangeFilters.value,
        containsFilters: f.containsFilters.value,
      }, getVal, mode);
      expect(viaPure.map(r => r.id), `委托同源（${mode}）`).toEqual(viaComposable.map(r => r.id));
    }
  });
});

/* ═══════════ 二、TableShell filterMode 作用域槽透传 ═══════════ */
describe('TableShell filterMode 可选 prop（五百六十三批）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);

  async function mountShell(props: Record<string, any>, slotFn?: (p: any) => any) {
    const app = createApp({ setup: () => () => h(TableShell as any, {
      barClass: 'rt-bar', barRClass: 'rt-bar-r', ...props,
    }, slotFn ? { 'bar-left': slotFn } : undefined) });
    app.mount(host);
    apps.push(app);
    await tick();
  }

  it('缺省 AND：bar-left 作用域槽收到 AND（shell 不自渲染档位钮，DOM 无新增钮）', async () => {
    let got: string | null = null;
    await mountShell({}, (p: any) => { got = p.filterMode; return h('span', { class: 'probe-slot' }, 'probe'); });
    expect(got).toBe('AND');
    expect(host.querySelector('.probe-slot')).toBeTruthy();
    expect(host.querySelector('button'), '壳级无内置档位钮').toBeNull();
  });

  it('传 OR：槽参跟随 prop（下批内核接线可经作用域槽消费）', async () => {
    let got: string | null = null;
    await mountShell({ filterMode: 'OR' }, (p: any) => { got = p.filterMode; return h('span'); });
    expect(got).toBe('OR');
  });
});

/* ═══════════ 三、TableFilteredHint mode 可选缺省 AND ═══════════ */
describe('TableFilteredHint mode 缺省（五百六十三批）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);

  async function mountHint(mode?: 'AND' | 'OR') {
    const app = createApp({ setup: () => () => h(TableFilteredHint as any, {
      spanCls: 'rt-filtered mono', fmodeCls: 'rt-fmode mono', clearCls: 'rt-filtered-clear',
      active: 1, shown: 2, total: 3, ...(mode ? { mode } : {}),
    }) });
    app.mount(host);
    apps.push(app);
    await tick();
  }

  it('不传 mode：档位钮显示 AND（缺省向后兼容，561 前调用方零触碰）', async () => {
    await mountHint();
    const btn = host.querySelector('.rt-fmode') as HTMLElement;
    expect(btn.textContent?.trim()).toBe('AND');
  });

  it('传 OR：显示 OR（既有必传形态行为不变）', async () => {
    await mountHint('OR');
    expect((host.querySelector('.rt-fmode') as HTMLElement).textContent?.trim()).toBe('OR');
  });
});

/* ═══════════ 四、ColFilterPopover 内建 filterMode chip（可选，不传零渲染） ═══════════ */
describe('ColFilterPopover filterMode chip（五百六十三批）', () => {
  const apps: ReturnType<typeof createApp>[] = [];

  async function mountPop(filterMode?: 'AND' | 'OR') {
    let toggles = 0;
    const app = createApp({ setup: () => () => h(ColFilterPopover as any, {
      col: 'n', x: 10, y: 10, vals: [{ v: 1, n: 2 }], total: 1, selected: [],
      normOf: (v: any) => String(v),
      ...(filterMode ? { filterMode } : {}),
      onToggleFilterMode: () => { toggles++; },
    }) });
    app.mount(document.body);
    apps.push(app);
    await tick();
    return () => toggles;
  }

  it('不传 filterMode：chip 零渲染（五通道既有消费方弹层零变化）', async () => {
    await mountPop();
    expect(document.querySelector('.cfp-fmode'), '缺省零视觉').toBeNull();
    expect(document.querySelector('.cfp'), '弹层本体照常').toBeTruthy();
  });

  it('传 OR：chip 显示「组合：OR」；点击 emit toggle-filter-mode（文案与双内核槽钮同语汇）', async () => {
    const getToggles = await mountPop('OR');
    const chip = document.querySelector('.cfp-fmode') as HTMLElement;
    expect(chip.textContent?.trim()).toBe('组合：OR');
    expect(chip.getAttribute('aria-label')).toContain('筛选组合档：OR');
    chip.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    expect(getToggles(), '点击翻转 emit').toBe(1);
  });
});
