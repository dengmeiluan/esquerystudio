/**
 * 五百六十三批（531 遗留件②收口）：数值列聚合行值分布 mini-bar（dist 单源纯函数+数据面+展示面）。
 * 此前 561 批已出 ColDetailModal「分布」段（stats.dist 等宽 8 桶），收口：
 * 1) dist 纯函数抽独占域 utils 单源 distBinsOf（原 useColStats 私有 distOf 逐字平移，
 *    弹窗与聚合行同源复用；colDetailDist561 行为锁保真）；
 * 2) useAggRow 增可选第 5 参 distOf → aggDist 出口（aggSpark 同构：关闭恒 null 零求值/
 *    未注入恒 null/空 bins 不出——既有四参调用形态零触碰）；
 * 3) TableAggFoot 增可选 dist prop 渲染 8 桶 mini 高度条（与 ColDetailModal 同语汇：
 *    桶 title「from~to: count」、最高桶满高；缺省不传零渲染——QRT/RT 既有接线 DOM 零变化，
 *    接线下批）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { distBinsOf } from '../utils/distBins';
import { useColStats } from '../composables/useColStats';
import { useAggRow } from '../composables/useAggRow';
import TableAggFoot from '../components/TableAggFoot.vue';

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

/* ═══════════ 一、distBinsOf 纯函数单源（口径与 colDetailDist561 同锁） ═══════════ */
describe('distBinsOf 等宽 8 桶纯函数（五百六十三批）', () => {
  it('[0,8] → 8 桶、桶宽 1、最大值钳末桶、Σcount=点数', () => {
    const d = distBinsOf([0, 8]);
    expect(d).not.toBeNull();
    expect(d!.bins.length).toBe(8);
    expect(d!.bins[0]).toEqual({ from: 0, to: 1, count: 1 });
    expect(d!.bins[7]).toEqual({ from: 7, to: 8, count: 1 });
    expect(d!.bins.reduce((a, b) => a + b.count, 0)).toBe(2);
  });

  it('边界左闭右开；min==max（span=0）退化全落桶 0 且 8 桶形状不变', () => {
    expect(distBinsOf([0, 3.9, 4, 8])!.bins[3]!.count).toBe(1);
    expect(distBinsOf([0, 3.9, 4, 8])!.bins[4]!.count).toBe(1);
    const flat = distBinsOf([5, 5, 5])!;
    expect(flat.bins[0]).toEqual({ from: 5, to: 5, count: 3 });
    expect(flat.bins.slice(1).every(b => b.count === 0)).toBe(true);
    expect(flat.bins.length).toBe(8);
  });

  it('守卫：<2 数值点/非数值/null·undefined 混入 → null；数字串不计入（硬口径）', () => {
    expect(distBinsOf([])).toBeNull();
    expect(distBinsOf(['a', 'b'])).toBeNull();
    expect(distBinsOf([1])).toBeNull();
    expect(distBinsOf([1, null, undefined, ''])).toBeNull();
    expect(distBinsOf(['10', '20'])).toBeNull();
  });

  it('useColStats 同源委托：statsOf().dist 与 distBinsOf(vals) 逐桶相等', () => {
    const rows = [{ v: 0 }, { v: 8 }, { v: 4 }];
    const s = useColStats({ rows: () => rows, getVal: (r: any, c: string) => r[c], labelOf: String }).statsOf('v');
    expect(s.dist).toEqual(distBinsOf(rows.map(r => r.v)));
  });
});

/* ═══════════ 二、useAggRow aggDist 数据面（aggSpark 同构） ═══════════ */
describe('useAggRow aggDist（五百六十三批）', () => {
  beforeEach(() => { localStorage.clear(); });

  it('aggOn 关闭恒 null 且 distOf 零求值；开后按列集出数；null dist 列不出', () => {
    const calls: string[] = [];
    const distOf = (c: string) => { calls.push(c); return c === 'n' ? { bins: [{ from: 0, to: 1, count: 2 }] } : null; };
    let a: any = null;
    const app = createApp({
      setup() {
        a = useAggRow(ref<string | null>('w563d1'), () => ['n', 's'], () => undefined, undefined, distOf);
        return () => h('div');
      },
    });
    app.mount(document.body);
    expect(a.aggDist.value, '关闭恒 null').toBeNull();
    expect(calls.length, '关闭零求值').toBe(0);
    a.toggleAggRow();
    expect(a.aggDist.value).toEqual({ n: { bins: [{ from: 0, to: 1, count: 2 }] } });
    app.unmount();
  });

  it('四参形态（不传 distOf）恒 null——既有调用形态零触碰', () => {
    let b: any = null;
    const app = createApp({
      setup() {
        b = useAggRow(ref<string | null>(null), () => ['n'], () => ({ sum: 1, avg: 1, min: 1, max: 1 }));
        return () => h('div');
      },
    });
    app.mount(document.body);
    b.toggleAggRow();
    expect(b.aggFoot.value).toEqual({ n: { sum: 1, avg: 1, min: 1, max: 1 } });
    expect(b.aggDist.value, '未注入 distOf 恒 null').toBeNull();
    app.unmount();
  });
});

/* ═══════════ 三、TableAggFoot dist mini-bar 展示面（缺省零渲染） ═══════════ */
describe('TableAggFoot dist mini-bar（五百六十三批）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);

  const FOOT = { n: { sum: 130, avg: 65, min: 50, max: 80, count: 2, median: 65 } };
  const DIST8 = {
    n: {
      bins: [
        { from: 0, to: 1, count: 3 }, { from: 1, to: 2, count: 0 }, { from: 2, to: 3, count: 0 },
        { from: 3, to: 4, count: 0 }, { from: 4, to: 5, count: 0 }, { from: 5, to: 6, count: 0 },
        { from: 6, to: 7, count: 0 }, { from: 7, to: 8, count: 3 },
      ],
    },
  };

  async function mountFoot(props: Record<string, any>) {
    const app = createApp({ setup: () => () => h(TableAggFoot as any, {
      prefix: 'qrt', cols: ['n'], foot: FOOT, spark: null, emptyPct: { n: 0 },
      frozenOf: () => false, ...props,
    }) });
    app.mount(host);
    apps.push(app);
    await tick();
  }

  beforeEach(() => {
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
  });

  it('缺省不传 dist：零渲染（QRT/RT 既有接线 DOM 零变化；Σ/avg/cnt/spark 段不动）', async () => {
    await mountFoot({});
    const cell = host.querySelector('td.qrt-agg-cell')!;
    expect(cell.querySelector('.qrt-agg-dist'), 'dist 缺省零渲染').toBeNull();
    expect(cell.textContent).toContain('Σ 130 · avg 65.00');
    expect(cell.textContent).toContain('· count 2');
  });

  it('传 dist：8 桶 mini 条渲染，桶 title「from~to: count」与 ColDetailModal 同语汇', async () => {
    await mountFoot({ dist: DIST8 });
    const bars = [...host.querySelectorAll('.qrt-agg-dist i')] as HTMLElement[];
    expect(bars.length, '8 桶').toBe(8);
    expect(bars[0].title).toBe('0~1: 3');
    expect(bars[7].title).toBe('7~8: 3');
    expect(bars[1].title, '零值桶仍标 count').toBe('1~2: 0');
  });

  it('桶高归一：最高桶 100%、零值桶 0%（与 ColDetailModal.distBarH 同口径）', async () => {
    await mountFoot({ dist: DIST8 });
    const fills = [...host.querySelectorAll('.qrt-agg-dist i')] as HTMLElement[];
    expect(fills[0].getAttribute('style')).toContain('100%');
    expect(fills[1].getAttribute('style')).toContain('0%');
  });

  it('foot 空位（非数值列）不出 dist（同 spark 同守卫——模板 foot?.[c] 门控内）', async () => {
    await mountFoot({ cols: ['s'], foot: {}, dist: { s: DIST8.n } });
    expect(host.querySelector('.qrt-agg-dist')).toBeNull();
  });
});
