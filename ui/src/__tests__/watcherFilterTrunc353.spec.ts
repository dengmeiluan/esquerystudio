/**
 * 三百五十三批：Watcher 过滤态截断标志修正——关键字命中 >100 时
 * filteredTruncated 同样置位（344 只覆盖了无关键字分支，过滤分支漏置位）。
 * 762 G222 锁同步更新+注释诚实化：354 批行内注释宣称「computed 纯化、置位走 watch 驱动」
 * 与实况不符（实况 computed 内写 ref 的 side-effect 且全文件无 watch）——落真纯化
 * （matchedWatches 同源派生+filteredTruncated 纯 computed），过滤/全量两分支由同一
 * 派生式结构性覆盖，本锁同步更新为纯 computed 形态。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/WatcherView.vue'), 'utf-8');

describe('Watcher 过滤态截断（353 批）', () => {
  it('过滤分支也置位 filteredTruncated', () => {
    expect(v).toMatch(/const filteredTruncated = computed\(\(\) => matchedWatches\.value\.length > 100\);/); /* 762 纯 computed 派生：过滤与全量同一式 */
  });
});
