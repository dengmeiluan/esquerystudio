/**
 * 1439：_msearch/template 头体补全。
 *
 * 头行与 _msearch 同款（index/search_type/routing…）；体行是模板执行参数
 * {id | source, params}。此前该端点落 none 档，头体都零候选、也无行键校验。
 */
import { describe, it, expect } from 'vitest';
import { bodyKindForPath, msearchTemplateBodyKeyItems, msearchHeaderLineAt } from '../utils/dslCompletionContext';
import { ndjsonLint } from '../utils/bulkNdjson';
import { lintNdjsonLineKeys } from '../utils/dslLint';

describe('1439 _msearch/template 头体', () => {
  it('bodyKind：模板版单列 msearch-template-body；普通 msearch 不受影响', () => {
    expect(bodyKindForPath('/idx/_msearch/template', 'POST')).toBe('msearch-template-body');
    expect(bodyKindForPath('_msearch/template', 'POST')).toBe('msearch-template-body');
    expect(bodyKindForPath('/idx/_msearch', 'POST')).toBe('msearch-body');
  });

  it('体行键表：id/source/params；头行判定沿用 msearch 奇偶', () => {
    expect(msearchTemplateBodyKeyItems().map(i => i.label)).toEqual(['id', 'source', 'params']);
    const header = '{"index":"logs"';
    expect(msearchHeaderLineAt(header, header.length)).toBe(true);
    const body = '{"index":"logs"}\n{"id":"t"';
    expect(msearchHeaderLineAt(body, body.length)).toBe(false);
  });

  it('配对口径（msearch-template）：头体成对合法；落单头行给头/体文案', () => {
    expect(ndjsonLint('{"index":"logs"}\n{"id":"t"}', 'msearch-template')?.level).toBe('ok');
    const odd = ndjsonLint('{"index":"a"}\n{"id":"t"}\n{"routing":"x"}', 'msearch-template');
    expect(odd?.level).toBe('warn');
    expect(odd?.msg).toContain('头行 2 行、查询体行 1 行');
  });

  it('行键 lint：模板体行拼错给「_msearch/template 体行」；普通 msearch 体行不判', () => {
    expect(lintNdjsonLineKeys('{"index":"logs"}\n{"id":"t"}', 'msearch-template')).toEqual([]);
    const f = lintNdjsonLineKeys('{"index":"logs"}\n{"idd":"t"}', 'msearch-template');
    expect(f).toHaveLength(1);
    expect(f[0].message).toContain('_msearch/template 体行');
    expect(f[0].message).toContain('最接近：id');
    expect(lintNdjsonLineKeys('{"index":"logs"}\n{"idd":"t"}', 'msearch')).toEqual([]);
  });
});
