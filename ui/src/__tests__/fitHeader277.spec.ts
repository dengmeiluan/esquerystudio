/**
 * 二百七十七批：fitCol 自适应测量补列头参与——此前只测 td，长列名
 * （如 announcementSecondTagCodes）双击自适应后仍被截断，语义不完整。RT/QRT 同批同款。
 * 五百一十九批：fit 内核下沉 useColFit（RT/QRT 同一实现）——列头测量锁随实现迁移：
 * 内核选择器必须拼入列头名选择器（thead th[data-col] <nameSel>），两表接线各自传
 * .rt-th-name / .qrt-th-name（列头参与测量的语义由 useColFit.spec 行为锁兜底）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const fit = read('../composables/useColFit.ts');
const rt = read('../components/ResultTable.vue');
const qrt = read('../components/QueryResultTable.vue');

describe('fitCol 列头参与测量（277 批；五百一十九批锁随内核迁移）', () => {
  it('内核：thead th[data-col] + 注入的列头名选择器参与 max（escape 防列名特殊字符）', () => {
    expect(fit).toMatch(/thead th\[data-col="\$\{name\}"\] \$\{opts\.nameSel\}/);
    expect(fit).toContain('CSS.escape');
  });
  it('RT/QRT 接线：各传自己的列头名选择器（.rt-th-name / .qrt-th-name）', () => {
    expect(rt).toContain("nameSel: '.rt-th-name'");
    expect(qrt).toContain("nameSel: '.qrt-th-name'");
  });
});
