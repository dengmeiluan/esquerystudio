/**
 * 七百九十五批：实时监控第二轮（用户续令「继续完整重构监控屏整个页面的布局以及整体
 * 组件的升级，质感交互大气等等都一并升级」；稿=docs/goal795-live-premium.html）。
 *
 * 件1 六卡卡头 KPI 大数重排：单行卡头（小灰题+20px 右浮值）→两行制——行① 标题+窗标注、
 *    行② 当前值 28px（--fs-num-l 区块大数档）色=指标身份色（curColor 通道既有）=
 *    Grafana stat 卡语言「打开先看六个大数」。
 * 件2 告警横条语义色边：左缘 4px 色条（crit 红/warn 黄/已恢复灰）一眼分档。
 * 件3 节点卡视觉升档：水位条 4→6px 圆角轨道+节点名字重 650。
 * 件4 页面节奏：区块间距 --sp-3→--sp-4（疏密对比=区块间疏+卡间维持密）+stagger 入场
 *    delay 拉档+PageHeader subtitle 精简（细节收 title 悬浮）。
 * 边界：只动 spacing/font-weight/border-left/height/字号档；布局属性零动画；
 * 高度哨兵=C 档新基线备案（间距升档自然增长）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：六卡卡头 KPI 大数重排', () => {
  it('P1 两行制卡头：标题行+KPI 大数行（源码锁）', () => {
    const s = strip(cardSrc);
    expect(s).toContain('ld-chart-kpi');
    expect(s).toMatch(/ld-chart-cur[^}]*font-size: var\(--fs-num-l\)/);
  });

  it('P2 六卡高度一致档（min-height 统一，源码锁）', () => {
    const s = strip(cardSrc);
    expect(s).toMatch(/\.ld-chart[^{]*\{[^}]*min-height/);
  });
});

describe('件2：告警横条语义色边', () => {
  it('P3 左缘 4px 语义色条（warn/bad 档，源码锁；既有类名口径=warn/bad/resolved）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-alert\.bad[^{]*\{[^}]*border-left:\s*4px[^}]*var\(--err\)/);
    expect(s).toMatch(/\.ld-alert\.warn[^{]*\{[^}]*border-left:\s*4px[^}]*var\(--warn\)/);
    expect(s).toMatch(/\.ld-alert\.resolved[^{]*\{[^}]*border-left:\s*4px/);
  });
});

describe('件3：节点卡视觉升档', () => {
  it('P4 节点名 650 字重+水位轨道在场（源码锁；稿 6px 笔误=现状 8px 已达标备案；八百零六批件1 用户令升档 8→12px=卡内主视觉+85/90 阈值刻度）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-bar[^{]*\{[^}]*height:\s*12px/);
    expect(s).toMatch(/\.ld-node-name b[^{]*\{[^}]*font-weight:\s*650/);
  });
});

describe('件4：页面节奏升档', () => {
  it('P5 区块间距 sp-4+stagger 拉档（源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-charts \{[^}]*margin-bottom:\s*var\(--sp-4\)/);
    expect(s).toMatch(/\.ld-nodes \{[^}]*margin-bottom:\s*var\(--sp-4\)/);
    expect(s).toMatch(/\.ld-hist \{[^}]*margin-bottom:\s*var\(--sp-4\)/);
    expect(s).toMatch(/--stagger:\s*85ms/);
  });

  it('P6 subtitle 精简（轮询细节收 title 悬浮，源码锁）', () => {
    const s = strip(liveSrc);
    expect(s.includes('后台常驻采样（切页降为'), '正文长串已收 title').toBe(false);
    expect(s).toContain('s 轮询 · 阈值告警');
  });
});
