/**
 * 1163 批：结果表「工具行」右键（用户点名的「表格格式 / 表格操作那个表头」）。
 *
 * 之前右键只覆盖列头与单元格，工具行这条带子完全没有右键——用户在这条带子上找动作时
 * 只能逐个点按钮。现在 TableShell（两表共用的卡头壳）统一转发 `bar-contextmenu`，
 * RT/QRT 各自给菜单（动作集不同，壳不猜），一级只放最常用几项，其余收进「更多…」二级。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const shell = readFileSync(join(__dirname, '../components/TableShell.vue'), 'utf-8');

describe('1163 工具行右键', () => {
  it('TableShell 统一转发 bar-contextmenu（两表同源）', () => {
    expect(shell).toContain(`@contextmenu.stop.prevent="emit('bar-contextmenu', $event)"`);
    expect(shell).toContain(`(e: 'bar-contextmenu', ev: { clientX: number; clientY: number }): void`);
    /* 1443：工具条自身聚焦时菜单键/Shift+F10 走同一事件 */
    expect(shell).toContain('@keydown.self="onBarKey"');
    expect(shell).toContain('function onBarKey');
  });

  it('两表都接事件并各自挂菜单', () => {
    expect(rt).toContain('@bar-contextmenu="openBarMenu"');
    expect(qrt).toContain('@bar-contextmenu="openBarMenu"');
    expect(rt).toMatch(/<CellContextMenu\s+v-if="barMenu"/);
    expect(qrt).toMatch(/<CellContextMenu\s+v-if="barMenu"/);
  });

  it('一级只放少数高频项，其余进「更多…」二级', () => {
    for (const [name, src] of [['RT', rt], ['QRT', qrt]] as const) {
      expect(src, `${name} 缺 更多… 分组`).toContain("key: 'bar-more', label: '更多…'");
      expect(src, `${name} 缺行高切换`).toContain("key: 'bar-rowh'");
    }
    /* 「更多…」二级承载表格级开关（能力零删除） */
    for (const key of ['bar-reset-w', 'bar-fit-all', 'bar-agg', 'bar-transpose', 'bar-sem']) {
      expect(rt, `RT 缺 ${key}`).toContain(`key: '${key}'`);
      expect(qrt, `QRT 缺 ${key}`).toContain(`key: '${key}'`);
    }
  });

  it('行高文案取 ref 的值（不是 [object Object]）', () => {
    /* 实测踩过：computed 里写 ${rowHLabel} 会渲染成 [object Object] */
    expect(rt).toContain('`行高：${rowHLabel.value}（点击切换）`');
    expect(qrt).toContain('`行高：${rowHLabel.value}（点击切换）`');
  });

  it('壳模板单元素根（根级注释会变 fragment，叠加卸载报 nextSibling 空）', () => {
    /* 实测踩过：右键注释写在模板根 → fragment 根 → 路由切换卸载时
       "Cannot read properties of null (reading 'nextSibling')"。
       这里锁住「<template> 后第一个有效节点是标签」，注释只允许在元素内部。 */
    const body = shell.slice(shell.indexOf('<template>') + '<template>'.length, shell.lastIndexOf('</template>'));
    const firstNode = body.replace(/^\s+/, '');
    expect(firstNode.startsWith('<!--'), '模板根注释必须移入元素内部').toBe(false);
    expect(firstNode.startsWith('<')).toBe(true);
  });
});
