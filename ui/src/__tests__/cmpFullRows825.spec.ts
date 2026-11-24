/**
 * 八百二十五批·监控第十五轮「对比读出层全量显示」（用户实报「+1 节点是什么意思？为什么看不完整？」；
 * R205——纯前端零 Java 小刀）。794 年代 CMP_TIP_CAP=8 行截断是「读出层固定顶部落位会爆行」时代的
 * 防护——823 批读出层已跟手化（小卡片贴指针），9 节点集群必然触发「+1 节点…」截断=信息不可见。
 * 刀面：cap 提至 24（覆盖 ES 集群常见规模）+读出卡片 max-height 260px 内滚动兜底极端规模；
 * 「+N 节点…」尾行通道保留（超 24 行极端场景仍兜底，零删除防回潮）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const liveSrc = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

describe('件1：对比读出层全量显示', () => {
  it('A1 cap 提至 24（9 节点集群全量可见；+N 尾行通道保留兜底极端规模）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/const CMP_TIP_CAP = 24;/);
    expect(s).toContain('+');
    expect(s).toContain('节点…');
  });

  it('A2 读出卡片滚动兜底：.ld-hv-stack max-height+overflow-y auto（超 24 行极端场景）', () => {
    const s = strip(liveSrc);
    expect(s).toMatch(/\.ld-hv-stack \{[^}]*max-height:\s*260px/);
    expect(s).toMatch(/\.ld-hv-stack \{[^}]*overflow-y:\s*auto/);
  });
});
