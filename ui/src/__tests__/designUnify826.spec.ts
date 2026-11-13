/**
 * 八百二十六批·监控第十五轮「设计语言统一大修」（用户续令+三路斥候调研差距落地；R206）。
 * 调研来源=三路并发斥候（Agent-A 明细条 seg 几何/Agent-B 告警往下布局节奏/Agent-C 四族曲线质感对比）。
 * 刀面：
 *  A组 明细条几何（Agent-A 根因1+3）：明细 seg 补 ld-seg 作用域（免费获得等宽钮+文字居中+真滑块——
 *    822 只治折行没治几何=「不对称不对齐仍在犯」真根因；thumb 幽灵占槽随之消除）+.ld-detail-meta nowrap。
 *  B组 布局节奏（Agent-B 根因1/2/4）：.ld-hist-grid 补 gap sp-3（原零间距+双边框缝=最刺眼项）+
 *    .ld-alerts 补 margin-bottom sp-4（交界 0px 焊死）+空态告警头整行不渲染（搁浅分隔条+死代码 ld-ok-chip 清除）。
 *  C组 读出统一（Agent-C 差异2/3，以 hc-tip 为基准）：.ld-xline 补规则（族3/4 十字线不可见=bug 级）+
 *    .ld-hv 壳底 bg1→bg2+font-size fs-2xs+.ld-hv-t 补样式（mono tx2 fs-2xs）+读出行 b 补 tx0/600。
 * 留下一批：折线平滑统一（族1 Catmull-Rom→族2/3/4，大刀）、族4 X/Y 轴重排。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('A组：明细条 seg 几何归一（ld-seg 作用域）', () => {
  it('A1 明细 seg 补 ld-seg class（等宽钮+居中+真滑块）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/class="seg ld-seg ld-detail-seg"/);
  });
  it('A2 .ld-detail-meta nowrap（慢请求/告警历史档长文案不折行）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-detail-meta \{[^}]*white-space:\s*nowrap/);
  });
});

describe('B组：告警往下布局节奏', () => {
  it('B1 .ld-hist-grid 补 gap sp-3（与六卡同档）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-hist-grid \{[^}]*gap:\s*var\(--sp-3\)/);
  });
  it('B2 .ld-alerts 补 margin-bottom sp-4（交界 0px 焊死根治）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-alerts \{[^}]*margin-bottom:\s*var\(--sp-4\)/);
  });
  it('B3 空态告警头整行不渲染（搁浅分隔条+死 ld-ok-chip 清除）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/v-if="activeAlerts\.length \|\| resolvedAlerts\.length" class="ld-alerts"/);
    expect(s).toMatch(/v-else class="ld-alerts ld-alerts-empty"/);
    expect(s).not.toContain('v-if="!activeAlerts.length" class="ld-ok-chip"');
  });
});

describe('C组：读出统一（hc-tip 基准）', () => {
  it('C1 .ld-xline 规则补位（族3/4 十字线不可见 bug 根治）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-xline \{[^}]*position:\s*absolute/);
    expect(s).toMatch(/\.ld-xline \{[^}]*width:\s*1px/);
  });
  it('C2 .ld-hv 壳对齐 hc-tip（bg2+fs-2xs）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-hv \{[^}]*background:\s*var\(--bg2\)/);
    expect(s).toMatch(/\.ld-hv \{[^}]*font-size:\s*var\(--fs-2xs\)/);
  });
  it('C3 .ld-hv-t 时间行样式+读出行值 tx0/600', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-hv-t \{[^}]*font-family:\s*var\(--mono\)/);
    expect(s).toMatch(/\.ld-ncmp-tip-r em \{[^}]*color:\s*var\(--tx0\)/);
  });
});
