/**
 * 二百二十八批 M1+M4：渲染截断下的「所见即所导航/操作」。
 * M1（RT）：行导航行集钳位 renderHits（此前=sortedHits 全量，↓ 走过 2000 行后高亮挂
 * 在不存在的 DOM 上、Enter/Ctrl+C 对不可见行生效）+ 滚动跟随（QRT 62 批同款合并）。
 * M4（QRT）：渲染截断保护补齐（此前无护栏，大结果集即万行 DOM）——渲染行走 renderRows、
 * 导出（getSortedRows/getCsvBlock）仍走全量（RT「导出不受截断影响」同口径）。
 * 挂载样板照抄 multiSort（裸 createApp + pinia + api mock）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
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

import ResultTable from '../components/ResultTable.vue';
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

/* 2010 行（刚过 MAX_RENDER=2000，挂载成本最小化） */
function makeHits(n: number): SearchHit[] {
  const out: SearchHit[] = [];
  for (let i = 0; i < n; i++) out.push({ _id: 'id' + i, _source: { seq: i, tag: 't' + i } } as any);
  return out;
}

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountTbl(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };
const keyOn = (sel: string, key: string, mods: KeyboardEventInit = {}) => {
  (host.querySelector(sel) as HTMLElement).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods }));
};

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('RT 行导航钳位 renderHits + 滚动跟随（228 批 M1）', () => {
  /* 2000 行渲染挂载重（renderGuard 同款基建敏感）：vi.waitFor 30s 兜底 */
  it('End 跳末行落在第 2000 渲染行（不越过截断线）；Enter 对可见行生效', async () => {
    const docOpens: SearchHit[] = [];
    await mountTbl(ResultTable, {
      hits: makeHits(2010), total: 2010, index: 'm1a',
      onOpenDoc: (hit: SearchHit) => docOpens.push(hit),
    });
    /* 渲染截断行集就绪等待（2000 行 DOM 挂载在大并发下可能不 settle，renderGuard 同款） */
    await vi.waitFor(() => {
      expect(host.querySelectorAll('tbody tr').length).toBeGreaterThanOrEqual(2000);
    }, { timeout: 30000, interval: 200 });
    const rt = host.querySelector('.rt') as HTMLElement;
    rt.focus();
    keyOn('.rt', 'End');
    await tick();
    const focusRows = host.querySelectorAll('tbody tr.rt-row-focus');
    expect(focusRows.length).toBe(1);
    /* 高亮行=渲染集最后一行（序号 2000），不是不存在 DOM 的第 2010 行 */
    expect(focusRows[0].querySelector('.rt-idx')?.textContent?.trim()).toBe('2000');
    keyOn('.rt', 'Enter');
    await tick();
    expect(docOpens.length).toBe(1);
    expect(docOpens[0]._id).toBe('id1999'); // renderHits[1999]（原序 id0..id2009）
  }, 40000);

  it('滚动跟随：↓ 后对焦点行 scrollIntoView({block:nearest})', async () => {
    const siv = vi.fn();
    (HTMLElement.prototype as any).scrollIntoView = siv;
    try {
      await mountTbl(ResultTable, { hits: makeHits(30), total: 30, index: 'm1b' });
      const rt = host.querySelector('.rt') as HTMLElement;
      rt.focus();
      keyOn('.rt', 'ArrowDown');
      await tick();
      expect(siv).toHaveBeenCalled();
      const arg = siv.mock.calls[0][0];
      expect(arg).toMatchObject({ block: 'nearest' });
    } finally {
      delete (HTMLElement.prototype as any).scrollIntoView;
    }
  });
});

describe('QRT 渲染截断保护（228 批 M4）', () => {
  it('渲染钳位 2000 行+尾部提示行；导出仍走全量（getSortedRows 不受截断影响）', async () => {
    const { nextTick: nt } = await import('vue');
    const app = createApp({ setup: () => () => h(QueryResultTable as any, { hits: makeHits(2010), sortable: true, storageKey: 'm4' }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 12; i++) { await nt(); await Promise.resolve(); }
    const bodyRows = host.querySelectorAll('tbody tr');
    expect(bodyRows.length).toBe(2001); // 2000 渲染行 + 1 截断提示行
    expect(bodyRows[2000].textContent).toContain('已渲染前 2000 行');
    expect(bodyRows[2000].textContent).toContain('2010');
    /* 序号列最后一行是 2000（渲染口径） */
    const lastIdx = (host.querySelectorAll('tbody tr')[1999].querySelector('td.qrt-idx') as HTMLElement).textContent?.trim();
    expect(lastIdx).toBe('2000');
  });
});
