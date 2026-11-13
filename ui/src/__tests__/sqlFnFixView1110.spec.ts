import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1110：SQL 未知函数纠错的页面接线（错误面板 chips → 词边界替换 → 由「重试」执行）。 */
const view = readFileSync(join(__dirname, '../views/SqlConsoleView.vue'), 'utf-8');

describe('1110 SQL 未知函数纠错接线', () => {
  it('错误文本进入函数纠错纯函数，候选只给有相近项时出 chips', () => {
    expect(view).toContain('suggestFunctionsFor');
    expect(view).toContain('const fnFix = computed(() => (runErr.value && !runErrStale.value ? suggestFunctionsFor(runErr.value) : null));');
    expect(view).toContain('v-if="fnFix && fnFix.suggestions.length"');
    expect(view).toContain('data-test="sql-fn-fix"');
  });

  it('替换走词边界（函数名大小写不敏感），不暗跑查询', () => {
    expect(view).toContain('fnFix.value?.fn');
    expect(view).toContain('sql.value = sql.value.replace(re, name);');
    expect(view).toContain("'gi'");
    expect(view).toContain('@click="applyFnFix(s.name)"');
    expect(view).toContain('可重新执行');
  });
});
