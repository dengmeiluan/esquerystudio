/**
 * 三百一十批：Ilm/Snapshots 接 useAutoRefresh（盯进度场景）——
 * KeepAlive/页面隐藏/卸载全链停续；开关与频率 usePref 记忆；无裸 setInterval。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const ilm = read('../views/IlmView.vue');
const snap = read('../views/SnapshotsView.vue');

describe('Ilm/Snapshots 自动刷新（310 批）', () => {
  it('两视图 useAutoRefresh 接线（ms 读偏好，guard 验 loading），无裸 setInterval', () => {
    for (const [s, ms] of [[ilm, 'ilmIntervalMs.value'], [snap, 'snapIntervalMs.value']] as const) {
      expect(s).toMatch(/useAutoRefresh\(/);
      expect(s).toContain(ms);
      expect(s).toMatch(/guard: \(\) => !loading\.value/);
      expect(s).not.toMatch(/setInterval\(/);
    }
  });
  it('TDZ 顺序：loading 声明在 refresher 块前（Ilm 曾插错位）', () => {
    const iL = ilm.indexOf('const loading = ref(false);');
    const iA = ilm.indexOf('ilmAutoRefresh = usePref');
    expect(iL, 'loading 声明必须先于 useAutoRefresh 块').toBeGreaterThan(-1);
    expect(iA).toBeGreaterThan(iL);
  });
  it('偏好键记忆', () => {
    expect(ilm).toContain("'ilm.autoRefresh'");
    expect(ilm).toContain("'ilm.intervalMs'");
    expect(snap).toContain("'snapshots.autoRefresh'");
    expect(snap).toContain("'snapshots.intervalMs'");
  });
});
