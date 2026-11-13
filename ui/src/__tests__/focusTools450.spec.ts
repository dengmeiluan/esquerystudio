/**
 * 四百五十批：聚焦态操作可达补齐（449 Lucene 同款缺口甄别推广）——
 * PIT 聚焦面内补 buffer 全量导出钮（JSONL/CSV 全量数据源在面外）；
 * DslQuery 聚焦面内补分页器（面外翻页不可达；QRT 内置导出/查找已可用）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pit = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');

describe('聚焦态操作可达（450 批）', () => {
  it('PIT 聚焦态补 buffer 全量导出钮', () => {
    expect(pit).toMatch(/<div v-if="focusPaneId === 'pit\.preview'" class="focus-tools">[\s\S]*?exportJsonl[\s\S]*?exportCsv/);
  });

  it('DslQuery 聚焦态工具可达：视图 seg+分页器寄居 RT 工具行（552 批同步更新 541 现行形态）', () => {
    /* 541 批：dq-res-bar/独立分页器退役——视图 seg+Pagination 寄居 RT 自带工具行
       (#bar-prepend)，聚焦面（FS）内 rt-bar 常驻 → 聚焦态切视图/翻页原生可达
       （锁意图不变=聚焦态工具可达）；552 批起 hideBody→true（切 JSON/Tree）时 RT 自动
       退出聚焦（rtFix552），表格档聚焦态工具可达语义不变 */
    expect(dq).toMatch(/<template #bar-prepend>[\s\S]*?<div class="seg">/);
    expect(dq).toMatch(/<Pagination v-if="view !== 'json' && view !== 'tree'"[\s\S]*?:page="page"/);
  });
});
