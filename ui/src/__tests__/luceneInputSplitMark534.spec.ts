/**
 * 五百三十四批 P1-2：LuceneInput 收口契约看守。
 *
 *  A v-html hl() 通道退役：组件内 v-html 零残留、hl() 函数删除、模板只剩 segs 片段
 *    单一渲染分支（:54 field 段形态推广至 op/value 段）；
 *  B op/value 段统一产 segs（splitMark 渲染基座行为：命中切分 / 空 query 单段无 mark）；
 *  C 未知字段提示附编辑距离最近候选（「最接近：xxx」，≤2 才附防噪音）。
 *
 * 源锚口径（assistLintWave533 同理由）：弹层渲染是 happy-dom Teleport 行为（luceneInput.spec
 * 已覆盖 textContent 等价），本件锁「注入面退役 + 渲染通道统一」的形态契约。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { splitMark } from '../composables/useGridSearch';

const SRC = join(__dirname, '..');
const li = readFileSync(join(SRC, 'components/LuceneInput.vue'), 'utf-8');

describe('A v-html hl() 通道退役', () => {
  it('组件内 v-html 零残留（注入面收口）', () => {
    expect(li, 'v-html 不得在 LuceneInput 内回潮').not.toMatch(/v-html/);
  });

  it('hl() 函数删除；模板只剩 segs 片段单一渲染分支（field 段 :54 形态同款）', () => {
    expect(li, '本地 hl() 退役').not.toMatch(/function hl\(/);
    expect(li, 'v-if/v-else 双分支退役').not.toMatch(/v-else class="li-name/);
    expect(li).toContain('<span class="li-name mono"><template v-for="(sg, si) in it.segs" :key="si"><mark v-if="sg.m">{{ sg.t }}</mark><template v-else>{{ sg.t }}</template></template></span>');
  });

  it('op 段 splitMark 化：OPS 常量表 + items 侧统一产 segs', () => {
    expect(li).toContain("const OPS = ['AND', 'OR', 'NOT'];");
    expect(li).toContain('OPS.map(t => ({ text: t, segs: splitMark(t, s.prefix) }))');
  });
});

describe('B splitMark 渲染基座行为（三段共用内核，useGridSearch 单一出处）', () => {
  it('命中切分：<mark> 段 m=true；空 query 单段无 mark（等价原 esc 平文）', () => {
    expect(splitMark('AND', 'A')).toEqual([{ t: 'A', m: true }, { t: 'ND', m: false }]);
    expect(splitMark('AND', 'and')).toEqual([{ t: 'AND', m: true }]);
    expect(splitMark('now-1d/d', '')).toEqual([{ t: 'now-1d/d', m: false }]);
    expect(splitMark('status', 'at')).toEqual([{ t: 'st', m: false }, { t: 'at', m: true }, { t: 'us', m: false }]);
  });

  it('value 段 segs 接线在場：keyword/date/numeric 三分支同款 seg 包装', () => {
    expect(li).toContain('const withSegs = (v: string) => ({ text: v, segs: splitMark(v, s.prefix) });');
  });
});

describe('C 未知字段提示附编辑距离最近候选', () => {
  it('「最接近：xxx」在場 + ≤2 才附（dslLint unknown-field 同口径防噪音）+ editDistance 单源 import', () => {
    expect(li).toContain("import { editDistance } from '../utils/editDistance';");
    expect(li).toContain("let best = ''; let bestD = 3; /* >2 即弃（防噪音） */");
    /* 五百六十一批同步更新：条目升级 {msg, level} 双档（软提示 warn 档），msg 字面零迁移 */
    expect(li).toContain("out.push({ msg: `未知字段「${f}」（不在当前索引字段清单${bestD <= 2 ? `，最接近：${best}` : ''}）`, level: 'warn' });");
  });
});
