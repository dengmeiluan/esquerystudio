/**
 * 【W3b】BoostTunerView：
 *  ① 字段权重行 FieldPicker text/keyword 置顶（multi_match 打分字段以文本类为主）——
 *     挂载断言最终 DOM：弹层组头 text 在前、候选序与字母序相反可辨；
 *  ② 死 CSS .bt-hd-tt 删除（模板零引用）；font-weight 700/800 收敛 650 —— 源码锁。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const routeMock = { path: '/boost-tuner', query: {} as Record<string, any> };
vi.mock('vue-router', () => ({
  useRoute: () => routeMock,
  useRouter: () => ({ push: vi.fn() }),
}));

const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      searchRaw: () => Promise.resolve({ hits: { hits: [] } }),
      aliases: () => Promise.resolve([]),
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      clusterIndices: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import BoostTunerView from '../views/BoostTunerView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

const MAPPING = { raw: { properties: { a_kw: { type: 'keyword' }, z_text: { type: 'text' }, n_num: { type: 'long' } } } };

async function mountView() {
  const app = createApp({ render: () => h(BoostTunerView as any) });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
  history.replaceState(null, '', '#/?idx=logs-x');
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
  history.replaceState(null, '', '#/');
});

describe('BoostTuner 字段权重行 text/keyword 置顶（W3b）', () => {
  it('加字段后 FieldPicker 弹层 text 组头在前、候选序与字母序相反可辨（keyword a_kw 不再第一）', async () => {
    const host = await mountView();
    (host.querySelector('.bt-add') as HTMLElement).click();
    await settle();
    const inp = host.querySelector('.bt-fname .fxp-inp') as HTMLInputElement;
    expect(inp, '字段权重行渲染 FieldPicker').toBeTruthy();
    inp.dispatchEvent(new Event('focus'));
    await settle();
    const groups = Array.from(document.body.querySelectorAll<HTMLElement>('.fxp-gh')).map(el => el.textContent || '');
    const items = Array.from(document.body.querySelectorAll<HTMLElement>('.fxp-item .fxp-name')).map(el => el.textContent || '');
    /* 558b 同步更新：组头人话词面升级（GH_LABEL→FIELD_TYPE_ZH 兜底），text→文本 */
    expect(groups[0], 'text 组头置顶').toBe('文本 字段');
    expect(items[0], 'z_text（text）先于 a_kw（keyword），字母序反转可辨置顶').toContain('z_text');
    expect(items).toContain('a_kw');
  });

  it('死 CSS .bt-hd-tt 退役；字重 700/800 收敛 650（源码锁）', () => {
    const v = readFileSync(join(__dirname, '../views/BoostTunerView.vue'), 'utf-8');
    expect(v, '模板零引用的死选择器删除').not.toContain('.bt-hd-tt');
    /* 五百二十五批同步更新：权重行 v-for 改过滤行集 x={f,i}（行级停用/名字过滤），v-model 变量随之 */
    expect(v).toMatch(/<FieldPicker v-model="x\.f\.name" :index="index" placeholder="字段名" class="bt-fname" :type-priority="\['text', 'keyword'\]" @picked="onTune" \/>/);
    expect(v, '无 700/800 残留').not.toMatch(/font-weight: *(700|800)\b/);
    expect(v).toMatch(/\.bt-new \{[^}]*font-weight: 650/);
  });
});
