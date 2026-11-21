/**
 * 二百五十九批：分割线重置能力可视化。
 * 双击重置自 SplitHandle 诞生就有（15 行 @dblclick）、键盘 r/方向键/Home/End 全套
 * 键盘语义也在（55/127 批），但零提示——hover 无 title、只能靠猜。补全 hover 提示。
 * WorkbenchLayout 四颗预设钮 title 既有（本 spec 一并锁防回退）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sh = readFileSync(join(__dirname, '../components/SplitHandle.vue'), 'utf-8');
const wl = readFileSync(join(__dirname, '../components/WorkbenchLayout.vue'), 'utf-8');

describe('分割线重置提示可视化（259 批）', () => {
  it('SplitHandle hover title 提示拖拽/双击重置/键盘全套', () => {
    expect(sh).toContain('拖拽调整 · 双击或按 R 重置');
    expect(sh).toContain('Home/End 到两端');
    /* 既有能力不回退 */
    expect(sh).toContain("@dblclick=\"emit('reset')\"");
    expect(sh).toContain("event.key === 'r' || event.key === 'R'");
  });
  it('WorkbenchLayout 预设钮 title 不回退', () => {
    expect(wl).toContain('title="等分布局"');
    expect(wl).toContain('title="恢复默认布局"');
  });
});
