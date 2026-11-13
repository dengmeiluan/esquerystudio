/**
 * W2 批：AnalyzerLabView 结果区失控修复——
 *  ① token 区限高内滚（max-height 走 usePref al.toksH，默认 240；ik_max_word 几百 token 不再撑出一两屏）；
 *  ② token 密度二档（data-al-dense，紧凑=--fs-2xs，usePref al.dense）；
 *  ③ lane 比例（data-al-split 五五/四六两档，usePref al.laneSplit；525 批反转：两档降为
 *     恰好双栏时的预设，≥3 列回 auto-fit 修孤列，双栏连续调宽走 al.laneW 纵缝拖拽）。
 *
 * 设施：vue-router 轻 mock + 只 mock ../api（alTaHeightPref 同范式）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';

const routeMock = { path: '/analyzer-lab', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      analyzeText: vi.fn(() => Promise.resolve({ tokens: [{ token: 'elas', position: 0, start_offset: 0, end_offset: 4, type: 'ENGLISH' }] })),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterQuery: () => Promise.resolve({}),
      aliases: () => Promise.resolve([]),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import AnalyzerLabView from '../views/AnalyzerLabView.vue';

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountView() {
  const app = createApp({ render: () => h(AnalyzerLabView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function btn(host: ParentNode, sel: string): HTMLButtonElement {
  const b = host.querySelector<HTMLButtonElement>(sel);
  expect(b, sel + ' 必须在场').toBeTruthy();
  return b!;
}

/** 预置 3 lane 全部试跑出 token → .al-toks 渲染 */
async function runAllWithTokens(host: HTMLElement) {
  const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => b.textContent?.includes('全部试跑'));
  expect(run, '「全部试跑」必须在场').toBeTruthy();
  run!.click();
  await settle();
  return host.querySelectorAll('.al-toks');
}

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('W2 批：分词实验室结果区可调', () => {
  it('① token 区限高：默认内联 max-height 240px；高度档 240→360 即时生效+落盘', async () => {
    const host = await mountView();
    const toks = await runAllWithTokens(host);
    expect(toks.length, '3 lane 全部出 token 区').toBe(3);
    expect((toks[0] as HTMLElement).style.maxHeight).toBe('240px');
    btn(host, '[data-al-toks-h]').click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.al.toksH')).toBe('360');
    expect((host.querySelector('.al-toks') as HTMLElement).style.maxHeight).toBe('360px');
  });

  it('② 密度二档：默认标准；点紧凑 → dense 类+aria-pressed+落盘，再点回标准', async () => {
    const host = await mountView();
    const dense = btn(host, '[data-al-dense]');
    expect(dense.classList.contains('on')).toBe(false);
    dense.click();
    await settle();
    expect(localStorage.getItem('esquerystudio.pref.al.dense')).toBe('true');
    expect(dense.getAttribute('aria-pressed')).toBe('true');
    const toks = await runAllWithTokens(host);
    expect((toks[0] as HTMLElement).classList.contains('dense')).toBe(true);
  });

  /* 525 批反转：默认 3 lane 回 auto-fit（split-half 强 2 列曾让第 3 列折行成半宽孤列）；
     恰好双栏时预设档生效（split-half/4060），单 lane 回 auto-fit 语义不变 */
  it('③ lane 比例：默认 3 列 auto-fit（孤列修正）；双栏预设五五/四六+落盘；单列回退', async () => {
    const host = await mountView();
    const lanes = host.querySelector('.al-lanes')!;
    expect(lanes.className, '默认 3 列不再挂 split-（孤列修正）').not.toMatch(/split-/);
    /* 删到恰好 2 列：默认五五预设生效 */
    const lane = host.querySelector('.al-lane-hd .btn[aria-label="删除分词通道"]') as HTMLButtonElement;
    lane.click(); await settle();
    expect(host.querySelectorAll('.al-lane').length).toBe(2);
    expect(lanes.classList.contains('split-half'), '双栏默认五五预设').toBe(true);
    btn(host, '[data-al-split="4060"]').click();
    await settle();
    expect(lanes.classList.contains('split-4060')).toBe(true);
    expect(lanes.classList.contains('split-half')).toBe(false);
    expect(localStorage.getItem('esquerystudio.pref.al.laneSplit')).toBe(JSON.stringify('4060'));
    /* 单 lane 回退 auto-fit：删到只剩 1 列 */
    lane.click(); await settle();
    expect(host.querySelectorAll('.al-lane').length).toBe(1);
    expect(host.querySelector('.al-lanes')!.className).not.toMatch(/split-/);
  });
});
