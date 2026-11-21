import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const live = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');

describe('1439h 监控屏节点卡/活动告警右键', () => {
  it('节点卡与活动告警行接右键与菜单键，复用 ldMenu 共享通道', () => {
    expect(live).toContain('@contextmenu.prevent="openLdRowMenu($event, \'node-card\', n)"');
    expect(live).toContain('@contextmenu.prevent="openLdRowMenu($event, \'active-alert\', a)"');
    expect(live).toContain('@keydown="onLdCardKey($event, \'node-card\', n)"');
    expect(live).toContain('@keydown="onLdCardKey($event, \'active-alert\', a)"');
    expect(live).toContain("type LdMenuKind = 'top' | 'slow' | 'alert' | 'node' | 'node-card' | 'active-alert'");
  });

  it('动作：打开节点诊断/定位处置 + 复制节点名/ID/角色/告警标题/键/阈值', () => {
    expect(live).toContain("label: '打开节点诊断'");
    expect(live).toContain("label: '定位到处置'");
    expect(live).toContain("label: '复制节点名'");
    expect(live).toContain("label: '复制节点 ID'");
    expect(live).toContain("label: '复制角色'");
    expect(live).toContain("label: '复制告警标题'");
    expect(live).toContain("label: '复制告警键'");
    expect(live).toContain("label: '复制阈值'");
  });
});
