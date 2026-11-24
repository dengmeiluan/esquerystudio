/**
 * 八百二十二批·跨页设计语言「图例色键圆点归一」（用户续令「继续优化」；R202——监控视觉矿枯竭后
 * 转向跨页一致性；纯 CSS 两声明零 Java）。
 * Phase 0 全站静态扫（border-radius 2/3px 小元素×语义过滤）：图例色键方点两处漂移——
 *   MappingView .mp-leg-dot（donut 图例色键 8px radius 2px）+ LifecycleView .lc-legend i（phase 图例
 *   色键 10px radius 2px）vs 全站圆点语言（MetaStrip .ms-dot/StatusPill/监控三族 chips/ld-ok-chip 全 50%）。
 * 豁免备案：TopologyView .tp-swatch 维持方形=形态随指称物（拓扑分片格=方块，swatch 镜像实际形状）；
 *   bar 填充族（dg-bar/agg-track/ring-bar）radius 3px=条形填充正确形态非色键。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mpSrc = readFileSync(join(__dirname, '../views/MappingView.vue'), 'utf-8');
const lcSrc = readFileSync(join(__dirname, '../views/LifecycleView.vue'), 'utf-8');
const tpSrc = readFileSync(join(__dirname, '../views/TopologyView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ');

describe('件1：图例色键圆点归一（与全站 dot 语言同构）', () => {
  it('A1 MappingView .mp-leg-dot 圆点 50%（donut 色键）', () => {
    const s = strip(mpSrc);
    expect(s).toMatch(/\.mp-leg-dot \{[^}]*border-radius:\s*50%/);
  });

  it('A2 LifecycleView .lc-legend i 圆点 50%（phase 色键）', () => {
    const s = strip(lcSrc);
    expect(s).toMatch(/\.lc-legend i \{[^}]*border-radius:\s*50%/);
  });

  it('A3 豁免锚：TopologyView .tp-swatch 维持方形（形态随指称物=分片方块）', () => {
    const s = strip(tpSrc);
    expect(s).toMatch(/\.tp-swatch \{[^}]*border-radius:\s*2px/);
  });
});

/* ═══ 追加件（用户 13:12 双实报+悬浮读出小卡片实报）═══ */
const liveSrc2 = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

describe('件3：对比/Top 悬浮读出补弹层四要素（=hc-tip 同语言；「不应该是悬浮小卡片吗」）', () => {
  it('B1 源码锁：.ld-hv 卡片壳（bg1 底+border+shadow+r-s+padding）+tip 行白空间不折', () => {
    const s = strip(liveSrc2);
    expect(s).toMatch(/\.ld-hv \{[^}]*background:\s*var\(--bg2\)/); /* 八百二十六批C2 同步更新：bg1→bg2 对齐 hc-tip 基准 */
    expect(s).toMatch(/\.ld-hv \{[^}]*border:\s*1px solid var\(--border\)/);
    expect(s).toMatch(/\.ld-hv \{[^}]*box-shadow:\s*var\(--shadow-m\)/);
    expect(s).toMatch(/\.ld-hv \{[^}]*border-radius:\s*var\(--r-s\)/);
    expect(s).toMatch(/\.ld-ncmp-tip-r \{[^}]*white-space:\s*nowrap/);
  });
});

describe('件4：明细条 seg 防折行（「完全不对称不对齐」=seg 被挤 wrap 两排）', () => {
  it('B2 源码锁：.ld-detail-seg nowrap+按钮不折不缩+meta 弹性让位', () => {
    const s = strip(liveSrc2);
    expect(s).toMatch(/\.ld-detail-seg \{[^}]*flex-wrap:\s*nowrap/);
    expect(s).toMatch(/\.ld-detail-seg button \{[^}]*white-space:\s*nowrap/);
    expect(s).toMatch(/\.ld-detail-meta \{[^}]*min-width:\s*0/);
  });
});
