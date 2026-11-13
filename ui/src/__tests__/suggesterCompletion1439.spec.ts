/**
 * 1439：suggest.<名> {} 内补全 3 种建议器类型。
 * 产品注册了 SUGGESTER_TYPES（term/phrase/completion），根键骨架只写死 term，
 * 光标进到建议器对象里此前无候选。
 * 防漂移：骨架替换占位符后必须能被产品 parseTree 接受（suggest 解析成建议器节点）。
 */
import { describe, it, expect } from 'vitest';
import { dslContext, SUGGESTER_SNIPPETS } from '../utils/dslCompletionContext';
import { SUGGESTER_TYPES } from '../utils/queryAstOps';
import { parseTree } from '../utils/queryAst';

function plain(text: string): string {
  return text
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, opts: string) => opts.split(',')[0] ?? 'x')
    .replace(/\$\{\d+:([^}]*)\}/g, (_m, v: string) => v)
    .replace(/\$\{\d+\}/g, 'x');
}

function problems(snippets: Record<string, { text: string; detail: string }>): string[] {
  const out: string[] = [];
  for (const op of Object.keys(SUGGESTER_TYPES)) {
    const s = snippets[op];
    if (!s) { out.push(`${op}：没有补全骨架`); continue; }
    if (!s.text.startsWith(`"${op}":`)) out.push(`${op}：骨架不是以 "${op}": 开头`);
    if (!s.detail) out.push(`${op}：缺中文说明`);
    let body: any;
    try { body = JSON.parse('{' + plain(s.text) + '}'); }
    catch (e: any) { out.push(`${op}：骨架不是合法 JSON（${e?.message}）`); continue; }
    const r: any = parseTree({ suggest: { s1: { text: 'x', ...body } } });
    if (!r.ok) { out.push(`${op}：产品解析器拒绝该骨架（${r.reason}）`); continue; }
    /* 解析树里建议器的类型体放在 items[].rest（其余键为 text 等伴随项） */
    const rest = r.tree.suggest?.items?.[0]?.rest ?? {};
    const got = Object.keys(rest)[0];
    if (got !== op) out.push(`${op}：解析出的类型是 ${got ?? '(空)'}`);
  }
  return out;
}

describe('1439 建议器类型补全', () => {
  it('每种建议器都有能被自家解析器吃下的骨架', () => {
    expect(problems(SUGGESTER_SNIPPETS)).toEqual([]);
  });

  it('上下文：suggest.<名> {} 内 → suggester-type；suggest 一层是建议器命名位（不出类型）', () => {
    const inner = '{"suggest": {"s1": {';
    expect(dslContext(inner, inner.length).kind).toBe('suggester-type');
    const outer = '{"suggest": {';
    expect(dslContext(outer, outer.length).kind).not.toBe('suggester-type');
  });

  it('负控：删一种 / 键名挂错 → 判据点名', () => {
    const missing: Record<string, { text: string; detail: string }> = { ...SUGGESTER_SNIPPETS };
    delete missing.phrase;
    expect(problems(missing).some(p => p.startsWith('phrase'))).toBe(true);
    const wrong: Record<string, { text: string; detail: string }> = {
      ...SUGGESTER_SNIPPETS,
      completion: { ...SUGGESTER_SNIPPETS.completion, text: '"term": { "field": "${1:f}" }' },
    };
    expect(problems(wrong).some(p => p.startsWith('completion'))).toBe(true);
  });
});
