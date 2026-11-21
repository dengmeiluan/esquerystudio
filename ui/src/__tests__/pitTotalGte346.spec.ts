/**
 * 三百四十六批：PIT 通道 totalGte 接线——此前 relation 丢弃，
 * track_total_hits 截断时 10,000 被误当精确值。现解析 relation 并展示（命中数为下界）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('PIT totalGte（346 批）', () => {
  it('relation 解析+下界标注', () => {
    expect(v).toMatch(/const totalGte = ref\(false\);/);
    expect(v).toMatch(/totalGte\.value = t\.relation === 'gte';/);
    expect(v).toMatch(/\{\{ totalGte \? '\+' : '' \}\}\{\{ total \|\| '\?' \}\}/);
    expect(v).toContain('（命中数为下界）');
  });
});
