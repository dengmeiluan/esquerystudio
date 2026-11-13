/**
 * 965：体检对比 diff 徽标色档语义分档——扁平 diff 对全部数值键统一「涨绿跌红」
 * （d.up ? 'g' : 'r'），而报告体多数数值指标是「越多越糟」（未分配分片/不健康
 * 索引/待处理任务/高负载节点）：未分配分片暴涨显示绿色徽标=把恶化读成改善。
 * 修法=色档随指标性质分档：score 类涨=改善（绿，保持）；已知集群健康量族
 * 涨=恶化（红）跌=缓解（绿，反转）；其余容量/结构量（节点数等）涨跌无好坏，
 * 中性档 n 不判方向。行为锚（挂载全真组件+种存档对，healthDiffNoise930 同款
 * 挂具范式）+源码锁（模板消费 tone、旧形态防回潮）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ARCHIVE_KEY, type ArchivedReport } from '../utils/reportArchive';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return { ...actual, api: { ...actual.api, healthReport: vi.fn() } };
});

import HealthReportView from '../views/HealthReportView.vue';

const src = readFileSync(join(__dirname, '../views/HealthReportView.vue'), 'utf-8');

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

function rowTone(host: HTMLElement, keyPart: string): { tone: string | null; label: string | null } {
  const rows = [...host.querySelectorAll('.hr-diff-row')];
  const row = rows.find((r) => r.querySelector('.hr-diff-k')?.textContent?.includes(keyPart));
  const pill = row?.querySelector('.hr-diff-pct');
  const tone = ['g', 'y', 'r', 'b', 'n'].find((t) => pill?.classList.contains(t)) ?? null;
  return { tone, label: pill?.textContent ?? null };
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.removeItem(ARCHIVE_KEY);
  sessionStorage.clear();
});

describe('HealthReportView diff 徽标色档语义（965）', () => {
  it('「越多越糟」族上涨显红：未分配分片暴涨不再读成改善（矿红证）', async () => {
    seedPair(
      { score: 86, generatedAt: '2026-10-20T20:00:00+08:00', summary: { status: 'green', unassigned: 20 } },
      { score: 86, generatedAt: '2026-10-20T21:00:00+08:00', summary: { status: 'green', unassigned: 60 } });
    const { app, host } = await mountView();
    const r = rowTone(host, 'unassigned');
    expect(r.label, '涨幅徽标在场').toContain('200%');
    expect(r.tone, '未分配分片 ↑200% = 恶化，显红').toBe('r');
    app.unmount();
  });

  it('「越多越糟」族下跌显绿：分片归位是缓解', async () => {
    seedPair(
      { score: 86, generatedAt: '2026-10-20T20:00:00+08:00', summary: { status: 'green', unassigned: 60 } },
      { score: 86, generatedAt: '2026-10-20T21:00:00+08:00', summary: { status: 'green', unassigned: 20 } });
    const { app, host } = await mountView();
    expect(rowTone(host, 'unassigned').tone, '未分配分片 ↓ = 缓解，显绿').toBe('g');
    app.unmount();
  });

  it('得分类涨=改善语义保持：score 上涨仍显绿', async () => {
    seedPair(
      { score: 70, generatedAt: '2026-10-20T20:00:00+08:00', summary: { status: 'green', unassigned: 0 } },
      { score: 95, generatedAt: '2026-10-20T21:00:00+08:00', summary: { status: 'green', unassigned: 0 } });
    const { app, host } = await mountView();
    expect(rowTone(host, 'score').tone, 'score ↑ = 改善，显绿保持').toBe('g');
    app.unmount();
  });

  it('得分类跌=恶化语义保持：score 下跌显红', async () => {
    seedPair(
      { score: 95, generatedAt: '2026-10-20T20:00:00+08:00', summary: { status: 'green', unassigned: 0 } },
      { score: 70, generatedAt: '2026-10-20T21:00:00+08:00', summary: { status: 'green', unassigned: 0 } });
    const { app, host } = await mountView();
    expect(rowTone(host, 'score').tone, 'score ↓ = 恶化，显红保持').toBe('r');
    app.unmount();
  });

  it('容量/结构量中性档：节点数变化不判好坏', async () => {
    seedPair(
      { score: 86, generatedAt: '2026-10-20T20:00:00+08:00', summary: { status: 'green', nodes: 3 } },
      { score: 86, generatedAt: '2026-10-20T21:00:00+08:00', summary: { status: 'green', nodes: 6 } });
    const { app, host } = await mountView();
    const r = rowTone(host, 'nodes');
    expect(r.label, '涨幅徽标仍在场（方向信息保留）').toContain('100%');
    expect(r.tone, '节点数 ↑ = 中性，不判红绿').toBe('n');
    app.unmount();
  });

  it('源码锁：diff 徽标消费 tone 分档，旧「涨绿跌红」二元形态防回潮', () => {
    expect(src).toContain(':tone="d.tone"');
    expect(src).not.toContain("d.up ? 'g' : 'r'");
  });
});
