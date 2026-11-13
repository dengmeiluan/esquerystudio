/**
 * 六百二十五批：集群连接管理弹窗深度质感重造（623 设计稿 v3 D1~D7 用户裁决「开始推进」落地）。
 * source-lock 风格（本件既有 ClusterSwitcher spec 全为 source-lock，naive 弹层挂载易碎不 mount）。
 *
 * 锁定（623 稿 §3 解剖学六步 + §4 mock 形态）：
 * 1) 弹窗骨架：720px + max-height 恒不超屏 + 内容区 flex 列（唯一滚动区=连接列表，滚动条常显）；
 * 2) 头部摘要 chip（N 连接 · M 异常）；
 * 3) 手动档：sortOptions 第四档「手动」+ usePref('cs.manualOrder') + 拖拽落位/Ctrl+↑↓ 键盘移位；
 * 4) 双层行卡：grip 拖拽柄 + 主行身份 + 次行地址 + 右锚状态 + hover-reveal 图标操作（触屏常显兜底）；
 * 5) 双折叠节：列表折叠头（摘要行）+ 表单折叠头（默认收起，编辑自动展开滚至表单）；
 * 6) 保留语义：AK 角标/失联角标/probingId 接线/askConfirm（permGating/clusterConnSyncStale 既有锁零迁移）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cs = readFileSync(join(__dirname, '../components/ClusterSwitcher.vue'), 'utf-8');

describe('弹窗骨架（625 批·D6/D7）', () => {
  it('720px + max-height 恒不超屏 + 内容区 flex 列（唯一滚动区=列表）', () => {
    expect(cs).toMatch(/width:720px;max-width:94vw;max-height:86vh/);
    expect(cs).toMatch(/content-style="[^"]*flex-direction:column/);
    expect(cs).toMatch(/\.cm-list \{[^}]*overflow-y:\s*auto/s);
    expect(cs).toMatch(/\.cm-list::-webkit-scrollbar-thumb/);
  });
  it('头部摘要 chip：N 连接 · M 异常', () => {
    expect(cs).toMatch(/#header/);
    expect(cs).toMatch(/cm-cnt/);
    expect(cs).toMatch(/异常/);
  });
});

describe('手动排序（625 批·D3/D4）', () => {
  it("第四档「手动」入 sortOptions；usePref('cs.manualOrder') 落盘", () => {
    expect(cs).toContain("['manual', '手动']");
    expect(cs).toMatch(/usePref<string\[\]>\('cs\.manualOrder', \[\]\)/);
  });
  it('拖拽接线：grip draggable + dragstart 落位 + 行 dragover/drop + 落位自动切手动档', () => {
    expect(cs).toMatch(/draggable="true"/);
    expect(cs).toMatch(/@dragstart="onDragStart\(/);
    expect(cs).toMatch(/@dragover\.prevent="onDragOver\(/);
    expect(cs).toMatch(/@drop\.prevent="onDrop\(/);
    expect(cs).toMatch(/sortMode\.value = 'manual'/);
  });
  it('键盘移位：行聚焦 Ctrl+↑/↓（moveInOrder 共用落位）', () => {
    expect(cs).toMatch(/onRowKey\(/);
    expect(cs).toMatch(/moveInOrder\(/);
  });
});

describe('双层行卡与 hover 操作（625 批·D1/D2）', () => {
  it('双层行卡网格 + grip 拖拽柄', () => {
    expect(cs).toMatch(/grid-template-areas:\s*"grip main aux"\s*"grip sub ops"/);
    expect(cs).toContain('class="cm-grip"');
  });
  it('操作图标 hover-reveal（探活全角色；测试/编辑/删除 canAdmin 门控不变；触屏兜底走 matchMedia——本组件 @media 豁免册禁新增）', () => {
    expect(cs).toMatch(/\.cm-row-ops \{[^}]*opacity:\s*0/s);
    expect(cs).toMatch(/matchMedia\('?\(pointer: coarse\)'?\)/);
    expect(cs).toMatch(/is-coarse/);
    expect(cs).toContain(':disabled="probingId === c.id" @click="probeConn(c)"');
    expect(cs).toContain('@click="testExisting(c.id)"');
    expect(cs).toContain('@click="editConn(c)"');
    expect(cs).toContain('@click="delConn(c)"');
  });
});

describe('双折叠节（625 批·D7）', () => {
  it('列表折叠头带摘要；表单折叠头默认收起', () => {
    expect(cs).toMatch(/listFoldOpen/);
    expect(cs).toMatch(/formOpen/);
    expect(cs).toMatch(/aria-expanded/);
    expect(cs).toMatch(/v-show="listFoldOpen"/);
    expect(cs).toMatch(/v-show="formOpen"/);
  });
  it('编辑自动展开表单并滚至表单', () => {
    expect(cs).toMatch(/formOpen\.value = true/);
    expect(cs).toMatch(/scrollIntoView/);
  });
});
