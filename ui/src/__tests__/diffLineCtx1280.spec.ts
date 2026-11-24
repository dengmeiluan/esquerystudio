/**
 * 差分行右键（DiffEditorView `.df-diff-line`）接线与形态。
 *
 * 背景：这一块此前只有「复制请求体」一个整段出口，**单行无从取用**——
 * 复核差异时常要把某一行的原文贴到工单或聊天里。用户要求「右键极致增强」。
 *
 * 本 spec 锁：行挂 @contextmenu、菜单在册、一级 ≤3（2 高频 + 1 分组父项）、
 * **写操作（提交/PUT 覆盖）不得进右键**（那是带确认语义的主按钮，藏在右键里会被误触）。
 * 负控：把写操作塞进菜单必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/DiffEditorView.vue'), 'utf-8');

function menuBlock(): string {
  const i = src.indexOf('const lineMenuItems');
  expect(i, 'lineMenuItems 必须存在').toBeGreaterThan(-1);
  const rest = src.slice(i);
  const end = rest.search(/\nfunction |\nconst [a-zA-Z]+ = (computed|ref)\(/);
  return end < 0 ? rest : rest.slice(0, end);
}

describe('差分行右键', () => {
  it('行挂 @contextmenu，handler 与菜单组件在册', () => {
    expect(src, '差分行必须挂右键').toMatch(/class="df-diff-line"[^>]*@contextmenu\.prevent="openLineMenu\(\$event, l, i\)"/s);
    expect(src, '必须挂 CellContextMenu').toContain('<CellContextMenu');
    expect(src, '必须有 openLineMenu').toContain('function openLineMenu');
    expect(src, '必须构造菜单项').toContain('const lineMenuItems');
  });

  it('一级 ≤3 项且含分组父项（不把功能平铺到一级）', () => {
    const blk = menuBlock();
    const topLevel = (blk.match(/^\s{4}\{ key:/gm) || []).length;
    expect(topLevel, '一级项应 ≤ 3').toBeLessThanOrEqual(3);
    expect(blk, '必须有分组父项').toMatch(/children:\s*\[/);
  });

  it('标题写明该行是新增/删除/未变 + 行号（右键先知道点到了什么）', () => {
    expect(src, '标题必须区分三种行态').toMatch(/op === 'add' \? '新增' : l\.op === 'del' \? '删除' : '未变'/);
    expect(src).toMatch(/第 ' \+ \(i \+ 1\) \+ ' 行/);
  });

  it('负控：写操作不得进右键（提交/PUT 覆盖只在页面主按钮上）', () => {
    /* 反向对照——menuBlock 里出现 doPush / PUT / 提交 就说明有人把写操作塞进了右键。
       这类动作必须留在带确认语义的主按钮，右键误触代价太高。 */
    const blk = menuBlock();
    expect(blk, '右键菜单不得含提交动作').not.toContain('doPush');
    expect(blk, '右键菜单不得含覆盖语义').not.toMatch(/PUT|覆盖/);
    /* 证明页面主按钮确实还在（不是被一起删了） */
    expect(src, '写回主按钮必须仍在页面上').toContain('@click="doPush"');
  });

  it('「复制全部变更行」只数真实增删（eq 行不算变更）', () => {
    expect(menuBlock(), '必须过滤 eq').toMatch(/filter\(l => l\.op !== 'eq'\)/);
  });
});
