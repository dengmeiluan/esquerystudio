/**
 * 三百二十八批：Snapshots 快照行右键「在 DevTools 打开 API」（GET /_snapshot/<repo>/<snap> 带参预填）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SnapshotsView.vue'), 'utf-8');

describe('Snapshots DevTools 带参（328 批）', () => {
  it('菜单项+_prefill 范式', () => {
    expect(v).toContain("key: 'devtools', label: '在 DevTools 打开 API'");
    expect(v).toMatch(/\/_snapshot\/\$\{encodeURIComponent\(currentRepo\.value \|\| ''\)\}\/\$\{encodeURIComponent\(s\.snapshot\)\}/);
  });
});
