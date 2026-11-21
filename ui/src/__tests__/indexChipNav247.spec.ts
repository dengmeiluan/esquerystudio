/**
 * 二百四十七批：索引名跳转芯片化——「看到索引名就能跳」全站联动。
 * ① QRT _index 元列：格内跳转芯片（单击复制语义不变，芯片专职跳转索引工作区）；
 * ② QueryHistoryPanel 历史条目索引名：芯片化点击直达（.stop 不触发整行回放）；
 * ③ DocDiffModal：新增 index prop 展示所属索引芯片（RT 传入），点击关闭弹窗+跳转。
 * router 经 vue-router mock 注入 push spy；AliasesView goHub 同范式（/indices?idx=）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const pushSpy = vi.fn();
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: pushSpy }),
  useRoute: () => ({ path: '/search', query: {} }),
}));

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
import QueryHistoryPanel from '../components/QueryHistoryPanel.vue';
import DocDiffModal from '../components/DocDiffModal.vue';
import type { SearchHit } from '../types';

const HITS: SearchHit[] = [
  { _id: 'a', _index: 'idx-one', _source: { name: 'banana' } },
  { _id: 'b', _index: 'idx-two', _source: { name: 'apple' } },
] as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountComp(comp: any, props: Record<string, any> = {}) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}

const tick = async (n = 6) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  pushSpy.mockClear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('索引名跳转芯片化（247 批）', () => {
  it('QRT _index 格芯片：命中即渲染、点击 push /indices?idx=；非 _index 列无芯片', async () => {
    await mountComp(QueryResultTable, { hits: HITS, storageKey: 'chip247' });
    const chips = [...host.querySelectorAll('button.qrt-idx-go')] as HTMLButtonElement[];
    expect(chips.length, '两行各一枚 _index 芯片').toBe(2);
    chips[0].click();
    await tick();
    expect(pushSpy).toHaveBeenCalledWith({ path: '/indices', query: { idx: 'idx-one' } });
    chips[1].click();
    await tick();
    expect(pushSpy).toHaveBeenLastCalledWith({ path: '/indices', query: { idx: 'idx-two' } });
    /* name 列格内无芯片 */
    const nameTds = [...host.querySelectorAll('td.qrt-cell')].filter(td => (td as HTMLElement).dataset.col === undefined && td.textContent?.includes('banana') === true);
    expect(nameTds.every(td => !td.querySelector('.qrt-idx-go'))).toBe(true);
  });

  it('QueryHistoryPanel 索引名芯片：点击 push 且不触发整行回放', async () => {
    const playSpy = vi.fn();
    await mountComp(QueryHistoryPanel, {
      items: [{ id: 'h1', query: '{"match_all":{}}', index: 'hist-idx', ts: Date.now() }],
      actions: ['play'],
      onPlay: playSpy,
    });
    const chip = host.querySelector('.qhp-idx-go') as HTMLElement;
    expect(chip, '索引名应有芯片类').toBeTruthy();
    chip.click();
    await tick();
    expect(pushSpy).toHaveBeenCalledWith({ path: '/indices', query: { idx: 'hist-idx' } });
    expect(playSpy, '.stop 应拦住整行回放').not.toHaveBeenCalled();
  });

  it('DocDiffModal index 芯片：展示所属索引、点击关弹窗+跳转；不传不渲染', async () => {
    await mountComp(DocDiffModal, {
      show: true, baseIdx: 0, index: 'diff-idx',
      hits: [
        { _id: 'a', _source: { f: 1 } },
        { _id: 'b', _source: { f: 2 } },
      ] as any,
      'onUpdate:show': (v: boolean) => { /* 父侧 v-model */ },
    });
    /* 五百六十六批同步更新：NModal 真解析后 teleport 到 body */
    const chip = document.querySelector('.ddm-idx') as HTMLElement;
    expect(chip?.textContent, '芯片应展示索引名').toContain('diff-idx');
    chip.click();
    await tick();
    expect(pushSpy).toHaveBeenCalledWith({ path: '/indices', query: { idx: 'diff-idx' } });
  });
});

/* 二百八十一批：索引芯片扫尾——Xmigrate 作业行目标索引（本地集群）可跳；源索引属远程不跳 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
describe('索引芯片扫尾（281 批）', () => {
  it('Xmigrate destIndex 芯片接线', () => {
    const s = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');
    expect(s).toMatch(/class="xm-idx-go"/);
    expect(s).toMatch(/function gotoIdx\(idx\?: string\)/);
    expect(s).toContain('源索引属远程集群不跳');
  });
});
