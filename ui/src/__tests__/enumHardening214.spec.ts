/**
 * 2.1.4 全项目同类缺陷硬化：存量非法枚举偏好一律「读取侧归一」。
 *
 * 背景（2.1.1/2.1.3 复盘）：`ih.docs.view="bogus"` 曾让索引工作区表格空白；
 * 同类模式还在导出格式、监控时间范围/聚合方式、编辑器高度档与 useTierCycle
 * 的 ~20 个档位消费面上——坏值会原样进按钮文案/API 参数/CSS 长度，静默失真。
 * 修法统一为 normalizePrefEnum / tiers.includes 回退，底层落盘键不变。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import ResultTable from '../components/ResultTable.vue';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const live = readFileSync(join(__dirname, '../views/LiveDashboardView.vue'), 'utf-8');
const ov = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const tier = readFileSync(join(__dirname, '../composables/useTierCycle.ts'), 'utf-8');

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('2.1.4 非法枚举偏好读取侧归一（行为锁）', () => {
  it('RT 导出格式：存量 "bogus" 读取即回 CSV（按钮 aria-label 不再出现 BOGUS）', async () => {
    localStorage.setItem('esquerystudio.pref.rt.export.fmt', JSON.stringify('bogus'));
    const app = createApp({ setup: () => () => h(ResultTable as any, { hits: [{ _id: 'a', _source: { x: 1 } }], total: 1, index: 'i214', storageKey: 's214' }) });
    app.use(createPinia());
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const btn = [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('导出为'));
    expect(btn, '导出钮在场').toBeTruthy();
    expect(btn!.getAttribute('aria-label'), '坏值回 CSV').toContain('CSV');
    expect(btn!.getAttribute('aria-label'), '坏值不得进文案').not.toContain('BOGUS');
    app.unmount();
  });

  it('useTierCycle：越档值不喂给消费面（读取即回默认档，cycle 写回 tiers[0]）', () => {
    expect(tier).toMatch(/tiers\.includes\(raw\.value\) \? raw\.value : fallback/);
    expect(tier).toMatch(/const i = tiers\.indexOf\(raw\.value\)/);
  });
});

describe('2.1.4 三处枚举消费面接线（源码锁）', () => {
  it('监控时间范围/聚合方式：坏值不原样进 API', () => {
    expect(live).toMatch(/normalizePrefEnum\(mh2RangePref\.value, MH_RANGE_KEYS, '24h'\)/);
    expect(live).toMatch(/normalizePrefEnum\(mhAggPref\.value, \['avg', 'max'\] as const, 'avg'\)/);
    expect(ov).toMatch(/normalizePrefEnum\(mhRangePref\.value, MH_RANGE_KEYS, '24h'\)/);
  });

  it('编辑器高度档：坏值不再让四档无激活态、高度落空', () => {
    expect(dq).toMatch(/normalizePrefEnum\(editorHPref\.value, EDITOR_H_KEYS, 's'\)/);
    expect(ih).toMatch(/normalizePrefEnum\(editorHPref\.value, IH_EDITOR_H_KEYS, 's'\)/);
  });

  it('RT 导出格式：读取侧归一到五格式集合', () => {
    expect(rt).toMatch(/normalizePrefEnum\(expFmtPref\.value, EXPORT_FMT_KEYS, 'csv'\)/);
  });
});
