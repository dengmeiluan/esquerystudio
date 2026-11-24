import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OPS_META } from '../utils/queryAstOps';

const extras = readFileSync(join(__dirname, '../components/builder/RootExtrasPane.vue'), 'utf-8');

/* 1096：JSON 参数面继续铺开——knn.filter（向量近邻的布尔过滤）与 collapse.inner_hits
 * （折叠时返回被折叠文档）都是产线常见但此前只能手写的对象参数。 */
describe('1096 knn.filter / collapse.inner_hits', () => {
  it('knn 注册 filter=json', () => {
    const p = (OPS_META.knn.params || []).find(x => x.key === 'filter');
    expect(p).toBeTruthy();
    expect(p!.kind).toBe('json');
  });

  it('collapse 参数位挂 json schema（inner_hits）与并发上限', () => {
    expect(extras).toContain('const COLLAPSE_PARAMS');
    expect(extras).toContain("{ key: 'inner_hits', kind: 'json' }");
    expect(extras).toContain("{ key: 'max_concurrent_group_searches', kind: 'number' }");
    expect(extras).toContain('<GenericParams :value="tree.collapse.params" :schema="COLLAPSE_PARAMS"');
  });
});
