/**
 * 五百六十二批（轨2，工蚁2：四大重点页深度重造，Kibana 对标）。
 *
 * K1 DevToolsView 光标处单请求执行（Kibana 多请求编辑器语义）：
 *    新建 utils/devtoolsSegments.ts 纯函数（splitRequests 空行与 // 注释行分界切段 +
 *    locateSegment 光标定位）；Ctrl+Enter 只执行光标所在段，Shift+Ctrl+Enter 执行全部段；
 *    切段只作用于发送出参——草稿持久化/历史 body/镜像 body 锁面保形；历史记录补 seg i/n 标识。
 * K2 AdhocRebuildView 五编辑面 Ctrl+I（IndexHubView 1453 动态 import 先例平移）+ 粘贴区
 *    Monaco @execute="applyPaste" + 按钮 kbd 提示。
 * K3 IndexHubView docs tab 检索行补历史钮；历史面板并显 lucene 行（lucene 回放走 docsQ）。
 * K4 DslQueryView/IndexHubView 历史面板补 'newtab'（_prefill 通道带到 DevTools 新 Tab）。
 * K5 AdhocRebuildView 执行监控步 card-t 行尾补原始 IO 钮（监控轮询现场）。
 * K6 中文备注扫尾（IH Refresh / AHR settings,mapping ×4 / XM 分节标题 ×2 / DV 复制为代码 title）。
 * K7 DslQueryView 文档双弹窗 Monaco Ctrl+I（docModalHeightsAssist 黑名单锁=标签字面冻结，
 *    经 monaco.editor.getEditors() 宿主侧接线，弹窗高度字面零变动）。
 * K8 DslQueryView 本地 elapsedTimer 100ms tick 补 document.hidden 短路（useNow 561 范式）。
 *
 * 设施：K1 行为网走 devtoolsResp561 挂载范式（api.raw mock + Monaco stub 捕获；
 * 空态 quickRun 不经 admin 门——run 本体无角色门）；K2-K8 源码锚。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { splitRequests, locateSegment } from '../utils/devtoolsSegments';

const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');
const ar = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');
const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dq = readFileSync(join(__dirname, '../views/DslQueryView.vue'), 'utf-8');
const xm = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

/* ═══════════ K1 一：devtoolsSegments 纯函数 ═══════════ */
describe('562 K1：devtoolsSegments.splitRequests（空行与 // 注释行分界切段）', () => {
  it('空行切段：两段 text/start/end 精确', () => {
    const body = '{"a":1}\n\n{"b":2}';
    const segs = splitRequests(body);
    expect(segs.length).toBe(2);
    expect(segs[0]).toMatchObject({ start: 0, end: 7, text: '{"a":1}' });
    expect(segs[1]).toMatchObject({ start: 9, end: 16, text: '{"b":2}' });
  });

  it('// 注释行分界（Kibana 控制台同语义）：注释行不进任何段', () => {
    const body = 'GET /\n// 这是一句注释\nPOST /_search\n{"q":1}';
    const segs = splitRequests(body);
    expect(segs.length).toBe(2);
    expect(segs[0].text).toBe('GET /');
    expect(segs[1].text).toBe('POST /_search\n{"q":1}');
    expect(segs[1].text.includes('//')).toBe(false);
  });

  it('多行 JSON 体不会被段内换行拆散；连续分隔行不产空段', () => {
    const body = '{\n "a": 1,\n "b": 2\n}\n\n\n\n{"c":3}\n// tail\n';
    const segs = splitRequests(body);
    expect(segs.length).toBe(2);
    expect(segs[0].text).toBe('{\n "a": 1,\n "b": 2\n}');
    expect(segs[1].text).toBe('{"c":3}');
  });

  it('单段/无分界 → 恰一段全文；空体与纯分隔 → 空数组', () => {
    expect(splitRequests('{"size":5}')).toHaveLength(1);
    expect(splitRequests('{"size":5}')[0].text).toBe('{"size":5}');
    expect(splitRequests('')).toEqual([]);
    expect(splitRequests('\n\n// only comment\n\n')).toEqual([]);
  });

  it('带 // 注释头引导的段：注释行之后的段独立成立', () => {
    const body = '// 第一段：健康\nGET /_cluster/health\n\n// 第二段：索引\nGET /_cat/indices';
    const segs = splitRequests(body);
    expect(segs.map(s => s.text)).toEqual(['GET /_cluster/health', 'GET /_cat/indices']);
  });
});

describe('562 K1：devtoolsSegments.locateSegment（光标所在段定位）', () => {
  const body = '{"a":1}\n\n{"b":2}\n\n{"c":3}';

  it('段内偏移命中所在段', () => {
    expect(locateSegment(body, 0)).toBe(0);
    expect(locateSegment(body, 3)).toBe(0);
    expect(locateSegment(body, 9)).toBe(1);
    expect(locateSegment(body, 12)).toBe(1);
    expect(locateSegment(body, body.length - 1)).toBe(2);
  });

  it('分界行（段间空隙）归后段（Kibana caret 语义）；行尾偏移归本段；尾部空隙归末段', () => {
    expect(locateSegment(body, 8)).toBe(1);
    expect(locateSegment(body, 16), '行尾（{"b":2} 之后、其换行符之前）=段1').toBe(1);
    expect(locateSegment(body, 17), '空行分隔行起点=后段（段2）').toBe(2);
    expect(locateSegment(body + '\n\n\n', body.length + 2)).toBe(2);
  });

  it('空体 → -1；光标超出文末按末段', () => {
    expect(locateSegment('', 0)).toBe(-1);
    expect(locateSegment('\n\n', 0)).toBe(-1);
    expect(locateSegment('{"a":1}', 999)).toBe(0);
  });
});

/* ═══════════ K1 二：DevToolsView 段执行源码锚 ═══════════ */
describe('562 K1：DevToolsView run 链升级（切段只作用于发送出参）', () => {
  it('切段纯函数接线：splitRequests/locateSegment 导入在场', () => {
    expect(dt).toContain("import { splitRequests, locateSegment, type DtSeg } from '../utils/devtoolsSegments';");
  });

  it('Monaco @execute 改挂 onBodyExecute（不再直挂全量 run）+ Shift+Ctrl+Enter 键面', () => {
    const reqPane = dt.slice(dt.indexOf('#pane-devtools-search-request'), dt.indexOf('#pane-devtools-search-response'));
    expect(reqPane).toContain('@execute="onBodyExecute"');
    expect(reqPane).toContain('@keydown.shift.ctrl.enter.prevent="runSmart(true)"');
  });

  it('段执行三件套：runSmart(all)/execOneSeg/editorCursorOffset + seg i/n 历史标识', () => {
    expect(dt).toContain('function onBodyExecute() { void runSmart(false); }');
    expect(dt).toContain('async function runSmart(all: boolean) {');
    expect(dt).toMatch(/if \(segs\.length <= 1\) \{ await run\(\); return; \}/);
    /* 942 随迁：段执行升格取消断链（execOneSeg 返回 boolean，false=取消 break） */
    expect(dt).toMatch(/await execOneSeg\(segs\[i\], i, segs\.length\)\)\) break; \}/);
    expect(dt).toContain('async function execOneSeg(seg: DtSeg, i: number, n: number): Promise<boolean> {');
    expect(dt).toMatch(/'seg ' \+ \(i \+ 1\) \+ '\/' \+ n/);
    expect(dt).toMatch(/function editorCursorOffset\(\): number \| null \{/);
    expect(dt).toMatch(/locateSegment\(t\.body \|\| '', off == null \? 0 : off\)/);
  });

  it('历史条目补 seg 标识：Tab.history 增 seg? 字段 + histRows sub 前缀（552 黑名单字面行保留）', () => {
    expect(dt).toMatch(/history: \{ method: string; path: string; body: string; time: string; ts\?: number; ok\?: boolean; took\?: number; seg\?: string \}\[\];/);
    expect(dt).toContain('sub: h.body ? (h.body.length > 80 ? h.body.slice(0, 80) + \'…\' : h.body) : undefined,');
    expect(dt).toMatch(/\[list\[i\]\.seg, r\.sub\]\.filter\(Boolean\)\.join\(' · '\)/);
  });

  it('执行历史写链补 segLabel 透传（execSend(t, bodyOut, segLabel?)），镜像锁面零触', () => {
    /* 942 随迁：签名升格返回 Promise<boolean>（false=用户取消丢弃，段执行断链通道）；segLabel 透传与镜像写链零触 */
    expect(dt).toContain('async function execSend(t: Tab, bodyOut: string, segLabel?: string): Promise<boolean> {');
    expect(dt).toMatch(/await execSend\(t, bodyOut\);/);
    expect(dt).toMatch(/await execSend\(t, bodyOut, 'seg ' \+ \(i \+ 1\) \+ '\/' \+ n\);/);
    expect(dt).toContain('...(segLabel ? { seg: segLabel } : {})');
    /* devtoolsLint532 镜像源码锁随批自检：镜像 body:t.body 原稿零触 */
    expect(dt).toContain('mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: true, took: t.took });');
    expect(dt).toContain('mirrorHistAll({ method: t.method, path: t.path, body: t.body, ts: Date.now(), ok: false, took: t.took });');
  });

  it('onGlobalRunKey Shift 分支：Shift+Ctrl+Enter 全部段（560 让路清单字面零触）', () => {
    const fn = dt.slice(dt.indexOf('function onGlobalRunKey(e: KeyboardEvent) {'),
      dt.indexOf('}', dt.indexOf('function onGlobalRunKey(e: KeyboardEvent) {') + 2000));
    expect(fn).toContain('if (e.shiftKey) void runSmart(true); else run();');
  });

  it('提示行：空行分段·Ctrl+Enter 执行光标段（dt-actions 行内 dim 弱化小字，零新 CSS）', () => {
    const reqPane = dt.slice(dt.indexOf('#pane-devtools-search-request'), dt.indexOf('#pane-devtools-search-response'));
    expect(reqPane).toContain('空行分段 · Ctrl+Enter 执行光标段 · Shift+Ctrl+Enter 全部');
  });

  it('557/560 既有锁面自检：run() 全量路径字面保持（bodyOut 行 + api.raw 出参 + busy 快照序）', () => {
    const runBody = dt.slice(dt.indexOf('async function run()'), dt.indexOf('/* 语义色轮：耗时展示与四档'));
    const busyAt = runBody.indexOf('t.busy = true');
    const fmtAt = runBody.indexOf('const bodyOut = autoFmt.value ? tryFormatBody(t.body) : t.body;');
    const rawAt = runBody.indexOf('api.devtoolsExecute(');
    expect(fmtAt).toBeGreaterThan(busyAt);
    expect(fmtAt).toBeLessThan(rawAt);
    /* 1127：发送值多了一层 ${var} 展开，但「run() 用格式化出参、草稿 t.body 零触」的锁面不变 */
    expect(runBody).toContain('api.devtoolsExecute(t.method, pathOut, bodyFinal, signal)');
    expect(runBody).toContain('applyVars(bodyOut)');
  });
});

/* ═══════════ K1 三：DevToolsView 段执行行为网（devtoolsResp561 挂载范式） ═══════════ */
const rawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      raw: (...args: any[]) => rawFn(...args),
      devtoolsExecute: (...args: any[]) => rawFn(...args),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
    },
  };
});

/* Monaco stub：可编程光标（cursorOffset>=0 时 getEditor 出口给出 getModel/getPosition） */
let cursorOffset = -1;
const monacoCaps: { props: any; emit: (e: string, v?: any) => void }[] = [];
vi.mock('../components/MonacoEditor.vue', () => ({
  default: {
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'dslAssist', 'readonly', 'fontSize'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any, { emit }: any) {
      monacoCaps.push({ props, emit });
      return {
        getEditor: () => (cursorOffset < 0 ? null : {
          getModel: () => ({ getOffsetAt: () => cursorOffset }),
          getPosition: () => ({}),
          addCommand: () => {},
        }),
      };
    },
    template: '<div class="monaco-stub"></div>',
  },
}));

import DevToolsView from '../views/DevToolsView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}
const apps: ReturnType<typeof createApp>[] = [];
const TWO_SEGS = '{"a":1}\n\n{"b":2}';

async function mountView() {
  location.hash = '#/devtools';
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div/>' } },
      { path: '/devtools', component: { template: '<div/>' } },
    ],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DevToolsView as any) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host };
}

/** 把两段体灌进请求体 Monaco（stub update:modelValue 通道），并回当前 caps 引用 */
async function typeBody(): Promise<{ props: any; emit: (e: string, v?: any) => void }> {
  const cap = monacoCaps[0] as any;
  cap.emit('update:modelValue', TWO_SEGS);
  await settle();
  return cap;
}

beforeEach(() => {
  document.body.innerHTML = '';
  location.hash = '#/';
  localStorage.clear();
  sessionStorage.clear();
  rawFn.mockReset().mockResolvedValue({ status: 200, body: 'ok' });
  monacoCaps.length = 0;
  cursorOffset = -1;
});

afterEach(() => {
  apps.forEach(a => a.unmount());
  apps.length = 0;
});

describe('562 K1：段执行行为网（裸 createApp 挂载）', () => {
  it('单段体 emit execute → 等价全量 run()（segs.length<=1 零行为漂移）', async () => {
    const { host } = await mountView();
    const cap = monacoCaps[0] as any;
    cap.emit('update:modelValue', '{"size":5}');
    await settle();
    cap.emit('execute');
    await settle();
    expect(rawFn).toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][2]).toBe('{\n  "size": 5\n}');
    void host;
  });

  it('两段体 emit execute（stub 无光标）→ 执行首段；草稿体保形（t.body 整身零触）', async () => {
    await mountView();
    const cap = await typeBody();
    cap.emit('execute');
    await settle();
    expect(rawFn).toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][2], '发送出参=段1原文经 autoFmt').toBe('{\n  "a": 1\n}');
    expect(cap.props.modelValue, '草稿体仍是整身两段（切段只作用于发送出参）').toBe(TWO_SEGS);
  });

  it('光标在第二段 → emit execute 执行第二段；历史行 sub 带 seg 2/2', async () => {
    const { host } = await mountView();
    const cap = await typeBody();
    cursorOffset = TWO_SEGS.indexOf('{"b":2}');
    cap.emit('execute');
    await settle();
    expect(rawFn).toHaveBeenCalledTimes(1);
    expect(rawFn.mock.calls[0][2], '发送出参=段2原文经 autoFmt').toBe('{\n  "b": 2\n}');
    const sub = host.querySelector('.qhp-sub');
    expect(sub, '历史行摘要行在场').toBeTruthy();
    expect(sub!.textContent).toContain('seg 2/2');
    expect(sub!.textContent).toContain('{"b":2}');
  });

  it('window Ctrl+Shift+Enter → 全部段顺序执行（api.raw 两次：段1、段2）', async () => {
    await mountView();
    await typeBody();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, shiftKey: true, cancelable: true, bubbles: true }));
    await settle();
    expect(rawFn).toHaveBeenCalledTimes(2);
    expect(rawFn.mock.calls[0][2]).toBe('{\n  "a": 1\n}');
    expect(rawFn.mock.calls[1][2]).toBe('{\n  "b": 2\n}');
  });

  it('window Ctrl+Enter（无 Shift）→ 既有全量执行（发送出参=整身经 autoFmt）', async () => {
    await mountView();
    await typeBody();
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, cancelable: true, bubbles: true }));
    await settle();
    expect(rawFn).toHaveBeenCalledTimes(1);
    /* 整身两段不是合法 JSON → autoFmt 严格 JSON.parse 门原样放行（557 语义） */
    expect(rawFn.mock.calls[0][2]).toBe('{"a":1}\n\n{"b":2}');
  });
});

/* ═══════════ K2：AdhocRebuildView 五编辑面 Ctrl+I + 粘贴区 @execute ═══════════ */
describe('562 K2：AdhocRebuildView Ctrl+I 五面 + 粘贴区执行', () => {
  it('wireCtrlI 宿主接线（IndexHub 1453 动态 import 先例平移）+ 五面全接', () => {
    expect(ar).toContain('function wireCtrlI(host: Ref<CtrlIHost | null>) {');
    expect(ar).toContain("void import('monaco-editor/esm/vs/editor/editor.api').then((m) => {");
    expect(ar).toContain('ed.addCommand(m.KeyMod.CtrlCmd | m.KeyCode.KeyI, () => {');
    expect(ar).toContain("ed.trigger('', 'editor.action.triggerSuggest', null);");
    expect(ar).toMatch(/wireCtrlI\(pasteMcRef\);/);
    expect(ar).toMatch(/wireCtrlI\(manualSetJaRef\);/);
    expect(ar).toMatch(/wireCtrlI\(manualMapJaRef\);/);
    expect(ar).toMatch(/wireCtrlI\(setJaRef\);/);
    expect(ar).toMatch(/wireCtrlI\(mapJaRef\);/);
  });

  it('粘贴区 Monaco 补 ref + @execute="applyPaste"（弹窗 JsonArea @submit 同语义先例）', () => {
    expect(ar).toMatch(/<MonacoEditor ref="pasteMcRef" v-model="pasteRaw" language="json" :height="pasteH" :dsl-assist="pasteAssist" @execute="applyPaste" \/>/);
  });

  it('解析并预填按钮补 kbd 提示 Ctrl⏎', () => {
    expect(ar).toMatch(/<button class="btn primary" @click="applyPaste">解析并预填 <span class="kbd" style="margin-left:var\(--sp-1\)">Ctrl⏎<\/span><\/button>/);
  });
});

/* ═══════════ K3：IndexHubView docs tab 检索历史钮 + 面板 lucene 档 ═══════════ */
describe('562 K3：IndexHubView docs 检索历史入口 + lucene 档并显', () => {
  it('docs 检索行补历史钮（复用本页 histOpen 面板）', () => {
    const docsBar = ih.slice(ih.indexOf('class="ih-docs-bar"'), ih.indexOf('</div>', ih.indexOf('class="ih-docs-bar"')));
    expect(docsBar).toContain('@click="histOpen = true"');
    expect(docsBar).toContain('检索历史');
  });

  it('histRows 并显 lucene 行 + 面板 show-mode（mode 徽标区分 DSL/Lucene）', () => {
    expect(ih).toContain("const histRows = computed(() => qh.items.filter(i => i.mode === 'dsl' || i.mode === 'lucene'));");
    expect(ih).toMatch(/:show-mode="true"/);
  });

  it('lucene 行回放走 docsQ 草稿路径（dsl 行原路径不绕 runDslNew 门）', () => {
    expect(ih).toMatch(/function replayIhHist\(row: \{ query: string; mode\?: string \}, runIt: boolean\) \{/);
    expect(ih).toContain("if (row.mode === 'lucene') {");
    expect(ih).toContain('docsQ.value = row.query;');
    /* 身份门（autoRunAllowed 同口径）——lucene 回放改走 runDocsAuto（docsQ 草稿路径不变，
       且回放载荷来自上一账号时不抢发）；runDocsNew 仍保留给用户主动点击 */
    expect(ih).toContain('if (runIt) runDocsAuto();');
  });
});

/* ═══════════ K4：历史面板 newtab 收口（DQ/IH → DevTools 新 Tab） ═══════════ */
describe('562 K4：DslQueryView/IndexHubView 历史面板 newtab（_prefill 通道）', () => {
  it('DQ 历史 actions 加 newtab + @newtab=histNewTab（openInDevTools 通道，历史行组装 body）', () => {
    expect(dq).toMatch(/:actions="\['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del'\]"/);
    expect(dq).toContain('@newtab="histNewTab"');
    expect(dq).toContain('function histNewTab(h: { query: string; index?: string }) {');
    expect(dq).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open'");
    expect(dq).toContain("router.push('/devtools');");
  });

  it('IH 历史 actions 加 newtab + @newtab=ihHistNewTab（openQryInDevTools 通道平移；lucene 行门控）', () => {
    expect(ih).toMatch(/:actions="\['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del'\]"/);
    expect(ih).toContain('@newtab="ihHistNewTab"');
    expect(ih).toContain('function ihHistNewTab(h: { query?: string; index?: string; mode?: string }) {');
    expect(ih).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open'");
    expect(ih).toContain("router.push('/devtools');");
    expect(ih).toMatch(/h\.mode && h\.mode !== 'dsl'/);
  });
});

/* ═══════════ K5：AdhocRebuildView 监控步行尾原始 IO 钮 ═══════════ */
describe('562 K5：AdhocRebuildView step4 card-t 行尾原始 IO 钮（监控轮询现场）', () => {
  it('执行监控 card-t 行尾 Terminal 钮 → openRawIo（:423 先例同形；中止钮 .right 语义零触）', () => {
    const step4 = ar.slice(ar.indexOf('<div v-if="step === 4"'), ar.indexOf('<!-- 最近作业 -->'));
    expect(step4).toContain('@click="openRawIo"');
    expect(step4).toContain('监控轮询');
    expect(step4).toContain('<Terminal :size="12" />');
    expect(step4).toMatch(/class="btn ghost sm danger right"/);
  });
});

/* ═══════════ K6：中文备注扫尾 ═══════════ */
describe('562 K6：中文备注扫尾（主显句式/弱化小字/title）', () => {
  it('IH ops 卡 Refresh → 中文主显句式（对照「Flush 刷盘」）', () => {
    expect(ih).toContain('<RotateCw :size="13" /> Refresh 刷新');
  });
  it('AHR 手动/审编四标签补中文弱化小字（settings=索引设置/mapping=字段映射）', () => {
    expect(ar.match(/settings <span class="dim">索引设置<\/span>/g)?.length).toBe(2);
    expect(ar.match(/mapping <span class="dim">字段映射<\/span>/g)?.length).toBe(2);
  });
  it('XM 两分节标题补中文弱化小字（track2Wave554 sec-t 计数=2 零触）', () => {
    expect(xm).toContain('<div class="xm-cfg-t sec-t">mapping <span class="dim">字段映射</span></div>');
    expect(xm).toContain('<div class="xm-cfg-t sec-t">settings <span class="dim">索引设置</span></div>');
  });
  it('DV 复制为代码 option 中文备注落 select title（devtoolsCodegen314 option 字面锁零触）', () => {
    expect(dt).toContain('title="复制为代码（fetch=前端 JavaScript 脚本 · requests=Python 脚本）"');
    expect(dt).toMatch(/<option value="js">JavaScript \(fetch\)<\/option>/);
    expect(dt).toMatch(/<option value="python">Python \(requests\)<\/option>/);
  });
});

/* ═══════════ K7：DQ 文档双弹窗 Ctrl+I（标签字面冻结，getEditors 通道） ═══════════ */
describe('562 K7：DslQueryView 文档双弹窗 Ctrl+I（docModalHeightsAssist 锁面兼容）', () => {
  it('watch(docOpen/newDocOpen) → wireDocModalCtrlI（monaco.editor.getEditors 拾取 + addCommand）', () => {
    expect(dq).toContain('function wireDocModalCtrlI(modelText: () => string) {');
    expect(dq).toContain('getEditors');
    expect(dq).toMatch(/watch\(docOpen, \(o\) => \{ if \(o\) nextTick\(\(\) => wireDocModalCtrlI\(\(\) => docEditText\.value\)\); \}\);/);
    expect(dq).toMatch(/watch\(newDocOpen, \(o\) => \{ if \(o\) nextTick\(\(\) => wireDocModalCtrlI\(\(\) => newDocText\.value\)\); \}\);/);
  });
  it('弹窗高度字面零变动（两 Monaco 标签随 561 批 useTierCycle 形态原样；裸定高不回潮）', () => {
    /* 六百六十九批同步更新（击穿者：件B 弹窗字号档 :font-size 复用 dqFont，高度字面零变动
       锁意图零触；edFontModal669.spec D 段同锚） */
    expect(dq).toContain('<MonacoEditor v-if="docEditMode" v-model="docEditText" :height="docH" :font-size="dqFont" />');
    expect(dq).toContain('<MonacoEditor v-model="newDocText" :height="docHNew" :font-size="dqFont" />');
    expect(dq).not.toContain('height="420px"');
    expect(dq).not.toContain('height="360px"');
  });
});

/* ═══════════ K8：DQ elapsedTimer 后台短路 ═══════════ */
describe('562 K8：DslQueryView 本地 elapsedTimer document.hidden 短路（useNow 561 范式）', () => {
  it('100ms tick 回调体首行短路（后台标签页不再空转写 ref）', () => {
    expect(dq).toContain('elapsedTimer = window.setInterval(() => { if (document.hidden) return; elapsedMs.value = Date.now() - t0; }, 100);');
  });
});
