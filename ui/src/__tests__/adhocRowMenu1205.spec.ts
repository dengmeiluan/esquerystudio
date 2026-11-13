/**
 * 1205：Adhoc 托管重建的「期望 vs 实际」差异表 与 轮次表 行右键。
 *
 * 两张表此前只读不可取：比对出「哪个字段类型不对」之后，要拿路径/值去改注解、
 * 贴工单或回给业务方，只能手拖选中。锁三件事：
 * 1) 两张表的行都挂了 contextmenu；
 * 2) 菜单是两级的（一级只留高频复制，其余进「复制…/更多…」），不把动作平铺；
 * 3) 只读安全：菜单里不得出现写动作（重试/启动/删除这类会改集群的动词）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

describe('1205 Adhoc 两张表行右键', () => {
  it('差异表与轮次表的行都挂 contextmenu', () => {
    expect(src).toContain('@contextmenu.prevent="openDiffMenu($event, row)"');
    expect(src).toContain('@contextmenu.prevent="openRoundMenu($event, r)"');
    expect(src).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(src).toContain('<CellContextMenu v-if="rowMenu"');
  });

  it('菜单收成两级：一级只留高频复制，其余进分组二级', () => {
    expect(src).toContain("label: '复制路径'");
    expect(src).toContain("label: '复制整行（TSV，可直接贴表格）'");
    /* 分组父行必须带 children（两级），不能把动作全平铺在一级 */
    expect(src).toMatch(/key: 'diff-group', label: '复制…',[\s\S]{0,80}children: \[/);
    expect(src).toMatch(/key: 'round-group', label: '更多…',[\s\S]{0,80}children: \[/);
    /* 二级里才出现低频项 */
    expect(src).toContain("label: '复制期望值 JSON'");
    expect(src).toContain("label: '复制实际值 JSON'");
    /* 轮次项带「第 N 轮」定位（不用「本轮」这类记账词——产品文案禁形态） */
    expect(src).toContain('复制第 ${r.round} 轮 JSON');
  });

  it('只读安全：菜单只有复制语义，不得混入写动作', () => {
    const items = src.slice(src.indexOf('const rowMenuItems = computed'), src.indexOf('function computeDiffRows'));
    expect(items.length).toBeGreaterThan(200);
    /* 负向：这类动词一旦出现在右键里，用户会以为能从差异行直接改集群 */
    for (const bad of ['runRollover', 'startJob', 'submit(', 'api.reindex', 'askConfirm', 'deleteIndex', 'abortJob']) {
      expect(items, `右键菜单不得含写动作：${bad}`).not.toContain(bad);
    }
    /* 正向：每个动作都落在统一复制通道上 */
    expect(items).toContain('copyWithToast(');
  });

  it('右键标题带上定位信息（差异=路径，轮次=第几轮+阶段）', () => {
    expect(src).toMatch(/title: '差异 · ' \+ row\.path/);
    expect(src).toContain("title: '第 ' + r.round + ' 轮 · '");
  });
});
