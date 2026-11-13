/**
 * 1439：聚合类型补全目录必须与「产品支持的聚合」同宽。
 *
 * 实测缺口：AGG_SNIPPETS 只有 11 种，而 AGG_OPS 有 69 种——
 * histogram / percentiles / value_count / filter / filters / nested / top_metrics
 * 等常见聚合在 Ctrl+Space 里根本看不到，补全这个「发现性入口」等于形同虚设。
 *
 * 判据：
 * ① 每个 AGG_OPS 键都有 snippet；
 * ② snippet 文本以 `"<op>":` 开头（插到实例值对象里才是合法键）；
 * ③ 把 Monaco 占位符换成普通值后，整段必须能 JSON.parse（不能给用户一个插进去就红的骨架）。
 */
import { describe, it, expect } from 'vitest';
import { AGG_SNIPPETS } from '../utils/dslCompletionContext';
import { AGG_OPS } from '../utils/queryAstOps';

/** Monaco snippet 占位符 → 普通值：${1:field}=>field、${2|a,b,c|}=>a、${0}=>x */
function plain(text: string): string {
  return text
    .replace(/\$\{\d+\|([^}]*)\|\}/g, (_m, opts: string) => opts.split(',')[0] ?? 'x')
    .replace(/\$\{\d+:([^}]*)\}/g, (_m, v: string) => v)
    .replace(/\$\{\d+\}/g, 'x');
}

function problems(snippets: Record<string, { text: string; detail: string }>): string[] {
  const out: string[] = [];
  for (const op of Object.keys(AGG_OPS)) {
    const s = snippets[op];
    if (!s) { out.push(`${op}：没有补全骨架`); continue; }
    if (!s.text.startsWith(`"${op}":`)) out.push(`${op}：骨架不是以 "${op}": 开头`);
    if (!s.detail) out.push(`${op}：缺中文说明`);
    try {
      JSON.parse('{' + plain(s.text) + '}');
    } catch (e: any) {
      out.push(`${op}：骨架不是合法 JSON（${e?.message}）`);
    }
  }
  return out;
}

describe('1439 聚合补全目录同宽', () => {
  it('AGG_OPS 每一项都有合法骨架', () => {
    expect(problems(AGG_SNIPPETS)).toEqual([]);
  });

  it('负控：删掉一种 → 判据必须点名', () => {
    const broken: Record<string, { text: string; detail: string }> = { ...AGG_SNIPPETS };
    delete broken.histogram;
    expect(problems(broken).some(p => p.startsWith('histogram'))).toBe(true);
  });

  it('负控：骨架写坏（少半个括号）→ 判据必须点名', () => {
    const broken: Record<string, { text: string; detail: string }> = {
      ...AGG_SNIPPETS,
      value_count: { ...AGG_SNIPPETS.value_count, text: '"value_count": { "field": "${1:field}"' },
    };
    expect(problems(broken).some(p => p.startsWith('value_count'))).toBe(true);
  });
});
