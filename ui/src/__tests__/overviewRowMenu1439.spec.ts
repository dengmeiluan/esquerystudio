import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ov = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');

describe('1439g 概览行右键', () => {
  it('索引排行/健康分布/最近作业行均接右键与菜单键，菜单挂共享件', () => {
    expect(ov).toContain('@contextmenu.prevent="openOvMenu($event, \'idx\', idx)"');
    expect(ov).toContain('@contextmenu.prevent="openOvMenu($event, \'health\', h)"');
    expect(ov).toContain('@contextmenu.prevent="openOvMenu($event, \'job\', j)"');
    expect(ov).toContain('@keydown="onOvKey($event, \'idx\', idx)"');
    expect(ov).toContain('@keydown="onOvKey($event, \'health\', h)"');
    expect(ov).toContain('@keydown="onOvKey($event, \'job\', j)"');
    expect(ov).toContain('<CellContextMenu v-if="ovMenu"');
  });

  it('动作：打开工作区/浏览器/托管重建 + 复制索引名/状态/深链', () => {
    expect(ov).toContain("label: '打开索引工作区'");
    expect(ov).toContain("label: '在数据浏览器打开'");
    expect(ov).toContain("label: '查看该健康索引清单'");
    expect(ov).toContain("label: '去托管重建'");
    expect(ov).toContain("label: '复制索引名'");
    expect(ov).toContain("label: '复制健康状态'");
    expect(ov).toContain("label: '复制 indexKey'");
    expect(ov).toContain("label: '复制深链'");
  });
});
