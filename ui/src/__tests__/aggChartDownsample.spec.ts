/**
 * R130 一百九十六批：AggBarChart 桶降采样（G 组·图表渲染性能）。
 * 根因：date_histogram interval 细时桶数可达千/万，SVG 全量渲染拖慢 brush。
 * 锁定：超 MAX_BARS(400) 按组等宽合并（doc_count 求和、key 取组首）；
 * ≤400 全量渲染；brush from/to 落在降采样桶（组首 key 语义不变）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/AggBarChart.vue'), 'utf-8');

describe('AggBarChart 桶降采样（一百九十六批）', () => {
  it('MAX_BARS 常量 + 组合并（doc_count 求和）+ 渲染/brush 全走 bars', () => {
    expect(src).toMatch(/const MAX_BARS = 400;/);
    expect(src).toMatch(/const group = Math\.ceil\(n \/ MAX_BARS\);/);
    expect(src).toContain('cnt += Number(props.buckets[j].doc_count) || 0;');
    expect(src).not.toMatch(/v-for="\(b, i\) in buckets"/);
    expect(src).not.toMatch(/props\.buckets\.length\) - 1\.5/);
    /* 1319b：边界钳位从内联 Math.max 提成 i0/i1 两个变量（右界还要 +1 取下一桶），
       意图不变——brush 仍走降采样后的 bars，且下标仍被钳在合法范围。 */
    expect(src).toMatch(/const i0 = Math\.max\(0, xToIdx\(/);
    expect(src).toMatch(/const i1 = Math\.min\(bars\.value\.length - 1, xToIdx\(/);
    expect(src).toMatch(/const from = bars\.value\[i0\], to = bars\.value\[i1\]/);
  });
});
