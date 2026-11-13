/**
 * 三百三十五批：BoostTuner「送入搜索沙盒」——sessionStorage 契约（esquerystudio.sandbox.body）
 * + /search?mode=sandbox 直达（TemplateGallery toSandbox 同范式）；调参结果可继续加聚合/profile。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/BoostTunerView.vue'), 'utf-8');

describe('送入搜索沙盒（335 批）', () => {
  it('按钮+函数+会话契约', () => {
    expect(v).toContain('> 送入沙盒');
    expect(v).toMatch(/function toSandbox\(\)/);
    expect(v).toMatch(/writeStoredRaw\(sessionStorage, 'esquerystudio\.sandbox\.body', JSON\.stringify\(builtQuery\.value, null, 2\)\)/);
    expect(v).toMatch(/router\.push\(\{ path: '\/search', query: \{ mode: 'sandbox' \} \}\)/);
  });
});
