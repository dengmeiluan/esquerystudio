/**
 * 三百三十六批：Snapshots 快照行右键「在 DevTools 打开恢复 API」
 * （POST /_snapshot/<repo>/<snap>/_restore 带参预填——与 328 GET 详情互补）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SnapshotsView.vue'), 'utf-8');

describe('恢复 API 带参（336 批）', () => {
  it('菜单项+_restore 预填', () => {
    expect(v).toContain("key: 'devtools-restore', label: '在 DevTools 打开恢复 API'");
    expect(v).toMatch(/\/_snapshot\/\$\{encodeURIComponent\(currentRepo\.value \|\| ''\)\}\/\$\{encodeURIComponent\(s\.snapshot\)\}\/_restore/);
  });
});
