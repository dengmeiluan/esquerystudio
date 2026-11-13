/**
 * 930：体检对比 diff 的元数据噪声治理——报告体自带 generatedAt（生成时间戳，每次必变），
 * 参与扁平 diff 后任何两份报告恒有 ≥1 项「变化」：摘要计数恒被噪声污染、
 * 「两份报告内容完全一致」的正向反馈永不出现。修法=diffItems 排除 generatedAt
 * （生成时间是报告元数据非集群状态），真实状态键变化照常列出。
 * 行为锚（挂载全真组件+种存档对，弹层 spec 同款范式）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ARCHIVE_KEY, type ArchivedReport } from '../utils/reportArchive';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, healthReport: vi.fn() } };
});

import HealthReportView from '../views/HealthReportView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

function seedPair(baseData: any, cmpData: any) {
  const now = Date.now();
  const arr: ArchivedReport[] = [
    { ts: now - 3600e3, score: 86, data: cmpData },
    { ts: now - 7200e3, score: 86, data: baseData },
  ];
  localStorage.setItem(ARCHIVE_KEY, JSON.stringify(arr));
  /* 对比卡在 hr-body 内（v-if="data"）：种一份「上次报告」让报告区渲染 */
  sessionStorage.setItem('esquerystudio.health-report.last', JSON.stringify(cmpData));
}

async function mountView() {
  const pinia = createPinia();
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(HealthReportView) });
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.removeItem(ARCHIVE_KEY);
  sessionStorage.clear();
});

describe('HealthReportView diff 元数据噪声（930）', () => {
  it('两份报告仅差 generatedAt：diff 计 0 项变化，完全一致正向反馈在场', async () => {
    seedPair(
      { score: 86, generatedAt: '2026-10-16T20:00:00+08:00', summary: { status: 'green', unassigned: 0 } },
      { score: 86, generatedAt: '2026-10-16T21:00:00+08:00', summary: { status: 'green', unassigned: 0 } });
    const { app, host } = await mountView();
    expect(host.querySelector('.hr-diff'), 'archive>=2 出卡').toBeTruthy();
    expect(host.textContent).toContain('0 项变化');
    expect(host.textContent).toContain('两份报告内容完全一致');
    expect(host.querySelectorAll('.hr-diff-row').length).toBe(0);
    app.unmount();
  });

  it('真实状态键变化照常列出：generatedAt 不再以噪声行混入', async () => {
    seedPair(
      { score: 86, generatedAt: '2026-10-16T20:00:00+08:00', summary: { status: 'green', unassigned: 3 } },
      { score: 86, generatedAt: '2026-10-16T21:00:00+08:00', summary: { status: 'green', unassigned: 0 } });
    const { app, host } = await mountView();
    const rows = host.querySelectorAll('.hr-diff-row');
    expect(rows.length, '仅 summary.unassigned 一行（generatedAt 不计）').toBe(1);
    expect(rows[0].querySelector('.hr-diff-k')?.textContent).toContain('unassigned');
    expect(host.textContent).not.toContain('generatedAt');
    app.unmount();
  });
});
