import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 四百九十六批：横向滚动态「假遮挡」守卫——冻结列(sticky+不透明背景)在横向滚动时会把
   普通列开头盖住（冻结窗格语义），此前无视觉反馈且 scrollLeft 跨维度残留，用户实报
   「表格渲染存在遮挡」。守卫钉死三件事：①滚动态 class 驱动 ②冻结缘投影 CSS ③切维度归零。
   happy-dom 无布局引擎（scrollLeft 赋值读回恒 0），滚动行为走源码静态锁（442 批先例）。 */

const SRC = join(__dirname, '..');
const rt = readFileSync(join(SRC, 'components', 'ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(SRC, 'components', 'QueryResultTable.vue'), 'utf-8');

/** 防空跑假绿：守卫引用的锚串必须真实存在（反向验证手法，239/239+ 批惯例） */
it('守卫自检：源码可读且含既有锚（防空跑假绿）', () => {
  expect(rt).toContain('rt-tbl th.rt-chk');
  expect(qrt).toContain('qrt-tbl th.qrt-idx');
});

it('RT：横向滚动态 is-hscrolled 由 scrollLeft 驱动（class 绑定 + onWrapScroll 更新）', () => {
  expect(rt).toContain("'is-hscrolled': hScrolled");
  expect(rt).toContain('hScrolled.value = el.scrollLeft > 0');
  expect(rt).toContain('const hScrolled = ref(false)');
});

it('RT：切索引/换存储键时横向滚动位归零（防上一维度残留假遮挡）', () => {
  expect(rt).toMatch(/watch\(\(\) => props\.storageKey \|\| props\.index[\s\S]*?scrollLeft = 0/);
});

it('RT：横向滚动态冻结缘投影 CSS（标识列 + 冻结业务列）', () => {
  /* v3.0.1 浅色主题:冻结缘阴影换浅色安全的深灰蓝(纯黑高不透明度在浅色下糊成一团) */
  expect(rt).toMatch(/\.rt\.is-hscrolled \.rt-tbl th\.rt-chk[\s\S]*?rgba\(15, 23, 42, \.16\)/);
  expect(rt).toMatch(/\.rt\.is-hscrolled \.rt-tbl th\.rt-col-frozen[\s\S]*?rgba\(15, 23, 42, \.16\)/);
});

it('QRT：同款三件套（class 驱动 / 冻结缘投影 / 换存储键归零）', () => {
  expect(qrt).toContain("'is-hscrolled': hScrolled");
  expect(qrt).toContain('hScrolled.value = el.scrollLeft > 0');
  expect(qrt).toMatch(/watch\(dimension, \(\) => \{ const el = wrapRef\.value; if \(el\) el\.scrollLeft = 0; \}\)/);
  expect(qrt).toMatch(/\.qrt\.is-hscrolled \.qrt-tbl th\.qrt-idx[\s\S]*?rgba\(0, 0, 0, \.38\)/);
});
