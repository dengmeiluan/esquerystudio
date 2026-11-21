/**
 * QueryHub 首刀三小刀+aria 随批（； 裁决表 G145+G140+G141+G142）。
 *
 * ① G145（P3 体验断链·头号）场景任务「一键生成 DSL」在构建器默认收起态断链——
 *    usePref 'query.buildCollapsed' 缺省 true→dq-main v-show 隐藏，预填完整进 Monaco
 *    （数据层）而编辑器零渲染（显示层）；toast「看看语句就学会了」指引与可见性断裂
 *    （ 活教材语义）。修法=onMounted 深链消费处（?dsl= 预填成功分支）自展开一行守卫。
 * ② G140（P3 死代码）场景条旧壳三组死样式退役（迁入工具行后残留，DOM 零引用；
 *    活锚 toggle 钮/pop 容器保留；737 G131 同族）。
 * ③ G141（P3 注释失实+铁律 F）模式钮 essence 六条选型文案完全不可达——title 全 null+
 *    副行死渲染双实锚，而源码注释两处宣称「essence 收进 title 悬浮」与实现不符；
 *    修法=六钮补 :title=m.essence+死渲染退役+注释对齐（「帮用户 1 秒选对通道」）。
 * ④ G142（弱 P3 aria 随批）模式组容器补 role=group+aria-label、六钮 aria-pressed
 *    （733 G114 同族；hubsKbNav 容器字面锁同步更新）。
 *
 * 挂载范式：G145 照 dqResilience546（monaco stub 链+api mock+memory router）；
 * G141/G142 照 dslAssistPenetration（同链挂 QueryHubView）；G140 源码锁（737 G131 同族）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* monaco editor.api stub（dqResilience546/dslAssistPenetration 同范式——斩断真实 monaco 导入链） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const fakeEditor = {
    onDidChangeModelContent: () => ({ dispose() {} }),
    addAction: () => {},
    getValue: () => '',
    setValue: () => {},
    updateOptions: () => {},
    getAction: () => null,
    getSelection: () => null,
    executeEdits: () => {},
    focus: () => {},
    deltaDecorations: () => [],
    getModel: () => null,
    dispose: () => {},
  };
  return {
    editor: { defineTheme: () => {}, create: () => fakeEditor, setTheme: () => {}, setModelMarkers: () => {} },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      registerHoverProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {},
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/format/browser/formatActions', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/comment/browser/comment', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));

/* api mock：clusterQuery/mappingDetail 可编程（其余网络出口堵死，dqResilience546 配方） */
const clusterQueryMock = vi.fn();
const mappingDetailFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      mappingDetail: (...a: any[]) => mappingDetailFn(...a),
      clusterQuery: (...a: any[]) => clusterQueryMock(...a),
      raw: () => Promise.resolve({}),
    },
  };
});

import DslQueryView from '../views/DslQueryView.vue';
import QueryHubView from '../views/QueryHubView.vue';
import { useAuthStore } from '../stores/auth';
import { QUERY_MODES } from '../utils/queryHub';
import { __clearFieldCache } from '../composables/useIndexFields';

const apps: ReturnType<typeof createApp>[] = [];
const errors: any[] = [];

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountAt(comp: any, path: string) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/search', component: { template: '<div/>' } },
      { path: '/lucene', component: { template: '<div/>' } },
    ],
  });
  await router.push(path);
  await router.isReady();
  const app = createApp({ render: () => h(comp) });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  app.config.errorHandler = (err) => { errors.push(err); };
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { host };
}

/** ?dsl= 通道编码（QueryHubView.applyTask 的 encodeDslParam 契约） */
const encodeDsl = (s: string) => btoa(unescape(encodeURIComponent(s)));

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  history.replaceState(null, '', '#/');
  __clearFieldCache();
  errors.length = 0;
  clusterQueryMock.mockReset().mockResolvedValue({ hits: [], total: 0, took: 1 });
  mappingDetailFn.mockReset().mockResolvedValue({ raw: { properties: {} } });
});
afterEach(() => { while (apps.length) apps.pop()!.unmount(); });

describe('739 G145 深链预填自展开（体验断链·头号）', () => {
  it('红锚：?dsl= 深链预填成功→构建器自展开（aria-expanded=true+dq-main 可见）', async () => {
    localStorage.setItem('es_picked', 'idx-a');
    localStorage.setItem('es_dsl:idx-a', '{"query":{"match_all":{}}}');
    history.replaceState(null, '', '#/search?mode=dsl&dsl=' + encodeDsl('{"query":{"match_all":{}}}'));
    const { host } = await mountAt(DslQueryView, '/search');
    const tg = host.querySelector<HTMLButtonElement>('.dq-build-tg');
    expect(tg, '构建器节头钮在场').toBeTruthy();
    expect(tg!.getAttribute('aria-expanded'), 'G145 病灶：预填后仍收起（aria-expanded=false）').toBe('true');
    expect(tg!.classList.contains('on'), '展开态激活类').toBe(true);
    const main = host.querySelector<HTMLElement>('.dq-main');
    expect(main, 'dq-main 在场').toBeTruthy();
    expect(main!.style.display, 'G145 病灶：编辑器区 v-show 隐藏').not.toBe('none');
    expect(errors).toEqual([]);
  });

  it('负锚（现状即守卫）：无深链裸进→默认收起不变（缺省 true 不回归）', async () => {
    localStorage.setItem('es_picked', 'idx-a');
    localStorage.setItem('es_dsl:idx-a', '{"query":{"match_all":{}}}');
    const { host } = await mountAt(DslQueryView, '/search');
    const tg = host.querySelector<HTMLButtonElement>('.dq-build-tg');
    expect(tg!.getAttribute('aria-expanded'), '裸进默认收起（553 裁决缺省）').toBe('false');
    expect(host.querySelector<HTMLElement>('.dq-main')!.style.display).toBe('none');
  });

  it('坏 dsl 参数（解析失败）不误展开：保留当前内容+维持收起', async () => {
    localStorage.setItem('es_picked', 'idx-a');
    localStorage.setItem('es_dsl:idx-a', '{"query":{"match_all":{}}}');
    history.replaceState(null, '', '#/search?mode=dsl&dsl=%E4%B8%8D%E6%98%AFbase64');
    const { host } = await mountAt(DslQueryView, '/search');
    const tg = host.querySelector<HTMLButtonElement>('.dq-build-tg');
    expect(tg!.getAttribute('aria-expanded'), '解析失败走 warn 分支不展开').toBe('false');
    expect(errors).toEqual([]);
  });
});

describe('739 G141 模式钮 essence 悬浮可达（注释失实+铁律 F）', () => {
  it('红锚：六钮 title=各自 essence 精确（修前全 null）+死渲染 span 退役', async () => {
    const { host } = await mountAt(QueryHubView, '/search');
    const btns = Array.from(host.querySelectorAll<HTMLButtonElement>('.qh-mode'));
    expect(btns.length, '六模式钮').toBe(6);
    QUERY_MODES.forEach((m, i) => {
      expect(btns[i].getAttribute('title'), `G141 病灶：${m.t} 钮无 essence 悬浮`).toBe(m.essence);
    });
    /* 死渲染退役：副行 span 不再进 DOM（修前 display:none 占位在场） */
    expect(host.querySelectorAll('.qh-mode .qh-mode-tx span.qh-mode-e').length, '副行死渲染须退役').toBe(0);
    /* essence 不进可见文本（title 悬浮通道零泄漏） */
    expect(host.textContent).not.toContain('全能主力');
  });
});

describe('739 G142 模式组 aria（弱 P3 随批·733 G114 同族）', () => {
  it('红锚：容器 role=group+aria-label；六钮 aria-pressed 精确（on 钮 true 其余 false）', async () => {
    const { host } = await mountAt(QueryHubView, '/search');
    const grp = host.querySelector<HTMLElement>('.qh-modes');
    expect(grp, '模式组容器在场').toBeTruthy();
    expect(grp!.getAttribute('role'), 'G142 病灶：容器无 role').toBe('group');
    expect(grp!.getAttribute('aria-label')).toBe('查询模式');
    const btns = Array.from(host.querySelectorAll<HTMLButtonElement>('.qh-mode'));
    QUERY_MODES.forEach((m, i) => {
      expect(btns[i].getAttribute('aria-pressed'), `${m.t} 钮 aria-pressed`).toBe(String(m.k === 'dsl'));
    });
  });
});

describe('1445 查询模式右键：深链/默认模式/历史（只读动作）', () => {
  it('模式钮右键打开菜单并切到该模式', async () => {
    const { host } = await mountAt(QueryHubView, '/search');
    const btn = host.querySelectorAll<HTMLButtonElement>('.qh-mode')[1];
    btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 24 }));
    await settle();
    const menu = document.body.querySelector<HTMLElement>('.ccm');
    expect(menu, '模式右键菜单').toBeTruthy();
    expect(menu!.textContent).toContain('查询模式 · ' + QUERY_MODES[1].t);
    for (const label of ['复制此模式深链', '设为默认进入模式', '复制当前查询权限摘要', '打开跨模式查询历史']) {
      expect(menu!.textContent, `菜单项 ${label}`).toContain(label);
    }
    (menu!.querySelector('[data-key="mode-switch"]') as HTMLElement).click();
    await settle();
    expect(host.querySelector('.qh-mode.on')?.textContent, '右键切换后 SQL 选中').toContain('SQL');
    expect(document.body.querySelector('.ccm'), '动作后菜单关闭').toBeNull();
    expect(errors).toEqual([]);
  });

  it('复制查询权限摘要：带目标/env/角色/读写与 mode（工单可复现口径）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { host } = await mountAt(QueryHubView, '/search');
    const btn = host.querySelectorAll<HTMLButtonElement>('.qh-mode')[1];
    btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 24 }));
    await settle();
    (document.body.querySelector('[data-key="mode-access"]') as HTMLElement).click();
    await settle();
    const summary = writeText.mock.calls[0][0] as string;
    for (const seg of ['target=', 'env=', 'role=', 'read=', 'write=', 'mode=sql']) {
      expect(summary, `摘要段 ${seg}`).toContain(seg);
    }
    delete (navigator as any).clipboard;
    expect(errors).toEqual([]);
  });

  it('只读身份：模式菜单标题显示「只读」而不是「可写」', async () => {
    const { host } = await mountAt(QueryHubView, '/search');
    const auth = useAuthStore();
    auth.me = { username: 'viewer', role: 'VIEWER', grantedPages: ['search'] } as any;
    auth.probed = true;
    await settle();
    const btn = host.querySelectorAll<HTMLButtonElement>('.qh-mode')[0];
    btn.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 24 }));
    await settle();
    const menu = document.body.querySelector('.ccm');
    expect(menu?.textContent, '只读身份必须显示只读档').toContain('只读');
    expect(menu?.textContent, '只读身份不得显示可写').not.toContain('可写');
    expect(errors).toEqual([]);
  });

  it('设为默认进入模式持久化，且日常切换不覆盖', async () => {
    const { host } = await mountAt(QueryHubView, '/search');
    const modes = host.querySelectorAll<HTMLButtonElement>('.qh-mode');
    modes[1].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 24, clientY: 24 }));
    await settle();
    (document.body.querySelector('[data-key="mode-default"]') as HTMLElement).click();
    await settle();
    expect(JSON.parse(localStorage.getItem('esquerystudio.pref.qh.default') || '""')).toBe('sql');
    modes[0].click();
    await settle();
    expect(JSON.parse(localStorage.getItem('esquerystudio.pref.qh.default') || '""'), '切换模式不改默认').toBe('sql');
    /* 新开一次裸进（无 ?mode=）必须落到默认 SQL，而不是上次使用的 DSL */
    apps.pop()!.unmount();
    document.body.innerHTML = '';
    history.replaceState(null, '', '#/search');
    const again = await mountAt(QueryHubView, '/search');
    await settle();
    expect(again.host.querySelector('.qh-mode.on')?.textContent, '裸进采用默认模式').toContain(QUERY_MODES[1].t);
    expect(errors).toEqual([]);
  });

  it('键盘 ContextMenu/Shift+F10 打开同一菜单', async () => {
    const { host } = await mountAt(QueryHubView, '/search');
    const btn = host.querySelectorAll<HTMLButtonElement>('.qh-mode')[2];
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    await settle();
    expect(document.body.querySelector('.ccm')?.textContent).toContain('查询模式 · ' + QUERY_MODES[2].t);
    expect(errors).toEqual([]);
  });
});

describe('739 G140 场景条旧壳三组死样式退役（源码锁；737 G131 同族）', () => {
  it('死族零残留（含注释；705-C1 零符号字面量）+活锚 toggle/pop 双锚保留', () => {
    const v = read('../views/QueryHubView.vue');
    /* 死族：旧壳容器规则+inbar 两规则+label 规则（正则口径防误伤 -toggle/-pop 活锚前缀） */
    expect(v.match(/\.qh-tasks\s*\{/), '旧壳容器死规则须退役').toBeNull();
    expect(v.includes('.qh-tasks-inbar'), 'inbar 死规则须退役').toBe(false);
    expect(v.includes('.qh-tasks-lb'), 'label 死规则须退役').toBe(false);
    /* 活锚保留：展开钮=CSS+模板双锚；任务弹层容器=模板锚（其样式规则是单数形 .qh-task-pop） */
    expect(v).toMatch(/\.qh-tasks-toggle \{/);
    expect(v).toContain('qh-task qh-tasks-toggle');
    expect(v).toContain('class="qh-tasks-pop"');
    expect(v).toMatch(/\.qh-task-pop \{/);
    /* 删除域注释已语义化（批号锚退役），改守功能实锚 */
    expect(v).toContain('将删除全部通道的查询历史记录');
  });
});

describe('739 G141 源码锁（essence 接线+死渲染清零+注释对齐）', () => {
  it(':title=m.essence 字面在场+副行死族零残留+失实注释对齐', () => {
    const v = read('../views/QueryHubView.vue');
    expect(v).toContain(':title="m.essence"'); // G141 接线
    expect(v.match(/qh-mode-e/g), '副行死渲染/死样式/注释零残留').toBeNull();
    /* 注释对齐：顶部注释宣称悬浮（修前宣称「副行」与实现不符） */
    expect(v).toContain('essence 悬浮是选型指南');
    /* aria 接线字面（G142） */
    expect(v).toContain(':aria-pressed="modeK === m.k"');
    expect(v).toContain('role="group" aria-label="查询模式"');
  });
});

describe('739 A0 挂载不变量负锚（现状即守卫）', () => {
  it('六模式钮主标题精确+默认 on=dsl+日常场景 toggle 在场（须种索引——空索引态场景任务 slot 随子视图 v-if 消失，738 探针课①）', async () => {
    /* 深链种 pickedIdx：场景任务入口经 #toolbar-prepend slot 随 DslQueryView 工具行渲染 */
    localStorage.setItem('es_picked', 'idx-a');
    localStorage.setItem('es_dsl:idx-a', '{"query":{"match_all":{}}}');
    const { host } = await mountAt(QueryHubView, '/search');
    const btns = Array.from(host.querySelectorAll<HTMLButtonElement>('.qh-mode'));
    expect(btns.length).toBe(6);
    QUERY_MODES.forEach((m, i) => {
      expect(btns[i].textContent, `${m.t} 主标题在场`).toContain(m.t);
    });
    expect(host.querySelector('.qh-mode.on')?.textContent).toContain('DSL');
    expect(host.querySelector('.qh-tasks-toggle'), '场景任务入口在场（活锚）').toBeTruthy();
    expect(host.textContent).toContain('日常场景');
    /* roving 键盘导航行为面归 hubsKbNav（），此处不重复锁 */
  });
});
