/**
 * 二百八十七批：文档对比字段路径过滤（大小写不敏感子串，与只看差异叠加）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ddm = readFileSync(join(__dirname, '../components/DocDiffModal.vue'), 'utf-8');

describe('文档对比字段过滤（287 批）', () => {
  it('过滤输入+叠加逻辑', () => {
    expect(ddm).toMatch(/<input v-model="pathKw" class="ddm-filter mono" placeholder="按字段路径过滤…"/);
    expect(ddm).toMatch(/const kw = pathKw\.value\.trim\(\)\.toLowerCase\(\);/);
    expect(ddm).toMatch(/rs = rs\.filter\(r => r\.path\.toLowerCase\(\)\.includes\(kw\)\)/);
  });
});
