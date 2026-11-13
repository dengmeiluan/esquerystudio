import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suggestIndexNames } from '../utils/indexSuggest';

const dsl = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

/* 1097：DSL 索引不存在的一键纠错（与 SQL 错误面板同口径）。
 * 顶栏索引可能因切集群/改名/手误失效；ES 报 index_not_found_exception: no such index [x]。
 * 错误面板给相近索引 chips，点击切换并重试，不用自己回顶栏找。 */
describe('1097 DSL 索引纠错', () => {
  it('从 no such index / Unknown index 提取索引并给 top-3', () => {
    const names = ['research_report', 'bond_issuer', 'logs-2026'];
    const r = suggestIndexNames('index_not_found_exception: no such index [reserch_report]', names);
    expect(r?.index).toBe('reserch_report');
    expect(r?.suggestions[0].path).toBe('research_report');
    const u = suggestIndexNames('Unknown index [bond_issue]', names);
    expect(u?.suggestions.map(s => s.path)).toContain('bond_issuer');
    expect(suggestIndexNames('something else', names)).toBeNull();
  });

  it('视图接线：错误面板 chips + 切换索引并重试', () => {
    expect(dsl).toContain("import { suggestIndexNames } from '../utils/indexSuggest';");
    expect(dsl).toContain('const idxSuggestion = computed(() => queryErr.value');
    expect(dsl).toMatch(/v-if="idxSuggestion\?\.suggestions\.length"/);
    expect(dsl).toContain('applyIdxSuggestion(s.path)');
    expect(dsl).toMatch(/function applyIdxSuggestion\(name: string\) \{[\s\S]{0,220}store\.pick\(name\);[\s\S]{0,160}runQuery\(\);/);
  });
});
