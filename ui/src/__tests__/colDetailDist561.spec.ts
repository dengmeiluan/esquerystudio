/**
 * 五百六十一批 轨3 工蚁C'：值分布段（531 遗留件）+ *_range 族类型守卫决策锚。
 * 锁定：
 * 1) useColStats dist 等宽 8 桶装配——数值点收集与 seriesOf 同硬口径（typeof number 且
 *    有限；isNumeric force 不放大，Σ/分布口径分离）；数值点<2（空列/非数值列/单点）→ null；
 *    最大值钳末桶；min==max（span=0）退化全落桶 0、8 桶形状不变；
 * 2) ColDetailModal「分布」段——stats.dist 非空渲染 8 桶 mini 高度条（桶 :title=
 *    「from~to: count」，最高桶满高/零值桶零高）；dist 为 null 或缺省字段时段零渲染
 *    （缺省零视觉，既有样板形状不受影响）；
 * 3) *_range 族决策锚（561 批判定：仅 ip_range 合并，integer/long/float/double/date
 *    五型备案不收——数值/日期白名单核心成员，NON_SEMANTIC_TYPES_RE 并入将在双内核
 *    isRangeCol/isNumericCol/aggFoot/aggSpark/contains 链 8 个消费点短路，行为回退
 *    不可小步同步更新）：ip_range 判真、五型不误伤、NUMERIC_TYPES_RE/isRangeType 链不受损。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';

import { useColStats } from '../composables/useColStats';
import ColDetailModal from '../components/ColDetailModal.vue';
import { isNonSemanticType, NUMERIC_TYPES_RE, isRangeType } from '../utils/typeTiers';

const ROWS = [
  { v: 0 },
  { v: 8 },
];
const base = {
  rows: () => ROWS,
  getVal: (r: any, c: string) => r[c],
  labelOf: (v: any) => (v === null || v === undefined ? '∅' : String(v)),
};

/* ═══════════ 一、useColStats dist 等宽 8 桶（单元） ═══════════ */
describe('useColStats 值分布 dist（五百六十一批）', () => {
  it('等宽 8 桶：[0,8] → 桶宽 1、首末桶各 1 点、最大值钳末桶、Σcount=点数', () => {
    const d = useColStats(base).statsOf('v').dist;
    expect(d, '两个数值点应有 dist').not.toBeNull();
    expect(d!.bins.length).toBe(8);
    expect(d!.bins[0]).toEqual({ from: 0, to: 1, count: 1 });
    expect(d!.bins[7]).toEqual({ from: 7, to: 8, count: 1 });
    expect(d!.bins.reduce((a, b) => a + b.count, 0)).toBe(2);
    for (let i = 0; i < 8; i++) {
      expect(d!.bins[i]!.from, `桶 ${i} 下界等宽`).toBe(i * 1);
      expect(d!.bins[i]!.to, `桶 ${i} 上界=下桶界`).toBe((i + 1) * 1);
    }
  });

  it('边界归属：3.9 落桶 3、4 落桶 4（左闭右开）', () => {
    const rows = [0, 3.9, 4, 8].map(v => ({ v }));
    const d = useColStats({ ...base, rows: () => rows }).statsOf('v').dist;
    expect(d!.bins[3]!.count).toBe(1);
    expect(d!.bins[4]!.count).toBe(1);
    expect(d!.bins.reduce((a, b) => a + b.count, 0)).toBe(4);
  });

  it('min==max（span=0）退化：全落桶 0、8 桶形状不变、from==to', () => {
    const rows = [5, 5, 5].map(v => ({ v }));
    const d = useColStats({ ...base, rows: () => rows }).statsOf('v').dist;
    expect(d!.bins[0]).toEqual({ from: 5, to: 5, count: 3 });
    expect(d!.bins.slice(1).every(b => b.count === 0)).toBe(true);
    expect(d!.bins.length).toBe(8);
  });

  it('守卫：空列/非数值列/单点 → null；null·undefined 混入不计', () => {
    expect(useColStats({ rows: () => [], getVal: () => 1, labelOf: String }).statsOf('v').dist).toBeNull();
    expect(useColStats({ ...base, rows: () => [{ v: 'a' }, { v: 'b' }] }).statsOf('v').dist).toBeNull();
    expect(useColStats({ ...base, rows: () => [{ v: 1 }] }).statsOf('v').dist).toBeNull();
    const rows = [1, null, undefined, ''].map(v => ({ v }));
    expect(useColStats({ ...base, rows: () => rows }).statsOf('v').dist, '仅 1 个有效点').toBeNull();
  });

  it('硬口径：数字字符串不计入 dist（与 seriesOf 同判；isNumeric force 不放大，Σ/分布口径分离）', () => {
    expect(useColStats({ ...base, rows: () => [{ v: '10' }, { v: '20' }] }).statsOf('v').dist).toBeNull();
    const force = useColStats({ ...base, rows: () => [{ v: '10' }, { v: '20' }], isNumeric: () => true }).statsOf('v');
    expect(force.numeric, 'Σ 侧 force 仍计入（对照）').not.toBeNull();
    expect(force.dist, '分布侧不受 force 放大').toBeNull();
  });
});

/* ═══════════ 二、ColDetailModal「分布」段 ═══════════ */
describe('ColDetailModal 分布段（五百六十一批）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  let host: HTMLElement;

  function mkStats(dist: any) {
    return reactive({
      col: 'n', type: 'long', distinct: 2, empty: 0, numeric: null,
      top: [{ v: 0, n: 1 }, { v: 8, n: 1 }], count: 2, median: 4, emptyRate: 0, topTotal: 2,
      dist,
    });
  }
  async function mountWith(stats: any) {
    host = document.createElement('div');
    document.body.appendChild(host);
    const pprops = reactive({ show: true, stats, labelOf: (v: any) => String(v) });
    const app = createApp({ setup: () => () => h(ColDetailModal as any, pprops) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    return pprops;
  }
  const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

  beforeEach(() => {
    localStorage.clear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    document.body.innerHTML = '';
  });

  it('dist 非空：渲染 8 桶 mini 条形，桶 :title=「from~to: count」', async () => {
    await mountWith(mkStats({
      bins: [
        { from: 0, to: 1, count: 1 }, { from: 1, to: 2, count: 0 }, { from: 2, to: 3, count: 0 },
        { from: 3, to: 4, count: 0 }, { from: 4, to: 5, count: 0 }, { from: 5, to: 6, count: 0 },
        { from: 6, to: 7, count: 0 }, { from: 7, to: 8, count: 1 },
      ],
    }));
    const seg = document.body.querySelector('.rt-cd-dist');
    expect(seg, '分布段应渲染').toBeTruthy();
    const bars = [...document.body.querySelectorAll('.rt-cd-bar')] as HTMLElement[];
    expect(bars.length, '8 桶').toBe(8);
    expect(bars[0]!.title, '首桶 title 格式').toBe('0~1: 1');
    expect(bars[7]!.title, '末桶 title 格式').toBe('7~8: 1');
    expect(bars[1]!.title, '零值桶 title 仍标 count').toBe('1~2: 0');
  });

  it('桶高归一：最高桶 fill 100%、零值桶 0%', async () => {
    await mountWith(mkStats({
      bins: [
        { from: 0, to: 1, count: 3 }, { from: 1, to: 2, count: 0 }, { from: 2, to: 3, count: 0 },
        { from: 3, to: 4, count: 0 }, { from: 4, to: 5, count: 0 }, { from: 5, to: 6, count: 0 },
        { from: 6, to: 7, count: 0 }, { from: 7, to: 8, count: 3 },
      ],
    }));
    const fills = [...document.body.querySelectorAll('.rt-cd-bar-fill')] as HTMLElement[];
    expect(fills[0]!.getAttribute('style'), '最高桶满高').toContain('100%');
    expect(fills[1]!.getAttribute('style'), '零值桶零高').toContain('0%');
  });

  it('dist=null / 缺省字段：分布段零渲染（缺省零视觉，既有样板形状不受影响）', async () => {
    await mountWith(mkStats(null));
    expect(document.body.querySelector('.rt-cd-dist'), 'dist=null 零渲染').toBeNull();
    const legacy = reactive({
      col: 'kw1', type: 'keyword', distinct: 5, empty: 0, numeric: null, topTotal: 5,
      top: ['v1', 'v2', 'v3', 'v4', 'v5'].map((v, i) => ({ v, n: 10 - i })),
      count: 10, median: null, emptyRate: 0,
    });
    await mountWith(legacy);
    expect(document.body.querySelector('.rt-cd-dist'), '缺 dist 字段（既有样板）零渲染').toBeNull();
    expect(document.body.querySelector('.rt-cd-top'), '高频值段不受影响').toBeTruthy();
    await tick();
  });
});

/* ═══════════ 三、*_range 族类型守卫决策锚（561 批判定） ═══════════ */
describe('NON_SEMANTIC_TYPES_RE 合并 ip_range（五百六十一批判定）', () => {
  it('ip_range 判真；integer/long/float/double/date 五型备案不收（不误伤）', () => {
    expect(isNonSemanticType('ip_range'), 'ip_range 已被 IP_TYPE_RE 抑制 contains/sem 链，561 批合并').toBe(true);
    for (const t of ['integer', 'long', 'float', 'double', 'date']) {
      expect(isNonSemanticType(t), `数值/日期白名单核心成员 ${t} 不得误伤`).toBe(false);
    }
  });

  it('数值/日期语义链不受损（NUMERIC_TYPES_RE / isRangeType 照常判真）', () => {
    for (const t of ['integer', 'long', 'float', 'double']) {
      expect(NUMERIC_TYPES_RE.test(t), `${t} 仍在数值白名单`).toBe(true);
    }
    expect(isRangeType('date'), 'date 仍在区间筛选白名单').toBe(true);
  });
});
