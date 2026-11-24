/**
 * 八百九十六批：历史图键盘步进读数（铁律 B 键盘可达 + 窄刺峰的终极命中方案——
 * 鼠标停在 1-2px 宽的刺顶靠精度，方向键逐采样步进每桶必达）。
 *
 * 判据：
 *   1) 源码锁：.hc-canvas 携 tabindex+role+aria-label+@keydown/@focus/@blur；
 *      步长=全序列最大点数的倒数（1 桶）；Home/End 两端、Esc 收线；
 *   2) 挂载锚：focus 即显中点十字线；ArrowRight 步进后十字线 x 右移且吸附采样
 *      分位；Escape 收线；blur 收线。
 * 894 批（图例峰值直读）解决「读数」，本批解决「逐点命中」的键盘通道。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, nextTick } from 'vue';
import HistoryChart from '../components/HistoryChart.vue';

const chartSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('源码锁：键盘步进读数', () => {
  it('A1 canvas 携 tabindex+role+aria-label+键鼠事件接线', () => {
    const s = strip(chartSrc);
    expect(s).toMatch(/class="hc-canvas" tabindex="0" role="img"/);
    expect(s).toMatch(/aria-label="[^"]*方向键逐采样读数/);
    expect(s).toMatch(/@focus="onFocus" @blur="onBlur" @keydown="onKeydown"/);
  });
  it('A2 步长=1 采样桶（全序列最大点数倒数）；Home/End/Esc 语义在场', () => {
    const s = strip(chartSrc);
    expect(s).toMatch(/1 \/ \(points - 1\)/);
    expect(s).toContain("e.key === 'Home'");
    expect(s).toContain("e.key === 'End'");
    expect(s).toContain("e.key === 'Escape'");
  });
  it('A3 键盘焦点环（focus-visible 内嵌）', () => {
    const s = strip(chartSrc);
    expect(s).toMatch(/\.hc-canvas:focus-visible \{[^}]*outline: 1px solid var\(--ac-line\)/);
  });
});

describe('挂载锚：方向键步进十字线', () => {
  const base = {
    title: 'Load_1m',
    unit: '',
    series: [
      { name: 'a', points: [{ t: 0, v: 2 }, { t: 60, v: 4 }, { t: 120, v: 9 }, { t: 180, v: 1 }, { t: 240, v: 3 }] },
    ],
  };

  beforeEach(() => { document.body.innerHTML = ''; });

  it('B1 focus 即显中点十字线；ArrowRight 步进 x 右移吸附采样分位；Escape 收线', async () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(HistoryChart, base);
    app.mount(host);
    try {
      await nextTick();
      const canvas = host.querySelector('.hc-canvas') as HTMLElement;
      expect(canvas, '绘图域在场').toBeTruthy();
      canvas.dispatchEvent(new FocusEvent('focus'));
      await nextTick();
      await nextTick();
      const xlineAt = () => (host.querySelector('.hc-xline') as HTMLElement | null)?.style.left ?? null;
      /* focus=0.5 → 5 点序列步长 0.25 → ArrowRight 后 0.75 → t=180 分位 */
      expect(xlineAt()).toBe('50.00%');
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
      await nextTick();
      expect(xlineAt()).toBe('75.00%');
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
      await nextTick();
      expect(xlineAt()).toBe('100.00%');
      canvas.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await nextTick();
      expect(xlineAt()).toBeNull();
      canvas.dispatchEvent(new FocusEvent('blur'));
      await nextTick();
      expect(xlineAt()).toBeNull();
    } finally {
      app.unmount();
      host.remove();
    }
  });
});
