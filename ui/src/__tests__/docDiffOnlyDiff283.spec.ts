/**
 * 二百八十三批：文档对比「只看差异」过滤——大字段表聚焦冲突/独有行，一致行按需隐藏。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ddm = readFileSync(join(__dirname, '../components/DocDiffModal.vue'), 'utf-8');

describe('文档对比只看差异（283 批）', () => {
  it('checkbox+过滤逻辑+一致行计数联动', () => {
    /* 控件升级随迁：原生 checkbox → NCheckbox（v-model:checked），文字入默认插槽
     （label 对 NCheckbox 根 div 无隐式关联，label 包裹形态点文字失效已修复） */
    expect(ddm).toContain('<n-checkbox v-model:checked="onlyDiff" size="small" class="ddm-only-diff">只看差异</n-checkbox>');
    expect(ddm).not.toContain('<input type="checkbox" v-model="onlyDiff"'); /* 防回潮：不得回落原生 checkbox */
    expect(ddm).not.toContain('<label class="ddm-only-diff"'); /* 防回潮：label 包裹 NCheckbox 点文字失效 */
    expect(ddm).toMatch(/if \(onlyDiff\.value\) rs = rs\.filter\(r => r\.status !== 'same'\)/); /* 287 批过滤链重构后同语义 */
    expect(ddm).toMatch(/v-if="!onlyDiff">\{\{ stat\.same \}\} 一致/);
  });
});
