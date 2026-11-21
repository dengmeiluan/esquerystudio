/**
 * 六百四十七批：实时数值「无数据」语义收口（646 批重盘 G'3，台账 R77 差距面）。
 *
 * 病灶：五张实时折线卡的头部当前值直接 `.toFixed(1)`——差分首轮（QPS/写入速率，序列空）
 *   与无节点时刻（Heap/CPU/磁盘均值）真实值为「无数据」，却显示「0.0」/「0.0%」——
 *   无数据与零值不可分辨（0.0 会误导用户为「当前确实是 0」）。
 * 收口：视图层五个 text computed——序列/数据空时回落 '—'（em dash），有数据保持原
 *   toFixed 形态零变化；cur-key 同步走 text（'—' 态稳定不触发动画重放）；
 *   pct 三卡 cur-title 无数据时不渲染（避免「数据节点均值 0.0%」误导句）。
 * 范式：源码锁（剥注释后字面断言，sparkThreshold644 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const VIEW = codeOf('views/LiveDashboardView.vue');

describe('六百四十七批：实时数值无数据回落「—」（G\'3）', () => {
  it('五卡 cur-text/cur-key 走 text computed（直接 toFixed 旧字面零残留）', () => {
    expect(VIEW, 'QPS 卡走 qpsText').toContain(':cur-text="qpsText"');
    expect(VIEW, '写入卡走 idxText').toContain(':cur-text="idxText"');
    expect(VIEW, 'Heap 卡走 heapText').toContain(':cur-text="heapText"');
    expect(VIEW, 'CPU 卡走 cpuText').toContain(':cur-text="cpuText"');
    expect(VIEW, '磁盘卡走 diskText').toContain(':cur-text="diskText"');
    expect(VIEW, '旧直接 toFixed 零残留（QPS）').not.toContain(':cur-text="curQps.toFixed(1)"');
    expect(VIEW, '旧直接 toFixed 零残留（Heap）').not.toContain(':cur-text="avgHeap.toFixed(1) + \'%\'"');
  });

  it('text computed 空序列回落「—」、有数据保持 toFixed 原形态', () => {
    expect(VIEW, 'qpsText 差分序列空回落').toContain("qpsSeries.value.length ? curQps.value.toFixed(1) : '—'");
    expect(VIEW, 'idxText 差分序列空回落').toContain("indexRateSeries.value.length ? curIdx.value.toFixed(1) : '—'");
    expect(VIEW, 'heapText 序列空回落').toContain("heapSeries.value.length ? avgHeap.value.toFixed(1) + '%' : '—'");
    expect(VIEW, 'cpuText 序列空回落').toContain("cpuSeries.value.length ? avgCpu.value.toFixed(1) + '%' : '—'");
    expect(VIEW, 'diskText 序列空回落').toContain("diskSeries.value.length ? avgDisk.value.toFixed(1) + '%' : '—'");
  });

  it('pct 三卡 cur-title 无数据不渲染（title 走 *Title computed）', () => {
    expect(VIEW, 'Heap title 走 heapTitle').toContain(':cur-title="heapTitle"');
    expect(VIEW, 'CPU title 走 cpuTitle').toContain(':cur-title="cpuTitle"');
    expect(VIEW, '磁盘 title 走 diskTitle').toContain(':cur-title="diskTitle"');
    expect(VIEW, 'heapTitle 空序列 undefined').toContain("heapSeries.value.length ? '数据节点均值 ' + avgHeap.value.toFixed(1) + '% · 阈值告警见虚线' : undefined");
    expect(VIEW, '旧内联 title 零残留').not.toContain(":cur-title=\"'数据节点均值 ' + avgHeap.toFixed(1)");
  });
});
