/**
 * 1169 批：排序字段解析必须覆盖「手输/URL 进来」的通道。
 *
 * 1149 已把「表头点击排序」统一走 resolveSortField（text → .keyword，无子域则拦下）。
 * 但 Lucene / PIT 的 sort 是**输入框**：FieldPicker 只过滤下拉候选，挡不住
 * `?sort=title`、粘贴、历史回放——直接把 text 列送给 ES 就是 400
 * 「Fielddata is disabled on text fields」，用户看到的就是「操作报错」。
 * 本锁钉死这两个发送点各自都在发请求前调用解析器，且解析失败不发请求。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const lucene = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');
const pit = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

describe('1169 手输排序字段的 fielddata 防线', () => {
  it('Lucene：发请求前解析，解析失败即 return（不发注定 400 的请求）', () => {
    expect(lucene).toContain("import { resolveSortField } from '../utils/sortField';");
    const run = lucene.slice(lucene.indexOf('async function doRun()'));
    const at = run.indexOf('resolveSortField(');
    expect(at, 'doRun 内调用解析器').toBeGreaterThan(-1);
    /* 关键顺序：解析结果必须在使用之前裁决，且失败分支先 return */
    const gate = run.slice(at, at + 400);
    expect(gate).toMatch(/if \(!res\.ok\) \{/);
    expect(gate).toMatch(/return;/);
    /* 真正发出的字段用解析后的值，不是原始手输值 */
    expect(run).toMatch(/api\.luceneSearch\([\s\S]{0,200}?sortField\.value\.trim\(\)/);
  });

  it('PIT：深分页开跑前解析；_shard_doc 恒快排不吃映射（不得被拦）', () => {
    expect(pit).toContain("import { resolveSortField } from '../utils/sortField';");
    expect(pit).toMatch(/sfRaw !== '_shard_doc'/);
    expect(pit).toMatch(/if \(!res\.ok\) \{[\s\S]{0,200}?return;/);
    /* 解析出 .keyword 时要回写，避免后续批次仍用旧 text 字段 */
    expect(pit).toMatch(/sortField\.value = res\.field;/);
  });

  it('PIT 解析发生在循环外（每批一次，不是每批重复解析）', () => {
    const before = pit.indexOf('while (running.value && !pause.value)');
    const call = pit.indexOf('resolveSortField(');
    expect(call, '解析器调用存在').toBeGreaterThan(-1);
    expect(call, '解析先于拉取循环').toBeLessThan(before);
  });
});
