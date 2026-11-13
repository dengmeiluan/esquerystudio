/**
 * 六百八十一批（用户令「全开刀」）：622 稿残项落码——D1 身份色仲裁 / D2 悬浮阻尼 /
 * D4 曲线平滑 / D5 卡级时间锚 / §3.2 按下反馈（五条全取稿内推荐案 a）+ 件B G'2
 * KPI 串窄档节奏（台账 R77 备案项）。
 *
 * 判据：
 *   D4 曲线平滑：Catmull-Rom t=0.5 立方贝塞尔近似（sparkChart 单源），控制点逐轴钳位
 *     图体内（曲线永不出界，稿 D4 风险兜底）；主卡折线+渐变面积同曲线（path），
 *     对比卡/迷你 spark/HistoryChart 保持 polyline（591/615 逐字锁 + 小尺寸无收益）；
 *   D2 悬浮阻尼：显示位置按帧向指针目标收敛（k=0.35 约 4 帧收敛，稿推荐案），
 *     首中直钉（liveHover589 的 frac=0 确定性断言依赖此语义）、reduced-motion k=0 直钉
 *     （theme.css 全局兜底只覆盖 CSS，JS rAF 须自伞；不入 @media 块=633/adaptive556 同律）；
 *   D5 时间锚：窗起/窗末 2 枚（稿 D5 推荐案——3 枚在六卡重复 18 次噪声大于信息）；
 *   D1：QPS 卡身份色 → --dv-cyan（蓝=CPU 全屏唯一语义），CPU/历史区/节点卡 PALETTE 不动；
 *   §3.2 按下反馈：.ld-expand 与 .ld-seg 按钮 ：active 缩档（transform-only 不触发布局）；
 *   件B G'2：MetaStrip 行距档 row-gap --sp-2（900 档两行换行的分隔节奏；列距 7px 刻意值
 *     保字面——651「精确等值才收」同律）。
 * 同步更新：liveWindow604（主卡 polyline points→path.ld-line d）/liveVisual597（polygon→.ld-area
 *   +sparkArea 源码锁→catmullRomAreaPath），本 spec 不重复其断言只锚新形态。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { catmullRomPath, catmullRomAreaPath, sparkPts, LD_H } from '../utils/sparkChart';
import { createHoverDamp, dampStep, HOVER_DAMP_K, lineYAtFrac } from '../utils/sparkHover';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const CARD = codeOf('components/LiveChartCard.vue');
const VIEW = codeOf('views/LiveDashboardView.vue');
const STRIP = codeOf('components/MetaStrip.vue');

describe('六百八十一批 D4：Catmull-Rom 平滑（t=0.5 + 控制点钳位）', () => {
  it('路径形态：M 开头、每段一条 C、端点保真', () => {
    const pts = sparkPts([1, 5, 2, 8], 300, LD_H, 'abs');
    const d = catmullRomPath(pts, 300, LD_H);
    expect(d.startsWith('M ' + pts[0].x.toFixed(1) + ',' + pts[0].y.toFixed(1)), 'M=首点').toBe(true);
    expect((d.match(/ C /g) ?? []).length, '4 点=3 段').toBe(3);
    expect(d.endsWith(pts[3].x.toFixed(1) + ',' + pts[3].y.toFixed(1)), '末点=尾点').toBe(true);
  });

  it('钳位：尖峰数据控制点不越图体（x∈[0,W] y∈[0,H]）', () => {
    const pts = sparkPts([0, 100, 0, 100, 0], 300, 88, 'pct');
    const d = catmullRomPath(pts, 300, 88);
    const pairs = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)];
    expect(pairs.length).toBeGreaterThan(0);
    for (const [, x, y] of pairs) {
      expect(Number(x), 'x 下界').toBeGreaterThanOrEqual(-0.05);
      expect(Number(x), 'x 上界').toBeLessThanOrEqual(300.05);
      expect(Number(y), 'y 下界').toBeGreaterThanOrEqual(-0.05);
      expect(Number(y), 'y 上界').toBeLessThanOrEqual(88.05);
    }
  });

  it('面积路径：同曲线闭到图底两角（L 右下 L 左下 Z）', () => {
    const pts = sparkPts([3, 7, 5], 300, LD_H, 'abs');
    const d = catmullRomAreaPath(pts, 300, LD_H);
    expect(d.endsWith(' L 300.0,' + LD_H.toFixed(1) + ' L 0.0,' + LD_H.toFixed(1) + ' Z'), '两角闭合').toBe(true);
    expect((d.match(/ C /g) ?? []).length, '3 点=2 段').toBe(2);
  });

  it('退化：空串/单点直钉', () => {
    expect(catmullRomPath([], 300, LD_H)).toBe('');
    const one = sparkPts([5], 300, LD_H, 'abs');
    expect(catmullRomPath(one, 300, LD_H)).toBe('M ' + one[0].x.toFixed(1) + ',' + one[0].y.toFixed(1));
  });

  it('消费面：主卡折线+面积走 path 单源；对比卡 polyline 保留（591/615 键面不动）', () => {
    expect(CARD, '折线平滑').toContain('catmullRomPath');
    expect(CARD, '面积平滑').toContain('catmullRomAreaPath');
    expect(CARD, '主卡 polyline 退役').not.toMatch(/<polyline/);
    expect(CARD, '面积 path 锚类').toContain('class="ld-area"');
    expect(CARD, '折线 path 锚类').toContain('class="ld-line"');
    expect(VIEW, '对比卡折线保留').toMatch(/<polyline/);
  });
});

describe('六百八十一批 D2：悬浮阻尼（k=0.35，首中直钉）', () => {
  it('dampStep 数学：一步走 k 比例', () => {
    expect(dampStep(0, 10, 0.35)).toBeCloseTo(3.5);
    expect(dampStep(3.5, 10, 0.35)).toBeCloseTo(3.5 + 6.5 * 0.35);
  });

  it('首中直钉→按帧收敛→settle 精确落点', () => {
    const d = createHoverDamp();
    expect(d.move(0.5), '首中直钉（589 确定性断言语义）').toBe(0.5);
    d.move(0.9);
    for (let i = 0; i < 50 && !d.settled; i++) d.frame();
    expect(d.value, '收敛精确').toBe(0.9);
  });

  it('k=0（reduced-motion）直钉退化', () => {
    const d = createHoverDamp(0);
    d.move(0.2);
    d.move(0.8);
    expect(d.value).toBe(0.8);
    expect(d.frame()).toBe(0.8);
  });

  it('clear 归位（mouseleave 后下次悬浮重新直钉）', () => {
    const d = createHoverDamp();
    d.move(0.7);
    d.clear();
    expect(d.value).toBeNull();
    expect(d.move(0.1)).toBe(0.1);
  });

  it('lineYAtFrac：端点=采样点 y、中点线性插值', () => {
    expect(lineYAtFrac([0, 10], 0, 100, 'abs')).toBeCloseTo(100);
    expect(lineYAtFrac([0, 10], 1, 100, 'abs')).toBeCloseTo(0);
    expect(lineYAtFrac([0, 10], 0.5, 100, 'abs')).toBeCloseTo(50);
  });

  it('组件接线：阻尼单源 + 直钉（八百六十七批：拖影退役，接线恒 createHoverDamp(0)）', () => {
    expect(CARD).toContain('createHoverDamp');
    /* 八百六十七批随迁：阻尼拖影与实报「悬浮不跟手+卡顿」相悖，接线直钉化——
 常量与 dampStep 数学锁保留（sparkHover 纯函数面契约不变），接线锁移交
 liveHoverDirect867（createHoverDamp(0)+反形态双锁） */
    expect(HOVER_DAMP_K).toBe(0.35);
  });
});

describe('六百八十一批 D5：卡级时间锚 2 枚（窗起/窗末）', () => {
  it('两锚在场且取窗首窗尾（series≥2 才渲染）', () => {
    expect(CARD, '左锚').toContain('ld-ta-l');
    expect(CARD, '右锚').toContain('ld-ta-r');
    expect(CARD, '窗首取值').toMatch(/tsWin\.value\[0\]/);
    expect(CARD, '窗尾取值').toMatch(/tsWin\.value\[tsWin\.value\.length - 1\]/);
    expect(CARD, '有折线才渲染').toMatch(/series\.length > 1/);
  });
});

describe('六百八十一批 §3.2：按下反馈（transform-only）', () => {
  it('展开钮 active 缩档', () => {
    expect(CARD).toMatch(/\.ld-expand:active/);
    expect(CARD).toContain('transform: scale(.92)');
  });
  it('seg 按钮 active 缩档（视图 scoped）', () => {
    expect(VIEW).toMatch(/\.ld-seg button:active/);
    expect(VIEW).toContain('transform: scale(.96)');
  });
});

describe('六百八十一批 D1：QPS 身份色仲裁（青轴=QPS，蓝=CPU 唯一）', () => {
  it('QPS 卡色与当前值双青；卡内零蓝', () => {
    const i = VIEW.indexOf('集群 QPS（搜索/秒）');
    expect(i, 'QPS 卡在场').toBeGreaterThan(-1);
    const blk = VIEW.slice(i, VIEW.indexOf('索引写入速率'));
    expect((blk.match(/var\(--dv-cyan\)/g) ?? []).length, 'color+cur-color 双青').toBe(2);
    expect(blk, '卡内零蓝').not.toContain('var(--dv-blue)');
  });
  it('CPU 卡保持蓝（全屏唯一语义）；历史区 PALETTE 不受影响', () => {
    const j = VIEW.indexOf(':cur-title="cpuTitle"');
    expect(j, 'CPU 卡在场').toBeGreaterThan(-1);
    expect(VIEW.slice(Math.max(0, j - 300), j), 'CPU 仍蓝').toContain('var(--dv-blue)');
    expect(VIEW, 'CMP_PALETTE 蓝保留').toContain("CMP_PALETTE = ['var(--dv-blue)'");
  });
});

describe('六百八十一批 件B：G\'2 KPI 串窄档节奏（MetaStrip row-gap）', () => {
  it('行距档 --sp-2、列距 7px 刻意值保字面', () => {
    expect(STRIP).toMatch(/gap: var\(--sp-2\) 7px/);
  });
});
