/**
 * 三百四十四批：Watcher slice(0,100) 静默截断补计数提示（wv-trunc）+PUT 编辑变体+真空态 action。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/WatcherView.vue'), 'utf-8');

describe('Watcher 截断/编辑/空态（344 批）', () => {
  it('截断提示+filteredTruncated 状态', () => {
    /* 762 G222 锁同步更新：ref(false) 初值+computed 内置位 → matchedWatches 同源纯 computed
       派生（354 批宣称的纯化落地；行为语义不变，watcherFirstCut762 双分支行为链守卫） */
    expect(v).toMatch(/const matchedWatches = computed/);
    expect(v).toContain('watch 较多，已显示前 100 个');
    expect(v).toMatch(/const filteredTruncated = computed\(\(\) => matchedWatches\.value\.length > 100\);/);
  });
  it('PUT 编辑变体（toDevToolsEdit）', () => {
    expect(v).toMatch(/function toDevToolsEdit\(w: any\)/);
    expect(v).toContain("title: 'watch/' + w._id + ' 编辑', method: 'PUT',");
  });
  it('真空态 action（toDevToolsSample 示例 watch）', () => {
    expect(v).toMatch(/action-text="去 Dev Tools 创建示例 watch →"/);
    expect(v).toMatch(/function toDevToolsSample\(\)/);
  });
});
