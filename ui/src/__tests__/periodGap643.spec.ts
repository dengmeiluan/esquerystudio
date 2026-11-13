/**
 * 六百四十三批：637-C2 收口——gap-ms 与所选「周期」解耦（历史趋势区 HistoryChart）。
 *
 * 病灶（637 批先例 637-C2）：`:gap-ms="intervalMsFor(mh2Range) * 3"` 仍按**时间范围**推导，
 *   选比范围默认更粗的桶（如 24h 范围选 1h 周期）时，实际取数用 1h 桶、gap 却按 5m 桶距算，
 *   HistoryChart 误判相邻 1h 点为断档、走势退化为孤点。
 * 收口：gap 跟「生效 interval」——mh2GapMs = fixedIntervalMs(生效桶宽) × 3；原始逐点档
 *   （interval=undefined）回采集默认 60s。fixedIntervalMs 单源（fixed_interval 字符串→毫秒），
 *   intervalMsFor 复用。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fixedIntervalMs } from '../utils/monitorSeries';

const view = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

describe('六百四十三批：gap-ms 与周期解耦（637-C2）', () => {
  it('fixedIntervalMs 纯函数：fixed_interval 字符串 → 毫秒（非法回落 5m）', () => {
    expect(fixedIntervalMs('1m')).toBe(60_000);
    expect(fixedIntervalMs('2m')).toBe(120_000);
    expect(fixedIntervalMs('5m')).toBe(300_000);
    expect(fixedIntervalMs('1h')).toBe(3.6e6);
    expect(fixedIntervalMs('bogus')).toBe(300_000);
  });

  it('mh2GapMs 跟生效 interval（fixedIntervalMs 单源），原始档回采集 60s', () => {
    expect(view, 'gap 计算器在场').toContain('const mh2GapMs = computed(');
    expect(view, '跟生效 interval').toContain('fixedIntervalMs(mh2Interval.value)');
    expect(view, '原始逐点回采集 60s').toContain('60_000');
  });

  it(':gap-ms 改走 mh2GapMs，不再按范围 intervalMsFor(mh2Range)*3', () => {
    expect(view, 'gap 直传 mh2GapMs').toContain(':gap-ms="mh2GapMs"');
    expect(view, '旧范围推导退役').not.toContain(':gap-ms="intervalMsFor(mh2Range) * 3"');
  });
});
