/**
 * 八百一十七批·监控第十一轮「区块/容器标题三档归一」（用户续令「继续统一设计语言，还不够」；R197）。
 * Phase 0 全页一致性审计（Chrome 真算+暗浅双主题整页截图）读数：
 *   区块标题两档——节点实时视图/历史趋势=.sec-t 12px·600 约定档 vs 实时告警头/监控明细钮=11px·600 低一档；
 *   孪生容器不同档——节点对比容器头（.ld-ncmp-tt 11px·400 muted）vs 监控明细容器头（同为容器标题形态）。
 * 刀面（纯 CSS 三规则）：件1 告警头升 sec-t 档；件2 明细钮升 sec-t 档；件3 对比容器头升容器档（fs-sm·600·tx1）。
 * 卡头档复核=已一致（六卡 ld-chart-tt-top/历史 hc-tt/对比 chips=11px muted 族，零刀）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1~3：区块/容器标题三档归一（sec-t 约定档=fs-sm·600）', () => {
  it('A1 告警头升档：.ld-alerts-tt font-size fs-sm（12px·600 约定档；warn 语义色保留）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-alerts-tt \{[^}]*font-size:\s*var\(--fs-sm\)/);
    expect(s).toMatch(/\.ld-alerts-tt \{[^}]*font-weight:\s*600/);
    expect(s).toMatch(/\.ld-alerts-tt \{[^}]*var\(--warn\)/);
  });

  it('A2 明细钮升档：.ld-detail-toggle font-size fs-sm（四区标题同档）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-detail-toggle \{[^}]*font-size:\s*var\(--fs-sm\)/);
  });

  it('A3 对比容器头升档：.ld-ncmp-tt fs-sm·600·tx1（与明细容器=孪生容器同语言；muted 卡级色退役）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-ncmp-tt \{[^}]*font-size:\s*var\(--fs-sm\)/);
    expect(s).toMatch(/\.ld-ncmp-tt \{[^}]*font-weight:\s*600/);
    expect(s).toMatch(/\.ld-ncmp-tt \{[^}]*color:\s*var\(--tx1\)/);
  });

  it('A4 卡头档复核锚：六卡/历史卡头维持 11px muted 族（零刀备案防误升）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-chart-tt-top \{[^}]*font-size:\s*var\(--fs-xs\)[^}]*color:\s*var\(--muted\)|\.ld-chart-tt-top \{[^}]*color:\s*var\(--muted\)[^}]*font-size:\s*var\(--fs-xs\)/);
  });
});
