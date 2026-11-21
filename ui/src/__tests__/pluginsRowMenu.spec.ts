/**
 * R130 一百九十二批：PluginsView 插件行右键菜单（E 组顺延——矩阵表按特性适配）。
 * 五百六十一批同步更新（矩阵表换 QRT rows 型·表格头收口）：原 tr @contextmenu 直开随裸表退役——
 * QRT 单元格右键=内核菜单（复制/列管理/整表 TSV 全量白得），宿主插件菜单改 #row-actions
 * 行尾「安装/卸载」快捷钮点开（原操作列钮位承接）。锁定（词面升级保形，DOM 能力等价）：
 * row-actions 槽接线；CellContextMenu 挂载；三菜单项齐备（复制插件名/SSH 安装命令/指南）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/PluginsView.vue'), 'utf-8');

describe('PluginsView 插件行菜单（一百九十二批→561 row-actions 迁槽同步更新）', () => {
  it('row-actions 槽接线点开菜单；菜单项齐备（复制插件名/SSH 命令/指南）', () => {
    /* 561 同步更新：原 tr @contextmenu.prevent="openPluginMenu(...)" 随裸表退役（负锁） */
    expect(src, '裸表行右键已退役').not.toContain('@contextmenu.prevent="openPluginMenu($event, p.plugin)"');
    expect(src).toMatch(/<template #row-actions="\{ row \}">/);
    expect(src).toMatch(/@click\.stop="openPluginMenu\(\$event, String\(row\[0\]\)\)"/);
    expect(src).toMatch(/<CellContextMenu v-if="pluginMenu" :x="pluginMenu\.x" :y="pluginMenu\.y" :title="pluginMenu\.plugin"/);
    expect(src).toContain("key: 'copy-name', label: '复制插件名'");
    expect(src).toContain("key: 'copy-cmd', label: '复制 SSH 安装命令'");
    expect(src).toContain('bin/elasticsearch-plugin install ${name}');
    expect(src).toContain("key: 'guide', label: '安装/卸载指南'");
  });
});
