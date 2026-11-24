/**
 * 1153 批：Watcher 告警卡右键 —— 项目级「右键必须极致增强」收口的一站。
 *
 * 此前 watch 卡右侧平铺三颗钮（编辑 / DevTools / 复制），窄屏时把 watch id 挤成省略号；
 * 且整页无右键。现在按 IlmView 卡片菜单同一两级语言：
 *   一级 = 最高频两项 + 分组父行；复制组 / DevTools 组收进二级（能力零删除）。
 * 行内同理收成「编辑 + 更多」，两条入口共用同一份菜单内容。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/WatcherView.vue'), 'utf-8');

describe('1153 watch 卡右键与「更多」菜单', () => {
  it('卡片挂 contextmenu，且菜单组件挂载在同一文件', () => {
    expect(src).toContain('@contextmenu.prevent="openWatchMenu($event, w)"');
    expect(src).toContain("import CellContextMenu, { type CcmItem } from '../components/CellContextMenu.vue';");
    expect(src).toMatch(/<CellContextMenu v-if="watchMenu"[\s\S]{0,200}:items="watchMenuItems"/);
  });

  it('行内动作收成「编辑 + 更多」——不再平铺 DevTools/复制', () => {
    expect(src).toContain(":aria-label=\"'更多操作：' + w._id\"");
    expect(src).toContain('@click.stop="openWatchMenuAt($event, w)"');
    /* 旧平铺钮（带文字的 DevTools / 复制）必须已移出卡片右侧 */
    expect(src).not.toContain('<TerminalSquare :size="12" /> DevTools');
    expect(src).not.toContain('<Copy :size="12" /> 复制');
  });

  it('菜单两级：一级只有 2 个分组父行，二级承载复制与 DevTools', () => {
    expect(src).toContain("key: 'copy-group', label: '复制…'");
    expect(src).toContain("key: 'dev-group', label: '在 DevTools 打开…'");
    /* 二级动作 label 逐字保留（能力零删除） */
    for (const label of ['复制 watch id', '复制整条定义 JSON', '查看定义（GET _watcher/watch/<id>）', '编辑定义（PUT 回写）']) {
      expect(src, `缺失二级项：${label}`).toContain(label);
    }
  });

  it('DevTools 权限门不被绕过：菜单动作仍走 toDevTools / toDevToolsEdit 原函数', () => {
    expect(src).toMatch(/key: 'dev-get'[^\n]*run: \(\) => toDevTools\(w\)/);
    expect(src).toMatch(/(key: 'edit'|key: 'dev-edit')[^\n]*run: \(\) => toDevToolsEdit\(w\)/);
  });
});
