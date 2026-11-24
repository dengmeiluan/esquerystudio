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
       analyzer 档 al-analyzer-opts 原名原内容零改动（原锁意图=四输入全有候选，不回退）。
       升档 SuggestInput 后迁：datalist/list 字面换 SuggestInput 挂点锚（id-prefix 分表语义同源，
       四输入全有候选的锁意图不变） */
    expect((src.match(/<SuggestInput v-model="l\.analyzer"[^>]*:suggestions="analyzerSug" id-prefix="al-ana"/g) || []).length, 'analyzer 位 SuggestInput 在场且仅一份').toBe(1);
    expect((src.match(/<SuggestInput v-model="l\.tokenizer"[^>]*:suggestions="tokenizerSug" id-prefix="al-tok"/g) || []).length, 'tokenizer 位 SuggestInput 在场且仅一份').toBe(1);
    expect((src.match(/<SuggestInput v-model="l\.charFilter"[^>]*:suggestions="charFilterSug" id-prefix="al-cf"/g) || []).length, 'char_filter 位 SuggestInput 在场且仅一份').toBe(1);
    expect((src.match(/<SuggestInput v-model="l\.filter"[^>]*:suggestions="tokenFilterSug" id-prefix="al-tf"/g) || []).length, 'filter 位 SuggestInput 在场且仅一份').toBe(1);
  });

  it('候选源=共享表只读消费（560 同步更新：四表同源 import，不另造漂移表；562 同步更新：并 ANALYZER_COMPONENT_ZH 释义表 import，option 挂 title 单源）', () => {
    const src = read('../views/AnalyzerLabView.vue');
    expect(src, 'import 在场（dslCompletionContext 单一出处）')
      .toMatch(/import \{ BUILTIN_ANALYZERS, BUILTIN_TOKENIZERS, BUILTIN_CHAR_FILTERS, BUILTIN_TOKEN_FILTERS, ANALYZER_COMPONENT_ZH \} from '\.\.\/utils\/dslCompletionContext'/);
    /* 升档 SuggestInput 后迁：datalist option 的 v-for 换建议清单常量行锚（共享表直接 map，不另造漂移表） */
    expect(src, 'analyzer 候选直接消费共享表').toMatch(/const analyzerSug = BUILTIN_ANALYZERS\.map\(a => \(\{ key: a, meta: ANALYZER_COMPONENT_ZH\[a\] \|\| '' \}\)\)/);
    expect(src).toMatch(/const tokenizerSug = BUILTIN_TOKENIZERS\.map\(a => \(\{ key: a, meta: ANALYZER_COMPONENT_ZH\[a\] \|\| '' \}\)\)/);
    expect(src).toMatch(/const charFilterSug = BUILTIN_CHAR_FILTERS\.map\(a => \(\{ key: a, meta: ANALYZER_COMPONENT_ZH\[a\] \|\| '' \}\)\)/);
    expect(src).toMatch(/const tokenFilterSug = BUILTIN_TOKEN_FILTERS\.map\(a => \(\{ key: a, meta: ANALYZER_COMPONENT_ZH\[a\] \|\| '' \}\)\)/);
    /* 562 批语义保持：中文释义从 option title 迁弹层行尾 meta（表外键回落空=不显示，零扰动） */
    expect(src).toMatch(/meta: ANALYZER_COMPONENT_ZH\[a\] \|\| ''/);
  });
});

describe('B 组件挂载渲染锁（analyzerAdjustW2 同款设施）', () => {
  it('analyzer 位建议清单挂 BUILTIN_ANALYZERS 全量候选；SuggestInput 输入就位', async () => {
    // 升档 SuggestInput 后迁：候选源全量断言走 setupState 常量 + 输入在场锚
    const host = await mountView();
    const st = (host.firstElementChild as any).__vueParentComponent.setupState;
    expect(st.analyzerSug.map((s: { key: string }) => s.key), 'analyzer 候选=共享表全量').toEqual(BUILTIN_ANALYZERS);
    expect(st.analyzerSug.every((s: { meta: string }) => typeof s.meta === 'string'), '候选行尾中文释义 meta 单源').toBe(true);
    /* 默认 3 lane 全 analyzer 模式：三个 analyzer 建议输入全部就位 */
    const inputs = host.querySelectorAll<HTMLInputElement>('.al-lane-form input.al-ii');
    expect(inputs.length).toBe(3);
    for (const inp of inputs) expect(inp.getAttribute('role')).toBe('combobox');
  });

  it('lane 切 custom 模式：tokenizer/char_filter/filter 三输入各挂分表候选（560 分表语义保持；升档后模式经 setupState 直写）', async () => {
    const host = await mountView();
    const st = (host.firstElementChild as any).__vueParentComponent.setupState;
    st.lanes[0].mode = 'custom';
    await settle();
    /* lane0 转 custom：三输入（tokenizer/char_filter/filter）全部就位（原「每输入都有候选」意图） */
    const lane0Form = host.querySelector('.al-lane-form') as HTMLElement;
    const customInputs = lane0Form.querySelectorAll<HTMLInputElement>('input.al-ii');
    expect(customInputs.length, 'custom lane 三个输入全部在场').toBe(3);
    expect(st.tokenizerSug.map((s: { key: string }) => s.key)).toEqual(BUILTIN_TOKENIZERS);
    expect(st.charFilterSug.map((s: { key: string }) => s.key)).toEqual(BUILTIN_CHAR_FILTERS);
    expect(st.tokenFilterSug.map((s: { key: string }) => s.key)).toEqual(BUILTIN_TOKEN_FILTERS);
    /* 其余 lane analyzer 位保持（原 5 个计数拆解后语义保持） */
    const laneForms = host.querySelectorAll('.al-lane-form');
    expect(laneForms[1]!.querySelectorAll('input.al-ii').length, 'lane1 保持 analyzer 档单输入').toBe(1);
    expect(laneForms[2]!.querySelectorAll('input.al-ii').length, 'lane2 保持 analyzer 档单输入').toBe(1);
    expect((laneForms[1]!.querySelector('input.al-ii') as HTMLInputElement).placeholder).toContain('ik_max_word');
  });
});
