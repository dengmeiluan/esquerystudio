/**
 * 五百二十五批 W5b：LuceneInput 语法检查 2→6 + PIT filter DSL 前置闸/lint 划线。
 *
 * ① LuceneInput .li-syntax 纯扫描提示条增四规则（既有引号奇数/尾随大写 AND/OR/NOT 保留勿动）：
 *    ③ ()[]{} 栈扫描不平衡——配对错乱（(] 交错、多余右括号）与 ( 未闭合；
 *    ④ 字段缺值——行尾落在 `field:` 冒号后无值；
 *    ⑤ 未闭合区间——[ 或 { 开到行尾无闭合（③ 报配对错乱与 (，⑤ 报 [ { 行尾未闭合）；
 *    ⑥ 未知字段——`field:` 引用不在 mapping 清单（fields 未到位跳过；_ 元字段豁免；
 *      引号内短语先挖除再扫——phrase 内冒号不误报；引号未闭合时四新规则整体跳过）。
 * ② PitScrollView：doStart 前置闸（非法 JSON notify 指名 filter 输入 + return，不再进拉取循环
 *    抛笼统「拉取失败」）+ lintDsl(parsed,{fields}) 随输入重估注入 JsonArea.setMarkers
 *    （SearchSandboxView 用法同款：debounce 250ms、info→hint 降级、非法 JSON 不 lint）——
 *    挂组件需真实 ES 响应与轮询（pitShardDocHint 同因），接线走源码锁。
 *
 * LuceneInput 挂载范式照 luceneInputPenetration.spec（真实组件 + api.mappingDetail mock 出字段清单）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
    },
  };
});

import LuceneInput from '../components/LuceneInput.vue';
import { __clearFieldCache } from '../composables/useIndexFields';
import { __clearSuggestCache } from '../composables/useTermsSuggest';

const MAPPING = { raw: { properties: {
  status: { type: 'keyword' },
  message: { type: 'text' },
} } };

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

/** 挂真实 LuceneInput（index 有值 → fields 真实拉取），返回宿主与 v-model ref */
async function mountLi(initial = '') {
  const model = ref(initial);
  const app = createApp({
    setup() {
      return () => h(LuceneInput as any, {
        modelValue: model.value,
        index: 'a-idx',
        'onUpdate:modelValue': (v: string) => { model.value = v; },
      });
    },
  });
  apps.push(app);
  app.use(createPinia());
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host, model };
}

async function type(host: HTMLElement, v: string) {
  const el = host.querySelector<HTMLInputElement>('.li-inp')!;
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await settle();
}

const issueText = (host: HTMLElement) => host.querySelector('.li-syntax')?.textContent ?? '';

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  __clearSuggestCache();
  mappingDetailFn.mockReset().mockResolvedValue(MAPPING);
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('525 LuceneInput 语法检查 2→6', () => {
  it('既有两规则保留：引号奇数 / 尾随大写 AND/OR/NOT', async () => {
    const { host } = await mountLi();
    await type(host, 'message:"未闭合');
    expect(issueText(host)).toContain('引号未闭合');
    await type(host, 'status:active AND ');
    expect(issueText(host)).toContain('以 AND/OR/NOT 结尾');
  });

  it('③ 括号：配对错乱（(] 交错 / 多余右括号）与 ( 未闭合', async () => {
    const { host } = await mountLi();
    await type(host, '(status:a AND message:b');
    expect(issueText(host)).toContain('( 未闭合（缺 )）');
    await type(host, '(status:a] ');
    expect(issueText(host)).toContain('括号不匹配');
    await type(host, 'status:a) ');
    expect(issueText(host)).toContain('括号不匹配');
    await type(host, '(status:a) AND message:b');
    expect(issueText(host), '配对完整零提示').toBe('');
  });

  it('⑤ 未闭合区间：[ 与 { 行尾未闭合各点名', async () => {
    const { host } = await mountLi();
    await type(host, 'status:[active TO passive');
    expect(issueText(host)).toContain('[ 区间未闭合（缺 ]）');
    await type(host, 'status:{a TO b');
    expect(issueText(host)).toContain('{ 未闭合（缺 }）');
    await type(host, 'status:[10 TO 20]');
    expect(issueText(host), '闭合区间零提示').toBe('');
  });

  it('④ 字段缺值：行尾落在 field: 冒号后点名字段名', async () => {
    const { host } = await mountLi();
    await type(host, 'status:');
    expect(issueText(host)).toContain('字段「status」缺查询值（冒号后为空）');
    await type(host, 'status:active');
    expect(issueText(host), '补上值后零提示').toBe('');
  });

  it('⑥ 未知字段：不在清单点名 warn；清单字段/_ 元字段/短语内冒号不误报', async () => {
    const { host } = await mountLi();
    await type(host, 'ghost:active');
    expect(issueText(host)).toContain('未知字段「ghost」');
    await type(host, 'status:active AND message:hi');
    expect(issueText(host), '清单内字段零提示').toBe('');
    await type(host, '_exists_:status');
    expect(issueText(host), '_ 元字段豁免').toBe('');
    await type(host, 'message:"a:b c"');
    expect(issueText(host), '短语内冒号不误报（闭合短语挖除后扫描）').toBe('');
    await type(host, 'message:"a:b');
    expect(issueText(host), '引号未闭合时新四规则跳过，不叠加噪音').toContain('引号未闭合');
    expect(issueText(host)).not.toContain('未知字段');
  });

  it('零请求零阻塞：提示条只读不拦输入、不改值、不关弹层契约（提示随输入实时增减）', async () => {
    const { host } = await mountLi();
    await type(host, 'ghost:x');
    expect(issueText(host)).toContain('未知字段「ghost」');
    await type(host, 'status:fixed');
    expect(issueText(host), '换成清单内字段后实时消减').toBe('');
  });
});

describe('525 PIT filter DSL 前置闸 + lint 划线（源码锁，pitShardDocHint 同因不挂组件）', () => {
  const src = readFileSync(join(__dirname, '../views/PitScrollView.vue'), 'utf-8');

  it('doStart 前置闸：非法 JSON notify 指名 filter 输入并 return，不进拉取态', () => {
    expect(src).toContain('if (filterDsl.value.trim()) {');
    expect(src).toContain('try { JSON.parse(filterDsl.value.trim()); }');
    expect(src).toContain('「filter DSL（可选）」不是合法 JSON');
    /* 前置闸在 running 置位之前（return 时拉取态未开启） */
    const gateAt = src.indexOf('「filter DSL（可选）」不是合法 JSON');
    const runningAt = src.indexOf('running.value = true;');
    expect(gateAt).toBeGreaterThan(-1);
    expect(runningAt).toBeGreaterThan(gateAt);
  });

  it('lintDsl + JsonArea.setMarkers 划线接线（SearchSandboxView 同款：debounce/info 降级/合法对象口径）', () => {
    expect(src).toContain("import { lintDsl } from '../utils/dslLint';");
    expect(src).toContain('ref="ptJaRef"');
    expect(src).toContain('ptJaRef.value?.setMarkers?.(');
    expect(src).toContain("f.severity === 'info' ? 'hint' as const : f.severity");
    expect(src).toContain('lintDsl(o, { fields: assistFields.value })');
    /* 非法 JSON 不 lint（清 marker）+ debounce 250ms（防每敲一键全量 findMatches）
       五百三十一批：手写 setTimeout 防抖换 useDebounceFn 统一件（250ms 同口径，卸载自动清 timer） */
    expect(src).toContain('ptJaRef.value?.setMarkers?.([])');
    expect(src).toContain("import { useDebounceFn } from '../composables/useDebounceFn'");
    expect(src).toMatch(/useDebounceFn\(\(\) => \{[\s\S]+?\}, 250\)/);
    /* parsedFilter 合法对象口径与 SearchSandboxView 同款 */
    expect(src).toMatch(/typeof o === 'object' && !Array\.isArray\(o\) \? o : null/);
  });
});
