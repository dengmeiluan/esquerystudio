/**
 * 一千三百六十九批：DSL 工作台工具行「太多功能平铺」。
 *
 * 用户实报「表格罗列的元素…第一行还是太多元素了在平铺了」——真机实测
 * `.dq-tb-l` 一行 13 个控件（构建器/模板/变量/历史/校验/保存/DevTools/保存的搜索/
 * 新文档/在构建器中打开/DSL→Lucene/索引工作区 + 计数徽标）。
 *
 * 分拣原则（按操作心智，不是按数量硬砍）：
 *   留在一级 = 「在本页做什么」的高频写操作（模板/变量/历史/校验/保存/DevTools/保存的搜索/新文档）
 *   收进二级 = 「离开本页」的跳转导航（在构建器中打开 / DSL→Lucene / 索引工作区）
 * 能力零删除——三条全部保留在「更多」菜单里（用真实 run 绑定，不是死链）。
 *
 * 本 spec 锁：
 *  ① 三个跳转入口不再出现在一级行（平铺回来必须红）
 *  ② 三条能力在菜单里都还在，且都绑到真实函数/路由（不许变成死链）
 *  ③ 一级仍保留高频写操作（不许为了「看上去简洁」把保存/校验也塞进二级）
 *  ④ 负控：把三个按钮搬回一级 → ① 必须红
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
/* 一级区 = 从 dq-tb-l 到「更多」popover 之前（popover 内部是二级菜单，不算平铺）。
   第一版把到 dq-tb-r 为止都当一级区，结果把二级菜单项也算进去、报假红。 */
const bar = (() => {
  const i = SRC.indexOf('<div class="dq-tb-l lr-bar-l">');
  expect(i, '必须有工具行左段').toBeGreaterThan(-1);
  const popStart = SRC.indexOf('<n-popover trigger="click" placement="bottom-start"', i);
  expect(popStart, '必须有「更多」popover').toBeGreaterThan(i);
  return SRC.slice(i, popStart);
})();
/* 整个左段（含 popover trigger）——用来确认「更多」入口在；平铺判据只看 bar（popover 之前） */
const barAll = (() => {
  const i = SRC.indexOf('<div class="dq-tb-l lr-bar-l">');
  return SRC.slice(i, SRC.indexOf('<div class="dq-tb-r lr-bar-r">', i));
})();
const pop = (() => {
  const i = SRC.indexOf('class="dq-more-pop"');
  expect(i, '必须有「更多」弹出层').toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf('</div>', SRC.indexOf('</n-popover>', i)));
})();

describe('1369 DSL 工具行收口：跳转类动作进二级', () => {
  it('① 三个跳转入口不再平铺在一级行', () => {
    /* 直接按钮形态（<button ... 文案）在一级行里必须消失 */
    expect(bar, '「在构建器中打开」不应再是一级按钮').not.toMatch(/<button[^>]*>[\s\S]{0,80}在构建器中打开/);
    expect(bar, '「DSL→Lucene」不应再是一级按钮').not.toMatch(/<button[^>]*>[\s\S]{0,80}DSL[→-]>?\s*Lucene/);
    expect(bar, '「索引工作区」不应再是一级按钮').not.toMatch(/<button[^>]*>[^<]*<ExternalLink[\s\S]{0,40}索引工作区/);
    expect(barAll, '一级行必须出现「更多」入口').toMatch(/class="btn sm ghost dq-more"/);
  });

  it('② 三条能力都在菜单里且绑到真实动作（不是死链）', () => {
    expect(pop, '菜单必须有「在构建器中打开」').toContain('在构建器中打开');
    expect(pop, '必须真的调 openInBuilder').toContain('openInBuilder()');
    expect(pop, '菜单必须有 DSL → Lucene').toMatch(/DSL\s*(→|->)\s*Lucene/);
    expect(pop, '必须真的调 openInLucene').toContain('openInLucene()');
    expect(pop, '菜单必须有索引工作区').toContain('索引工作区');
    expect(pop, '必须真的跳转 /indices').toContain("router.push('/indices')");
    /* 三个 run 都必须顺手关掉弹层（否则点了菜单不消失） */
    const closes = (pop.match(/tbMoreOpen = false/g) ?? []).length;
    expect(closes, '每个菜单项都要关弹层').toBeGreaterThanOrEqual(3);
  });

  it('③ 高频写操作仍在一级（收口不许把保存/校验也埋进去）', () => {
    for (const label of ['模板', '变量', '历史', '校验', '保存', 'DevTools']) {
      expect(bar, `「${label}」必须仍是一级按钮`).toContain(label);
    }
    expect(bar, '保存的搜索也留一级').toMatch(/aria-label="保存的搜索"/);
  });

  it('④ 负控：把「在构建器中打开」搬回一级 → ① 必须红', () => {
    const broken = SRC.replace('<slot name="toolbar-prepend" />',
      '<slot name="toolbar-prepend" /><button class="btn sm ghost" @click="openInBuilder">在构建器中打开</button>');
    expect(broken, '负控必须真的改掉源码').not.toBe(SRC);
    const b = (() => {
      const i = broken.indexOf('<div class="dq-tb-l lr-bar-l">');
      return broken.slice(i, broken.indexOf('<div class="dq-tb-r lr-bar-r">', i));
    })();
    expect(b, '搬回一级必须判不合格').toMatch(/<button[^>]*>[\s\S]{0,80}在构建器中打开/);
  });
});
