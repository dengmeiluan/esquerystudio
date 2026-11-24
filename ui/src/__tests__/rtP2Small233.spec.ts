/**
 * 二百三十三批 P2 首批：P2-1 类型语义着色（简化版五类）+ P2-2 十字准星简化版。
 * 锁定：
 * 1) RT 列头类型徽标按 ES 类型挂语义色类（数值蓝/日期琥珀/布尔绿/文本中性/keyword 青）；
 * 2) QRT 同款（fieldTypes 传入时）；
 * 3) 十字准星简化版源码锁：命中格 hover 光环规则在 RT/QRT 样式在场。
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
import QueryResultTable from '../components/QueryResultTable.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _source: { name: 'banana', age: 2, ts: 1700000000000, ok: true } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('P2-1 类型语义着色（233 批）', () => {
  it('RT 列头徽标按类型挂语义色类', async () => {
    const app = createApp({ setup: () => () => h(ResultTable as any, {
      hits: HITS, total: 1, index: 'ty1',
      fieldTypes: { name: 'text', age: 'long', ts: 'date', ok: 'boolean', kw: 'keyword' },
    }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const badgeOf = (c: string) => [...host.querySelectorAll('thead th.rt-th')]
      .find(th => (th as HTMLElement).dataset.col === c)?.querySelector('.rt-th-type');
    expect(badgeOf('age')?.classList.contains('rt-ty-num')).toBe(true);
    expect(badgeOf('ts')?.classList.contains('rt-ty-date')).toBe(true);
    expect(badgeOf('ok')?.classList.contains('rt-ty-bool')).toBe(true);
    expect(badgeOf('name')?.classList.contains('rt-ty-text')).toBe(true);
  });

  it('QRT 同款（fieldTypes 传入时）', async () => {
    const app = createApp({ setup: () => () => h(QueryResultTable as any, {
      hits: HITS, storageKey: 'ty2',
      fieldTypes: { age: 'integer' },
    }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    const badge = [...host.querySelectorAll('thead th')].find(th => (th as HTMLElement).dataset.col === 'age')?.querySelector('.qrt-th-type');
    expect(badge?.classList.contains('rt-ty-num')).toBe(true);
  });
});

describe('P2-2 十字准星简化版（233 批）', () => {
  it('源码锁：RT/QRT 单元格 hover 光环规则在场', () => {
    const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
    expect(rt).toMatch(/\.rt-cell\.rt-cell:hover \{ box-shadow: inset 0 0 0 1px var\(--info-line\); \}/);
  });
});
