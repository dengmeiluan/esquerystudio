/**
 * 横切审计第七轮族D 潜伏雷收刀：LiveChartCard tick 续约帧 id 未回写 rafId。
 *
 * 病灶：tick() 起手 rafId=null，阻尼未收敛时裸调 scheduleTick() 丢弃返回值——
 * rafId 恒 null，onLeave 的 cancel 够不到续约帧；且 k>0 时离开已 clear()
 * （cur=null → settled=false），续约帧照排不误=不可取消的 60fps 空转。
 * 现网 createHoverDamp(0) 直钉态 settled 恒真不触达（870 批记档不动刀的
 * 潜伏面）；k>0 恢复阻尼前必须回写。修法=续约时 rafId = scheduleTick()。
 *
 * 守卫形态：867-C1 判例——阻尼/动效类缺陷的 spec 行为锚恒假绿（等待窗内
 * rAF 把收敛跑完），此类缺口唯一可靠守卫=源码锁（接线形态字面）。
 * 顺带锁 onLeave 取消通道双形态在场（rAF 与 setTimeout 回退配对不缺角）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8');

describe('LiveChartCard rAF 续约帧回写 rafId', () => {
  it('tick 续约必须回写 rafId（修复前丢弃返回值=cancel 够不到续约帧=红）', () => {
    expect(cardSrc).toContain('if (!damp.settled) rafId = scheduleTick();');
  });

  it('丢弃返回值的续约形态不得回归', () => {
    expect(cardSrc).not.toContain('if (!damp.settled) scheduleTick();');
  });

  it('onLeave 取消通道双形态配对在场（rAF 主通道+setTimeout 回退）', () => {
    expect(cardSrc).toMatch(/cancelAnimationFrame\(rafId\)/);
    expect(cardSrc).toMatch(/clearTimeout\(rafId\)/);
  });
});
