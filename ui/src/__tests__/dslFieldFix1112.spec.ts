import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { suggestFieldsFor } from '../utils/queryErrorLocate';

/* 1112：DSL 运行时 unknown-field 一键改名——纯函数候选 + 页面接线。
 只对 errorFieldOf 已确认的查询上下文生效（sort/agg 不误指），宁缺勿错。 */
const view = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const FIELDS = ['title', 'publish_time', 'issuer_name', 'title.keyword'];

describe('1112 DSL 运行时字段纠错', () => {
  it('no field found → mapping 内最近字段 top-3', () => {
    const r = suggestFieldsFor('search_phase_execution_exception: failed to create query: No field found for [titl] in mapping with types []', FIELDS);
    expect(r?.field).toBe('titl');
    expect(r?.suggestions[0]).toEqual({ path: 'title', score: 1 });
    expect(r?.suggestions.length).toBeLessThanOrEqual(3);
  });

  it('下划线长名可救（距离阈值随名长放宽）', () => {
    expect(suggestFieldsFor('failed to find field [publish_tim]', FIELDS)?.suggestions[0].path).toBe('publish_time');
  });

  it('非查询上下文/无候选/空字段源零增量', () => {
    expect(suggestFieldsFor('No mapping found for [ts] in order to sort on', FIELDS)).toBeNull();
    expect(suggestFieldsFor('Field [title] of type [text] is not supported for aggregation', FIELDS)).toBeNull();
    expect(suggestFieldsFor('No field found for [zzzzzz] in mapping', FIELDS)?.suggestions).toEqual([]);
    expect(suggestFieldsFor('No field found for [titl] in mapping', [])).toBeNull();
  });

  it('页面接线：字段 chip → 只改出错叶子 → 重试；树未同步时不暗改', () => {
    expect(view).toContain("import { errorFieldOf, findLeafIdByField, suggestFieldsFor } from '../utils/queryErrorLocate';");
    expect(view).toContain('suggestFieldsFor(queryErr.value, builderFields.value)');
    expect(view).toContain('data-test="dsl-field-fix"');
    expect(view).toContain('updateNodeById(t.root, id, n => ({ ...n, field: path }))');
    expect(view).toContain('onExtrasUpdate({ ...t, root });');
    expect(view).toContain('await runQuery();');
    expect(view).toContain('条件树与 DSL 尚未同步，请先修正 JSON 再改字段');
  });
});
