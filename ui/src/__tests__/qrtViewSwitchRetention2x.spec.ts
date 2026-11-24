/**
 * 产线实测：QRT 从 JSON/Tree/卡片切回「表格」需要重建整表（100×~20 单元格约 794ms）。
 * RT 早已用 v-show 保留表体；QRT 对齐为「隐藏不销毁」，切回是同一 DOM 节点、滚动位与
 * 渲染结果都不丢。源码锁 + 运行时节点身份双证。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

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

import QueryResultTable from '../components/QueryResultTable.vue';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

async function mountQrt() {
  document.body.appendChild(host);
  const app = createApp({ setup: () => () => h(QueryResultTable as any, {
    cols: ['name', 'age'],
    rows: [['banana', 2], ['apple', 3]],
    viewSeg: true,
    storageKey: 'switch-retain',
  }) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

function seg(label: string): HTMLButtonElement {
  return [...host.querySelectorAll('.qrt-view-seg button')]
    .find(b => b.textContent?.trim() === label) as HTMLButtonElement;
}

describe('QRT 视图切换保留表体', () => {
  it('切到 JSON 时表格隐藏不卸载，切回是同一节点且数据仍在', async () => {
    await mountQrt();
    const before = host.querySelector('.qrt-wrap') as HTMLElement;
    expect(before, '表格容器必须初始在场').toBeTruthy();
    expect(before.querySelectorAll('tbody tr').length).toBe(2);

    const json = seg('JSON');
    expect(json, 'JSON 档必须可达').toBeTruthy();
    json.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(host.querySelector('.qrt-alt-body'), 'JSON 视图体应在').toBeTruthy();
    const hidden = host.querySelector('.qrt-wrap') as HTMLElement;
    expect(hidden, '表格不得被卸载（否则切回要整表重建）').toBe(before);
    expect(hidden.style.display, '表格应为隐藏态').toBe('none');

    const table = seg('表格');
    table.click();
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const after = host.querySelector('.qrt-wrap') as HTMLElement;
    expect(after, '切回必须复用同一 DOM 节点').toBe(before);
    expect(after.style.display).not.toBe('none');
    expect(after.querySelectorAll('tbody tr').length, '行不得因切换丢失').toBe(2);
  });

  it('源码锁：qrt-wrap 走 v-show（RT 同款），不再 v-else-if 销毁', () => {
    expect(QRT).toContain('<div v-else v-show="!bodyHidden" ref="wrapRef" class="qrt-wrap"');
    expect(QRT).not.toContain('<div v-else-if="!bodyHidden" ref="wrapRef" class="qrt-wrap"');
    /* 表体隐藏时表格自己的回顶钮不得浮在 alt 视图上 */
    expect(QRT).toContain('<TableBacktop v-if="showTop && !bodyHidden"');
  });
});
