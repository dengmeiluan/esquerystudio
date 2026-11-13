/**
 * 1169 批：生命周期甘特策略行右键（用户「很多地方没有右键能力」的补位）。
 *
 * 甘特行此前只能看：想拿策略名/阶段表只能手抄。右键按两级给：一级=两个直接动作，
 * 其余收进「复制…」二级；只读数据 → 不含任何写动作（防止监控面变误操作面）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lc = readFileSync(join(__dirname, '../views/LifecycleView.vue'), 'utf-8');

describe('1169 甘特策略行右键', () => {
  it('行挂 contextmenu，菜单走共享 CellContextMenu', () => {
    expect(lc).toContain('@contextmenu.prevent="openLcMenu($event, p)"');
    expect(lc).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(lc).toMatch(/<CellContextMenu\s+v-if="lcMenu"/);
  });

  it('一级只放高频两项，其余收进「复制…」二级（与表格/卡片右键同语言）', () => {
    expect(lc).toContain("key: 'lc-copy-name'");
    expect(lc).toContain("key: 'lc-copy-json'");
    expect(lc).toContain("key: 'lc-copy-group', label: '复制…'");
    /* 二级承载阶段表两种口径 */
    expect(lc).toContain("key: 'lc-copy-phase'");
    expect(lc).toContain("key: 'lc-copy-phase-en'");
  });

  it('只读面：菜单内不含任何写动作（不得出现推进/启停这类动词）', () => {
    const menu = lc.slice(lc.indexOf('const lcMenuItems'), lc.indexOf('function toDevToolsSample') > 0 ? lc.indexOf('function toDevToolsSample') : lc.length);
    expect(menu).not.toMatch(/label: '[^']*(推进|启动|停止|删除|重跑)/);
  });
});
