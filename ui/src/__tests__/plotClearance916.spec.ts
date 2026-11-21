/**
 * 九百一十六批续二：绘图域让位全站收口（用户令「为什么每次扫描不到全部角落」——
 * KPI 卡让位后，节点对比卡与 Top 曲线的同构缺陷仍在：曲线 x=0 起点横穿 Y 刻度文字）。
 *
 * 判据（三组件同语言）：
 *   1) HistoryChart：.hc-canvas 原生 left:36px（既有）；
 *   2) LiveChartCard：.ld-svgwrap padding-left:36px + .ld-hitlayer 同域 + frac 取 svg rect；
 *   3) LiveDashboardView：对比卡与 Top 曲线各包 .ld-cmp-inner（inset 0 0 0 36px），
 *      Y 刻度列 .ld-yt 右对齐（width:32px），frac 分母取 inner rect；
 *   4) 收口清点：全站时序曲线组件=HistoryChart/LiveChartCard/对比卡/Top 卡/
 *      jobCount mini spark（无刻度豁免）——无漏网。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8');
const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('源码锁：绘图域让位全站收口', () => {
  it('A1 HistoryChart：hc-canvas left:36px 让位（既有锚）', () => {
    const s = strip(hcSrc);
    expect(s).toMatch(/\.hc-canvas \{ position: absolute; top: 0; bottom: 0; left: 36px; right: 0; \}/);
  });

  it('A2 LiveChartCard：svgwrap 让位+hitlayer 同域+frac 取 svg rect+刻度右对齐', () => {
    const s = strip(cardSrc);
    expect(s).toMatch(/\.ld-svgwrap \{ position: relative; padding-left: 36px; \}/);
    expect(s).toMatch(/\.ld-hitlayer \{ position: absolute; top: 0; bottom: 0; left: 36px; right: 0;/);
    expect(s).toMatch(/const svg = el\?\.querySelector\('\.ld-svg'\);/);
    expect(s).toMatch(/\.ld-yt \{ position: absolute; left: 0; width: 32px; text-align: right;/);
  });

  it('A3 对比卡：ld-cmp-inner 让位壳+frac 取 inner rect+Y 刻度右对齐', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/<div class="ld-cmp-inner">/);
    expect(s).toMatch(/\.ld-cmp-inner \{ position: absolute; inset: 0 0 0 36px; \}/);
    expect(s).toMatch(/const inner = el\?\.querySelector\('\.ld-cmp-inner'\);/);
    expect(s).toContain('.ld-yt { position: absolute; left: 0; width: 32px; text-align: right;');
  });

  it('A4 Top 曲线：同壳复用（ld-cmp-inner）+frac 取 inner rect', () => {
    const s = strip(liveSrc);
    /* Top plot 内的 inner 开壳（plot 开壳后第一元素） */
    expect(s).toMatch(/class="ld-cmp-plot ld-top-plot"[\s\S]{0,120}<div class="ld-cmp-inner">/);
    expect(s).toMatch(/const inner = el\?\.querySelector\('\.ld-cmp-inner'\);[\s\S]*?const frac = rect && rect\.width > 0/);
  });
});
