/**
 * 一千三百一十九批：直方图补 x 轴刻度。
 *
 * 真机复现（1440×1000，research_report 6 桶）：柱状图画得好，但**整张图没有任何坐标标注**——
 * 六根柱分别对应哪段时间，只能逐根悬停才看得到，「一眼看分布」这件事做不到。
 * 而这张图同时是 SQL 图表视图（sqlChartView1048）、索引工作区概览、查询工作台在用的共享件。
 *
 * 本 spec 锁行为（真挂载，不读源码）：
 *  - 日期桶出短日期 MM-DD；跨年出 YYYY-MM-DD（否则 2025/2026 两段会看起来一样）
 *  - 词条桶原样出 key
 *  - 首尾两个刻度**必须都在**（范围两端缺了就读不出区间）
 *  - 刻度数受容器宽限制（60px/条），窄容器不硬塞
 *  - 刻度不溢出容器右缘、两两不重叠（末刻度内收）
 * 负控：删掉 .agg-x 渲染 → 第一条必红。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import AggBarChart from '../components/AggBarChart.vue';

const tick = async (n = 10) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

/** 给容器一个已知宽度（组件用 ResizeObserver/clientWidth 测宽）。
 happy-dom 无布局引擎且 ResizeObserver 不回包 → 组件会停在默认 600；
 这里在挂载**前**把宿主 clientWidth 打桩，组件的 onMounted measureW 即可读到目标宽。 */
function mount(buckets: any[], width = 600) {
  host.style.width = width + 'px';
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
  const app = createApp({ setup: () => () => h(AggBarChart as any, { buckets, height: 80 }) });
  app.mount(host);
  apps.push(app);
  return host.querySelector('.agg-chart') as HTMLElement;
}
const labels = () => [...document.querySelectorAll('.agg-x-t')].map(e => (e.textContent || '').trim());

afterEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* noop */ } });
  apps.length = 0;
  host.innerHTML = '';
  vi.restoreAllMocks();
});

const dateBuckets = Array.from({ length: 6 }, (_, i) => ({
  key: Date.UTC(2026, 8, 1 + i), key_as_string: '2026-09-0' + (1 + i) + 'T00:00:00.000Z', doc_count: i + 1,
}));
const termBuckets = [
  { key: 'ACTIVE', doc_count: 3 }, { key: 'PENDING', doc_count: 2 }, { key: 'CLOSED', doc_count: 1 },
];

describe('1319 直方图 x 轴刻度', () => {
  it('日期桶出短日期，且首尾刻度都在', async () => {
    mount(dateBuckets, 600);
    await tick();
    const ls = labels();
    expect(ls.length, '必须有刻度').toBeGreaterThanOrEqual(2);
    expect(ls[0], '首个刻度 = 第一桶日期').toBe('09-01');
    expect(ls[ls.length - 1], '末个刻度 = 最后一桶日期').toBe('09-06');
  });

  it('跨年桶带年份（否则两年同月同日看起来一样）', async () => {
    mount([
      { key: 1, key_as_string: '2024-03-01T00:00:00.000Z', doc_count: 1 },
      { key: 2, key_as_string: '2025-03-01T00:00:00.000Z', doc_count: 2 },
    ], 600);
    await tick();
    expect(labels(), '非当年必须带年份').toEqual(['2024-03-01', '2025-03-01']);
  });

  it('词条桶原样出 key（keyword 型直方图）', async () => {
    mount(termBuckets, 600);
    await tick();
    expect(labels()).toEqual(['ACTIVE', 'PENDING', 'CLOSED']);
  });

  it('窄容器不硬塞：刻度数受宽度限制，但首尾仍保留', async () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      key: Date.UTC(2026, 0, 1 + i), key_as_string: new Date(Date.UTC(2026, 0, 1 + i)).toISOString(), doc_count: 1,
    }));
    mount(many, 180); // 180/60 = 最多 3 条
    await tick();
    const ls = labels();
    expect(ls.length, '窄容器刻度数应显著少于桶数').toBeLessThanOrEqual(4);
    expect(ls.length, '但仍要有首尾').toBeGreaterThanOrEqual(2);
  });

  it('刻度不溢出容器、两两不重叠', async () => {
    mount(dateBuckets, 600);
    await tick();
    const els = [...document.querySelectorAll('.agg-x-t')] as HTMLElement[];
    expect(els.length).toBeGreaterThanOrEqual(2);
    /* happy-dom 无布局引擎 → 用 left 样式百分比重建位置做纯几何校验 */
    const boxW = 600;
    const pos = els.map(e => {
      const raw = (e.style.left || '0').replace('%', '');
      return parseFloat(raw) / 100 * boxW;
    });
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i], `第 ${i} 个刻度不得与其前一个重叠`).toBeGreaterThan(pos[i - 1]);
    }
    expect(pos[pos.length - 1], '末刻度不得越出容器').toBeLessThanOrEqual(boxW);
  });
});
