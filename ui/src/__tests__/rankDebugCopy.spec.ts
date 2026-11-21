/**
 * R130 一百三十七批：RankDebug 诊断结果 Markdown 复制（群聊/工单讨论直贴）。
 * 源码级锁（页面挂载依赖 explain 双请求链，轻量锁形态）：
 * 1) explainTreeMd 递归展开（缩进层级 + 得分）；
 * 2) copyWhyMd 产出 verdict 头 + 打分树，走剪贴板；
 * 3) verdict 区「复制诊断」按钮接线。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/RankDebugView.vue'), 'utf-8');

describe('RankDebug 诊断复制（137 批）', () => {
  it('explainTreeMd 递归展开打分树（缩进+得分）', () => {
    expect(src).toMatch(/function explainTreeMd\(node: any, depth = 0\)/);
    expect(src).toMatch(/for \(const d of node\.details \|\| \[\]\) lines\.push\(\.\.\.explainTreeMd\(d, depth \+ 1\)\)/);
  });

  it('copyWhyMd 产出 verdict 头+打分树并复制', () => {
    expect(src).toMatch(/async function copyWhyMd\(\)/);
    expect(src).toMatch(/打分树：/);
    expect(src).toMatch(/诊断结果已复制（Markdown）/);
  });

  it('verdict 区按钮接线', () => {
    expect(src).toContain('复制诊断');
    expect(src).toMatch(/@click="copyWhyMd"/);
  });
});
