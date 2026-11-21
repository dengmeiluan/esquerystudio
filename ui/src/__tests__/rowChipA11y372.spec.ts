/**
 * 三百七十二批：交互行/芯片/排序 th 键盘可达收尾（369-371 同口径第四波）——
 * SystemView 排序表头（useTableSort 孤岛，370 批 Xmigrate 同款）/
 * RestView 示例芯片+历史重放项/DiagView 节点名采热线程/AdhocRebuild 无风险变更折叠行。
 * 行内纯复制点（SystemView 单元格/AdhocRebuild jobId span）维持全站口径不硬塞 tabindex。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const sy = readFileSync(join(__dirname, '../views/SystemView.vue'), 'utf-8');
const rest = readFileSync(join(__dirname, '../views/RestView.vue'), 'utf-8');
const dg = readFileSync(join(__dirname, '../views/DiagView.vue'), 'utf-8');
const ad = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

describe('交互行/芯片键盘可达（372 批）', () => {
  /* 天罗W6 同步更新：SystemView 手写排序表头随结果网格整表换 QueryResultTable 退役——
     键盘可达契约（th tabindex+Enter/Space+aria-sort）由 QRT 内建承接（qrtSortable 已锁），
     此处锚「SystemView 结果网格确已交给 QRT 且排序开启」不回潮。 */
  it('SystemView 排序表头 tabindex+Enter/Space+aria-sort', () => {
    /* 五百六十一批同步更新：v-show 换 :hide-body 视图分档（表格头收口），排序契约不变 */
    expect(sy).toMatch(/<QueryResultTable ref="resQrt" class="sy-qrt"\s*\n\s*:hits="resp\.hits \?\? \[\]" :total="resp\.total" :sortable="true"/);
    expect(sy).not.toContain('syToggle');
  });

  it('RestView 示例芯片+历史重放项 role+tabindex+Enter（373 起 Enter+Space 双键）', () => {
    expect(rest).toMatch(/<span v-for="s in SNIPPETS" :key="s\.path" class="chip mono" role="button" tabindex="0" :aria-label="'填入示例：' \+ s\.label" @click="applySnippet\(s\)" @keydown\.enter\.prevent="applySnippet\(s\)" @keydown\.space\.prevent="applySnippet\(s\)">/);
    /* 第十批：历史重放行改用 QueryHistoryPanel——role/tabindex/Enter+Space 契约随共享件承接 */
    const qhp = readFileSync(join(__dirname, '../components/QueryHistoryPanel.vue'), 'utf-8');
    expect(qhp).toMatch(/role="button" tabindex="0" @keydown\.enter\.prevent="clickable && \$emit\('play', it\)" @keydown\.space\.prevent/);
  });

  it('DiagView 采热直达键盘可达（row-actions 注入原生 button；五百二十五批 W5 同步更新）', () => {
    /* 节点名 span 的 role=button+tabindex+Enter/Space 手挂双键随节点表换 QRT 壳退役——
       采热直达改 row-actions 注入原生 <button>（tabindex 聚焦 + Enter/Space 为浏览器原生
       语义，aria-label 全名可达），契约等价上移。 */
    expect(dg).toMatch(/<template #row-actions="\{ row \}">/);
    expect(dg).toMatch(/<button class="btn ghost xs" :aria-label="'按节点 ' \+ \(row\[0\] \|\| ''\) \+ ' 采热线程'"/);
    expect(dg).toMatch(/title="按此节点采热线程" @click\.stop="loadHot\(String\(row\[0\] \|\| ''\)\)"/);
  });

  it('AdhocRebuild 折叠行 role+tabindex+Enter（aria-label 随开合态；373 起 Enter+Space 双键）', () => {
    expect(ad).toMatch(/<tr v-if="cfgParts\.benign\.length" class="cd-benign-toggle" role="button" tabindex="0" :aria-label="benignOpen \? '收起无风险变更' : '展开无风险变更'" @click="benignOpen = !benignOpen" @keydown\.enter\.prevent="benignOpen = !benignOpen" @keydown\.space\.prevent="benignOpen = !benignOpen">/);
  });
});
