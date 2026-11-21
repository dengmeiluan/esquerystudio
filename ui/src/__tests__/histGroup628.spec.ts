/**
 * 六百二十八批：对标阿里云「分组」导航（626 批真机实测：阿里云「分组: 概览 ▾」展开 9 项）
 * + 历史区工具行 ⋯ 收纳（铁律 C 明面 ≤5）。
 *
 * 判据：
 *   1) `utils/histGroups.ts` 纯函数单源——8 组（我方收敛，不照搬「主节点指标」）、
 *      `HIST_GROUP_OF` 编译期 30 项全覆盖、`overview` = pass-through（零行为变更）、
 *      组间为**划分**（无重复无遗漏）；
 *   2) 视图接线：分组 seg 由 `HIST_GROUPS` 驱动（短标签 + title 全称 + aria-pressed）；
 *      `histCharts` 的组过滤必须在**既有 scope 过滤之后**（626 辨析：自动二态隐藏 ≠ 用户导航）；
 *      `histGroup` 走 usePref 落盘且**切集群/模式/范围不重置**（铁律 B）；
 *   3) 工具行收纳：聚合方式 / 自动刷新 / 按节点查看 三件移入 ⋯（`<details class="ld-hist-more">`），
 *      明面保留 分组 / 时间范围 / 集群 / 刷新 / ⋯ = 5（铁律 C ≤5）。
 * 负锁一律剥注释后断言（unifyWave561 口径：历史备案注释里的字面不算数）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HIST_GROUPS, HIST_GROUP_OF, inHistGroup, histGroupLabel, type HistGroupKey } from '../utils/histGroups';
import type { MonitorSeriesField } from '../utils/monitorSeries';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');

/** 37 个历史图卡字段（与 monitorSeries.MonitorSeriesField union 逐字同集；896 批 Wave B +7） */
const ALL_FIELDS: MonitorSeriesField[] = [
  'qps', 'indexRate', 'heapUsedPct', 'cpuPct', 'diskUsedPct',
  'writeRejected', 'searchRejected', 'gcYoungPerMin',
  'searchLatencyMs', 'indexingLatencyMs',
  'load1m', 'diskReadKbS', 'diskWriteKbS', 'diskReadIops', 'diskWriteIops',
  'tpSearchActive', 'tpSearchQueue', 'shards', 'primaryShards', 'indices',
  'tpWriteActive', 'tpWriteQueue', 'docsDeleted',
  'ioUtilPct', 'gcYoungTimeMs', 'gcOldTimeMs', 'heapUsedMb', 'fielddataMb',
  'netRxKbS', 'netTxKbS',
  'docsTotal', 'tpForceMergeActive', 'tpForceMergeQueue', 'tpForceMergeRejected',
  'osMemUsedPct', 'fsAvailMb', 'esCpuPct', 'gcOldPerMin',
];

const METRIC_KEYS = HIST_GROUPS.filter(g => g.key !== 'overview').map(g => g.key) as HistGroupKey[];

describe('六百二十八批①：分组单源纯函数（utils/histGroups.ts）', () => {
  it('8 组：概览在前，其余 7 指标族；键唯一；label/short 非空', () => {
    expect(HIST_GROUPS.length).toBe(8);
    expect(HIST_GROUPS[0].key).toBe('overview');
    expect(HIST_GROUPS.map(g => g.key)).toEqual([
      'overview', 'cluster', 'index', 'node-res', 'node-net', 'node-disk', 'node-jvm', 'thread',
    ]);
    expect(new Set(HIST_GROUPS.map(g => g.key)).size).toBe(8);
    HIST_GROUPS.forEach(g => {
      expect(g.label.length, g.key + ' label').toBeGreaterThan(1);
      expect(g.short.length, g.key + ' short').toBeGreaterThan(1);
      /* 短标签必须短于全称（窄档单行不折行的前提；全称走 title 兜底） */
      expect(g.short.length, g.key + ' short<label').toBeLessThanOrEqual(g.label.length);
    });
  });

  it('映射覆盖全部 30 字段、值域不含 overview、每个指标族非空（无空组）', () => {
    expect(Object.keys(HIST_GROUP_OF).sort()).toEqual([...ALL_FIELDS].sort());
    ALL_FIELDS.forEach(f => {
      const g = HIST_GROUP_OF[f];
      expect(g, f + ' 有组').toBeTruthy();
      expect(g, f + ' 不落 overview').not.toBe('overview');
      expect(METRIC_KEYS).toContain(g);
    });
    /* 每族至少 1 卡（避免 seg 里出现点了永远空的档） */
    METRIC_KEYS.forEach(k => {
      expect(ALL_FIELDS.filter(f => HIST_GROUP_OF[f] === k).length, k + ' 非空').toBeGreaterThan(0);
    });
  });

  it('组间为「划分」：各族字段数之和 = ALL_FIELDS 长度（无重复无遗漏；896 批 30→37）', () => {
    const total = METRIC_KEYS.reduce(
      (n, k) => n + ALL_FIELDS.filter(f => HIST_GROUP_OF[f] === k).length, 0);
    expect(total).toBe(ALL_FIELDS.length);
  });

  it('inHistGroup：overview 恒真（pass-through=零行为变更）；组内真、跨组假', () => {
    ALL_FIELDS.forEach(f => {
      expect(inHistGroup(f, 'overview'), f + '@overview').toBe(true);
      expect(inHistGroup(f, HIST_GROUP_OF[f]), f + '@self').toBe(true);
      METRIC_KEYS.filter(k => k !== HIST_GROUP_OF[f]).forEach(k => {
        expect(inHistGroup(f, k), f + '@' + k).toBe(false);
      });
    });
    /* 具名抽查（防映射整体错位而计数仍对） */
    expect(HIST_GROUP_OF.heapUsedPct).toBe('node-res');
    expect(HIST_GROUP_OF.ioUtilPct).toBe('node-disk');
    expect(HIST_GROUP_OF.gcOldTimeMs).toBe('node-jvm');
    expect(HIST_GROUP_OF.fielddataMb).toBe('node-jvm');
    expect(HIST_GROUP_OF.tpSearchQueue).toBe('thread');
    expect(HIST_GROUP_OF.searchLatencyMs).toBe('cluster');
    expect(HIST_GROUP_OF.indices).toBe('index');
  });

  it('histGroupLabel：全称可查，未知键回落空串', () => {
    expect(histGroupLabel('node-jvm')).toBe('节点JVM指标');
    expect(histGroupLabel('overview')).toBe('概览');
    expect(histGroupLabel('nope' as HistGroupKey)).toBe('');
  });
});

describe('六百二十八批②：视图接线（LiveDashboardView 源码契约）', () => {
  it('分组 seg：HIST_GROUPS 驱动 + 短标签 + title 全称 + aria-pressed 单选语义', () => {
    const s = codeOf('views/LiveDashboardView.vue');
    expect(s, '单源 import').toMatch(/from '\.\.\/utils\/histGroups'/);
    expect(s, 'seg 容器 role=group + aria-label').toMatch(/role="group" aria-label="指标分组"/);
    expect(s, 'v-for 驱动').toMatch(/v-for="g in HIST_GROUPS"/);
    expect(s, '单选态 aria-pressed').toMatch(/:aria-pressed="histGroup === g\.key"/);
    expect(s, '全称入 title 兜底（短标签的补偿）').toMatch(/:title="'分组：' \+ g\.label"/);
    expect(s, '短标签渲染').toMatch(/\{\{ g\.short \}\}/);
  });

  it('组过滤在既有 scope 过滤之后（626 辨析：自动二态隐藏 ≠ 用户导航）', () => {
    const s = codeOf('views/LiveDashboardView.vue');
    const scopeIdx = s.indexOf('!m.onlyNodeMode || nodeMode.value');
    const grpIdx = s.indexOf('inHistGroup(m.field, histGroup.value)');
    expect(scopeIdx, '既有 scope 过滤在场').toBeGreaterThan(-1);
    expect(grpIdx, '组过滤接线').toBeGreaterThan(-1);
    expect(grpIdx, '组过滤在 scope 过滤之后').toBeGreaterThan(scopeIdx);
  });

  it('histGroup 落盘 + 不重置（铁律 B：切集群/模式/范围不得改写用户导航）', () => {
    const s = codeOf('views/LiveDashboardView.vue');
    expect(s).toContain("usePref<HistGroupKey>('live.histGroup', 'overview')");
    /* 反锁：除初始化外不得出现对 histGroup 的赋值（否则切范围即重置） */
    expect(s, 'histGroup 无二次赋值').not.toMatch(/histGroup\.value\s*=/);
    expect(s, 'histGroup 不入重查 watch 依赖之外被改写').not.toMatch(/histGroup\s*=\s*['"]/);
  });

  it('空态：组内 0 卡（scope×组 交集为空）渲染 EmptyState 而非空白栅格', () => {
    const s = codeOf('views/LiveDashboardView.vue');
    expect(s).toMatch(/v-if="!histCharts\.length"/);
    expect(s).toMatch(/histGroupEmpty/);
  });

  it('工具行 ⋯ 收纳：聚合/自动刷新/按节点 三件移入 details，明面 ≤5', () => {
    const s = codeOf('views/LiveDashboardView.vue');
    const moreIdx = s.indexOf('class="ld-hist-more"');
    expect(moreIdx, '⋯ details 在场').toBeGreaterThan(-1);
    ['aria-label="聚合方式"', 'aria-label="自动刷新"', '按节点查看'].forEach(k => {
      const i = s.indexOf(k);
      expect(i, k + ' 在场').toBeGreaterThan(-1);
      expect(i, k + ' 在 ⋯ 之内（源码序在 details 之后）').toBeGreaterThan(moreIdx);
    });
    /* 明面保留件仍在 details 之前 */
    ['aria-label="时间范围"', 'aria-label="筛选集群"', '指标分组'].forEach(k => {
      const i = s.indexOf(k);
      expect(i, k + ' 明面在场').toBeGreaterThan(-1);
      expect(i, k + ' 在 ⋯ 之前').toBeLessThan(moreIdx);
    });
    expect(s, '刷新钮保留明面（铁律 B 高频一击直达）')
      .toMatch(/<button class="btn ghost sm" :disabled="histLoading" @click="loadHist">/);
  });
});
