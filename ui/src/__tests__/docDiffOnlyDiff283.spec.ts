/**
 * 二百八十三批：文档对比「只看差异」过滤——大字段表聚焦冲突/独有行，一致行按需隐藏。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ddm = readFileSync(join(__dirname, '../components/DocDiffModal.vue'), 'utf-8');

describe('文档对比只看差异（283 批）', () => {
  it('checkbox+过滤逻辑+一致行计数联动', () => {
    expect(ddm).toMatch(/<label class="ddm-only-diff"><input type="checkbox" v-model="onlyDiff" \/> 只看差异<\/label>/);
    expect(ddm).toMatch(/if \(onlyDiff\.value\) rs = rs\.filter\(r => r\.status !== 'same'\)/); /* 287 批过滤链重构后同语义 */
    expect(ddm).toMatch(/v-if="!onlyDiff">\{\{ stat\.same \}\} 一致/);
  });
});
