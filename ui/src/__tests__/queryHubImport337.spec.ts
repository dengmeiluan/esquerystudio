/**
 * 三百三十七批：QueryHub 跨模式历史导入合并（333 单入口扩展至第二入口）——
 * 隐藏 file input + mergeFrom 计数反馈 + busy 防重入。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf-8');

describe('QueryHub 历史导入（337 批）', () => {
  it('导入钮+消费即清+busy 防重入+计数反馈', () => {
    expect(v).toMatch(/ref="importFileEl" type="file" accept="\.json/);
    expect(v).toMatch(/async function onImportFile\(e: Event\)/);
    expect(v).toMatch(/hist\.mergeFrom\(list\)/);
    expect(v).toMatch(/跳过重复\/无效/);
    expect(v).toMatch(/if \(!f \|\| importing\.value\) return;/);
  });
});
