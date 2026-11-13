/**
 * 五百四十七批：AdhocRebuildView 双 WorkbenchLayout 摘视口兜底（fill-viewport=false）。
 * 真机实锤：两处工作台缺省吃 .wl min-height:calc(100vh-210px) 视口兜底（WorkbenchLayout
 * fillViewport 缺省 true）——向导「目标物理索引名/仅校验/校验并继续」行动行被推出首屏，
 * settings/mapping 编辑区高度被兜底定死无法调矮。修=两处显式 :fill-viewport="false"
 * （DslQueryView :82-88 先例），pane 高度交内容自撑；其余视图缺省行为零增量
 * （queryWorkbenchW1 已锁 fillViewport prop 语义）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = (p: string) => readFileSync(join(__dirname, '..', p), 'utf8');

describe('adhocFillViewport547 · Adhoc 工作台摘视口兜底', () => {
  const adhoc = src('views/AdhocRebuildView.vue');

  it('双 WorkbenchLayout 均显式 :fill-viewport="false"（手动模式+审编模式）', () => {
    /* 554 批同步更新：开标签头部补 class="ar-fill-wl"（554-P0 高度档锚，554-P2 rows 驱动后类保留作 DOM 锚） */
    expect(adhoc, '手动模式工作台摘兜底').toContain(
      '<WorkbenchLayout class="ar-fill-wl" :scope="arManualScope" :panes="AR_MANUAL_PANES" axis="vertical" mode="arManual" :fill-viewport="false">',
    );
    expect(adhoc, '审编模式工作台摘兜底').toContain(
      '<WorkbenchLayout class="ar-fill-wl" :scope="arEdScope" :panes="AR_ED_PANES" axis="vertical" mode="arEditors" :fill-viewport="false">',
    );
  });

  it('页内 WorkbenchLayout 全数摘兜底（无漏网第三处）', () => {
    const opens = adhoc.match(/<WorkbenchLayout[^>]*>/g) ?? [];
    expect(opens.length, '本页工作台恰两处').toBe(2);
    for (const o of opens) expect(o, o.slice(0, 80)).toContain(':fill-viewport="false"');
  });

  it('高度链零触碰：dq.mainH 式内联定高/height 覆盖不回流', () => {
    expect(adhoc).not.toMatch(/WorkbenchLayout[^>]*:fill-viewport="false"[^>]*:style=/);
  });
});
