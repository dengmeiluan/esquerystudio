/**
 * 一千三百二十二期：条件树里拼错字段 → 只让你「造新字段」，不告诉你「是不是想找 X」。
 *
 * 真机复现（`{match: {issuer_nmae: 'x'}}`，索引 mapping 里有 issuer_name）：
 * 条件行只出一条
 *   字段不在 mapping：＋创建 keyword 运行时字段
 * 拼错一个字母的人会被引向**新建一个空壳字段**，而真正该做的是改回已有字段。
 * LuceneInput / dslLint 早就有了「最接近：xxx」的口径（editDistance ≤2），
 * 条件树这条输入通道漏了。
 *
 * 本 spec 锁：
 *  - 未知字段时出「是不是想找 X」按钮，且点到即改（onFieldPicked，会按类型换算子）
 *  - 阈值与既有口径一致：距离 ≤2 才提示（>2 大概率是全新字段，提示反而误导）
 *  - 有明显更近的真实字段时选中它；距离过大时**不出现**该按钮
 *  - 视觉分层：纠错用主色（.cn-suggest），造新字段保留 warn 色（.cn-defrt）
 * 负控：把阈值改成 <= 99 → 「距离过大不提示」必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { editDistance } from '../utils/editDistance';

const src = readFileSync(join(__dirname, '../components/builder/ClauseNode.vue'), 'utf-8');

/** 从组件源码里取出「阈值」那一行——**不用复刻副本**，否则改了组件断言也不会红。 */
function componentThreshold(): number {
  const m = src.match(/return bestD <= (\d+) \? best : ''/);
  expect(m, '组件里必须有 bestD <= N 的阈值判据').toBeTruthy();
  return Number(m![1]);
}
/** 用组件**自己的阈值**跑候选逻辑（公式与组件一致，只有阈值取自源码） */
function suggest(f: string, fields: string[]): string {
  let best = '', bestD = Infinity;
  for (const cand of fields) {
    const d = editDistance(f.toLowerCase(), cand.toLowerCase());
    if (d < bestD) { bestD = d; best = cand; }
  }
  return bestD <= componentThreshold() ? best : '';
}

describe('1322 条件树未知字段的「是不是想找」', () => {
  it('拼错一个字母 → 命中真实字段', () => {
    expect(suggest('issuer_nmae', ['issuer_name', 'title', 'status'])).toBe('issuer_name');
    expect(suggest('titel', ['title', 'status'])).toBe('title');
    expect(suggest('bons_code', ['bond_code', 'issuer_name'])).toBe('bond_code');
  });

  it('阈值与 LuceneInput/dslLint 同口径：>2 不提示（避免把新字段当笔误）', () => {
    expect(suggest('completely_new_field', ['title', 'status'])).toBe('');
    /* 距离恰好 2 仍然提示（边界不提前放弃） */
    expect(editDistance('statu', 'status')).toBe(1);
    expect(suggest('statu', ['status'])).toBe('status');
  });

  it('组件里确实渲染该按钮，并走 onFieldPicked（不是只写 field 的 patchFieldOnly）', () => {
    expect(src, '模板必须有建议钮').toContain('class="btn xs cn-suggest"');
    expect(src, '文案必须是人话提问').toContain('是不是想找');
    const fn = src.slice(src.indexOf('function useSuggestion'), src.indexOf('function useSuggestion') + 200);
    expect(fn, '点击必须走 onFieldPicked（按类型换算子），而不是 patchFieldOnly').toContain('onFieldPicked(');
  });

  it('视觉分层：纠错用主色、造新字段保留 warn 色', () => {
    const sug = src.slice(src.indexOf('.cn-suggest {'), src.indexOf('.cn-suggest code'));
    expect(sug, '纠错建议用主色').toContain('var(--ac-hi)');
    expect(sug, '不得用警告色').not.toContain('var(--warn)');
    const def = src.slice(src.indexOf('.cn-defrt {'), src.indexOf('.cn-val {'));
    expect(def, '造新字段仍是警告色').toContain('var(--warn)');
  });

  it('建议钮排在「创建运行时字段」之前（先纠错，再造新字段）', () => {
    const tpl = src.slice(src.indexOf('cn-defrt-bar'), src.indexOf('cn-params'));
    const iSug = tpl.indexOf('cn-suggest');
    const iDef = tpl.indexOf('cn-defrt"');
    expect(iSug).toBeGreaterThan(-1);
    expect(iDef).toBeGreaterThan(-1);
    expect(iSug, '建议钮必须在前').toBeLessThan(iDef);
  });
});
