/**
 * 三百六十四批：复制诚实口径收尾——IndexHubView 三处失败静默补失败分支、
 * RestView copyResp 按结果反馈。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

describe('复制诚实口径收尾（364 批）', () => {
  it('IndexHubView 三处失败分支补齐', () => {
    const s = read('../views/IndexHubView.vue');
    /* v3.0.1:失败文案补引导(诚实口径延续——不只报失败,还给手动兜底路径) */
    expect((s.match(/else store\.notify\('error', '复制失败，请手动选中后 Ctrl\+C'\);/g) || []).length).toBeGreaterThanOrEqual(3);
  });
  it('RestView copyResp 按结果反馈', () => {
    const s = read('../views/RestView.vue');
    expect(s).toMatch(/const ok = await copyText\(typeof v === 'string' \? v : JSON\.stringify\(v, null, 2\)\);/);
    expect(s).toMatch(/ok \? '已复制响应' : '复制失败'/);
  });
});
