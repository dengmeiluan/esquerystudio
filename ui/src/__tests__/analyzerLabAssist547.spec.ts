/**
 * 547 批轨1：AnalyzerLabView analyzer 族四输入接候选（原生 <datalist>，零依赖方案）。
 *
 * 基线：:101(analyzer)/:109(tokenizer)/:112(charFilter)/:115(filter) 四裸 input 零候选。
 * 共享表已备好：dslCompletionContext BUILTIN_ANALYZERS（9 项，含 ik 族）——只消费不改 util，
 * 不造新表。四 input 各挂 list 属性指向共享 datalist（analyzer/tokenizer/filter/char_filter
 * 同表：tokenizer 位内置名与 analyzer 名同源，BUILTIN_ANALYZERS 已含即直接用）。
 *
 * 锁两层：
 *  - 源码锚锁（flattenWave546 静态范式）：datalist 在场 + 四 input list 绑定 +
 *    BUILTIN_ANALYZERS import 在场（消费共享表，不另造漂移表）；
 *  - 组件挂载渲染锁（analyzerAdjustW2 同款设施：vue-router 轻 mock + 只 mock ../api）：
 *    datalist 渲染 9 option、analyzer 位 input list 属性生效、切 custom 模式后
 *    tokenizer/char_filter/filter 三 input 同样挂上（happy-dom：select 换值走 dispatchEvent）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS } from '../utils/dslCompletionContext';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

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

beforeEach(() => {
  while (apps.length) apps.pop()!.unmount();
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  for (const k of Object.keys(routeMock.query)) delete routeMock.query[k];
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('A 源码锚锁（静态断言，happy-dom 不挂载也成立）', () => {
  it('四张 datalist 各一份；四 input 各挂 list（560 同步更新：自定义组合三件套分表，analyzer 档不动）', () => {
    const src = read('../views/AnalyzerLabView.vue');
    /* 560 同步更新：原「四 input 同指 al-analyzer-opts」改为分表——tokenizer/char_filter/filter
       各指 BUILTIN_TOKENIZERS/CHAR_FILTERS/TOKEN_FILTERS 对应 datalist（候选各归其位），
       analyzer 档 al-analyzer-opts 原名原内容零改动（原锁意图=四输入全有候选，不回退） */
    expect((src.match(/<datalist id="al-analyzer-opts">/g) || []).length, 'analyzer datalist 在场且仅一份').toBe(1);
    expect(src, 'analyzer 位 input 挂 list').toMatch(/<input v-model="l\.analyzer"[^>]* list="al-analyzer-opts"/);
    expect(src, 'tokenizer 位 input 挂 list').toMatch(/<input v-model="l\.tokenizer"[^>]* list="al-tokenizer-opts"/);
    expect(src, 'char_filter 位 input 挂 list').toMatch(/<input v-model="l\.charFilter"[^>]* list="al-charfilter-opts"/);
    expect(src, 'filter 位 input 挂 list').toMatch(/<input v-model="l\.filter"[^>]* list="al-tokenfilter-opts"/);
    expect((src.match(/<datalist id="al-tokenizer-opts">/g) || []).length, 'tokenizer datalist 在场且仅一份').toBe(1);
    expect((src.match(/<datalist id="al-charfilter-opts">/g) || []).length, 'charfilter datalist 在场且仅一份').toBe(1);
    expect((src.match(/<datalist id="al-tokenfilter-opts">/g) || []).length, 'tokenfilter datalist 在场且仅一份').toBe(1);
  });

  it('候选源=共享表只读消费（560 同步更新：四表同源 import，不另造漂移表；562 同步更新：并 ANALYZER_COMPONENT_ZH 释义表 import，option 挂 title 单源）', () => {
    const src = read('../views/AnalyzerLabView.vue');
    expect(src, 'import 在场（dslCompletionContext 单一出处）')
      .toMatch(/import \{ BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS, ANALYZER_COMPONENT_ZH \} from '\.\.\/utils\/dslCompletionContext'/);
    expect(src, 'datalist option 直接消费共享表').toMatch(/v-for="a in BUILTIN_ANALYZERS"/);
    expect(src).toMatch(/v-for="a in BUILTIN_TOKENIZERS"/);
    expect(src).toMatch(/v-for="a in BUILTIN_CHAR_FILTERS"/);
    expect(src).toMatch(/v-for="a in BUILTIN_TOKEN_FILTERS"/);
    expect(src, '562 批：option 挂中文释义 title（表外键回落空串零扰动）').toMatch(/:title="ANALYZER_COMPONENT_ZH\[a\] \|\| ''"/);
  });
});

describe('B 组件挂载渲染锁（analyzerAdjustW2 同款设施）', () => {
  it('datalist 渲染 BUILTIN_ANALYZERS 全量 option；analyzer 位 input list 属性生效', async () => {
    const host = await mountView();
    const dl = host.querySelector('#al-analyzer-opts') as HTMLDataListElement;
    expect(dl, 'datalist 必须渲染').toBeTruthy();
    const opts = Array.from(dl.querySelectorAll('option')).map(o => o.getAttribute('value'));
    expect(opts).toEqual(BUILTIN_ANALYZERS);
    /* 默认 3 lane 全 analyzer 模式：三个 analyzer input 全部挂上同一 list */
    const inputs = host.querySelectorAll<HTMLInputElement>('input[list="al-analyzer-opts"]');
    expect(inputs.length).toBe(3);
    for (const inp of inputs) expect(inp.getAttribute('list')).toBe('al-analyzer-opts');
  });

  it('lane 切 custom 模式：tokenizer/char_filter/filter 三 input 各挂分表 list（560 同步更新：同表改分表；happy-dom：select 换值走 dispatchEvent）', async () => {
    const host = await mountView();
    const sel = host.querySelector('.al-lane-form select') as HTMLSelectElement;
    expect(sel, 'lane 模式 select 必须在场').toBeTruthy();
    sel.value = 'custom';
    sel.dispatchEvent(new Event('change'));
    await settle();
    /* 560 同步更新：lane0 转 custom 三 input 分表（al-tokenizer/charfilter/tokenfilter-opts），
       lane1/2 保持 analyzer（al-analyzer-opts）——原「同指一份 5 个」意图=每输入都有候选，
       分表后逐位锁各自的 list 属性 */
    const customInputs = (host.querySelector('.al-lane-form') as HTMLElement).querySelectorAll<HTMLInputElement>('input[list]');
    expect(customInputs.length, 'custom lane 三个 input（tokenizer/char_filter/filter）全部挂 list').toBe(3);
    expect(customInputs[0]!.getAttribute('list')).toBe('al-tokenizer-opts');
    expect(customInputs[1]!.getAttribute('list')).toBe('al-charfilter-opts');
    expect(customInputs[2]!.getAttribute('list')).toBe('al-tokenfilter-opts');
    /* 其余 lane analyzer 位全部挂 list（原 5 个计数拆解后语义保持） */
    const analyzerInputs = host.querySelectorAll<HTMLInputElement>('input[list="al-analyzer-opts"]');
    expect(analyzerInputs.length, 'analyzer 档 input 全部挂 al-analyzer-opts').toBe(2);
    /* 四 datalist 渲染各自共享表全量 option */
    expect(host.querySelector('#al-analyzer-opts')!.querySelectorAll('option').length).toBe(BUILTIN_ANALYZERS.length);
    expect(host.querySelector('#al-tokenizer-opts')!.querySelectorAll('option').length).toBe(BUILTIN_TOKENIZERS.length);
    expect(host.querySelector('#al-charfilter-opts')!.querySelectorAll('option').length).toBe(BUILTIN_CHAR_FILTERS.length);
    expect(host.querySelector('#al-tokenfilter-opts')!.querySelectorAll('option').length).toBe(BUILTIN_TOKEN_FILTERS.length);
  });
});
