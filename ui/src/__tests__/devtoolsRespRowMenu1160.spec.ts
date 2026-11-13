/**
 * 1160 批：DevTools 响应表格视图的行右键。
 *
 * 该表是「响应 JSON 的可视化预览」——单击复制行 JSON 是最常用一步，但整页没有右键：
 * 想拿走某个字段值、整张响应的原文，只能回 JSON 档自己找。现在补两级菜单：
 *   一级 = 复制该行 JSON（与单击同义，鼠标右手直达）；
 *   二级 = 复制…（TSV / key=value / 前若干字段值）、整表…（复制全量 / 导出响应原文）。
 * 注意：这是临时预览表，不接 QRT 内核（内核会持久化列宽/列选偏好，预览表不应写入维度记忆）；
 * 「复用内核」的口径在这里体现为复用同一套 CellContextMenu 两级语言。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('1160 DevTools 响应表行右键', () => {
  it('数组行与键值行都挂 contextmenu', () => {
    expect(src).toContain('@contextmenu.prevent="openRespRowMenu($event, r, ri)"');
    expect(src).toContain('@contextmenu.prevent="openRespRowMenu($event, { [k]: val }, -1)"');
  });

  it('菜单组件挂载并绑定 respRowMenuItems', () => {
    expect(src).toMatch(/<CellContextMenu v-if="respRowMenu"[\s\S]{0,180}:items="respRowMenuItems"/);
  });

  it('一级是复制该行 JSON，复制与整表收进二级', () => {
    expect(src).toContain("key: 'copy-row', label: '复制该行 JSON'");
    expect(src).toContain("key: 'copy-group', label: '复制…'");
    expect(src).toContain("label: '复制为 TSV（可直接贴表格）'");
    expect(src).toContain("label: '复制为 key=value 行'");
    expect(src).toContain("key: 'copy-all-group', label: '整表…'");
    expect(src).toContain("label: '导出响应原文（JSON）'");
  });

  it('单击复制行 JSON 的既有行为保留（不只靠右键）', () => {
    expect(src).toContain('@click="copyRespRow(r)"');
    expect(src).toContain('@click="copyRespRow({ [k]: val })"');
  });

  it('导出走响应原文（不重排 JSON，与服务端回包一致）', () => {
    expect(src).toContain("downloadText(respShown.value ?? '', 'devtools-response.json', 'application/json')");
  });
});
