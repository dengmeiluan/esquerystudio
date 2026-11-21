/**
 * 1439：查询工作台「顶满当前页」必须真的把空间给表格。
 *
 * 实测缺陷（1440×900）：收起构建区后页面从 1037px 缩到 687px，
 * 结果区仍停在 min-height 505px，白空 177px 而表格一行没多。
 * 根因是 .qh 按内容高、.qh-pane 不吃剩余高度、.dq 的 height:100% 无确定父高。
 *
 * 1339 曾试过 .qh{min-height:100%} 并回退，理由是「多出的高度只顶大结果区下限」；
 * 1439 结果表有了 fill（表体在 rt-wrap 内滚，见 dqFillChain），前提已变。
 *
 * 判据用真实 CSS 文本抽取 + 属性断言，负控按仓库既有范式注入违规再判红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const QH = readFileSync(join(__dirname, '../views/QueryHubView.vue'), 'utf8');
const DQ = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf8');
const RT = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf8');

function ruleBody(src: string, sel: string): string {
  const i = src.indexOf(sel + ' {');
  expect(i, `必须有 ${sel} 规则`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
}

/** 判据：高度链三段齐全且不靠百分比。返回缺失项数组（空=合格）。 */
function chainProblems(src: string): string[] {
  const out: string[] = [];
  const body = (sel: string): string | null => {
    const i = src.indexOf(sel + ' {');
    return i < 0 ? null : src.slice(i, src.indexOf('}', i));
  };
  const qh = body('.qh:has(.dq-fill)');
  if (!qh || !/height:\s*100%/.test(qh) || !qh.includes('min-height: 0')) out.push('.qh 未定高');

  const pane = body('.qh:has(.dq-fill) > .qh-pane');
  if (!pane) out.push('缺 pane 规则');
  else {
    if (!/flex:\s*1 1 auto/.test(pane)) out.push('pane 未吃满剩余高度');
    if (!pane.includes('min-height: 0')) out.push('pane 不可收缩');
  }

  const dq = body('.qh:has(.dq-fill) > .qh-pane > .dq.dq-fill');
  if (!dq) out.push('缺 dq 规则');
  else {
    if (!/flex:\s*1 1 auto/.test(dq)) out.push('dq 未 flex 填满');
    /* 父高来自 min-height 时百分比不解析（实测退化为 267px） */
    if (!dq.includes('height: auto')) out.push('dq 依赖 height:100%（父高非确定值 → 退化为内容高）');
  }
  return out;
}

describe('1439 顶满当前页 = 表格吃满剩余高度', () => {
  it('① 高度链三段齐全（.qh → .qh-pane → .dq，且不靠百分比）', () => {
    expect(chainProblems(QH)).toEqual([]);
  });

  it('② 结果表接线 fill，且 RT 有对应高度链', () => {
    expect(DQ).toMatch(/<ResultTable ref="resultTbl"[\s\S]{0,200}?\bfill\b/);
    expect(RT).toContain('fill?: boolean');
    expect(ruleBody(RT, '.fs.rt-fs-fill')).toMatch(/flex:\s*1 1 auto/);
    expect(ruleBody(RT, '.rt.rt-fill')).toContain('flex-direction: column');
    expect(ruleBody(RT, '.rt.rt-fill > .rt-wrap-shell')).toMatch(/flex:\s*1 1 auto/);
  });

  it('③ 负控：三种违规各自被 ① 的判据抓住', () => {
    const cases: Array<[string, string, string]> = [
      ['去掉 height:auto', '.qh:has(.dq-fill) > .qh-pane > .dq.dq-fill { flex: 1 1 auto; min-height: 0; height: auto; }',
        '.qh:has(.dq-fill) > .qh-pane > .dq.dq-fill { flex: 1 1 auto; min-height: 0; }'],
      ['pane 去掉 flex-grow', '.qh:has(.dq-fill) > .qh-pane { flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; }',
        '.qh:has(.dq-fill) > .qh-pane { flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; }'],
      ['.qh 不再定高', '.qh:has(.dq-fill) { height: 100%; min-height: 0; }', '.qh:has(.dq-fill) { min-height: 0; }'],
    ];
    for (const [name, from, to] of cases) {
      const broken = QH.replace(from, to);
      expect(broken, `负控「${name}」必须真的改掉规则`).not.toBe(QH);
      expect(chainProblems(broken), `负控「${name}」未被判据抓住`).not.toEqual([]);
    }
  });

  it('④ 负控：结果区 505px 下限不得被动过（用户裁决：至少 10 行）', () => {
    expect(DQ).toMatch(/\.dq-result \{ margin-top: (?:10px|var\(--sp-2h\)); flex: 1 1 auto; min-height: 505px; display: flex; flex-direction: column; \}/);
  });
});
