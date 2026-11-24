/**
 * 历史图多序列共享坐标系（用户实报「悬浮命中点挪不到曲线最高点/最低点」根治）：
 * polylineSegments 此前按单序列自身点建域（tMin/tMax/yMax 全取本序列），而十字线/
 * 悬浮点/tooltip 映射（px/py）按全体可见序列共享域——各线被各自拉伸满宽满高，
 * 曲线视觉位置与悬浮读数错位：序列间时间范围或量级不同时，悬浮圆点不贴任何曲线，
 * 鼠标对准视觉峰顶/谷底也命不中（同刻 x 错位最大满宽）。修法=polylineSegments 增设
 * 可选共享域实参，多序列同图消费方（HistoryChart）传入与 px/py 同源的域，
 * 单序列消费方缺省形态逐字节不变（向后兼容）。
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, nextTick } from 'vue';
import { polylineSegments } from '../utils/monitorSeries';
import HistoryChart from '../components/HistoryChart.vue';

const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

const W = 600;
const H = 220;
/* 序列 A 时间域 [0,100] 自身 max=10；共享域刻意放宽到 [0,200]/yMax=220 以区分两种映射 */
const ptsA = [
  { t: 0, v: 10 },
  { t: 100, v: 0 },
];
/* 序列 B 时间域 [100,200]——与 A 仅在 t=100 交叠（同刻），自身域与 A 完全错开 */
const ptsB = [
  { t: 100, v: 1 },
  { t: 200, v: 2 },
];
const shared = { tMin: 0, tMax: 200, yMax: 220 };

describe('polylineSegments 共享域实参（多序列同图坐标同源）', () => {
  it('S1 传共享域时坐标按共享域映射（而非本序列自身域）', () => {
    /* 点 (0,10)：x=(0-0)/200*600=0；y=220-(10/220)*220=210 —— 自身域下 y=20，可区分 */
    /* 点 (100,0)：x=(100/200)*600=300；y=220 —— 自身域下 x=600，可区分 */
    expect(polylineSegments(ptsA, W, H, undefined, shared)).toEqual(['0.0,210.0 300.0,220.0']);
  });

  it('S2 共享域下两序列同刻 x 对齐（悬浮点贴线/横向可比的前提）', () => {
    const a = polylineSegments(ptsA, W, H, undefined, shared)[0]!.split(' ');
    const b = polylineSegments(ptsB, W, H, undefined, shared)[0]!.split(' ');
    /* t=100：A 第二点 x=300；B 第一点 x=300 —— 同刻同 x */
    const ax = Number(a[1]!.split(',')[0]);
    const bx = Number(b[0]!.split(',')[0]);
    expect(Math.abs(ax - bx)).toBeLessThan(0.1);
  });

  it('S3 缺省形态逐字节不变（单序列消费方向后兼容）', () => {
    /* 自身域：span=100、yMax=10*1.1=11 → y(10)=220-200=20；x(100)=600 */
    expect(polylineSegments(ptsA, W, H)).toEqual(['0.0,20.0 600.0,220.0']);
  });

  it('S4 HistoryChart 消费侧传入共享域（与 px/py 映射同源）', () => {
    const s = strip(hcSrc);
    /* segCache 调用带第 5 实参，且域构造与 hover 链同源（dom 时间域+yMaxV 值域） */
    expect(s).toMatch(/polylineSegments\(s\.points,\s*PLOT_W,\s*PLOT_H,\s*props\.gapMs,\s*\w+/);
    expect(s).toMatch(/tMin:\s*dom\.value\.tMin[\s\S]{0,120}yMax:\s*yMaxV\.value/);
  });
});

describe('挂载级行为锚：悬浮圆点与曲线共享域坐标重合（用户实报缺陷的直接守卫）', () => {
  /* 892 批同步更新：圆点从「吸附最近采样点」升级为「十字线 x + 曲线在该 x 处的
     线性插值高度」（贴线语义，主卡 lineYAtFrac 同语言；用户复报「点无法到达最高点」，
     采样点 x 与十字线错位=圆点不在指针位置）。域外序列不再出圆点（曲线不在=无高度可贴）。 */
  it('S5 时间域错位两序列：圆点贴十字线 x 与共享域插值高度（而非各自拉伸后的视觉位置）', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(HistoryChart, {
      title: 'Load_1m',
      unit: '',
      series: [
        { name: 'a', points: [{ t: 0, v: 10 }, { t: 100, v: 0 }] },
        { name: 'b', points: [{ t: 100, v: 1 }, { t: 200, v: 2 }] },
      ],
    });
    app.mount(host);
    try {
      await nextTick();
      const canvas = host.querySelector('.hc-canvas') as HTMLElement;
      expect(canvas, '绘图域在场').toBeTruthy();
      const spy = vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        left: 0, top: 0, width: 600, height: 220, right: 600, bottom: 220, x: 0, y: 0, toJSON: () => ({}),
      } as DOMRect);
      /* frac=0.25 → t=50：a 在 t∈[0,100] 段内线性插值 v=5 → 共享域 yMaxV=max(10,2)*1.1=11
         → 圆点 left=25.00%、top=(220-(5/11)*220)/220=(220-100)/220=54.55%；
         b 的时间域 [100,200] 不含 t=50（曲线不在）→ 不出圆点；
         修复前 b 曲线按自身域画在 x=0（left=0%），与十字线 50% 错位满宽一半 */
      canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 150, clientY: 100 }));
      await nextTick();
      await nextTick();
      const dots = [...host.querySelectorAll<HTMLElement>('.hc-dot')];
      expect(dots.length, '仅时间域覆盖十字线的序列出圆点').toBe(1);
      expect(dots[0]!.style.left).toBe('25.00%');
      expect(dots[0]!.style.top).toBe('54.55%');
      void spy;
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
