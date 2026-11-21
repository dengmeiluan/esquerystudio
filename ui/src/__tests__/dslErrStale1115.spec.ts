import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 1115：DSL 错误锚点绑定失败时的 DSL 快照——改稿后旧字段/条件定位撤下，
 面板保留全文并标「错误来自上一版 DSL」（与 SQL 1109 同语义）。 */
const view = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('1115 DSL 错误锚点过期撤下', () => {
  it('失败快照 + stale 计算', () => {
    expect(view).toContain("const queryErrDsl = ref('');");
    expect(view).toContain('const queryErrStale = computed(() => !!queryErr.value && dsl.value !== queryErrDsl.value);');
    expect(view).toContain('const dslSnapshot = dsl.value;');
    expect(view).toContain('queryErrDsl.value = dslSnapshot;');
  });

  it('改稿后旧字段 chip/定位/停用入口撤下，保留「上一版」标记', () => {
    expect(view).toContain('data-test="dsl-err-stale"');
    expect(view).toContain('v-if="errLeafId && !queryErrStale"');
    expect(view).toContain('fieldFix.suggestions.length && errLeafId && !queryErrStale');
    expect(view).toContain('错误来自上一版 DSL');
  });

  it('新一轮执行清空旧快照', () => {
    expect(view).toContain("queryErr.value = '';\n  queryErrDsl.value = '';");
  });
});
