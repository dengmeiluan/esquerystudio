/**
 * 八百六十七批：走势卡悬浮读出直钉化（用户复验反馈「没完全修正+卡顿」）。
 *
 * 背景：六卡（LiveChartCard）十字线/圆点 x 走 createHoverDamp(k=0.35) 阻尼滑行
 * （622-D2「跟手而不抖」）——但圆点 y 已由 lineYAtFrac 相邻采样线性插值钉线，
 * 抖动早已被插值消化；阻尼只剩「慢半拍」的拖影：k=0.35 每帧收敛 65%，
 * 60fps 下约 4 帧（67ms）滞后，低帧率环境（远程桌面/负载高）拖影成倍放大，
 * 用户两次实报「悬浮点不跟鼠标点」「感觉卡顿」与此一致。对比卡/顶部图
 * 两条悬浮链本就是即时直钉（无阻尼），四链跟手语义两口径——本刀把六卡
 * 对齐到直钉，四链统一「指针在哪、读出在哪」。
 *
 * 为什么是源码锁而非行为锚：阻尼拖影只存在于真实浏览器连续 mousemove 流中
 * （每次移动重置收敛进度）；spec 的等待窗内 rAF 会把阻尼收敛跑完，DOM 断言
 * 恒绿测不出拖影（本批实测：静态等待后十字线已收敛至目标位，行为锚假绿）。
 * 直钉行为由 dev 真机 probe 承接验证。
 *
 * 锁定：
 * 1) 接线锁：LiveChartCard 阻尼工厂调用恒为 createHoverDamp(0)（直钉）；
 * 2) 反形态锁：禁 reduceMotion 条件形态回归（k 条件化=拖影回归通道）。
 * 随迁：livePremium681 的 `CARD toContain('HOVER_DAMP_K')` 源码锁改为直钉锁
 * （HOVER_DAMP_K 常量值锁与 dampStep 数学锁保留——纯函数与常量本体不动，
 * sparkHover 单元面契约不变）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cardSrc = readFileSync(join(__dirname, '../components/LiveChartCard.vue'), 'utf-8');

describe('liveHoverDirect867 · 走势卡悬浮直钉', () => {
  it('接线锁：阻尼工厂调用=createHoverDamp(0)（直钉）', () => {
    expect(cardSrc).toContain('createHoverDamp(0)');
  });

  it('反形态锁：禁 reduceMotion 条件形态回归（拖影回归通道）', () => {
    expect(cardSrc).not.toMatch(/createHoverDamp\(\s*reduceMotion/);
    expect(cardSrc).not.toMatch(/createHoverDamp\(\s*reduceMotion\s*\?\s*0\s*:\s*HOVER_DAMP_K/);
  });
});
