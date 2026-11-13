/**
 * 二百二十二批：弹出层视口碰撞自适应（popFit）守卫。
 * 用户实报锚点：「索引中心列表第一行右键看不到信息，要滚动下去右键才能看全」——
 * 菜单固定落光标点无碰撞检测，视口底部溢出被裁。
 * 锁定：底溢上翻/右溢左翻/四向钳位/零尺寸不翻（happy-dom 兼容）/超大菜单贴边。
 */
import { describe, it, expect } from 'vitest';
import { fitPopupPos } from '../popFit';

const VW = 1280, VH = 720;

describe('fitPopupPos 视口碰撞自适应', () => {
  it('视口中部落点不动（无溢出零调整）', () => {
    expect(fitPopupPos(400, 300, 168, 200, VW, VH)).toEqual({ x: 400, y: 300 });
  });
  it('底部溢出向上翻（用户实报场景：列表底部行右键菜单被裁）', () => {
    /* 菜单高 240，y=600 时 600+240 > 720-8 → 翻到 600-240=360 */
    const p = fitPopupPos(400, 600, 168, 240, VW, VH);
    expect(p).toEqual({ x: 400, y: 360 });
    expect(p.y + 240).toBeLessThanOrEqual(VH - 8);
  });
  it('右侧溢出向左翻（右缘列右键）', () => {
    /* 菜单宽 200，x=1200 时 1200+200 > 1280-8 → 翻到 1200-200=1000 */
    const p = fitPopupPos(1200, 100, 200, 150, VW, VH);
    expect(p).toEqual({ x: 1000, y: 100 });
    expect(p.x + 200).toBeLessThanOrEqual(VW - 8);
  });
  it('双向溢出双向翻', () => {
    const p = fitPopupPos(1200, 600, 200, 240, VW, VH);
    expect(p).toEqual({ x: 1000, y: 360 });
  });
  it('四向钳位：负坐标与超菜单尺寸都收进视口', () => {
    expect(fitPopupPos(-50, -20, 168, 200, VW, VH)).toEqual({ x: 8, y: 8 });
    /* 菜单比视口还高：贴上边（CSS max-height 内滚兜底），不越上界 */
    const p = fitPopupPos(400, 400, 168, 2000, VW, VH);
    expect(p.y).toBe(8);
  });
  it('零尺寸（happy-dom 无布局）数学上不翻：落点=期望点，与旧行为一致', () => {
    expect(fitPopupPos(1200, 600, 0, 0, VW, VH)).toEqual({ x: 1200, y: 600 });
  });
  it('自定义边距 M 生效', () => {
    const p = fitPopupPos(400, 600, 168, 240, VW, VH, 16);
    expect(p).toEqual({ x: 400, y: 360 });
    /* 695+10=705 > 720-16=704 → 上翻到 695-10=685 */
    const q = fitPopupPos(400, 695, 168, 10, VW, VH, 16);
    expect(q.y).toBe(685);
  });
});
