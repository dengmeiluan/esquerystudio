/**
 * 三百五十一批：HitNav 搜索框 aria-label + DiagView 观测区可选自动刷新。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const hn = read('../components/HitNav.vue');
const diag = read('../views/DiagView.vue');

describe('HitNav aria + Diag 自动刷新（351 批）', () => {
  it('HitNav 搜索框 aria-label', () => {
    expect(hn).toMatch(/aria-label="表内搜索"/);
  });
  it('DiagView 观测区 useAutoRefresh（开关+频率 usePref 记忆）', () => {
    expect(diag).toMatch(/const diagRefresher = useAutoRefresh\(loadOps, \{/);
    expect(diag).toContain("'diag.autoRefresh'");
    expect(diag).toContain("'diag.intervalMs'");
    expect(diag).toMatch(/guard: \(\) => !loadingOps\.value/);
  });
});
