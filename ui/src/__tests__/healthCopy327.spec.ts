/**
 * 三百二十七批：HealthReport 主报告复制 MD（buildReportMd 抽取共用）+检查项行级复制。
 * TemplateGallery 复制诚实口径扫尾。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const hr = read('../views/HealthReportView.vue');
const tg = read('../views/TemplateGalleryView.vue');

describe('HealthReport 复制（327 批）', () => {
  it('buildReportMd 抽取共用+复制 MD 钮+检查项复制', () => {
    expect(hr).toMatch(/function buildReportMd\(\): string/);
    expect(hr).toMatch(/@click="copyReportMd"/);
    expect(hr).toContain("aria-label=\"'复制检查项：' + c.name\"");
    expect(hr).toMatch(/async function copyCheck\(c: any\)/);
    expect((hr.match(/buildReportMd\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });
  it('TemplateGallery 复制诚实口径', () => {
    expect(tg).toMatch(/\.then\(ok => store\.notify\(ok \? 'success' : 'error', ok \? `模板已复制/);
  });
});
