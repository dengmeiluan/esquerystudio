/**
 * 三百七十批：Xmigrate 排序表头键盘可达——五处 th.sortable 此前纯 @click，
 * RT/QRT 平台表头早已 tabindex+Enter/Space+aria-sort，自制表孤岛未跟上。
 * 五百二十九批 W-C：作业表换壳 QRT rows 型（DiagView/HealthReport 525 同款消费形态）——
 * 表头键盘可达整体由内核 sortable 表头承接，本守卫随壳迁为「消费方传 sortable +
 * 内核表头 tabindex/Enter/Space/aria-sort 机制在位」双断言（用例语义不变）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

describe('Xmigrate 排序表头键盘可达（370 批，529 随壳迁 QRT）', () => {
  it('消费方传 sortable；内核表头 tabindex+Enter/Space+aria-sort 机制在位', () => {
    expect(v, '作业表必须以 sortable 启用内核排序表头').toMatch(
      /<QueryResultTable v-else-if="jobs\.length" ref="qrtRef" :cols="XM_COLS" :rows="jobRows" sortable/,
    );
    /* 五百五十二批同步更新（击穿者：tableKernelWave552 ② QRT syncSort 平移）——模板 aria-sort
       改读显示链 dispChain（本地档=sortSpec 原语义逐字节不变，remote+syncSort 接线档由宿主
       回填驱动），锁意图=aria-sort 机制在位不破 */
    expect(qrt, '内核表头 aria-sort').toContain(':aria-sort="sortable && chainCount > 0 && dispChain[0].f === c');
    expect(qrt, '内核表头 Enter').toContain('@keydown.enter.prevent.stop="onSort(i)"');
    expect(qrt, '内核表头 Space').toContain('@keydown.space.prevent.stop="onSort(i)"');
    expect(qrt, '内核表头 tabindex').toContain(':tabindex="sortable ? 0 : undefined"');
  });
});
