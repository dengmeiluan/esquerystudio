import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('1439j DSL 聚合桶行右键', () => {
  it('桶行接右键与菜单键，菜单挂共享 CellContextMenu', () => {
    expect(dq).toContain('@contextmenu.prevent="openAggMenu($event, a, b)"');
    expect(dq).toContain('@keydown="onAggKey($event, a, b)"');
    expect(dq).toContain('<CellContextMenu v-if="aggMenu"');
    expect(dq).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
  });

  it('动作：下钻/排除复用 drillAgg，复制桶键/计数', () => {
    expect(dq).toContain("label: `下钻「${key}」`");
    expect(dq).toContain("label: `排除「${key}」`");
    expect(dq).toContain("label: '复制桶键'");
    expect(dq).toContain("label: '复制计数'");
    expect(dq).toContain('function onAggKey');
  });
});
