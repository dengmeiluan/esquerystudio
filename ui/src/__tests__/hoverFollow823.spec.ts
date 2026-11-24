/**
 * 八百二十三批·监控第十四轮「悬浮读出跟手化+tooltip 语言统一」（用户实报「悬浮卡片不跟手！！！
 * 违反设计语言」+「所有曲线图以及所有组件一样的设计语言一样质感」；R204）。
 * Phase 0：三处读出层（历史卡 hc-tip/对比卡 ld-hv/Top 卡 ld-top-hv）Y 向全固定顶部落位=不跟手根因；
 * hc-tip 容器 max-width 240px=节点名截断过狠（es-cn-cfn402duf0003fmmv-data-…）。
 * 刀面：件1 三处读出层 Y 向跟手（top 跟随指针+垂直居中于指针；左右翻转保留）；件2 hc-tip 容器放宽
 * 280px+行名称列不缩过狠（min-width 提高保节点可读）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const hcSrc = readFileSync(join(__dirname, '../components/HistoryChart.vue'), 'utf-8');
const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：悬浮读出 Y 向跟手（三处统一）', () => {
  it('A1 HistoryChart：hoverY 记录指针+tipStyle 带 top+垂直居中', () => {
    const s = strip(hcSrc);
    expect(s).toContain('hoverY');
    expect(s).toMatch(/top:\s*[^}]*hoverY|hoverY[^}]*top:/s);
    expect(s).toMatch(/transform:\s*'translateY\(-50%\)'/);
  });

  it('A2 LiveDashboard：cmpHit 带 y+ld-hv style 绑 top+shift 含 translateY', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/cmpHit\.value = hit \? \{ \.\.\.hit, y: y \?\? 0 \} : null/);
    expect(s).toMatch(/top: \(cmpHit\.y \|\| 0\)\.toFixed\(1\) \+ 'px'/);
    expect(s).toMatch(/translateY\(-50%\)/);
  });

  it('A3 Top 卡同构：topHit 带 y+ld-top-hv style 绑 top', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/topHit\.value = topRes \? \{ \.\.\.topRes, y: y \?\? 0 \} : null/);
    expect(s).toMatch(/top: \(topHit\.y \|\| 0\)\.toFixed\(1\) \+ 'px'/);
  });
});

describe('件2：tooltip 名称可读（放宽截断）', () => {
  it('B1 HistoryChart：hc-tip max-width 280px（九节点长名少截断）', () => {
    const s = strip(hcSrc);
    expect(s).toMatch(/\.hc-tip \{[^}]*max-width:\s*280px/);
  });
});
