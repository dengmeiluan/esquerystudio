/**
 * 二百五十八批：RT/QRT 长列表回顶钮。
 * 滚过 600px（约一屏）出现悬浮「回顶」，点击平滑归顶并消失——2000 行渲染下
 * 「滚到底→回顶」是最高频痛点操作。行为锁：scroll 驱动显隐 + 点击归位。
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

const HITS: SearchHit[] = Array.from({ length: 5 }, (_, i) => ({ _id: 'r' + i, _source: { name: 'n' + i } })) as any;

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

async function mountComp(comp: any, props: Record<string, any>) {
  const app = createApp({ setup: () => () => h(comp as any, props) });
  app.use(createPinia());
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
}
const tick = async (n = 4) => { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } };

function scrollOf(el: HTMLElement, top: number) {
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll', { bubbles: true }));
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  host.innerHTML = '';
});

describe('长列表回顶钮（258 批）', () => {
  it('RT：浅滚不出现；滚过 600px 出现；点击归顶并消失', async () => {
    await mountComp(ResultTable, { hits: HITS, total: 5, index: 'bt258' });
    const wrap = host.querySelector('.rt-wrap') as HTMLElement;
    expect(wrap, '滚动容器在位').toBeTruthy();
    scrollOf(wrap, 300);
    await tick();
    expect(host.querySelector('.rt-backtop'), '浅滚不出现').toBeNull();
    scrollOf(wrap, 900);
    await tick();
    const btn = host.querySelector('.rt-backtop') as HTMLButtonElement;
    expect(btn, '滚过 600px 出现').toBeTruthy();
    /* happy-dom 的 scrollTo 是 no-op——改锁调用参数（真浏览器行为=平滑归顶） */
    const spy = vi.spyOn(wrap, 'scrollTo').mockImplementation(() => {});
    btn.click();
    await tick();
    expect(spy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(host.querySelector('.rt-backtop'), '归顶后消失').toBeNull();
  });

  it('QRT：同语义（滚过出现/点击归顶消失）', async () => {
    await mountComp(QueryResultTable, { hits: HITS, storageKey: 'bt258q' });
    const wrap = host.querySelector('.qrt-wrap') as HTMLElement;
    scrollOf(wrap, 1200);
    await tick();
    const btn = host.querySelector('.qrt-backtop') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    const spy = vi.spyOn(wrap, 'scrollTo').mockImplementation(() => {});
    btn.click();
    await tick();
    expect(spy).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
    expect(host.querySelector('.qrt-backtop')).toBeNull();
  });
});
