import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');

describe('1439f 集群切换器连接行右键', () => {
  it('宿主/连接行均接右键与菜单键，菜单挂在共享 CellContextMenu', () => {
    expect(cs).toContain('@contextmenu.prevent="openConnMenu($event, c)"');
    expect(cs).toContain('@keydown="onConnKey($event, c)"');
    expect(cs).toContain('@contextmenu.prevent="openConnMenu($event, null)"');
    expect(cs).toContain('@keydown="onConnKey($event, null)"');
    expect(cs).toContain('<CellContextMenu v-if="connMenu"');
  });

  /* 右键在 n-popover 内先触发 mousedown——不吞会先关弹层致 contextmenu 无从落地 */
  it('切换菜单行吞掉 mousedown 冒泡，右键不被 n-popover 抢先关闭', () => {
    expect(cs).toMatch(/@mousedown\.stop @click="pickTarget\('', ''\)"/);
    expect(cs).toMatch(/@mousedown\.stop @click="pickTarget\(c\.id, c\.name\)"/);
  });

  it('动作：切换走 pickTarget 授权链，复制名称/ID/端点/环境', () => {
    expect(cs).toMatch(/run: \(\) => \{ void pickTarget\(c \? c\.id : '', c \? c\.name : ''\); \}/);
    expect(cs).toContain("label: '复制名称'");
    expect(cs).toContain("label: '复制连接 ID'");
    expect(cs).toContain("label: '复制端点'");
    expect(cs).toContain("label: '复制环境'");
    expect(cs).toContain('function onConnKey');
    expect(cs).toContain('function copyConnVal');
  });
});
