/**
 * 八百批：实时监控第五轮「监控明细单容器」（用户六令实报 20261008 13:18「top写入索引
 * 为什么不跟下面的监控在一块，这严重违反了我想要的设计，请继续深度改造」；稿=
 * docs/goal800-live-detail.html）。
 *
 * 根因：Top 索引/慢请求/告警历史三条独立 CollapsePanel 收起条=视觉分离三块散条。
 * 改法=三面板整合为单一「监控明细」容器（.ld-detail 一个壳+一个展开钮+seg 三视图切换
 * 〔铁律 C〕）；三旧状态合一（detailOpen+detailTab）；视图内容原样迁入（Top 曲线双视图/
 * 慢请求阈值行/告警筛选导出）；懒加载保持（开容器且切到该视图才拉取）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：监控明细单容器', () => {
  it('D1 单容器壳+seg 三视图（源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-detail');
    expect(s).toContain('ld-detail-seg');
    expect(s).toContain('detailTab');
    expect(s).toContain('detailOpen');
  });

  it('D2 三旧独立面板状态退役（源码锁：topOpen/slowOpen/alertHistOpen 零残留）', () => {
    const s = strip(liveSrc);
    expect(s.includes('topOpen'), 'topOpen 退役').toBe(false);
    expect(s.includes('slowOpen'), 'slowOpen 退役').toBe(false);
    expect(s.includes('alertHistOpen'), 'alertHistOpen 退役').toBe(false);
  });

  it('D3 三视图条件渲染形态（源码锁）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/detailTab === 'top'/);
    expect(s).toMatch(/detailTab === 'slow'/);
    expect(s).toMatch(/detailTab === 'alert'/);
  });

  it('D4 懒加载语义保持（开容器+视图命中才拉取，源码锁：ensureDetailLoad 单入口）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('function ensureDetailLoad');
    expect(s).toMatch(/detailTab\.value === 'top'[^}]{0,80}loadTop/);
    expect(s).toMatch(/detailTab\.value === 'slow'[^}]{0,80}loadSlow/);
  });

  it('D5 三视图内容原样保留（Top 曲线/慢请求表/告警表锚在场）', () => {
    const s = strip(liveSrc);
    expect(s).toContain('ld-top-plot');
    expect(s).toContain('慢请求');
    expect(s).toContain('告警历史');
  });
});
