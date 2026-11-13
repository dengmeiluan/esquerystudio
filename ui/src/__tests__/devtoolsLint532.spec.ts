/**
 * 五百三十二批：DevTools lint 深化（工蚁2 · DevTools 深化批）。
 *  ① dtLint 档路由五分派（视图级挂载 + 底部条渗透）：
 *     search→lintDsl（root-key-typo）/ bulk（_bulk→none 档）→ndjsonLint 配对告警 /
 *     settings→lintSettingsBody / mapping→lintMappingBody / 其他（doc 档）→[] 恒静默；
 *  ② bodyLang computed：_bulk / _msearch 族→ndjson、其余→json（Monaco stub language prop 渗透）；
 *  ③ lintSettingsBody / lintMappingBody 纯函数基本用例（键拼写 + 数值值型 + 宁少勿误报豁免）；
 *  ④ P2-3 跨 Tab 历史汇聚：写历史镜像 es_devtools_hist_all + 「全部」chip 跨 Tab 渲染 + fill 回当前 Tab。
 * mount 范式同 devtoolsSmartAssist.spec（Monaco stub 捕获 props/emit；stub 无 setMarkers 出口 →
 * finding 全量降级底部条——恰好成为档路由的观测面；ndjson-pair 无锚点亦降级底部条）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const rawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: (...args: any[]) => rawFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      /* 防御性 stub 挡真实 fetch 噪音（store.loadIndices / useIndexFields 链路） */
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'dslAssist', 'readonly'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) { monacoCaps.push({ props, emit }); return {}; },
    template: '<div class="monaco-stub"></div>',
  },
}));
/* body 编辑器恰为首个捕获（响应 Monaco v-if cur.result，run 之后才挂） */
const bodyCap = () => monacoCaps[0];

import DevToolsView from '../views/DevToolsView.vue';
import { lintSettingsBody, lintMappingBody } from '../utils/dslLint';
import { ndjsonLint } from '../utils/bulkNdjson';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
const me = readFileSync(join(__dirname, '../components/MonacoEditor.vue'), 'utf-8');

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountView(comp: any, hash = '#/') {
  location.hash = hash;
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/update-by-query', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, pinia };
}

const dtInp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.dt-path .epi-inp')!;
async function type(el: HTMLInputElement, val: string) {
  el.value = val;
  el.dispatchEvent(new Event('input'));
  await settle();
}
const lintBar = (host: ParentNode) => host.querySelector<HTMLElement>('.dt-lint');

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  rawFn.mockReset().mockResolvedValue({ status: 200, body: '{"ok":true}' });
  monacoCaps.length = 0;
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('532 dtLint 档路由五分派（视图级 · 底部条观测）', () => {
  it('① search 档走 lintDsl：根键笔误进底部条，语言仍 json', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/orders/_search');
    bodyCap().emit('update:modelValue', '{"fromm":0}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, 'search 档应有 lint 底部条').toBeTruthy();
    expect(bar!.textContent).toContain('fromm');
    expect(bar!.textContent).toContain('from');
    expect(bodyCap().props.language, 'search 档语言保持 json').toBe('json');
  });

  it('② bulk 档走 ndjsonLint：配对告警进底部条（无锚点 finding 降级不静默丢）+ bodyLang=ndjson', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/orders/_bulk');
    expect(bodyCap().props.language, '_bulk 路径 body 语言切 ndjson').toBe('ndjson');
    bodyCap().emit('update:modelValue', '{"index":{}}\n{"index":{}}\n{"a":1}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, 'bulk 档配对告警应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('数量不匹配');
  });

  it('③ settings 档走 lintSettingsBody：设置键笔误进底部条', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/idx/_settings');
    bodyCap().emit('update:modelValue', '{"index":{"number_of_shardss":1}}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, 'settings 档应有 lint 底部条').toBeTruthy();
    expect(bar!.textContent).toContain('number_of_shardss');
  });

  it('④ mapping 档走 lintMappingBody：字段类型笔误进底部条', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/idx/_mapping');
    bodyCap().emit('update:modelValue', '{"properties":{"a":{"type":"kyword"}}}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, 'mapping 档应有 lint 底部条').toBeTruthy();
    expect(bar!.textContent).toContain('kyword');
  });

  it('⑤ 其他档（doc：/idx/_doc/1）恒静默——任何 body 不出条', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/idx/_doc/1');
    expect(bodyCap().props.language, '非 _bulk 语言保持 json').toBe('json');
    bodyCap().emit('update:modelValue', '{"weird_root":true}');
    await settle(6);
    expect(lintBar(host), 'doc 档不出 lint 底部条').toBeNull();
  });

  it('⑥ bodyLang 随路径切换往返：_bulk/_msearch→ndjson、改回 search→json', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/_bulk');
    expect(bodyCap().props.language).toBe('ndjson');
    /* 1439：_msearch 族体也是 NDJSON（每行一个独立 JSON） */
    await type(dtInp(host), '/_msearch');
    expect(bodyCap().props.language, '_msearch 应切 ndjson').toBe('ndjson');
    await type(dtInp(host), '/_search');
    expect(bodyCap().props.language, '切回 search 档语言回 json').toBe('json');
  });

  it('⑦ 结构化体根键校验：_delete_by_query 的 sort 进底部条；合法体静默', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/orders/_delete_by_query');
    bodyCap().emit('update:modelValue', '{"sort":[]}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, '按查询删除体的非法根键应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('按查询删除体');
    expect(bar!.textContent).toContain('sort');
    bodyCap().emit('update:modelValue', '{"query":{"match_all":{}},"max_docs":10}');
    await settle(6);
    expect(lintBar(host), '合法体应静默').toBeNull();
  });

  it('⑧ rollover conditions 笔误：max_doc → 建议 max_docs', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/logs/_rollover');
    bodyCap().emit('update:modelValue', '{"conditions":{"max_doc":10}}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, '滚动条件笔误应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('滚动条件');
    expect(bar!.textContent).toContain('max_docs');
  });

  it('⑨ 负控：同样 {"sort":[]} 在 _search 档不产生结构化体告警（sort 是合法 search 根键）', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/orders/_search');
    bodyCap().emit('update:modelValue', '{"sort":[]}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar?.textContent ?? '').not.toContain('按查询删除体');
  });

  it('⑩ _mget 体根键校验：ide → 未知根键 + 列出 docs/ids；合法体静默', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/logs/_mget');
    bodyCap().emit('update:modelValue', '{"ide":["1"]}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, '_mget 非法根键应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('_mget 体');
    expect(bar!.textContent).toContain('ids');
    bodyCap().emit('update:modelValue', '{"ids":["1"]}');
    await settle(6);
    expect(lintBar(host), '合法体应静默').toBeNull();
  });

  it('⑪ 存储脚本体（PUT /_scripts/<id>）：非法根键进底部条；合法体静默', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/_scripts/my-script');
    const sel = host.querySelector<HTMLSelectElement>('select.dt-method')!;
    sel.value = 'PUT';
    sel.dispatchEvent(new Event('change'));
    await settle();
    bodyCap().emit('update:modelValue', '{"scriptt":{"lang":"painless"}}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, '存储脚本体非法根键应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('存储脚本体');
    bodyCap().emit('update:modelValue', '{"script":{"lang":"painless","source":"1"}}');
    await settle(6);
    expect(lintBar(host), '合法体应静默').toBeNull();
  });

  it('⑫ 别名动作体根键校验：action → 最接近 actions；合法体静默', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/_aliases');
    bodyCap().emit('update:modelValue', '{"action":[{"add":{"index":"a","alias":"b"}}]}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, '别名动作体根键笔误应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('别名动作体');
    expect(bar!.textContent).toContain('actions');
    bodyCap().emit('update:modelValue', '{"actions":[{"add":{"index":"a","alias":"b"}}]}');
    await settle(6);
    expect(lintBar(host), '合法体应静默').toBeNull();
  });

  it('⑬ _msearch 头体对：落单的头行仍出 NDJSON 配对告警', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/_msearch');
    bodyCap().emit('update:modelValue', '{"index":"a"}\n{"query":{"match_all":{}}}\n{"index":"b"}');
    await settle(6);
    const bar = lintBar(host);
    expect(bar, 'msearch 落单头行应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('数量不匹配');
  });

  it('⑭ NDJSON 行键 lint：_msearch 头行 indxe / _bulk 动作 indx 进底部条', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/_msearch');
    bodyCap().emit('update:modelValue', '{"indxe":"a"}\n{"query":{}}');
    await settle(6);
    let bar = lintBar(host);
    expect(bar, 'msearch 头行拼错应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('indxe');
    expect(bar!.textContent).toContain('index');
    await type(dtInp(host), '/idx/_bulk');
    bodyCap().emit('update:modelValue', '{"indx":{"_index":"a"}}');
    await settle(6);
    bar = lintBar(host);
    expect(bar, 'bulk 动作行拼错应有底部条').toBeTruthy();
    expect(bar!.textContent).toContain('indx');
  });
});

describe('532 lintSettingsBody（纯函数）', () => {
  it('根键笔误（setings→settings）报 settings-key，anchor=拼错键', () => {
    const fs = lintSettingsBody({ setings: { number_of_shards: 1 } });
    const f = fs.find(x => x.rule === 'settings-key');
    expect(f, '应产出 settings-key').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('setings');
    expect(f!.nth).toBe(0);
    expect(f!.suggestion).toContain('settings');
  });

  it('容器内设置键笔误（number_of_shardss）报最近键候选', () => {
    const fs = lintSettingsBody({ index: { number_of_shardss: 1 } });
    const f = fs.find(x => x.rule === 'settings-key');
    expect(f, '应产出 settings-key').toBeTruthy();
    expect(f!.message).toContain('number_of_shardss');
    expect(f!.suggestion).toContain('number_of_shards');
  });

  it('数值键收非数值（"abc"）报 settings-value error；数字串合法不报', () => {
    const bad = lintSettingsBody({ index: { max_result_window: 'abc' } });
    const f = bad.find(x => x.rule === 'settings-value');
    expect(f, '应产出 settings-value').toBeTruthy();
    expect(f!.severity).toBe('error');
    expect(f!.message).toContain('max_result_window');
    expect(lintSettingsBody({ index: { number_of_shards: '3' } })).toHaveLength(0);
  });

  it('合法 body 零误报：动态键/静态键/时间值/analysis 通配段/create-index 三容器', () => {
    expect(lintSettingsBody({ index: { refresh_interval: '30s' } })).toHaveLength(0);
    expect(lintSettingsBody({ index: { number_of_shards: 3, codec: 'best_compression' } })).toHaveLength(0);
    expect(lintSettingsBody({ settings: { analysis: { analyzer: { my_a: { type: 'custom', tokenizer: 'standard' } } } } })).toHaveLength(0);
    expect(lintSettingsBody({ settings: { number_of_shards: 1 }, mappings: { properties: { a: { type: 'keyword' } } }, aliases: {} })).toHaveLength(0);
  });

  it('目录外彻底未知键宁少勿误报（编辑距离 >2 不提示）；非对象输入 []', () => {
    expect(lintSettingsBody({ index: { totally_unknown_setting_xyz: 1 } })).toHaveLength(0);
    expect(lintSettingsBody('not-an-object')).toHaveLength(0);
    expect(lintSettingsBody(null)).toHaveLength(0);
    expect(lintSettingsBody([1, 2])).toHaveLength(0);
  });
});

describe('532 lintMappingBody（纯函数）', () => {
  it('根键笔误（propertiess→properties）报 mapping-key', () => {
    const fs = lintMappingBody({ propertiess: {} });
    const f = fs.find(x => x.rule === 'mapping-key');
    expect(f, '应产出 mapping-key').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('propertiess');
  });

  it('字段类型笔误（kyword→keyword）报 mapping-type，anchor 钉 type 键', () => {
    const fs = lintMappingBody({ properties: { a: { type: 'kyword' } } });
    const f = fs.find(x => x.rule === 'mapping-type');
    expect(f, '应产出 mapping-type').toBeTruthy();
    expect(f!.severity).toBe('warning');
    expect(f!.anchor).toBe('type');
    expect(f!.nth).toBe(0);
    expect(f!.path).toBe('a');
    expect(f!.suggestion).toContain('keyword');
  });

  it('子字段 fields 与 create-index mappings 包裹形态同判；runtime 同吃', () => {
    const sub = lintMappingBody({ properties: { a: { fields: { raw: { type: 'kyword' } } } } });
    expect(sub.find(x => x.rule === 'mapping-type')!.path).toBe('a.raw');
    const wrapped = lintMappingBody({ mappings: { properties: { a: { type: 'kyword' } } } });
    expect(wrapped.find(x => x.rule === 'mapping-type')).toBeTruthy();
    const rt = lintMappingBody({ runtime: { dow: { type: 'kyword' } } });
    expect(rt.find(x => x.rule === 'mapping-type')).toBeTruthy();
  });

  it('合法类型零误报；插件型未知类型（编辑距离 >2）宁少勿误报不报', () => {
    expect(lintMappingBody({ properties: { a: { type: 'keyword' }, b: { type: 'date', c: { type: 'nested' } } } })).toHaveLength(0);
    expect(lintMappingBody({ properties: { a: { type: 'my_custom_plugin_type' } } })).toHaveLength(0);
    expect(lintMappingBody(null)).toHaveLength(0);
  });
});

describe('532 P2-3 跨 Tab 历史汇聚（视图级）', () => {
  it('写历史镜像 es_devtools_hist_all:{target}；「全部」chip 跨 Tab 渲染；fill 回当前 Tab', async () => {
    const { host } = await mountView(DevToolsView, '#/devtools');
    await type(dtInp(host), '/_search');
    bodyCap().emit('update:modelValue', '{"size":1}');
    bodyCap().emit('execute'); /* run（api.raw mock 成功） */
    await settle(10);
    const mirror = JSON.parse(sessionStorage.getItem('es_devtools_hist_all:host') || '[]');
    expect(mirror.length, '写历史必须镜像进汇聚键').toBe(1);
    expect(mirror[0].method).toBe('GET');
    expect(mirror[0].path).toBe('/_search');
    expect(mirror[0].ok).toBe(true);
    expect(typeof mirror[0].ts).toBe('number');
    expect(typeof mirror[0].took).toBe('number');

    /* 新 Tab：本 Tab 历史为空，切「全部」chip 后汇聚条目可见。
       五百六十五批同步更新（击穿者：565 件④③——历史工具行行尾并列表限高三档钮）：chip 计数
       2→3（本Tab/全部/限高），「全部」仍居下标 1，点击选择语义零变 */
    (host.querySelector('.dt-tab-add') as HTMLElement).click();
    await settle(4);
    const chips = host.querySelectorAll<HTMLButtonElement>('.dt-hist-chip');
    expect(chips.length).toBe(3);
    chips[1].click();
    await settle(4);
    const panel = host.querySelector('.dt-hist') as HTMLElement;
    expect(panel, '汇聚档历史面板必须在').toBeTruthy();
    expect(panel.textContent).toContain('GET /_search');

    /* fill 回当前 Tab（空 Tab 收到汇聚条目的 method/path/body） */
    (panel.querySelector('button[aria-label="仅填入"]') as HTMLButtonElement).click();
    await settle(4);
    expect(dtInp(host).value, 'fill 必须回填当前 Tab 的 path').toBe('/_search');
    expect(bodyCap().props.modelValue, 'fill 必须回填当前 Tab 的 body').toBe('{"size":1}');
  });
});

describe('532 源码锁（行号漂移自适应：只锁语义串）', () => {
  it('dtLint 按档路由分派五支 + bodyLang computed 在场', () => {
    expect(v).toMatch(/const dtLint = computed<Finding\[\]>\(\(\) => \{/);
    /* 1439：none 档扩到 msearch/msearch-template/bulk（NDJSON 同一条配对规则） */
    expect(v).toMatch(/if \(kind === 'none' \|\| kind === 'msearch-body' \|\| kind === 'msearch-template-body' \|\| kind === 'bulk-body'\)/);
    expect(v).toContain("if (kind === 'settings') return lintSettingsBody(JSON.parse(body));");
    expect(v).toContain("if (kind === 'mapping') return lintMappingBody(JSON.parse(body));");
    expect(v).toContain("if (kind === 'search') return lintDsl(JSON.parse(body), { fields: dtFields.value });");
    /* 1439：bodyLang 抽到共享 bodyLangForPath（REST 同源）——DevTools 只消费，锁接线符号 */
    expect(v).toContain("const bodyLang = computed(() => bodyLangForPath(cur.value?.path || ''));");
    expect(v).toContain('bodyLangForPath');
  });

  it('P0-1 行内 marker 接线：bodyMonacoRef + setMarkers + info→hint 降级 + unplaced 兜底', () => {
    expect(v).toContain('ref="bodyMonacoRef"');
    expect(v).toMatch(/bodyMonacoRef\.value\?\.setMarkers\?\./);
    expect(v).toMatch(/severity: f\.severity === 'info' \? 'hint' as const : f\.severity/);
    expect(v).toContain('lintUnplaced.value = r ? [...findings.filter(f => !f.anchor), ...r.unplaced] : findings.slice();');
  });

  it('P1-1 字段源跟路径 + 防抖；P1-2 .dt-lint max-height 钳制；P1-3 curl origin', () => {
    expect(v).toContain("useIndexFields(() => dtPathIdx.value || store.pickedIdx || '')");
    expect(v).toContain('useDebounceFn(() => { ensureDtFields(); }, 400)');
    expect(v).toContain('max-height: 88px; overflow: auto;');
    expect(v, 'ES_HOST 占位串退役').not.toContain("'http://ES_HOST");
    expect(v).toMatch(/curl -X \$\{cur\.value\.method\} '\$\{window\.location\.origin\}\$\{cur\.value\.path\}'/);
  });

  it('P2-3 汇聚镜像双写位（成功/失败）+ cap100 + MonacoEditor language 运行时切换', () => {
    expect(v).toContain('es_devtools_hist_all:');
    expect(v).toContain('mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: true, took: t.took });');
    expect(v).toContain('mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: false, took: t.took });');
    expect(v).toMatch(/\.slice\(0, 100\)/);
    expect(me).toContain('monaco.editor.setModelLanguage(model, v)');
  });

  it('红线复查：dt-hist 仍直挂 dt-body（</WorkbenchLayout> 之后），.qhp-list 定高口径未动', () => {
    const wlEndAt = v.indexOf('</WorkbenchLayout>');
    const histAt = v.indexOf('class="dt-hist"');
    expect(histAt).toBeGreaterThan(wlEndAt);
    expect(v.slice(wlEndAt, histAt)).not.toContain('pane-devtools');
    expect(v).toContain('.dt-hist-list :deep(.qhp-list) { max-height: max(240px, 42vh); }');
    expect(v).toContain('.dt-body :deep(.wl) { flex: 1 1 auto; min-height: 0; }');
  });
});

describe('532 ndjsonLint 回归（复用不改，DevTools bulk 档消费同源）', () => {
  it('配对正常 ok / 配对错 warn 双档保持既有语义', () => {
    expect(ndjsonLint('{"index":{}}\n{"a":1}')!.level).toBe('ok');
    expect(ndjsonLint('{"index":{}}\n{"index":{}}\n{"a":1}')!.level).toBe('warn');
    expect(ndjsonLint('not json\n')!.level).toBe('warn');
  });
});
