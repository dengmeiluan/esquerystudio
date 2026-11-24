/**
 * 三百三十九批：WatcherView 复制诚实口径扫尾（此前无论成败都报成功）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/WatcherView.vue'), 'utf-8');

describe('Watcher 复制诚实口径（339 批）', () => {
  it('copyBody 按结果反馈', () => {
    expect(v).toMatch(/\.then\(ok => store\.notify\(ok \? 'success' : 'error', ok \? 'Watch 已复制' : '复制失败'\)\)/);
  });
});
