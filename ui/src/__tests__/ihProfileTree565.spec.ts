/**
 * 五百六十五批·轨2 W2 件②：IndexHub query tab 接 ProfileTree（552 备案「组件就绪待接」落地）。
 *
 *  背景：IndexHubView.vue 备案「ProfileTree 组件已就绪待接」——query tab 就地执行无 Profile
 *  通道，per-shard/分段耗时只能在 DslQueryView 看。接上：
 *  · query tab 执行行加 Profile 开关（ih.qry.profile usePref 落盘，默认关=DQ query.profile 同款）；
 *  · 开时 runDsl 走 api.profile（body 透传 _search+profile:true，hits/aggregations 同形不降级），
 *    主路径与 R90 降级重试路径同分支（DQ execQuery 双分支同款）；
 *  · 树挂直方图节后（DQ run-sec 同位序）：ProfileTree 统一件（node=shards[0].searches[0].query[0]、
 *    total=树根 time_in_nanos、@close 关闭）；无 profile 数据树不渲染（空态=折叠不占位）；
 *  · 高度受控：组件自带 max(240px,42vh) 定 max 内滚（固定 max，无棘轮面），布局零破坏。
 *
 *  挂载范式同 indexHubQueryTab.spec（monaco stub + api 壳 mock + 真 naive-ui）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');

/* ═══════════ 源码锁 ═══════════ */

describe('565 件②：IndexHub query tab ProfileTree 接线（源码锁）', () => {
  it('ProfileTree 统一件 import + 模板挂载（node/total/@close 契约）', () => {
    expect(ih).toContain("import ProfileTree from '../components/ProfileTree.vue';");
    expect(ih).toMatch(/<ProfileTree v-if="qryProfileTree" :node="qryProfileTree" :total="qryProfileTotal" @close="qryProfileTree = null" \/>/);
  });

  it('Profile 开关：ih.qry.profile usePref（默认关）+ 模板开关在 query 执行行', () => {
    expect(ih).toContain("const profileOn = usePref('ih.qry.profile', false);");
    expect(ih).toMatch(/<label class="ih-sw" :class="\{ on: profileOn \}" title="Query Profiler：返回 breakdown 耗时树（开启后就地执行走 Profile 通道）">\s*<input type="checkbox" v-model="profileOn" \/> Profile\s*<\/label>/);
  });

  it('runDsl 主路径+降级重试路径按 profileOn 分支走 api.profile（DQ execQuery 双分支同款）', () => {
    const branch = /r = profileOn\.value\s*\?\s*await api\.profile\(idx, JSON\.stringify\(bodyObj\), signal\) as SearchResp\s*\:\s*await api\.clusterQuery\(idx, JSON\.stringify\(bodyObj\), qrySize\.value, signal\);/;
    expect(ih.match(new RegExp(branch.source, 'g'))?.length, '主路径与降级重试两处同分支').toBe(2);
  });

  it('树回填同 DQ 判据（shards[0].searches[0].query[0]）+ 新执行清旧树 + 切索引清场', () => {
    expect(ih).toMatch(/penv\?\.profile\?\.shards\?\.\[0\]\?\.searches\?\.\[0\]\?\.query\?\.\[0\]/);
    expect(ih).toContain('qryProfileTree.value = pRoot;');
    expect(ih).toContain('qryProfileTotal.value = pRoot.time_in_nanos || 1;');
    expect(ih, '执行开始清旧树（DQ execQuery 同款）').toContain('qryProfileTree.value = null; /* 565：新执行清旧树');
    expect(ih, '切索引清场').toMatch(/qryResp\.value = null; qryErr\.value = ''; qryPage\.value = 1; qryProfileTree\.value = null;/);
  });

  it('552 「待接」备案退役（组件已接线，过时备案不留误导）', () => {
    expect(ih).not.toContain('ProfileTree 组件已就绪待接');
  });
});

/* ═══════════ 行为锁（挂载范式同 indexHubQueryTab.spec） ═══════════ */

vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const registrations: any[] = [];
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
    __registrations: registrations,
    editor: {
      defineTheme: () => {},
      create: () => fakeEditor,
      setTheme: () => {},
      setModelMarkers: () => {},
    },
    languages: {
      registerCompletionItemProvider: (_l: string, p: any) => { registrations.push(p); return { dispose() {} }; },
      registerHoverProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class { constructor(public a?: number, public b?: number, public c?: number, public d?: number) {} },
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

const profileFn = vi.fn();
const clusterQueryFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      profile: (...a: any[]) => profileFn(...a),
      clusterQuery: (...a: any[]) => clusterQueryFn(...a),
      mappingDetail: () => Promise.resolve({ index: 'a-idx', raw: { properties: { status: { type: 'keyword' } } } }),
      indexSettings: () => Promise.resolve({ index: { refresh_interval: '1s' } }),
      shards: () => Promise.resolve([]),
      aliases: () => Promise.resolve([]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';

const PROFILE_RESP = {
  took: 3,
  hits: [{ _id: '1', _source: { status: 'A' } }],
  total: 1,
  profile: { shards: [{ searches: [{ query: [{
    type: 'BooleanQuery', description: 'match_all', time_in_nanos: 1200,
    children: [{ type: 'TermQuery', description: '_id:1', time_in_nanos: 300 }],
  }] }] }] },
};

async function settle(n = 14) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

const apps: ReturnType<typeof createApp>[] = [];

async function mountHub() {
  history.replaceState(null, '', '#/indices?idx=a-idx&tab=query');
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(IndexHubView as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
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
  history.replaceState(null, '', '#/');
  profileFn.mockReset().mockResolvedValue(PROFILE_RESP);
  clusterQueryFn.mockReset().mockResolvedValue({ took: 2, hits: [{ _id: '1', _source: { status: 'A' } }], total: 1 });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('565 件②：Profile 开 → profile 通道执行 + 树回显（行为锁）', () => {
  it('开 Profile 执行：走 api.profile 不走 clusterQuery；Profile 耗时树回显父子节点', async () => {
    const host = await mountHub();
    /* 开关：query 执行行 Profile label 内 checkbox */
    const sw = host.querySelector<HTMLInputElement>('.ih-sw input[type="checkbox"]');
    expect(sw, 'Profile 开关在场').toBeTruthy();
    sw!.click();
    await settle();
    /* 执行查询 */
    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('执行查询'));
    expect(run, '执行查询钮在场').toBeTruthy();
    run!.click();
    await settle();
    expect(profileFn, 'Profile 通道恰一次').toHaveBeenCalledTimes(1);
    expect(clusterQueryFn, '普通查询通道不并发').toHaveBeenCalledTimes(0);
    /* 树回显：ProfileTree 统一件外壳 + 父子两行 */
    const tree = host.querySelector('.dq-profile');
    expect(tree, 'Profile 耗时树在场').toBeTruthy();
    expect(tree!.textContent).toContain('Profile 耗时树');
    expect(host.querySelectorAll('.pf-row').length).toBe(2);
    expect(tree!.textContent).toContain('BooleanQuery');
    /* 关闭钮收树 */
    (tree!.querySelector<HTMLButtonElement>('[aria-label="关闭 Profile 耗时树"]'))!.click();
    await settle();
    expect(host.querySelector('.dq-profile'), '关闭后树收起').toBeNull();
  });

  it('Profile 关（默认）：执行走 clusterQuery，树不渲染（空态=折叠不占位）', async () => {
    const host = await mountHub();
    const run = Array.from(host.querySelectorAll<HTMLButtonElement>('button')).find(b => b.textContent?.includes('执行查询'));
    run!.click();
    await settle();
    expect(clusterQueryFn).toHaveBeenCalledTimes(1);
    expect(profileFn).toHaveBeenCalledTimes(0);
    expect(host.querySelector('.dq-profile')).toBeNull();
  });
});
