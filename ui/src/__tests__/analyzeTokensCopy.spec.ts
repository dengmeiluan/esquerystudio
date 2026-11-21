/**
 * R130 一百三十九批：AnalyzeView 分词结果 Markdown 表复制（评估报告直贴）。
 * 源码级锁：
 * 1) copyResultMd 产出五列表（#/token/pos/offset/type）；
 * 2) 「Markdown」按钮接线且与既有 JSON 复制并存。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/AnalyzeView.vue'), 'utf-8');

describe('Analyze 分词 Markdown 复制（139 批）', () => {
  it('copyResultMd 五列表结构+复制通知', () => {
    expect(src).toMatch(/async function copyResultMd\(\)/);
    expect(src).toContain('| # | 词元 | 序位 | 字符区间 | 词性 |'); // 181 批表头中文化
    expect(src).toContain('（Markdown）');
  });

  it('Markdown 按钮接线且 JSON 复制并存', () => {
    expect(src).toMatch(/@click="copyResultMd"/);
    expect(src).toMatch(/@click="copyResult"/);
    expect(src).toContain('tokens JSON');
  });
});
