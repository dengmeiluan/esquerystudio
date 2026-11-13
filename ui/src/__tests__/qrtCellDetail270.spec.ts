/**
 * 二百七十批：QRT 单元格详情「查看完整值」（RT 229 批 P0-2 同款合并）——
 * 右键详情弹层（JsonTree tools+maxChildren/maxStrLen 防 MB 级值），两表右键菜单对齐。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const qrt = read('../components/QueryResultTable.vue');
const rt = read('../components/ResultTable.vue');

describe('QRT 单元格详情（270 批）', () => {
  it('菜单项/状态/弹层三件齐', () => {
    expect(qrt).toMatch(/key: 'detail-cell', label: '查看完整值', icon: Search/);
    expect(qrt).toMatch(/const cellDetail = ref<\{ ri: number; ci: number \} \| null>\(null\)/);
    expect(qrt).toMatch(/<n-modal v-model:show="detailOpen" preset="card" title="单元格详情"/);
    expect(qrt).toMatch(/<JsonTree :data="detailData" tools :max-children="200" :max-str-len="4000" \/>/);
  });
  it('RT 同款形态对齐（meta+JsonTree）', () => {
    expect(rt).toMatch(/title="单元格详情"/);
    expect(rt).toMatch(/<JsonTree :data="detailData" tools :max-children="200" :max-str-len="4000" \/>/);
  });
});
