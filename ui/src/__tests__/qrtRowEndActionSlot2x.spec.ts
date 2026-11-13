/**
 * BrowserView「操作」列实测：QRT 内建行尾复制/展开是 absolute 右缘，会压在宿主
 * #cell-操作 的「更多」上（elementFromPoint 命中 more trigger）。宿主动作列接管时退役。
 * 运行时锁两态：无末列槽 → 内建钮在；末列有 #cell- 槽 → 内建钮不渲染、槽内容接管。
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';

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

import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import QueryResultTable from '../components/QueryResultTable.vue';

const QRT = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');

async function mountQrt(slots: Record<string, any> = {}) {
  document.body.appendChild(host);
  const app = createApp({
    setup: () => () => h(QueryResultTable as any, {
      cols: ['A', 'B'],
      rows: [['a1', 'b1']],
      storageKey: 'rowend-slot',
    }, slots),
  });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('QRT 行尾快捷钮 vs 宿主动作列', () => {
  it('最后一列无 #cell- 槽：内建行尾复制/展开照常渲染', async () => {
    await mountQrt();
    const last = host.querySelector('tbody tr td:last-child');
    expect(last?.querySelector('.qrt-row-copy'), '复制钮应在末列格内').not.toBeNull();
    expect(last?.querySelector('.qrt-row-expand'), '展开钮应在末列格内').not.toBeNull();
  });

  it('最后一列有 #cell- 槽：内建钮退役，槽内容独占末列', async () => {
    await mountQrt({ 'cell-B': () => h('button', { class: 'host-more' }, '更多') });
    const last = host.querySelector('tbody tr td:last-child');
    expect(last?.querySelector('.host-more'), '槽内容应渲染在末列').not.toBeNull();
    expect(last?.querySelector('.qrt-row-copy'), '复制钮不得压在宿主动作上').toBeNull();
    expect(last?.querySelector('.qrt-row-expand'), '展开钮不得压在宿主动作上').toBeNull();
  });

  it('源码锁：两枚内建钮都带宿主动作槽门控', () => {
    expect(QRT).toContain('const lastColHasCellSlot = computed');
    expect((QRT.match(/ci === row\.length - 1 && !lastColHasCellSlot/g) || []).length).toBe(2);
  });
});
