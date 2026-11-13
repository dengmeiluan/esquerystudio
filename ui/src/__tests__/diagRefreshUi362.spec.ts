/**
 * 三百六十二批：DiagView 观测区自动刷新 UI 接线锁定——
 * 开关 checkbox+频率下拉+useAutoRefresh 接线+guard 验 loadingOps（351 批实装的四验收口）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');

describe('DiagView 观测区自动刷新 UI（362 批）', () => {
  it('开关+频率下拉+接线三件齐', () => {
    expect(v).toMatch(/<input type="checkbox" v-model="diagAutoRefresh" \/>/);
    /* 第十批：频率下拉改用 AutoRefreshSelect 统一件（原生 select 退役） */
    expect(v).toMatch(/<AutoRefreshSelect v-if="diagAutoRefresh" v-model:ms="diagIntervalMs"/);
    expect(v).toMatch(/const diagRefresher = useAutoRefresh\(loadOps, \{/);
    expect(v).toMatch(/watch\(diagAutoRefresh, \(v\) => \{ if \(v\) loadOps\(\); diagRefresher\.restart\(\); \}\);/);
  });
});
