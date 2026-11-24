/**
 * 一千三百一十七批：配置校验器的「问题清单」行右键。
 *
 * 背景：校验报告跑完，每条 issue 都是要贴进工单/群聊的待办
 * （「哪一层、哪个码、哪个字段、说了什么、建议怎么改」），此前只能一条条手抄。
 * 这正是用户反复强调的「鼠标右键必须极致的增强在整个项目」里剩下的空白面。
 *
 * 本 spec 锁：
 *  - 问题行挂 @contextmenu；菜单组件在册
 *  - 一级 ≤3（整条 / 修正建议 / 分组父项），无 suggestion 时降为 2（不出现空动作）
 *  - 文案用层名人类可读名（L1 Lint），不是 LINT 裸码 —— 贴出去对方不用回来问
 *  - 「复制全部问题」走同一条 issueLine 格式化（与单条同口径，不另写一套）
 * 负控：把层名换回 iss.layer 裸码必须红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/ConfigValidatorView.vue'), 'utf-8');

function block(start: string, endPat: RegExp): string {
  const i = src.indexOf(start);
  expect(i, start + ' 必须存在').toBeGreaterThan(-1);
  const rest = src.slice(i + start.length);
  const m = rest.match(endPat);
  return m ? rest.slice(0, m.index) : rest;
}

describe('1317 配置校验问题行右键', () => {
  it('问题行挂右键，菜单组件在册', () => {
    expect(src, 'cv-issue 必须挂右键').toMatch(/class="cv-issue"[^>]*@contextmenu\.prevent="openIssueMenu\(\$event, iss\)"/s);
    expect(src, '必须挂 CellContextMenu').toContain('<CellContextMenu v-if="issueMenu"');
    expect(src, '必须有 openIssueMenu').toContain('function openIssueMenu');
  });

  it('一级 ≤3 且含分组父项（复制项不铺平）', () => {
    const blk = block('const issueMenuItems', /\n\}\);/);
    const topLevel = (blk.match(/^\s{4}\{ key:/gm) || []).length;
    expect(topLevel, '一级项应 ≤3').toBeLessThanOrEqual(3);
    expect(blk, '必须有二级分组').toMatch(/children:\s*\[/);
  });

  it('层名走人类可读名（L1 Lint），不是 layer 裸码', () => {
    const fn = block('const issueLine =', /;\n/);
    expect(fn, 'issueLine 必须查 LAYER_NAMES').toContain('LAYER_NAMES[iss.layer]');
    expect(fn, '不得直接吐裸码').not.toMatch(/\$\{iss\.layer\}/);
  });

  it('「复制全部问题」与单条同口径（复用 issueLine）', () => {
    const blk = block('const issueMenuItems', /\n\}\);/);
    expect(blk, '全部问题必须走 issueLine').toMatch(/\.map\(issueLine\)/);
    expect(blk, '不得为「全部」另写拼接').not.toMatch(/issues[\s\S]{0,80}\.map\(i\s*=>\s*`/);
  });

  it('无 suggestion 时不出现空动作项', () => {
    const blk = block('const issueMenuItems', /\n\}\);/);
    expect(blk, '修正建议项必须按 suggestion 存在性条件展开').toMatch(/\.\.\.\(iss\.suggestion/);
  });
});
