/**
 * 1439：_msearch 头行补全。
 *
 * _msearch 体是 NDJSON 的「头行 + 查询体行」对：头行此前按 none 档零候选，
 * 查询体行虽有 search 补全但头行键（index/search_type/routing…）只能凭记忆。
 * 现在按非空行奇偶判定头/体行：头行给请求头目录，体行回落整棵查询补全。
 */
import { describe, it, expect } from 'vitest';
import { bodyKindForPath, msearchHeaderKeyItems, msearchHeaderLineAt } from '../utils/dslCompletionContext';
import { ndjsonLint } from '../utils/bulkNdjson';

describe('1439 _msearch 头行补全', () => {
  it('bodyKind：_msearch 升 msearch-body；模板版仍无档', () => {
    expect(bodyKindForPath('/_msearch', 'POST')).toBe('msearch-body');
    expect(bodyKindForPath('/idx/_msearch', 'POST')).toBe('msearch-body');
    expect(bodyKindForPath('_msearch', 'POST')).toBe('msearch-body');
    expect(bodyKindForPath('/idx/_msearch/template', 'POST')).toBe('msearch-template-body');
  });

  it('头行判定：第 1、3… 个非空行为头行；体行与空行前后奇偶正确', () => {
    const first = '{"index":"a"';
    expect(msearchHeaderLineAt(first, first.length)).toBe(true);
    const second = '{"index":"a"}\n{"query":{}}';
    expect(msearchHeaderLineAt(second, second.length)).toBe(false);
    const third = '{"index":"a"}\n{"query":{}}\n{"';
    expect(msearchHeaderLineAt(third, third.length)).toBe(true);
    /* 末尾换行后的下一行是头行；空行计入非空行过滤（不改变奇偶） */
    const next = '{"index":"a"}\n{"query":{}}\n';
    expect(msearchHeaderLineAt(next, next.length)).toBe(true);
    const blankBetween = '{"index":"a"}\n\n{"query":{}}';
    expect(msearchHeaderLineAt(blankBetween, blankBetween.length)).toBe(false);
  });

  it('头行键表为官方请求头字段', () => {
    expect(msearchHeaderKeyItems().map(i => i.label)).toEqual([
      'index', 'search_type', 'routing', 'preference', 'ignore_unavailable',
      'allow_no_indices', 'expand_wildcards', 'ccs_minimize_roundtrips',
    ]);
  });

  it('配对口径：头行不含 index 也合法；落单/非法行给头体文案（不再套 bulk 动作文案）', () => {
    expect(ndjsonLint('{"routing":"x"}\n{"query":{}}', 'msearch')?.level).toBe('ok');
    const odd = ndjsonLint('{"index":"a"}\n{"query":{}}\n{"routing":"x"}', 'msearch');
    expect(odd?.level).toBe('warn');
    expect(odd?.msg).toContain('头行 2 行、查询体行 1 行');
    expect(odd?.msg).not.toContain('动作');
    const bad = ndjsonLint('{"routing":"x"}\n{bad', 'msearch');
    expect(bad?.level).toBe('warn');
    expect(bad?.msg).toContain('头行/查询体行');
    expect(ndjsonLint('', 'msearch')).toBeNull();
    /* 默认（bulk）口径不回归 */
    expect(ndjsonLint('{"index":{}}\n{"a":1}')?.level).toBe('ok');
  });
});
