/**
 * R130 第五十二批守卫：JQ 过滤表达式草稿化（按索引维度）。
 * DslQueryView 挂载即初始化 Monaco（happy-dom 抛错）——沿用源码静态守卫口径。
 * 锁定：
 * 1) jqExpr 接 useScopedDraft（scope 含 index 函数式跟随）；
 * 2) pickedIdx watch 不再显式清 jqExpr（切索引由 draft scope 自动隔离，
 *    显式清会抹掉新索引已存草稿——旧实现与新机制叠加的隐患）。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const src = readFileSync(join(__dirname, '..', 'views', 'DslQueryView.vue'), 'utf-8');

test('jqExpr 接 useScopedDraft 且 scope 含 index 跟随', () => {
  expect(src).toContain("useScopedDraft('jq', { route: 'query', index: () => store.pickedIdx || '' }, '')");
});

test('切索引不再显式清 jqExpr（scope 隔离已内建）', () => {
  const watchSeg = src.slice(src.indexOf('watch(() => store.pickedIdx'), src.indexOf('watch(() => store.pickedIdx') + 900);
  expect(watchSeg).not.toContain("jqExpr.value = ''");
});
