/**
 * 1439：retriever 体内也能补全检索器变体（此前只有根键骨架里写死的 standard）。
 *
 * 产品支持 9 种变体（RETRIEVER_META），但 Ctrl+Space 在 retriever 值对象里什么都拿不到。
 * 本批补 RETRIEVER_SNIPPETS + dslContext 的 retriever-type 档。
 *
 * 防漂移判据：每条骨架替换占位符后，必须能被**产品自己的 parseTree** 吃下，
 * 且解析出的 retriever.op 等于该变体名——骨架与解析器任何一侧改了都会红。
 */
import { describe, it, expect } from 'vitest';
import { dslContext, RETRIEVER_SNIPPETS } from '../utils/dslCompletionContext';
import { RETRIEVER_META } from '../utils/queryAstOps';
import { parseTree } from '../utils/queryAst';

function plain(text: string): string {
  return text
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, opts: string) => opts.split(',')[0] ?? 'x')
    .replace(/\$\{\d+:([^}]*)\}/g, (_m, v: string) => v)
    .replace(/\$\{\d+\}/g, 'x');
}

function problems(snippets: Record<string, { text: string; detail: string }>): string[] {
  const out: string[] = [];
  for (const op of Object.keys(RETRIEVER_META)) {
    const s = snippets[op];
    if (!s) { out.push(`${op}：没有补全骨架`); continue; }
    if (!s.text.startsWith(`"${op}":`)) out.push(`${op}：骨架不是以 "${op}": 开头`);
    if (!s.detail) out.push(`${op}：缺中文说明`);
    let body: any;
    try { body = JSON.parse('{' + plain(s.text) + '}'); }
    catch (e: any) { out.push(`${op}：骨架不是合法 JSON（${e?.message}）`); continue; }
    const r: any = parseTree({ retriever: body });
    if (!r.ok) { out.push(`${op}：产品解析器拒绝该骨架（${r.reason}）`); continue; }
    const got = r.tree.retriever?.op;
    if (got !== op) out.push(`${op}：解析出的变体是 ${got}`);
  }
  return out;
}

describe('1439 retriever 变体补全', () => {
  it('每个检索器变体都有能被自家解析器吃下的骨架', () => {
    expect(problems(RETRIEVER_SNIPPETS)).toEqual([]);
  });

  it('上下文：retriever 值对象键位 → retriever-type', () => {
    const doc = '{"retriever": {';
    expect(dslContext(doc, doc.length).kind).toBe('retriever-type');
  });

  it('上下文：rrf.retrievers[] 元素对象键位 → retriever-type；linear 包裹元素不给裸变体', () => {
    /* 裸数组位（`[` 之后、`{` 之前）不出档：那里该先开元素对象，直接插 `"standard":{…}`
       会得到 `[ "standard": … ]` 这种非法数组元素——宁可让用户先打 `{`。 */
    const rrfArr = '{"retriever":{"rrf":{"retrievers":[';
    expect(dslContext(rrfArr, rrfArr.length).kind).toBe('none');
    const rrfElem = rrfArr + '{';
    expect(dslContext(rrfElem, rrfElem.length).kind).toBe('retriever-type');
    /* linear 的元素必须是 {retriever, weight} 包裹——不在这里给裸变体键 */
    const linearElem = '{"retriever":{"linear":{"retrievers":[{';
    expect(dslContext(linearElem, linearElem.length).kind).not.toBe('retriever-type');
  });

  it('负控：删掉一种 → 判据必须点名；键名写错 / 括号写坏 → 都要报出来', () => {
    const missing: Record<string, { text: string; detail: string }> = { ...RETRIEVER_SNIPPETS };
    delete missing.rrf;
    expect(problems(missing).some(p => p.startsWith('rrf'))).toBe(true);

    /* 键名与注册键不一致（骨架挂错变体） */
    const wrongKey: Record<string, { text: string; detail: string }> = {
      ...RETRIEVER_SNIPPETS,
      knn: { ...RETRIEVER_SNIPPETS.knn, text: '"standard": { "field": "${1:f}" }' },
    };
    expect(problems(wrongKey).some(p => p.startsWith('knn') && p.includes('开头'))).toBe(true);

    /* 括号写坏：连 JSON 都过不了 */
    const brokenJson: Record<string, { text: string; detail: string }> = {
      ...RETRIEVER_SNIPPETS,
      rescorer: { ...RETRIEVER_SNIPPETS.rescorer, text: '"rescorer": { "retriever": { "standard": {} }"' },
    };
    expect(problems(brokenJson).some(p => p.startsWith('rescorer') && p.includes('合法 JSON'))).toBe(true);
  });
});
