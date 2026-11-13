import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

/**
 * 第四十一/四十三批守卫：查询工作台偏好持久化。
 * 四十二批手写 es_qry_prefs，四十三批按复用纪律收敛到既有 usePref 封装
 * （esquerystudio.pref.*，与 SqlConsole lenient / Tasks·Topology autoRefresh 同款）。
 * DslQueryView 挂载即初始化 Monaco（happy-dom 抛错），沿用三十七批源码静态守卫口径。
 */
const src = readFileSync(
  join(__dirname, '..', 'views', 'DslQueryView.vue'), 'utf-8');

test('查询偏好接 usePref（复用既有封装，键空间 esquerystudio.pref.query.*）', () => {
  expect(src).toContain("usePref('query.profile', false)");
  expect(src).toContain("usePref('query.autoHist', true)");
  expect(src).toContain('usePref } from');
});

test('不回落手写 localStorage 实现（口径统一，防回潮）', () => {
  // 只锁实现特征（手写读存函数/键常量），注释里的历史沿革记录不算回潮
  expect(src).not.toContain("QRY_PREFS_KEY = 'es_qry_prefs'");
  expect(src).not.toContain('setQryPref');
  expect(src).not.toContain('loadQryPrefs');
  expect(src).not.toContain('localStorage.getItem(QRY_PREFS_KEY');
});
